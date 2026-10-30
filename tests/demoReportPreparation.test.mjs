import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareDemoReport,passedDemoReview} from '../src/demoReportPreparation.mjs';
import {excelModule,inspectReport} from '../src/reportWorkbook.mjs';
test('quick fill creates a downloadable case-bound ordinary report and runs actual rules',async()=>{
 const request={id:'REQ-QUICK-1',productCode:'PRODUCT-1',testItems:['低溫試驗'],quantity:3,specification:'DEMO -40°C，2 小時'};
 const prepared=await prepareDemoReport(request);
 assert.equal(prepared.fileName,'REQ-QUICK-1-DEMO.xlsx');assert.equal(passedDemoReview(prepared.check),true);
 assert.equal((await inspectReport(prepared.bytes,request.id,prepared.fileName,request)).ok,true);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(prepared.bytes);const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('B4').text,request.id);assert.equal(sheet.getCell('E4').text,request.productCode);assert.equal(sheet.getCell('E6').value,3);assert.match(sheet.getCell('B7').text,/-40°C/);
 assert.equal(request.status,undefined);
});
test('general quick fill respects the uploaded layout, product, quantity and customer',async()=>{
 const request={id:'REQ-QUICK-2',productCode:'PRODUCT-2',customer:'DEMO customer',quantity:2,testItems:['一般性能試驗']};
 const prepared=await prepareDemoReport(request,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 assert.equal(prepared.check.profileId,'general-performance-v1');assert.equal(passedDemoReview(prepared.check),true);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(prepared.bytes);const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('AK3').text,`DQA-${request.id}`);assert.equal(sheet.getCell('F13').text,request.productCode);assert.equal(sheet.getCell('N17').value,2);assert.equal(sheet.getCell('AC9').text,request.customer);
});
test('quick fill cannot hard-code a pass for missing required general report data',async()=>{
 await assert.rejects(prepareDemoReport({testItems:['一般性能試驗']}),/找不到本案/);
 await assert.rejects(prepareDemoReport({id:'REQ-INVALID',testItems:['一般性能試驗']},{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')}),error=>error.check?.ok===false);
 for(const check of [null,{ok:true},{engine:'Demo 規則式防呆檢查',ok:true,checks:[]},{engine:'Demo 規則式防呆檢查',ok:true,checks:[{ok:false}]}])assert.equal(passedDemoReview(check),false);
});
