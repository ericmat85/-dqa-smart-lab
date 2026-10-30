import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeReportText} from '../src/reportPresentation.mjs';
import {createReportTemplate,excelModule} from '../src/reportWorkbook.mjs';
import {cellText} from '../src/reportLayout.mjs';
test('precision applies to conditions and results without changing dates, clock times or sample identifiers',()=>{
 assert.equal(normalizeReportText('≤320 ms；0.5±0.25 s；30±1 秒；DC14V；9/16 V；2026-10-28 14:30'), '≤320 ms；0.50±0.25 s；30.00±1.00秒；DC14.0 V；9.0/16.0 V；2026-10-28 14:30');
});
test('approved example fills only the requested specimens, dates and fixed numeric precision',async()=>{
 const request={id:'REQ-FULL',productCode:'PRODUCT-FULL',quantity:2,testItems:['一般性能試驗'],purpose:['設計變更'],sampleSource:['廠商'],execution:{sampleCode:'ACTUAL-SAMPLE',plannedStart:'2026-11-01T01:00:00Z',completedAt:'2026-11-02T09:00:00Z'}};
 const bytes=await createReportTemplate(request,true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const cover=book.worksheets[0],sheet=book.worksheets[1];
 assert.equal(cover.getCell('AK3').text,'DQA-REQ-FULL');assert.equal(cover.getCell('N17').value,2);assert.equal(cover.getCell('F5').text,'■');assert.equal(cover.getCell('O5').text,'□');assert.equal(cover.getCell('F8').text,'■');
 assert.equal(sheet.getCell('J5').text,'11/01');assert.equal(sheet.getCell('M5').text,'11/02');assert.equal(sheet.getCell('P5').value,null);
 assert.equal(sheet.getCell('Q147').text,'0～2 Ω');assert.equal(sheet.getCell('V154').text,'242～1313 Ω');assert.equal(sheet.getCell('AA147').text,'N/A');
 assert.equal(cellText(sheet.getCell('Q166')),'29.80');assert.equal(cellText(sheet.getCell('Q123')),'0.48');assert.equal(cellText(sheet.getCell('Q193')),'4.90');assert.equal(cellText(sheet.getCell('Q189')),'9.0');assert.match(sheet.getCell('Q91').text,/^298 ms/);
 for(const a of ['F54','S54','AF54'])assert.equal(cover.getCell(a).fill.fgColor.argb,'FFFFFFFF');
 assert.equal(sheet.getCell('G168').text,'N/A');
});
test('more specimens than the template supports never generate an incomplete passing report',async()=>{
 await assert.rejects(createReportTemplate({id:'BIG',quantity:6,testItems:['一般性能試驗']},true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')}),/不得省略/);
});

test('all five specimen durations retain two decimal places, including 30.00 and clock drift',async()=>{
 const bytes=await createReportTemplate({id:'ALL',productCode:'P',quantity:5,testItems:['一般性能試驗']},true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[1];
 assert.equal(cellText(sheet.getCell('Q168')),'30.00');assert.equal(cellText(sheet.getCell('AK209')),'1.00');assert.equal(cellText(sheet.getCell('Q193')),'4.90');assert.equal(cellText(sheet.getCell('AK190')),'16.0');
});

test('ordinary report durations and hour conditions use two decimals too',async()=>{
 const bytes=await createReportTemplate({id:'HOURS',testItems:['高溫儲存試驗'],specification:'2小時、DC14V',execution:{plannedStart:'2026-10-28T01:00:00Z',completedAt:'2026-10-28T03:00:00Z'}},true);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);
 assert.equal(cellText(book.worksheets[0].getCell('E7')),'2.00');assert.match(book.worksheets[0].getCell('B7').text,/2.00小時/);
});

test('precision also applies to rich text criteria from the original Excel template',async()=>{
 const bytes=await createReportTemplate({id:'RICH',productCode:'P',quantity:1,testItems:['一般性能試驗']},true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[1];
 assert.match(sheet.getCell('A165').text,/30.00±1.00/);assert.match(sheet.getCell('E193').text,/5.00±0.50/);assert.match(sheet.getCell('K189').text,/0.2/);
});
