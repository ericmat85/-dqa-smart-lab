import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {excelModule,createReportTemplate,inspectReport} from '../src/reportWorkbook.mjs';
import {reportBounds} from '../src/reportLayout.mjs';
const templateBytes=await readFile('public/templates/general-performance-v1.xlsx');
const request={id:'REQ-GENERAL-TEST',productCode:'GENERAL-DEMO-001',testItems:['一般性能試驗']};
const generated=demo=>createReportTemplate(request,demo,{templateBytes});
test('the actual uploaded template ignores empty XFD merges but never passes as a finished report',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(templateBytes);
 assert.ok(book.worksheets[0].model.merges.includes('XEO47:XFD47'));
 assert.deepEqual(book.worksheets.map(sheet=>reportBounds(sheet)),[{rows:57,columns:44},{rows:229,columns:48}]);
 const check=await inspectReport(templateBytes,request.id,'1.1_一般性能試驗範本.xlsx',request);
 assert.equal(check.profileId,'general-performance-v1');assert.equal(check.ok,false);
 for(const label of ['報告編號對應本案','結果摘要已填寫','合格／不合格擇一勾選','試驗明細已有填寫'])assert.equal(check.checks.find(row=>row.label===label).ok,false);
});
test('downloaded templates bind report number and product without inventing results',async()=>{
 const blank=await inspectReport(await generated(false),request.id,'report.xlsx',request);
 assert.equal(blank.ok,false);assert.equal(blank.checks.find(row=>row.label==='報告編號對應本案').ok,true);
 assert.equal(blank.checks.find(row=>row.label==='試驗明細已有填寫').ok,false);
 const demo=await inspectReport(await generated(true),request.id,'report.xlsx',request);
 assert.equal(demo.ok,true);assert.deepEqual(demo.cells,{level3:'F54',level2:'S54',executor:'AF54'});
});
test('wrong case, wrong test type, mismatched product and conflicting judgments do not pass',async()=>{
 const bytes=await generated(true);
 assert.equal((await inspectReport(bytes,'OTHER','report.xlsx',request)).ok,false);
 assert.equal((await inspectReport(bytes,request.id,'report.xlsx',{...request,testItems:['高溫儲存試驗']})).ok,false);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);
 book.worksheets[0].getCell('AL48').value='☑';book.worksheets[0].getCell('F13').value='OTHER';
 const check=await inspectReport(await book.xlsx.writeBuffer(),request.id,'report.xlsx',request);
 assert.equal(check.checks.find(row=>row.label==='品番已填寫且對應委託單').ok,false);
 assert.equal(check.checks.find(row=>row.label==='合格／不合格擇一勾選').ok,false);
});
test('external formulas and actual data past the print area remain blocked',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await generated(true));
 book.worksheets[1].getCell('Q82').value={formula:"'[other.xlsx]Sheet1'!A1",result:22};
 assert.equal((await inspectReport(await book.xlsx.writeBuffer(),request.id,'report.xlsx',request)).ok,false);
 book.worksheets[0].getCell('XFD47').value='must not be discarded';
 assert.throws(()=>reportBounds(book.worksheets[0]),/16384 欄/);
});

test('invalid calendar dates, formula errors and extra report sheets remain review failures',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await generated(true));
 book.worksheets[0].getCell('AC13').value='2026-02-31';
 book.worksheets[1].getCell('Q82').value={formula:'1/0',result:{error:'#DIV/0!'}};
 book.addWorksheet('extra').getCell('A1').value='must not disappear';
 const check=await inspectReport(await book.xlsx.writeBuffer(),request.id,'report.xlsx',request);
 for(const label of ['報告日期已填寫','公式無錯誤值','工作表符合已接入版型'])assert.equal(check.checks.find(row=>row.label===label).ok,false);
});
