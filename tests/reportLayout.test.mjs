import test from 'node:test';
import assert from 'node:assert/strict';
import {excelModule,createReportTemplate,inspectReport} from '../src/reportWorkbook.mjs';
import {reportBounds,cellText} from '../src/reportLayout.mjs';
test('formatting to XFD and row 3000 does not reject a filled Demo report',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();
 await book.xlsx.load(await createReportTemplate({id:'REQ-TEST'},true));
 const sheet=book.worksheets[0];sheet.getCell('XFD3000').font={bold:true};
 const reread=new Excel.Workbook();await reread.xlsx.load(await book.xlsx.writeBuffer());
 assert.equal(reread.worksheets[0].getCell('XFD3000').font.bold,true);
 assert.equal(reread.worksheets[0].rowCount,3000);
 assert.deepEqual(reportBounds(sheet),{rows:24,columns:9});
 assert.equal((await inspectReport(await book.xlsx.writeBuffer(),'REQ-TEST','report.xlsx')).ok,true);
});
test('real out-of-range content is rejected rather than silently dropped',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('report');
 sheet.getCell('AY1').value='real data';assert.throws(()=>reportBounds(sheet),/51 欄/);
 sheet.getCell('AY1').value=null;sheet.pageSetup.printArea='A1:AZ10';assert.throws(()=>reportBounds(sheet),/52 欄/);
});
test('empty merged cells can be read safely',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('report');
 sheet.mergeCells('A1:B2');assert.equal(cellText(sheet.getCell('B2')),'');
});
test('reference documents and unsupported report layouts give actionable errors',async()=>{
 const Excel=await excelModule(),book=new Excel.Workbook();book.addWorksheet('reference').getCell('XFD1').font={bold:true};
 const bytes=await book.xlsx.writeBuffer();
 await assert.rejects(inspectReport(bytes,'REQ','一般性能試驗檢查篩檢條件表_V0.0.xlsx'),/參考表/);
 await assert.rejects(inspectReport(bytes,'REQ','正式報告.xlsx'),/此檔版型無法安全套用簽名/);
});
