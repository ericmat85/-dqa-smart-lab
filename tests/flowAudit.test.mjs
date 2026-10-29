import {isCalendarDate} from '../src/requestDate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLabOperationResults,submitLabOperation,decideLabOperation} from '../src/labOperations.mjs';
import {mergeLabSchedules} from '../src/labScheduleBridge.mjs';
import {confirmLabReceipt,completeLabTrial} from '../src/labReceipts.mjs';
import {recoverLifecycleTransaction,syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
const schedule={id:'SCH',requestId:'REQ',reservationId:'VERSION1',time:'2026-11-01',end:'2026-11-02',status:'已排程',sampleCode:'SAMPLE-A、SAMPLE-B',eq:'Machine',equipmentId:'EQ'};
const before=Date.parse('2026-10-29T12:00:00+08:00'),after=Date.parse('2026-11-03T12:00:00+08:00');
function storage(){const data=new Map([['dqa-schedules-demo-v1',JSON.stringify([schedule])],['dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules([],[schedule],before))],['dqa-equipment-demo-v1',JSON.stringify([{id:'EQ',name:'Machine',status:'待機中'}])],['dqa-shared-demo-accounts-v1',JSON.stringify([{id:'LAB',name:'工程師',role:'實驗室工程師',status:'啟用中'},{id:'ADMIN',name:'管理員',role:'系統管理員',status:'啟用中'}])]]);return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
test('new reservation is not cancelled again by its previous approved cancellation',()=>{
 const old={id:'OLD',requestId:'REQ',action:'cancel',status:'已核准',reservationId:'VERSION1',scheduledStart:schedule.time,scheduledEnd:schedule.end};
 const fresh=mergeLabSchedules([],[{...schedule,reservationId:'VERSION2'}],before);
 assert.equal(applyLabOperationResults(fresh,[old])[0].status,'待確認');
 assert.equal(applyLabOperationResults(fresh,[{id:'LEGACY',requestId:'REQ',action:'interrupt',status:'已核准'}])[0].status,'待確認');
});
test('same dates rescheduled under a new reservation require another receipt',()=>{
 const received={...mergeLabSchedules([],[schedule],before)[0],status:'已排程',acceptedAt:'2026-10-29'};
 assert.equal(mergeLabSchedules([received],[{...schedule,reservationId:'VERSION2'}],before)[0].status,'待確認');
});
test('sample codes reach the laboratory and accepted trials finish after their timetable',()=>{
 const rows=mergeLabSchedules([],[schedule],before);assert.equal(rows[0].sampleIds,'SAMPLE-A、SAMPLE-B');
 assert.equal(mergeLabSchedules([{...rows[0],status:'試驗中'}],[{...schedule,status:'已完成'}],after)[0].status,'已完成');
});
test('receipt is written together with audit and duplicate or stale confirmation is rejected',()=>{
 const store=storage();const result=confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:before,expected:{scheduleId:'SCH',reservationId:'VERSION1',time:schedule.time,end:schedule.end}},store);
 assert.equal(result.status,'已排程');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_audit_v1')).length,1);
 assert.throws(()=>confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:before},store),/已接收/);
 const stale=storage();stale.setItem('dqa-schedules-demo-v1',JSON.stringify([{...schedule,reservationId:'VERSION2'}]));
 assert.throws(()=>confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:before,expected:{scheduleId:'SCH',reservationId:'VERSION1',time:schedule.time,end:schedule.end}},stale),/已更新/);
});
test('late confirmation never bypasses automatic return policy',()=>{
 const store=storage();assert.throws(()=>confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:after},store),/已到開始時間/);assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0].status,'待確認');
});
test('receipt write failure recovers without losing or duplicating confirmation history',()=>{
 const store=storage(),write=store.setItem;let fail=true;store.setItem=(key,value)=>{if(key==='dqa_lab_demo_audit_v1'&&fail){fail=false;throw Error('temporary');}write(key,value);};
 assert.throws(()=>confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:before},store),/temporary/);recoverLifecycleTransaction(store);
 assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0].status,'已排程');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_audit_v1')).length,1);
});
test('an interruption waiting for approval cannot auto-complete while a supervisor has not processed it',()=>{
 const store=storage();const lab=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'));store.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...lab[0],status:'試驗中'}]));
 const operation=submitLabOperation({requestId:'REQ',actorId:'LAB',action:'interrupt',reason:'機台故障',signature:'signature'},store);
 syncScheduleLifecycle(store,after);assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'待核准');
 decideLabOperation({id:operation.id,actorId:'ADMIN',approve:true},store);assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'未排程');
});

test('manual trial completion updates LMS and releases equipment once',()=>{
 const store=storage();confirmLabReceipt({requestId:'REQ',actorId:'LAB',now:before},store);
 const running=Date.parse('2026-11-01T12:00:00+08:00');syncScheduleLifecycle(store,running);
 const lab=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'));store.setItem('dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules(lab,JSON.parse(store.getItem('dqa-schedules-demo-v1')),running)));
 completeLabTrial({requestId:'REQ',actorId:'LAB',signature:'signed',now:running},store);
 assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'已完成');assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0].status,'待機中');
 assert.throws(()=>completeLabTrial({requestId:'REQ',actorId:'LAB',signature:'signed',now:running},store),/並非進行中/);
 const completed=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'));assert.equal(completed[0].status,'已完成');
});
test('trial completion cannot bypass pending operational approval',()=>{
 const store=storage();const lab=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'));store.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...lab[0],status:'試驗中'}]));submitLabOperation({requestId:'REQ',actorId:'LAB',action:'interrupt',signature:'s',reason:'reason'},store);
 assert.throws(()=>completeLabTrial({requestId:'REQ',actorId:'LAB',signature:'signed',now:Date.parse('2026-11-01T12:00:00+08:00')},store));
});
test('impossible dates are rejected instead of rolling into another month',()=>{
 assert.equal(isCalendarDate('2026-02-31'),false);assert.equal(isCalendarDate('2026-02-29'),false);assert.equal(isCalendarDate('2028-02-29'),true);
});
