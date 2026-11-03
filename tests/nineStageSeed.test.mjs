import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNineStageSeed,nineStageCounts,SEED_ACTORS} from '../src/nineStageSeed.mjs';
import {reportMetadata} from '../src/reportRules.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const now=Date.now();
function memory(data=new Map()){return {getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key),data};}
let prepared;
async function fixture(){prepared||=buildNineStageSeed({signature,now,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},memory());const bundle=await prepared,s=memory(new Map(bundle.data)),reports=new Map(bundle.reports.map(r=>[r.requestId,r]));return {s,reports,bundle,repo:{get:async id=>reports.get(id),list:async()=>[...reports.values()].map(reportMetadata),save:async(report,revision)=>{assert.equal(reports.get(report.requestId)?.revision??null,revision);reports.set(report.requestId,report);}}};}
test('18 operable requests replace legacy cases: two per actual nine-stage projection and real Demo PDF dossiers',async()=>{
 const {s,reports}=await fixture();const requests=JSON.parse(s.getItem('dqa-request-demo-v2'));
 assert.equal(requests.length,18);assert.equal(new Set(requests.map(r=>r.id)).size,18);assert.deepEqual(nineStageCounts(s).map(r=>r.count),Array(9).fill(2));assert.equal(new Set(requests.map(r=>r.demoSeed.sampleCode)).size,18);
 assert.equal(JSON.parse(s.getItem('dqa-schedules-demo-v1')).length,14);assert.equal(JSON.parse(s.getItem('dqa_lab_demo_requests_v1')).length,12);
 for(const request of requests){assert.ok(request.demoSeed.equipmentId);assert.ok(request.demoSeed.operatorId);assert.ok(request.demoFlow.steps.length);assert.match(request.notes,/假資料/);}
 const {PDFDocument}=await import('pdf-lib');for(const id of ['DEMO-017','DEMO-018']){const report=reports.get(id);assert.equal(report.stage,'archived');assert.match(report.pdfName,/DEMO/);const pdf=await PDFDocument.load(report.pdf);assert.ok(pdf.getPageCount()>=2);assert.ok(report.pdfSections.length>=2);}
 const {readArchivedPdf}=await import('../src/reportArchive.mjs');await assert.rejects(readArchivedPdf({actorId:SEED_ACTORS.b,requestId:'DEMO-017',system:'request'},s,{get:async id=>reports.get(id)}));assert.ok((await readArchivedPdf({actorId:SEED_ACTORS.manager,requestId:'DEMO-017',system:'request'},s,{get:async id=>reports.get(id)})).bytes.byteLength>1000);
 const seeded=JSON.parse(s.getItem('dqa-equipment-demo-v1'));for(const old of DEMO_EQUIPMENT)assert.ok(seeded.some(r=>r.id===old.id));
 assert.equal(reports.get('DEMO-013').stage,'level2');assert.equal(reports.get('DEMO-014').stage,'level3');assert.equal(reports.get('DEMO-015').stage,'view');assert.ok(reports.get('DEMO-018').history.some(r=>r.action.includes('查閱退回')));
});
export {fixture,signature,now,memory};

const list=(s,key)=>JSON.parse(s.getItem(key)||'[]'),request=(s,id)=>list(s,'dqa-request-demo-v2').find(r=>r.id===id);
const setRequest=(s,row)=>s.setItem('dqa-request-demo-v2',JSON.stringify(list(s,'dqa-request-demo-v2').map(r=>r.id===row.id?row:r)));
test('stages 1–2 use existing manager and LMS decisions, with signature, return reason and self-review guards',async()=>{
 const {reviewRequesterDecision}=await import('../src/requestWorkflow.mjs'),{reviewElectronicRequest,reviewRevision}=await import('../src/electronicReview.mjs');const {s}=await fixture(),actors=list(s,'dqa-shared-demo-accounts-v1'),manager=actors.find(r=>r.id===SEED_ACTORS.manager);
 assert.throws(()=>reviewRequesterDecision(request(s,'DEMO-001'),actors.find(r=>r.id===SEED_ACTORS.a),{status:'已核准',signature}));
 setRequest(s,reviewRequesterDecision(request(s,'DEMO-001'),manager,{status:'已核准',signature}));assert.equal(request(s,'DEMO-001').status,'已核准');
 assert.throws(()=>reviewRequesterDecision(request(s,'DEMO-002'),manager,{status:'退件',comment:' '}));setRequest(s,reviewRequesterDecision(request(s,'DEMO-002'),manager,{status:'退件',comment:'Demo補充需求'}));assert.equal(request(s,'DEMO-002').status,'退件');
 for(const actorId of [SEED_ACTORS.level1,SEED_ACTORS.level2])reviewElectronicRequest({id:'DEMO-003',accountId:actorId,signature,expectedRevision:reviewRevision(request(s,'DEMO-003'))},s);assert.equal(request(s,'DEMO-003').status,'待排程');
 reviewElectronicRequest({id:'DEMO-004',accountId:SEED_ACTORS.level1,returnIt:true,comment:'Demo補充規範',expectedRevision:reviewRevision(request(s,'DEMO-004'))},s);assert.equal(request(s,'DEMO-004').status,'退件');
});
test('stages 3–5 schedule/receipt/trial transitions and conflict/cancel/interrupt paths are real operations',async()=>{
 const {s}=await fixture(),{validateSchedule}=await import('../src/scheduleEquipment.mjs'),{mergeLabSchedules}=await import('../src/labScheduleBridge.mjs'),{confirmLabReceipt,completeLabTrial}=await import('../src/labReceipts.mjs'),{submitLabOperation,decideLabOperation}=await import('../src/labOperations.mjs');
 const schedules=list(s,'dqa-schedules-demo-v1'),editing=schedules.find(r=>r.requestId==='DEMO-005'),busy=schedules.find(r=>r.requestId==='DEMO-007'),equipment=list(s,'dqa-equipment-demo-v1'),accounts=list(s,'dqa-shared-demo-accounts-v1');
 const form={equipmentId:busy.equipmentId,ownerId:busy.ownerId,sampleCode:editing.sampleCode,sampleVolumeLitres:1,time:busy.time.slice(0,10),end:busy.end.slice(0,10)};
 assert.throws(()=>validateSchedule({editing,form,equipment,accounts,rows:schedules}));
 const date=getDate(now+6*86400000);const next=validateSchedule({editing,form:{...form,time:date,end:date},equipment,accounts,rows:schedules});s.setItem('dqa-schedules-demo-v1',JSON.stringify(schedules.map(r=>r.id===next.id?next:r)));s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules(list(s,'dqa_lab_demo_requests_v1'),[next],now)));assert.equal(list(s,'dqa_lab_demo_requests_v1').find(r=>r.id==='DEMO-005').status,'待確認');
 confirmLabReceipt({requestId:'DEMO-007',actorId:SEED_ACTORS.labA,now},s);assert.equal(list(s,'dqa_lab_demo_requests_v1').find(r=>r.id==='DEMO-007').status,'已排程');
 const cancel=submitLabOperation({requestId:'DEMO-008',actorId:SEED_ACTORS.labB,action:'cancel',reason:'DEMO取消原安排'},s);assert.throws(()=>decideLabOperation({id:cancel.id,actorId:SEED_ACTORS.labB,approve:true},s));decideLabOperation({id:cancel.id,actorId:SEED_ACTORS.level1,approve:true,signature},s);assert.equal(list(s,'dqa-schedules-demo-v1').find(r=>r.requestId==='DEMO-008').status,'未排程');
 completeLabTrial({requestId:'DEMO-009',actorId:SEED_ACTORS.labA,signature,now:now+60000},s);assert.equal(request(s,'DEMO-009').status,'已完成');
 assert.throws(()=>submitLabOperation({requestId:'DEMO-010',actorId:SEED_ACTORS.labB,action:'interrupt',reason:'',signature},s));const interrupt=submitLabOperation({requestId:'DEMO-010',actorId:SEED_ACTORS.labB,action:'interrupt',reason:'DEMO中斷',signature},s);decideLabOperation({id:interrupt.id,actorId:SEED_ACTORS.level1,approve:true,signature},s);assert.equal(list(s,'dqa-lab-operations-v1').find(r=>r.id===interrupt.id).status,'已核准');
 const fresh=await fixture(),{syncScheduleLifecycle}=await import('../src/scheduleLifecycle.mjs');confirmLabReceipt({requestId:'DEMO-007',actorId:SEED_ACTORS.labA,now},fresh.s);const future=Date.parse(list(fresh.s,'dqa-schedules-demo-v1').find(r=>r.requestId==='DEMO-007').time)+1000;syncScheduleLifecycle(fresh.s,future);fresh.s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules(list(fresh.s,'dqa_lab_demo_requests_v1'),list(fresh.s,'dqa-schedules-demo-v1'),future)));syncScheduleLifecycle(fresh.s,future);assert.equal(request(fresh.s,'DEMO-007').status,'執行中');
});
function getDate(ms){return new Date(ms+8*3600000).toISOString().slice(0,10);}
test('stages 6–8 accept valid reports, enforce review levels, reject bad files and permit manager return only at readback',async()=>{
 const {s,repo,reports}=await fixture(),{createReportTemplate}=await import('../src/reportWorkbook.mjs'),{submitReportWorkflow,approveReportWorkflow,returnReportWorkflow,returnViewedReport,confirmReportViewed}=await import('../src/reportWorkflow.mjs');
 let meta=await submitReportWorkflow({requestId:'DEMO-011',file:new File([await createReportTemplate(request(s,'DEMO-011'),true)],'demo.xlsx'),actorId:SEED_ACTORS.labA,signature,minimumMs:0},s,repo);assert.equal(meta.stage,'level2');
 await assert.rejects(submitReportWorkflow({requestId:'DEMO-012',file:new File(['invalid'],'bad.xlsx'),actorId:SEED_ACTORS.labB,signature,minimumMs:0},s,repo));assert.equal(request(s,'DEMO-012').status,'已完成');
 meta=reports.get('DEMO-013');await assert.rejects(approveReportWorkflow({requestId:'DEMO-013',actorId:SEED_ACTORS.level3,signature,expectedRevision:meta.revision},s,repo));meta=await approveReportWorkflow({requestId:'DEMO-013',actorId:SEED_ACTORS.level2,signature,expectedRevision:meta.revision},s,repo);meta=await approveReportWorkflow({requestId:'DEMO-013',actorId:SEED_ACTORS.level3,signature,expectedRevision:meta.revision},s,repo);assert.equal(meta.stage,'view');
 meta=await returnReportWorkflow({requestId:'DEMO-014',actorId:SEED_ACTORS.level3,comment:'DEMO三階退回',expectedRevision:reports.get('DEMO-014').revision},s,repo);assert.equal(meta.stage,'returned');assert.equal(request(s,'DEMO-014').status,'已完成');
 await assert.rejects(returnViewedReport({requestId:'DEMO-016',actorId:SEED_ACTORS.b,comment:'DEMO',expectedRevision:reports.get('DEMO-016').revision},s,repo));await assert.rejects(returnViewedReport({requestId:'DEMO-016',actorId:SEED_ACTORS.manager,comment:' ',expectedRevision:reports.get('DEMO-016').revision},s,repo));
 meta=await returnViewedReport({requestId:'DEMO-016',actorId:SEED_ACTORS.manager,comment:'DEMO主管查閱退回',expectedRevision:reports.get('DEMO-016').revision},s,repo);assert.equal(meta.stage,'returned');assert.equal(request(s,'DEMO-016').status,'已完成');assert.ok(meta.history.some(r=>r.action.includes('主管查閱退回')));
 meta=await confirmReportViewed({requestId:'DEMO-015',actorId:SEED_ACTORS.manager,expectedRevision:reports.get('DEMO-015').revision,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},s,repo);assert.equal(meta.stage,'archived');await assert.rejects(returnViewedReport({requestId:'DEMO-015',actorId:SEED_ACTORS.manager,comment:'too late',expectedRevision:meta.revision},s,repo));
});

test('reset replaces previous cases and reports, preserves unrelated accounts/assets, and restores exactly two per stage',async()=>{
 const {installNineStageSeed}=await import('../src/installNineStageSeed.mjs');const s=memory(new Map([['dqa-request-demo-v2',JSON.stringify([{id:'OLD-CASE',status:'草稿'}])],['dqa-shared-demo-accounts-v1',JSON.stringify([{id:'KEEP',name:'假管理員',role:'系統管理員',status:'啟用中'}])]]));let records=[{requestId:'OLD-REPORT',revision:'old',stage:'archived'}];const repo={list:async()=>records.map(reportMetadata),get:async id=>records.find(r=>r.requestId===id),replace:async rows=>{records=rows;}};
 await installNineStageSeed({signature,now,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},s,repo);assert.equal(request(s,'OLD-CASE'),undefined);assert.ok(!records.some(r=>r.requestId==='OLD-REPORT'));assert.equal(records.length,6);assert.ok(list(s,'dqa-shared-demo-accounts-v1').some(r=>r.id==='KEEP'));assert.deepEqual(nineStageCounts(s).map(r=>r.count),Array(9).fill(2));
 setRequest(s,{...request(s,'DEMO-001'),status:'退件'});assert.equal(nineStageCounts(s)[0].count,1);
 await installNineStageSeed({signature,now,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},s,repo);assert.deepEqual(nineStageCounts(s).map(r=>r.count),Array(9).fill(2));assert.equal(list(s,'dqa-shared-demo-accounts-v1').filter(r=>r.demoSeed).length,8);assert.equal(list(s,'dqa-equipment-demo-v1').filter(r=>r.demoSeed).length,6);
});
test('preparation failure does not clear existing data and reset epoch blocks lifecycle writes',async()=>{
 const {installNineStageSeed}=await import('../src/installNineStageSeed.mjs'),{syncScheduleLifecycle}=await import('../src/scheduleLifecycle.mjs');const s=memory(new Map([['dqa-request-demo-v2','[{"id":"KEEP-CASE","status":"草稿"}]']]));const old=s.getItem('dqa-request-demo-v2');await assert.rejects(installNineStageSeed({signature:'invalid'},s,{list:async()=>[],get:async()=>null,replace:async()=>{throw Error('must not write');}}));assert.equal(s.getItem('dqa-request-demo-v2'),old);s.setItem('dqa-case-reset-version',JSON.stringify({phase:'clearing'}));assert.equal(syncScheduleLifecycle(s,now),false);assert.equal(s.getItem('dqa-request-demo-v2'),old);
});

test('installation rollback restores prior cases/reports after a storage failure',async()=>{
 const {installNineStageSeed}=await import('../src/installNineStageSeed.mjs');const old=[{id:'PRESERVED',status:'草稿'}],s=memory(new Map([['dqa-request-demo-v2',JSON.stringify(old)]])),set=s.setItem;let fail=true;s.setItem=(key,value)=>{if(key==='dqa-nine-stage-seed-v1'&&fail){fail=false;throw Error('simulated quota');}set(key,value);};let reports=[{requestId:'OLD-PDF',revision:'old',stage:'archived',pdf:new Uint8Array([1,2]).buffer}];const original=reports;
 await assert.rejects(installNineStageSeed({signature,now,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf')},s,{list:async()=>reports.map(reportMetadata),get:async id=>reports.find(r=>r.requestId===id),replace:async rows=>{reports=rows;}}),/simulated quota/);assert.deepEqual(list(s,'dqa-request-demo-v2'),old);assert.deepEqual(reports,original);assert.equal(s.getItem('dqa-case-reset-version'),null);assert.equal(s.getItem('dqa-schedule-lifecycle-pending-v1'),null);
});
test('edits during preparation cancel replacement instead of erasing newer data',async()=>{
 const {installNineStageSeed}=await import('../src/installNineStageSeed.mjs');const s=memory();let touched=false,writes=0;
 await assert.rejects(installNineStageSeed({signature,now,fontBytes:await readFile('public/fonts/NotoSansCJKtc-Regular.otf'),onProgress:()=>{if(!touched){touched=true;s.setItem('dqa-request-demo-v2','[{"id":"NEWER-EDIT","status":"草稿"}]');}}},s,{list:async()=>[],get:async()=>null,replace:async()=>writes++}),/資料已更新/);assert.equal(writes,0);assert.equal(request(s,'NEWER-EDIT').status,'草稿');
});
