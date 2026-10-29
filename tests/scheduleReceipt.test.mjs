import test from 'node:test';
import assert from 'node:assert/strict';
import {returnUnreceivedSchedules} from '../src/scheduleReceipt.mjs';
import {syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
import {mergeLabSchedules} from '../src/labScheduleBridge.mjs';
const row={id:'S',requestId:'R',equipmentId:'E',eq:'Machine',status:'已排程',time:'2026-10-29',end:'2026-10-30'};
const start=Date.parse('2026-10-29T00:00:00+08:00'),machine={id:'E',status:'使用中',currentRequest:'R',records:[]};
const receipt={id:'R',scheduleId:'S',status:'待確認',scheduledStart:row.time,scheduledEnd:row.end};
test('unreceived reservation stays before its start and returns at the start, even if lab was never opened',()=>{
 assert.equal(returnUnreceivedSchedules([row],[machine],[receipt],start-1).returned.length,0);
 for(const lab of [[],[receipt]]){const result=returnUnreceivedSchedules([row],[machine],lab,start);assert.equal(result.schedules[0].status,'未排程');assert.equal(result.schedules[0].time,'');assert.equal(result.schedules[0].end,'');assert.equal(result.equipment[0].status,'待機中');assert.equal(result.returned.length,1);}
});
test('accepted receipt must match the current schedule dates',()=>{
 const accepted={...receipt,status:'試驗中'};assert.equal(returnUnreceivedSchedules([row],[machine],[accepted],start).returned.length,0);
 assert.equal(returnUnreceivedSchedules([{...row,end:'2026-10-31'}],[machine],[accepted],start).returned.length,1);
 const lab=mergeLabSchedules([accepted],[{...row,end:'2026-10-31'}]);assert.equal(lab[0].status,'待確認');
});
test('confirmed future receipt displays scheduled and starts only at the schedule boundary',()=>{
 const confirmed={...receipt,status:'已排程',acceptedAt:'2026-10-28T10:00:00+08:00'};
 assert.equal(mergeLabSchedules([confirmed],[row],start-1)[0].status,'已排程');
 assert.equal(returnUnreceivedSchedules([row],[machine],[confirmed],start).returned.length,0);
 assert.equal(mergeLabSchedules([confirmed],[row],start)[0].status,'試驗中');
});
test('service states and another running accepted trial keep their equipment',()=>{
 for(const status of ['維護中','校驗中'])assert.equal(returnUnreceivedSchedules([row],[{...machine,status}],[],start).equipment[0].status,status);
 const other={...row,id:'S2',requestId:'R2'},accepted={...receipt,id:'R2',scheduleId:'S2',status:'試驗中'};
 assert.equal(returnUnreceivedSchedules([row,other],[machine],[accepted],start).equipment[0].status,'使用中');
});
test('previously elapsed but unreceived schedules are repaired instead of being treated as finished trials',()=>{
 const result=returnUnreceivedSchedules([{...row,status:'已完成',completedAt:'2026-10-31T00:00:00+08:00'}],[machine],[receipt],start+4*86400000);
 assert.equal(result.schedules[0].status,'未排程');assert.equal(result.schedules[0].completedAt,undefined);
});
test('synchronization records a return once and rescheduling permits fresh confirmation',()=>{
 const data=new Map([['dqa-schedules-demo-v1',JSON.stringify([row])],['dqa-equipment-demo-v1',JSON.stringify([machine])],['dqa_lab_demo_requests_v1',JSON.stringify([receipt])]]);
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 assert.equal(syncScheduleLifecycle(storage,start),true);const lab=JSON.parse(storage.getItem('dqa_lab_demo_requests_v1'));assert.equal(lab.length,0);assert.equal(syncScheduleLifecycle(storage,start+1000),false);assert.equal(JSON.parse(storage.getItem('dqa_lab_demo_audit_v1')).length,1);
 assert.equal(mergeLabSchedules(lab,[{...row,time:'2026-11-01',end:'2026-11-02'}])[0].status,'待確認');
});

test('returned lab items disappear while future rescheduling creates a new pending receipt',()=>{
 const old={...receipt,status:'已退回LMS'};
 assert.deepEqual(mergeLabSchedules([old],[{...row,status:'未排程',time:'',end:'',receiptReturn:{reason:'return'}}]),[]);
 assert.equal(mergeLabSchedules([old],[{...row,time:'2026-11-01',end:'2026-11-02'}])[0].status,'待確認');
});
