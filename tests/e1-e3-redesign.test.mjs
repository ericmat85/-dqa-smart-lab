import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {reviewE1Request,reviewE1Report} from '../src/e1Review.mjs';import {makeE3Draft,buildE3Export,authorizeE3Export} from '../src/e3ReportDraft.mjs';import {createReportTemplate,excelModule} from '../src/reportWorkbook.mjs';import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';import {memoryStorage} from '../src/guidedTourStorage.mjs';
const request={id:'REQ-2026-aabbccdd',ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',title:'合成高溫試驗',testItems:['高溫試驗'],productCode:'SYNTH-E1',quantity:2,specification:'合成高溫試驗；100°C；48 小時。',judgementCriteria:'依提供的合成規範檢查。',dueDate:'2026-11-30',status:'已完成'};
const store=()=>memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS),'dqa-request-demo-v2':JSON.stringify([request]),'dqa-schedules-demo-v1':'KEEP_SCHEDULE'});
test('E1 request and electronic signature checks report actual gaps and repeated signers without approvals or model claims',()=>{
 const row={...request,signatureRecords:[1,2].map(stage=>({stage,actorId:'DEMO-LEVEL1',at:'2026-11-14T10:00:00Z',decision:'核准',signature:'data:image/png;base64,FAKE_TEST_IMAGE'}))},before=JSON.stringify(row),result=reviewE1Request(row);assert.equal(result.mode,'RULE_BASED_ONLY');assert.equal(result.real_ai,false);assert(result.findings.some(f=>f.title.includes('跨階重複')));assert.equal(result.signature_authenticity,'NOT_VERIFIED');assert.equal(JSON.stringify(row),before);assert.equal(result.writes,'NONE');assert(result.checks.some(c=>c.scope==='REQUEST'));assert(result.checks.some(c=>c.scope==='SIGNATURE'));
 const missing=reviewE1Request({...request,specification:''});assert(missing.findings.some(f=>f.title==='試驗規範／手法'));assert.match(missing.summary,/未呼叫 AI 模型/);
});
test('E1 parses the actual workbook and never treats an empty report as a valid measured result',async()=>{
 const bytes=await createReportTemplate(request),report={requestId:request.id,revision:'SYNTH-REV-1',stage:'level2',fileName:'SYNTH-report.xlsx',signedExcel:bytes,submitterId:'U003',approvals:[]},s=store();
 const r=await reviewE1Report({actorId:'U001',requestId:request.id,expectedRevision:report.revision},s,{get:async()=>report});assert.equal(r.real_ai,false);assert(r.findings.some(c=>c.title==='試驗結果已填寫'));assert.equal(s.getItem('dqa-schedules-demo-v1'),'KEEP_SCHEDULE');
 let calls=0;await assert.rejects(()=>reviewE1Report({actorId:'U001',requestId:request.id,expectedRevision:report.revision},s,{get:async()=>{if(++calls===3)s.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id==='U001'?{...a,status:'已停用'}:a)));return report;}}),/權限已變更/);
});
const input={title:'合成試驗管理週報',purpose:'追蹤目前合成試驗',kind:'SPECIAL',columns:[{key:'requestId',label:'委託編號'},{key:'status',label:'狀態'},{key:'verdict',label:'試驗判定'}],rows:[{requestId:'REQ-2026-001',status:'試驗中'},{requestId:'REQ-2026-002',status:'已完成',verdict:'未登錄'}],sectionTitles:['特殊試驗說明','改善計畫'],scope:'本機合成來源',now:Date.parse('2026-11-14T12:00:00+08:00')};
test('E3 custom sections retain actual filtered rows and missing evidence; zero records remain zero',()=>{
 const original=JSON.stringify(input),d=makeE3Draft(input);assert.equal(d.engine,'E3');assert.equal(d.real_ai,false);assert.equal(d.rowCount,2);assert.equal(d.rows[0].verdict,'');assert.equal(d.rows[1].verdict,'未登錄');assert.match(d.sections.find(s=>s.title==='狀態分佈').text,/試驗中：1 列/);assert(d.sections.some(s=>s.title==='改善計畫'&&s.text.includes('尚未提供')));assert.equal(JSON.stringify(input),original);
 const empty=makeE3Draft({...input,rows:[]});assert.equal(empty.rowCount,0);assert.match(empty.sections.find(s=>s.title==='狀態分佈').text,/沒有來源資料/);
 for(const patch of [{columns:[]},{title:'超'.repeat(41)},{sectionTitles:Array(9).fill('章節')},{rows:[{status:{bad:'SHAPE'}}]}])assert.throws(()=>makeE3Draft({...input,...patch}));
});
test('E3 emits usable Excel/PDF drafts, keeps actual source values and does not manufacture signatures or pass verdicts',async()=>{
 const draft=makeE3Draft(input),Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await buildE3Export(draft,'xlsx'));assert.deepEqual(book.worksheets.map(s=>s.name),['客製報告草稿','來源資料']);assert.equal(book.getWorksheet('來源資料').getCell('C2').text,'');assert.equal(book.getWorksheet('來源資料').getCell('C3').text,'未登錄');
 const fontBytes=await fs.readFile(new URL('../public/fonts/NotoSansCJKtc-Regular.otf',import.meta.url)),pdf=await buildE3Export(draft,'pdf',{fontBytes});assert.equal(Buffer.from(pdf.subarray(0,4)).toString(),'%PDF');
 const empty=makeE3Draft({...input,rows:[]});await book.xlsx.load(await buildE3Export(empty,'xlsx'));assert.equal(book.getWorksheet('來源資料').rowCount,1);
});
test('E3 requires current report page access; disabled users and roles without reports access are refused',()=>{
 const s=store(),session={getItem:()=> 'U001'};assert.equal(authorizeE3Export(s,session),'U001');s.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id==='U001'?{...a,status:'已停用'}:a)));assert.throws(()=>authorizeE3Export(s,session),/權限/);
});
