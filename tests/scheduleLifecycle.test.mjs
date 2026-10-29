import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSchedules,syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
import {SCHEDULE_KEY,EQUIPMENT_KEY} from '../src/scheduleEquipment.mjs';

const scheduled={id:'SCH-1',requestId:'REQ-1',equipmentId:'EQ-1',eq:'試驗箱',time:'2026-10-28',end:'2026-10-30',status:'已排程'};
const machine={id:'EQ-1',name:'試驗箱',status:'待機中',records:[]};
const middle=Date.parse('2026-10-29T02:00:00Z'),after=Date.parse('2026-11-01T02:00:00Z');
test('scheduled trials start, finish and release their equipment once',()=>{
  const started=reconcileSchedules([scheduled],[machine],middle);
  assert.equal(started.schedules[0].status,'試驗中');
  assert.equal(started.equipment[0].status,'使用中');
  const completed=reconcileSchedules(started.schedules,started.equipment,after);
  assert.equal(completed.schedules[0].status,'已完成');
  assert.equal(completed.equipment[0].status,'待機中');
  assert.equal(completed.equipment[0].currentRequest,'');
  assert.equal(completed.equipment[0].records.length,2);
  assert.deepEqual(reconcileSchedules(completed.schedules,completed.equipment,after),completed);
  assert.equal(machine.status,'待機中');
});
test('another active trial prevents premature equipment release',()=>{
  const other={...scheduled,id:'SCH-2',requestId:'REQ-2',time:'2026-10-30',end:'2026-11-02'};
  const current={...machine,status:'使用中',currentRequest:'REQ-1'};
  const result=reconcileSchedules([scheduled,other],[current],after);
  assert.equal(result.schedules[0].status,'已完成');
  assert.equal(result.schedules[1].status,'試驗中');
  assert.equal(result.equipment[0].status,'使用中');
  const finished=reconcileSchedules(result.schedules,result.equipment,Date.parse('2026-11-03T02:00:00Z'));
  assert.equal(finished.equipment[0].status,'待機中');
});
test('maintenance, calibration and unrelated usage are never cleared by an elapsed trial',()=>{
  for(const status of ['維護中','校驗中']){
    const result=reconcileSchedules([scheduled],[{...machine,status}],after);
    assert.equal(result.schedules[0].status,'已完成');
    assert.equal(result.equipment[0].status,status);
  }
  const result=reconcileSchedules([scheduled],[{...machine,status:'使用中',currentRequest:'OTHER'}],after);
  assert.equal(result.equipment[0].status,'使用中');
});
test('unscheduled cases do not complete and unavailable equipment cannot start a trial',()=>{
  const unset=reconcileSchedules([{...scheduled,end:''}],[machine],after);
  assert.equal(unset.schedules[0].status,'未排程');
  assert.equal(unset.equipment[0].status,'待機中');
  const blocked=reconcileSchedules([scheduled],[{...machine,status:'維護中'}],middle);
  assert.equal(blocked.schedules[0].status,'有衝突');
  assert.equal(blocked.equipment[0].status,'維護中');
});
test('stored completion recovers after a partial write without duplicate release records',()=>{
  const data=new Map([[SCHEDULE_KEY,JSON.stringify([scheduled])],[EQUIPMENT_KEY,JSON.stringify([{...machine,status:'使用中',currentRequest:'REQ-1'}])]]);
  data.set('dqa_lab_demo_requests_v1',JSON.stringify([{id:'REQ-1',scheduleId:'SCH-1',status:'試驗中',scheduledStart:scheduled.time,scheduledEnd:scheduled.end}]));
  let fail=true;
  const storage={getItem:key=>data.get(key)||null,setItem(key,value){if(key===EQUIPMENT_KEY&&fail){fail=false;throw Error('quota');}data.set(key,value);},removeItem:key=>data.delete(key)};
  assert.throws(()=>syncScheduleLifecycle(storage,after));
  assert.equal(syncScheduleLifecycle(storage,after),true);
  assert.equal(JSON.parse(storage.getItem(SCHEDULE_KEY))[0].status,'已完成');
  assert.equal(JSON.parse(storage.getItem(EQUIPMENT_KEY))[0].status,'待機中');
  assert.equal(JSON.parse(storage.getItem(EQUIPMENT_KEY))[0].records.length,1);
  assert.equal(syncScheduleLifecycle(storage,after),false);
});
