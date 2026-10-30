import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {createCompletedDemoFlow} from '../src/completedDemoFlow.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {createReportTemplate,inspectReport,stampReport,excelModule} from '../src/reportWorkbook.mjs';
import {submitReportWorkflow,approveReportWorkflow,confirmReportViewed} from '../src/reportWorkflow.mjs';
import {canReviewReport,canConfirmReport,reportMetadata} from '../src/reportRules.mjs';
import {syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
import {readLabSnapshot,deriveLabMetrics} from '../src/labData.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function fixture(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS)],['dqa-request-demo-v2','[]'],['dqa-lms-reviews-v1','[]'],['dqa-schedules-demo-v1','[]'],['dqa-equipment-demo-v1',JSON.stringify(DEMO_EQUIPMENT)]]);const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};const result=createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now:Date.parse('2026-10-29T01:30:00+08:00')},storage);let record=null;const repository={get:async()=>structuredClone(record),save:async(value,revision)=>{assert.equal(record?.revision??null,revision);record=structuredClone(value);},list:async()=>record?[reportMetadata(record)]:[]};return {storage,repository,id:result.id,source:()=>JSON.parse(storage.getItem('dqa-request-demo-v2'))[0]};}
const upload=async request=>new File([await createReportTemplate(request,true)],'report.xlsx');
test('real Excel submission, two distinct supervisor signatures, requester confirmation and Chinese PDF archive',async()=>{
 const {storage,repository,id,source}=fixture();
 const progress=[];let meta=await submitReportWorkflow({requestId:id,file:await upload(source()),actorId:'U003',signature,minimumMs:0,onProgress:value=>progress.push(value)},storage,repository);
 assert.equal((await repository.get(id)).pdf,undefined);
 assert.equal(meta.stage,'level2');assert.equal(source().status,'待審核');assert.deepEqual(progress,[20,45,80,100]);
 assert.ok(!storage.getItem('dqa-request-demo-v2').includes('signedExcel'));assert.ok(!storage.getItem('dqa-request-demo-v2').includes('submitterSignature'));
 await assert.rejects(approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL3',signature,expectedRevision:meta.revision},storage,repository));
 const first=meta.revision;meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',signature,expectedRevision:first},storage,repository);assert.equal(meta.stage,'level3');
 await assert.rejects(approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',signature,expectedRevision:first},storage,repository));
 await assert.rejects(confirmReportViewed({requestId:id,actorId:'DEMO-SUPERVISOR',expectedRevision:meta.revision},storage,repository));
 meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL3',signature,expectedRevision:meta.revision},storage,repository);assert.equal(meta.stage,'view');assert.equal(source().status,'待查閱');
 assert.equal((await repository.get(id)).pdf,undefined);
 const stored=await repository.get(id),Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(stored.signedExcel);const sheet=book.getWorksheet(stored.sheetName);
 assert.equal(sheet.getImages().length,3);assert.deepEqual(sheet.getImages().map(row=>[Math.floor(row.range.tl.col),Math.floor(row.range.tl.row)]),[[6,20],[3,20],[0,20]]);assert.match(sheet.getCell('A22').text,/三階/);assert.match(sheet.getCell('D22').text,/二階/);assert.match(sheet.getCell('G22').text,/陳/);
 const original=new Excel.Workbook();await original.xlsx.load(stored.original);assert.equal(original.worksheets[0].getImages().length,0);
 syncScheduleLifecycle(storage,Date.parse('2026-11-01T01:30:00+08:00'));assert.equal(source().status,'待查閱');assert.equal(JSON.parse(storage.getItem('dqa_lab_demo_requests_v1'))[0].status,'待查閱');
 await assert.rejects(confirmReportViewed({requestId:id,actorId:'DEMO-REQUESTER',expectedRevision:meta.revision},storage,repository));
 meta=await confirmReportViewed({requestId:id,actorId:'DEMO-SUPERVISOR',expectedRevision:meta.revision,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},storage,repository);
 assert.equal(meta.stage,'archived');assert.equal(source().status,'已結案');const archived=await repository.get(id);assert.equal(Buffer.from(archived.pdf).subarray(0,5).toString(),'%PDF-');assert.ok(archived.pdf.byteLength>1000);
 const {PDFDocument,PDFName}=await import('pdf-lib');const pdf=await PDFDocument.load(archived.pdf);assert.ok(pdf.getPageCount()>0);assert.ok(pdf.getPages().some(page=>page.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length>=2));
 syncScheduleLifecycle(storage,Date.now());assert.equal(source().status,'已結案');assert.equal(JSON.parse(storage.getItem('dqa-schedules-demo-v1'))[0].status,'已結案');
 const metrics=deriveLabMetrics(readLabSnapshot(storage));assert.equal(Object.values(metrics.counts).reduce((sum,value)=>sum+value,0),metrics.schedules.length);assert.equal(metrics.counts['已完成'],1);
});
test('report checks reject mismatched IDs, missing results, invalid Excel and unsafe signature targets',async()=>{
 const bytes=await createReportTemplate({id:'CASE'});assert.equal((await inspectReport(bytes,'OTHER','report.xlsx')).ok,false);assert.equal((await inspectReport(bytes,'CASE','report.xlsx')).ok,false);
 await assert.rejects(inspectReport(new Uint8Array([1,2]),'CASE','report.xlsx'));await assert.rejects(inspectReport(bytes,'CASE','report.xls'));
 await assert.rejects(stampReport(bytes,{sheetName:'試驗報告',cells:{level2:'A4',level3:'D21'},level:2,signature,actor:'X',at:new Date().toISOString()}));
 await assert.rejects(stampReport(bytes,{sheetName:'試驗報告',cells:{level2:'A21',level3:'B21'},level:2,signature,actor:'X',at:new Date().toISOString()}));
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await createReportTemplate({id:'CASE'},true));book.worksheets[0].getCell('B12').value={formula:'1+1'};assert.equal((await inspectReport(new Uint8Array(await book.xlsx.writeBuffer()),'CASE','report.xlsx')).ok,false);
});
test('disabled accounts, wrong roles, self review and duplicate signatures cannot approve',()=>{
 const source={ownerId:'owner',supervisorId:'supervisor'},report={stage:'level2',submitterId:'lab',approvals:[]},actor=INITIAL_ACCOUNTS.find(row=>row.id==='DEMO-LEVEL2');
 assert.equal(canReviewReport(actor,report,source),true);assert.equal(canReviewReport({...actor,status:'已停用'},report,source),false);assert.equal(canReviewReport({...actor,id:'owner'},report,source),false);assert.equal(canReviewReport({...actor,id:'lab'},report,source),false);assert.equal(canReviewReport(actor,{...report,approvals:[{actorId:actor.id}]},source),false);assert.equal(canReviewReport(actor,report,{...source,status:'取消'}),false);
 assert.equal(canConfirmReport({id:'supervisor',status:'啟用中',role:'委託者主管'},{stage:'view'},source),true);assert.equal(canConfirmReport({id:'owner',status:'啟用中'},{stage:'view'},source),false);assert.equal(canConfirmReport({id:'supervisor',role:'實驗室工程師',status:'啟用中'},{stage:'view'},source),false);
});
test('invalid or duplicate submission never advances the source case',async()=>{
 const {storage,repository,id,source}=fixture();await assert.rejects(submitReportWorkflow({requestId:id,file:new File([await createReportTemplate(source())],'report.xlsx'),signature,actorId:'U003',minimumMs:0},storage,repository));assert.equal(await repository.get(id),null);assert.equal(source().status,'已完成');
 await submitReportWorkflow({requestId:id,file:await upload(source()),signature,actorId:'U003',minimumMs:0},storage,repository);
 await assert.rejects(submitReportWorkflow({requestId:id,file:await upload(source()),signature,actorId:'U003',minimumMs:0},storage,repository));assert.equal(source().status,'待審核');
});

test('report return keeps review history, restarts signatures and creates an ordered closure dossier',async()=>{
 const {returnReportWorkflow}=await import('../src/reportWorkflow.mjs');const {storage,repository,id,source}=fixture();
 let meta=await submitReportWorkflow({requestId:id,file:await upload(source()),actorId:'U003',signature,minimumMs:0},storage,repository);
 await assert.rejects(returnReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',comment:' ',expectedRevision:meta.revision},storage,repository));
 meta=await returnReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',comment:'補充結果',expectedRevision:meta.revision},storage,repository);
 assert.equal(meta.stage,'returned');assert.equal(source().status,'已完成');assert.equal(meta.returnReason,'補充結果');
 meta=await submitReportWorkflow({requestId:id,file:await upload(source()),actorId:'U003',signature,minimumMs:0},storage,repository);assert.equal(meta.revisionNumber,2);assert.ok(meta.history.some(row=>row.action.includes('補充結果')));
 meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',signature,expectedRevision:meta.revision},storage,repository);
 meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL3',signature,expectedRevision:meta.revision},storage,repository);
 meta=await confirmReportViewed({requestId:id,actorId:'DEMO-SUPERVISOR',expectedRevision:meta.revision,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},storage,repository);
 assert.deepEqual(meta.pdfSections.map(row=>row.kind),['request','report']);assert.equal(meta.pdfSections[0].firstPage,1);assert.equal(meta.pdfSections[1].firstPage,meta.pdfSections[0].pageCount+1);
 const {PDFDocument}=await import('pdf-lib'),report=await repository.get(id);const pdf=await PDFDocument.load(report.pdf);assert.equal(pdf.getPageCount(),meta.pdfSections.reduce((total,row)=>total+row.pageCount,0));assert.match(meta.pdfName,/結案文件-DEMO/);
});
test('role changes never allow the same actor to review a different level in the same case',()=>{
 const source={ownerId:'OWNER',supervisorId:'SUP',signatureRecords:[{stage:1,decision:'核准',actorId:'CHANGED'}]};
 assert.equal(canReviewReport({id:'CHANGED',role:'二階主管',status:'啟用中'},{stage:'level2',submitterId:'LAB',approvals:[]},source),false);
 assert.equal(canReviewReport({id:'CHANGED',role:'三階主管',status:'啟用中'},{stage:'level3',submitterId:'LAB',approvals:[],priorApprovals:[{actorId:'CHANGED',level:2}]},{ownerId:'OWNER'}),false);
});

test('submission uses system signature positions and ignores caller overrides',async()=>{
 const {storage,repository,id,source}=fixture();
 await submitReportWorkflow({requestId:id,file:await upload(source()),actorId:'U003',signature,cells:{level3:'Z99'},minimumMs:0},storage,repository);
 assert.deepEqual((await repository.get(id)).cells,{level3:'A21',level2:'D21',executor:'G21'});
});

test('general performance template keeps its signature blocks and archives seven report pages',async()=>{
 const {storage,repository,id,source}=fixture();
 const requests=JSON.parse(storage.getItem('dqa-request-demo-v2'));requests[0].testItems=['一般性能試驗'];storage.setItem('dqa-request-demo-v2',JSON.stringify(requests));
 const bytes=await createReportTemplate(source(),true,{templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 let meta=await submitReportWorkflow({requestId:id,file:new File([bytes],'general.xlsx'),actorId:'U003',signature,minimumMs:0},storage,repository);
 meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL2',signature,expectedRevision:meta.revision},storage,repository);
 meta=await approveReportWorkflow({requestId:id,actorId:'DEMO-LEVEL3',signature,expectedRevision:meta.revision},storage,repository);
 const report=await repository.get(id),Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(report.signedExcel);
 const sheet=book.getWorksheet('1.1一般性能試驗-1');
 assert.equal(sheet.getImages().length,3);assert.equal(sheet.getRow(54).height,17.25);
 assert.deepEqual(sheet.getImages().map(row=>[Math.floor(row.range.tl.col),Math.floor(row.range.tl.row)]),[[31,53],[18,53],[5,53]]);
 assert.match(sheet.getCell('F54').text,/三階/);assert.match(sheet.getCell('S54').text,/二階/);assert.match(sheet.getCell('AF54').text,/陳/);
 assert.equal(sheet.getCell('AC13').text.length>0,true);assert.equal(sheet.getCell('AK3').text,`DQA-${id}`);
 meta=await confirmReportViewed({requestId:id,actorId:'DEMO-SUPERVISOR',expectedRevision:meta.revision,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},storage,repository);
 assert.equal(meta.stage,'archived');assert.equal(meta.pdfSections.find(row=>row.kind==='report').pageCount,7);
 const {PDFDocument,PDFName}=await import('pdf-lib');const stored=await repository.get(id),pdf=await PDFDocument.load(stored.reportPdf);
 assert.equal(pdf.getPageCount(),7);assert.equal(pdf.getPages()[0].node.Resources().lookup(PDFName.of('XObject')).keys().length,4);
});
