import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildWorkbookView,readReportWorkbook} from '../src/reportWorkbookView.mjs';
import {createReportTemplate,excelModule,stampReport} from '../src/reportWorkbook.mjs';
import {ROLE} from '../src/demoPermissions.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('viewer reads every visible worksheet, merged cells, fixed decimals and embedded signatures without changing bytes',async()=>{
 const template=await createReportTemplate({id:'VIEW',productCode:'DEMO',quantity:2,testItems:['一般性能試驗']},true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 const bytes=await stampReport(template,{sheetName:'1.1一般性能試驗-1',cells:{level3:'F54',level2:'S54',executor:'AF54'},level:'executor',signature:png,actor:'DEMO executor',at:'2026-10-30T00:00:00Z'}),before=Buffer.from(bytes).toString('base64');
 const model=await buildWorkbookView(bytes);assert.equal(model.sheets.length,2);
 const first=model.sheets[0],detail=model.sheets[1],cell=(sheet,address)=>sheet.rows.flatMap(row=>row.cells).find(row=>row.address===address);
 assert.equal(first.images.length,1);assert.equal(cell(first,'AF54').colSpan,13);assert.equal(cell(first,'AF54').rowSpan,4);assert.equal(cell(first,'AG54'),undefined);
 assert.equal(cell(first,'F13').text,'DEMO');assert.equal(cell(detail,'Q193').text,'4.90');assert.equal(cell(detail,'Q189').text,'9.0');assert.equal(cell(detail,'Q166').text,'29.80');assert.equal(cell(detail,'AA147').text,'N/A');assert.equal(cell(detail,'Q91').text,'298 ms\nOK');
 assert.equal(detail.rows.length>=229,true);assert.equal(first.widths.length,44);assert.equal(Buffer.from(bytes).toString('base64'),before);
});
test('viewer treats formulas as cached text and hides hidden sheets with an explicit notice',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('Visible');sheet.getCell('A1').value='<script>not executed</script>';sheet.getCell('B1').value={formula:'1+1'};book.addWorksheet('Hidden',{state:'hidden'}).getCell('A1').value='hidden data';
 const model=await buildWorkbookView(await book.xlsx.writeBuffer());assert.equal(model.sheets.length,1);assert.match(model.warnings.join(' '),/公式沒有/);assert.match(model.warnings.join(' '),/隱藏/);assert.equal(model.sheets[0].rows[0].cells[0].text,'<script>not executed</script>');
});
test('read access uses current role, case and revision and never writes or creates a PDF',async()=>{
 const report={requestId:'CASE',revision:'R1',stage:'level2',submitterId:'LAB',approvals:[],fileName:'case.xlsx',signedExcel:new Uint8Array([1,2]).buffer},source={id:'CASE',ownerId:'OWNER',supervisorId:'SUP',status:'待審核'},actor={id:'L2',role:ROLE.LEVEL2,status:'啟用中'};
 const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify([actor])],['dqa-request-demo-v2',JSON.stringify([source])]]),storage={getItem:key=>data.get(key)||null};
 const repository={get:async()=>structuredClone(report)};
 assert.equal((await readReportWorkbook({actorId:'L2',requestId:'CASE',expectedRevision:'R1'},storage,repository)).fileName,'case.xlsx');assert.equal(report.pdf,undefined);assert.equal(report.revision,'R1');
 await assert.rejects(readReportWorkbook({actorId:'L2',requestId:'CASE',expectedRevision:'OLD'},storage,repository),/版本已更新/);
 data.set('dqa-shared-demo-accounts-v1',JSON.stringify([{...actor,status:'停用'}]));await assert.rejects(readReportWorkbook({actorId:'L2',requestId:'CASE'},storage,repository),/無權檢視/);
 data.set('dqa-shared-demo-accounts-v1',JSON.stringify([{...actor,id:'OTHER',role:ROLE.REQUESTER}]));await assert.rejects(readReportWorkbook({actorId:'OTHER',requestId:'CASE'},storage,repository),/無權檢視/);
});
