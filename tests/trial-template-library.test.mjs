import {test} from 'node:test';import assert from 'node:assert/strict';
import {defaultTrialCatalog,saveTrialDefinition} from '../src/trialCatalogStore.mjs';
import {readTrialTemplateFile,makeTrialTemplateWorkbook,trialTemplateName} from '../src/trialTemplateWorkbook.mjs';
import {excelModule} from '../src/reportWorkbook.mjs';import {buildWorkbookView} from '../src/reportWorkbookView.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';import {memoryStorage} from '../src/guidedTourStorage.mjs';
const admin=INITIAL_ACCOUNTS.find(a=>a.id==='U001'),storage=()=>memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS),'dqa-request-demo-v2':'KEEP_REQUEST','dqa-schedules-demo-v1':'KEEP_SCHEDULE'}),options=id=>({actorId:'U001',system:'lms',templateId:id,expectedRevision:0});
test('all twenty current templates create real Excel with intact references and blank results/signatures',async()=>{
 const Excel=await excelModule(),s=storage();for(const row of defaultTrialCatalog()){const file=await readTrialTemplateFile(options(row.id),s),book=new Excel.Workbook();await book.xlsx.load(file.bytes);assert.deepEqual(book.worksheets.map(w=>w.name),['範本資訊','試驗紀錄']);const info=book.getWorksheet('範本資訊');assert.equal(info.getCell('B1').text,row.name);assert.equal(info.getCell('B4').text,row.version);const records=book.getWorksheet('試驗紀錄');for(const cell of ['B3','B4','B9','B10','B11','B13','B14','B15'])assert.equal(records.getCell(cell).text,'');book.eachSheet(ws=>ws.eachRow(r=>r.eachCell(c=>{assert(!c.value?.formula);assert(!c.value?.hyperlink);})));assert.equal(file.name,trialTemplateName(row));}
 assert.equal(s.getItem('dqa-request-demo-v2'),'KEEP_REQUEST');assert.equal(s.getItem('dqa-schedules-demo-v1'),'KEEP_SCHEDULE');
});
test('edited catalog version and methods are used by both download and the actual workbook preview',async()=>{
 const s=storage(),row=defaultTrialCatalog()[2];saveTrialDefinition({...row,version:'SYNTH-2',specification:row.specification.replace('60°C','85°C')},admin,{storage:s,expectedRevision:0});const file=await readTrialTemplateFile({...options(row.id),expectedRevision:1},s),model=await buildWorkbookView(file.bytes);const text=model.sheets.flatMap(s=>s.rows.flatMap(r=>r.cells.map(c=>c.text))).join(' ');assert.match(text,/85°C/);assert.match(text,/SYNTH-2/);assert.match(file.name,/SYNTH-2/);
});
test('fresh archive permissions and catalog revisions are rechecked after asynchronous generation',async()=>{
 const s=storage(),row=defaultTrialCatalog()[0];await assert.rejects(()=>readTrialTemplateFile({...options(row.id),actorId:'U004'},s),/權限/);
 await assert.rejects(()=>readTrialTemplateFile(options(row.id),s,{build:async()=>{s.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id==='U001'?{...a,status:'已停用'}:a)));return new Uint8Array([1]);}}),/權限/);
 const t=storage();await assert.rejects(()=>readTrialTemplateFile(options(row.id),t,{build:async()=>{saveTrialDefinition({...row,version:'SYNTH-3'},admin,{storage:t,expectedRevision:0});return new Uint8Array([1]);}}),/已更新/);
});
test('long source text is preserved and spreadsheet-like instructions remain literal strings',async()=>{
 const row={...defaultTrialCatalog()[0],specification:'=HYPERLINK("https://example.invalid")\n'+('完整參考條件。'.repeat(500))},Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await makeTrialTemplateWorkbook(row));const sheet=book.getWorksheet('範本資訊');let method='',inside=false;sheet.eachRow(r=>{const label=r.getCell(1).text;if(label==='試驗規範／手法')inside=true;if(label==='判定參考')inside=false;if(inside)method+=r.getCell(2).text;});assert.equal(method,row.specification.replaceAll('\n',''));assert.equal(sheet.getCell('B8').type,Excel.ValueType.String);assert(!sheet.getCell('B8').value?.hyperlink);
});

test('a newly registered custom trial also becomes downloadable without claiming a scheduling rule',async()=>{const s=storage(),row={...defaultTrialCatalog()[0],id:undefined,name:'合成自訂觀察試驗',profileId:'UNVERIFIED',version:'SYNTH-CUSTOM-1'},added=saveTrialDefinition(row,admin,{storage:s,expectedRevision:0}),file=await readTrialTemplateFile({...options(added.id),expectedRevision:1},s),model=await buildWorkbookView(file.bytes);assert.match(file.name,/合成自訂觀察試驗/);assert(model.sheets.flatMap(s=>s.rows.flatMap(r=>r.cells)).some(c=>c.text==='尚未設定排程規則'));});
