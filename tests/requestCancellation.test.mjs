import test from 'node:test';
import assert from 'node:assert/strict';
import {stopRequestSchedules,readCancellationOverrides} from '../src/requestCancellation.mjs';
import {syncScheduleLifecycle,reconcileSchedules} from '../src/scheduleLifecycle.mjs';
import {SCHEDULE_KEY,EQUIPMENT_KEY} from '../src/scheduleEquipment.mjs';
import {readStoredRequests} from '../src/requestStorage.mjs';

const now=Date.parse('2026-10-29T02:00:00Z');
const params={scheduleId:'SCH-1',requestId:'REQ-1',actor:'工程師',actorId:'user1',reason:'樣品異常，整單取消',now};
function setup(extraRows=[],machineStatus='使用中'){
  const schedules=[{id:'SCH-1',requestId:'REQ-1',equipmentId:'EQ-1',status:'試驗中',time:'2026-10-28',end:'2026-10-30'},{id:'SCH-2',requestId:'REQ-1',equipmentId:'EQ-1',status:'已排程',time:'2026-11-01',end:'2026-11-03'},...extraRows];
  const data=new Map([[SCHEDULE_KEY,JSON.stringify(schedules)],[EQUIPMENT_KEY,JSON.stringify([{id:'EQ-1',name:'設備',status:machineStatus,currentRequest:'REQ-1',records:[]}])],['dqa-request-demo-v2',JSON.stringify([{id:'REQ-1',status:'待排程',signatureRecords:[{signature:'original'}],lmsReview:{status:'完成'}}])],['dqa-lms-reviews-v1',JSON.stringify([{id:'REQ-1',status:'完成',history:['舊紀錄']}])]]);
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  return {storage,data};
}
test('stopping a schedule cancels the entire source request and all of its schedules',()=>{
  const {storage}=setup([{id:'SCH-3',requestId:'REQ-OTHER',status:'未排程'}]);
  const result=stopRequestSchedules(params,storage);
  assert.equal(result.schedules[0].status,'取消');
  assert.equal(result.schedules[1].status,'取消');
  assert.equal(result.schedules[2].status,'未排程');
  assert.equal(result.equipment[0].status,'待機中');
  assert.equal(result.equipment[0].records[0].actorId,'user1');
  const source=JSON.parse(storage.getItem('dqa-request-demo-v2'))[0];
  assert.equal(source.status,'取消');assert.equal(source.lmsReview.status,'取消');
  assert.equal(source.signatureRecords[0].signature,'original');
  assert.equal(source.cancellation.reason,params.reason);
  assert.equal(JSON.parse(storage.getItem('dqa-lms-reviews-v1'))[0].status,'取消');
  assert.equal(reconcileSchedules(result.schedules,result.equipment,now+10*86400000).schedules[0].status,'取消');
});
test('other active trials and service states prevent equipment being incorrectly released',()=>{
  const other={id:'OTHER',requestId:'REQ-OTHER',equipmentId:'EQ-1',status:'試驗中',time:'2026-10-28',end:'2026-10-30'};
  assert.equal(stopRequestSchedules(params,setup([other]).storage).equipment[0].status,'使用中');
  for(const status of ['維護中','校驗中'])assert.equal(stopRequestSchedules(params,setup([],status).storage).equipment[0].status,status);
});
test('cancellation survives reloads for demo requests even when no stored review exists',()=>{
  const {storage}=setup();storage.removeItem('dqa-lms-reviews-v1');storage.removeItem('dqa-request-demo-v2');
  stopRequestSchedules(params,storage);
  const fallback=[{id:'REQ-1',status:'待審查',history:[]}];
  assert.equal(readStoredRequests(fallback,storage)[0].status,'取消');
  assert.equal(readCancellationOverrides(fallback,storage)[0].cancellation.actorId,'user1');
  assert.equal(storage.getItem('dqa-request-demo-v2'),null);
});
test('repeated confirmation is idempotent and interrupted storage can recover',()=>{
  const {storage}=setup();let fail=true;
  const failing={...storage,setItem(key,value){if(key==='dqa-request-demo-v2'&&fail){fail=false;throw Error('quota');}storage.setItem(key,value);}};
  assert.throws(()=>stopRequestSchedules(params,failing));
  assert.equal(syncScheduleLifecycle(storage,now),true);
  assert.equal(JSON.parse(storage.getItem('dqa-request-demo-v2'))[0].status,'取消');
  const result=stopRequestSchedules(params,storage);
  assert.equal(result.equipment[0].records.length,1);
});
test('missing identities or a mismatched request cannot cancel any rows',()=>{
  const {storage}=setup();
  assert.throws(()=>stopRequestSchedules({...params,actorId:''},storage));
  assert.throws(()=>stopRequestSchedules({...params,requestId:'different'},storage));
  assert.equal(JSON.parse(storage.getItem(SCHEDULE_KEY))[0].status,'試驗中');
});
