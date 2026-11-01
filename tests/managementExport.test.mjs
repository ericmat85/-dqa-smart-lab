import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {excelModule} from '../src/reportWorkbook.mjs';
import {buildManagementExport} from '../src/managementExport.mjs';
import {saveManagementPreferences,readManagementPreferences} from '../src/managementPreferences.mjs';
const columns=[{key:'id',label:'委託編號'},{key:'name',label:'中文名稱'},{key:'count',label:'數量'}];
const rows=Array.from({length:55},(_,i)=>({id:`REQ-${i}`,name:'設備試驗數據',count:i}));
test('Excel exports all matching rows, typed values, chosen columns and optional metadata',async()=>{
 const bytes=await buildManagementExport({type:'xlsx',title:'測試',columns,rows,summary:'全部日期'});const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);
 assert.equal(book.worksheets[0].rowCount,56);assert.equal(book.worksheets[0].getCell('A56').value,'REQ-54');assert.equal(book.worksheets[0].getCell('C56').value,54);assert.equal(book.worksheets[1].name,'匯出摘要');
 const lean=new Excel.Workbook();await lean.xlsx.load(await buildManagementExport({type:'xlsx',title:'測試',columns:columns.slice(0,1),rows}));assert.equal(lean.worksheets.length,1);assert.equal(lean.worksheets[0].columnCount,1);
});
test('Chinese PDF supports multiple pages and valid metadata',async()=>{
 const fontBytes=await readFile(new URL('../public/fonts/NotoSansCJKtc-Regular.otf',import.meta.url));
 const bytes=await buildManagementExport({type:'pdf',title:'中文試驗排程',columns,rows,summary:'篩選：全部日期',fontBytes});const doc=await PDFDocument.load(bytes);assert.equal(doc.getTitle(),'中文試驗排程');assert.ok(doc.getPageCount()>1);assert.equal(String.fromCharCode(...bytes.slice(0,4)),'%PDF');
});
test('invalid exports and storage failures stay errors; preferences normalize',async()=>{
 await assert.rejects(buildManagementExport({type:'csv',columns,rows}),/不支援/);await assert.rejects(buildManagementExport({type:'xlsx',columns,rows:[]}),/有資料/);
 let saved;const storage={getItem:()=>saved,setItem:(_,value)=>{saved=value;}};assert.deepEqual(readManagementPreferences(storage),{reportPeriod:'all',exportSummary:true,equipmentDays:14,equipmentStart:''});saveManagementPreferences({reportPeriod:'month',exportSummary:false},storage);assert.equal(readManagementPreferences(storage).reportPeriod,'month');assert.equal(readManagementPreferences(storage).exportSummary,false);assert.throws(()=>saveManagementPreferences({}, {setItem(){throw Error('quota');}}),/quota/);
});
