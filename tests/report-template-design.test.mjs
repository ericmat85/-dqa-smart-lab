import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {excelModule,createReportTemplate,inspectReport,stampReport} from '../src/reportWorkbook.mjs';
import {requestWorkbookBytes} from '../src/requestDocumentWorkbook.mjs';
import {defaultTrialCatalog} from '../src/trialCatalogStore.mjs';
import {makeTrialTemplateWorkbook} from '../src/trialTemplateWorkbook.mjs';
import {labTemplateProfile,LAB_SIGNATURE_CELLS,trialProcedure} from '../src/labFormLayout.mjs';
import {reportToPdf} from '../src/reportPdf.mjs';
import {buildWorkbookView} from '../src/reportWorkbookView.mjs';
import {validateUploadedTemplate,inspectTemplateZip,saveUploadedTemplate,listUploadedTemplates,readUploadedTemplate} from '../src/reportTemplateStore.mjs';
import {memoryStorage} from '../src/guidedTourStorage.mjs';import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+s0AAAAASUVORK5CYII=';
const storage=()=>memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS)}),access={actorId:'U001',system:'lms'};
const repo=()=>{const rows=new Map();return {rows,async list(){return [...rows.values()];},async get(id){return rows.get(id);},async put(r,authorize){authorize();rows.set(r.id,structuredClone(r));}};};
test('all twenty forms preserve separate procedures, blank measurements and exact signature anchors',async()=>{
 const Excel=await excelModule();for(const row of defaultTrialCatalog()){
  const book=new Excel.Workbook();await book.xlsx.load(await makeTrialTemplateWorkbook(row));assert.deepEqual(labTemplateProfile(book).cells,LAB_SIGNATURE_CELLS);
  assert.equal(book.getWorksheet('委託單').getCell('C19').text,`試驗項目 Test item：${row.name}`);assert.equal(book.getWorksheet('報告首頁').getCell('C12').text,row.name);
  assert.equal(book.getWorksheet('報告首頁').getCell('A44').text,'');for(const p of ['C55','F55','I55'])assert.equal(book.getWorksheet('報告首頁').getCell(p).text,'');
  for(const p of ['C12','G12','C16','G16','C20','G20'])assert.equal(book.getWorksheet('結果與照片').getCell(p).text,'');
  assert.match(book.getWorksheet('試驗過程').getCell('C14').text,new RegExp(trialProcedure(row)[0].slice(0,4)));
  assert.equal(book.getWorksheet('報告首頁').pageSetup.orientation,'portrait');assert.equal(book.getWorksheet('報告首頁').pageSetup.fitToWidth,1);
 }
});
test('new case report checks blank results, fixes three signatures and renders three A4 report pages',async()=>{
 const row=defaultTrialCatalog()[2],request={id:'REQ-2026-998',productCode:'SYNTH-ONLY',testItems:[row.name],specification:row.specification,quantity:2};
 assert.equal((await inspectReport(await createReportTemplate(request,false),request.id,'blank.xlsx',request)).ok,false);
 let bytes=await createReportTemplate(request,true),check=await inspectReport(bytes,request.id,'demo.xlsx',request);assert.equal(check.ok,true);assert.deepEqual(check.cells,LAB_SIGNATURE_CELLS);
 await assert.rejects(stampReport(bytes,{...check,cells:{...check.cells,level2:'F54'},level:2,signature,actor:'DEMO',at:'2026-11-16T00:00:00Z'}),/固定/);
 for(const [level,actor]of [['executor','DEMO 執行人'],[2,'DEMO 確認'],[3,'DEMO 承認']])bytes=await stampReport(bytes,{...check,level,signature,actor,at:'2026-11-16T00:00:00Z'});
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const sheet=book.getWorksheet('報告首頁');assert.deepEqual(sheet.getImages().map(i=>[i.range.tl.col,i.range.tl.row]),[[8,54],[5,54],[2,54]]);assert.match(sheet.getCell('C59').text,/DEMO 承認/);assert.match(sheet.getCell('F59').text,/DEMO 確認/);assert.match(sheet.getCell('I59').text,/DEMO 執行人/);
 const fontBytes=await fs.readFile('public/fonts/NotoSansCJKtc-Regular.otf'),pdf=await reportToPdf(bytes,{fontBytes});const {PDFDocument}=await import('pdf-lib'),doc=await PDFDocument.load(pdf);assert.equal(doc.getPageCount(),3);for(const page of doc.getPages())assert(page.getWidth()<page.getHeight());
});
test('request signatures use only case records, with supervisor left and requester right',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await requestWorkbookBytes({id:'REQ-2026-998',ownerId:'DEMO-REQUESTER',requester:'Demo',requesterSignature:signature,requesterSignatureAt:'2026-11-16',supervisorSignature:signature,supervisorSignatureAt:'2026-11-17',approver:'主管'}));
 const s=book.getWorksheet('委託單');assert.equal(s.getImages().length,2);const cols=s.getImages().map(i=>i.range.tl.col).sort((a,b)=>a-b);assert(cols[0]>2&&cols[0]<3);assert(cols[1]>7&&cols[1]<8);assert.equal(s.getCell('C44').text,'');assert.equal(s.getCell('H44').text,'');
 const blank=new Excel.Workbook();await blank.xlsx.load(await requestWorkbookBytes({}));assert.equal(blank.getWorksheet('委託單').getImages().length,0);
});
test('upload validates real XLSX and rejects formula, macro extension, fake inflated size and missing confirmation',async()=>{
 const bytes=await requestWorkbookBytes({});assert.equal((await validateUploadedTemplate(bytes,'blank.xlsx')).sheets[0],'委託單');
 await assert.rejects(validateUploadedTemplate(bytes,'macro.xlsm'),/xlsx/);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);book.worksheets[0].getCell('C5').value={formula:'1+1',result:2};await assert.rejects(validateUploadedTemplate(new Uint8Array(await book.xlsx.writeBuffer()),'formula.xlsx'),/公式/);
 const forged=bytes.slice(),d=new DataView(forged.buffer),entry=inspectTemplateZip(forged).entries.find(e=>e.unpacked>100);let pos=0;for(let i=0;i<forged.length-46;i++)if(d.getUint32(i,true)===0x02014b50&&d.getUint32(i+42,true)+30+d.getUint16(d.getUint32(i+42,true)+26,true)+d.getUint16(d.getUint32(i+42,true)+28,true)===entry.dataStart){pos=i;break;}assert(pos>0);d.setUint32(pos+24,1,true);await assert.rejects(validateUploadedTemplate(forged,'forged.xlsx'),/實際解壓縮/);
 const s=storage(),r=repo(),file=new File([bytes],'blank.xlsx');await assert.rejects(saveUploadedTemplate(file,access,s,r),/合成/);assert.equal(r.rows.size,0);
});
test('upload, shared readback and downloads recheck permissions and byte integrity',async()=>{
 const s=storage(),r=repo(),bytes=await requestWorkbookBytes({}),file=new File([bytes],'合成委託.xlsx'),saved=await saveUploadedTemplate(file,{...access,syntheticConfirmed:true,trialId:'BLANK'},s,r);
 assert.equal((await listUploadedTemplates(access,s,r))[0].id,saved.id);assert.deepEqual((await readUploadedTemplate(saved.id,access,s,r)).bytes,bytes);
 r.rows.get(saved.id).bytes[10]^=1;await assert.rejects(readUploadedTemplate(saved.id,access,s,r),/完整性/);
 await assert.rejects(saveUploadedTemplate(file,{actorId:'DEMO-LEVEL3',syntheticConfirmed:true},s,r),/權限/);
 const c=new AbortController();c.abort();await assert.rejects(saveUploadedTemplate(file,{...access,syntheticConfirmed:true,signal:c.signal},s,r),/取消/);
 const revoked={name:'revoked.xlsx',size:bytes.length,async arrayBuffer(){s.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id==='U001'?{...a,status:'已停用'}:a)));return bytes.buffer;}};
 await assert.rejects(saveUploadedTemplate(revoked,{...access,syntheticConfirmed:true},s,r),/權限/);
});
test('template upload ignores empty formatting and empty merges outside the print area without changing the file',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('合成委託單');
 sheet.getCell('A1').value='空白委託單';sheet.getCell('AQ43').value='簽名欄位';sheet.mergeCells('A2:AR2');sheet.pageSetup.printArea='A1:AR45';
 sheet.getCell('CK45').font={bold:true};sheet.getCell('CK3000').border={bottom:{style:'thin'}};sheet.mergeCells('CB40:CK40');
 const bytes=new Uint8Array(await book.xlsx.writeBuffer()),file=new File([bytes],'合成空白委託.xlsx'),s=storage(),r=repo();
 assert.deepEqual((await validateUploadedTemplate(bytes,file.name)).declaredTrials,[]);
 const saved=await saveUploadedTemplate(file,{...access,syntheticConfirmed:true,trialId:'BLANK'},s,r),loaded=await readUploadedTemplate(saved.id,access,s,r);
 assert.deepEqual(loaded.bytes,bytes);const view=await buildWorkbookView(loaded.bytes);
 assert.equal(view.sheets[0].rows.length,45);assert.equal(view.sheets[0].widths.length,44);
 assert(view.sheets[0].rows.flatMap(row=>row.cells).some(cell=>cell.address==='AQ43'&&cell.text==='簽名欄位'));
});
test('template bounds still reject real distant content, print areas, nonempty merges and image anchors',async()=>{
 const Excel=await excelModule();
 for(const configure of [s=>{s.getCell('AW1').value='實際內容';},s=>{s.getCell('A2001').value='實際內容';},s=>{s.pageSetup.printArea='A1:AW45';},s=>{s.mergeCells('AU2:AW2');s.getCell('AU2').value='不可忽略';},(s,b)=>{const id=b.addImage({base64:signature,extension:'png'});s.addImage(id,'AW1:AX3');}]){
  const book=new Excel.Workbook(),sheet=book.addWorksheet('合成範本');sheet.getCell('A1').value='空白欄位';sheet.pageSetup.printArea='A1:AR45';configure(sheet,book);
  await assert.rejects(validateUploadedTemplate(new Uint8Array(await book.xlsx.writeBuffer()),'oversized.xlsx'),/實際內容或列印範圍.*超過支援的 2,000 列、48 欄/);
 }
});
