import test from 'node:test';
import assert from 'node:assert/strict';
import {changeEquipmentStatus,formatServiceDuration} from '../src/equipmentStatus.mjs';

const params={id:'EQ-1',status:'維護中',reason:'定期保養',actor:'工程師',actorId:'user1'};
test('service completion records are deferred until service ends',()=>{
  const original=[{id:'EQ-1',status:'待機中',records:[{type:'舊紀錄'}]},{id:'EQ-2',status:'使用中'}];
  for(const status of ['維護中','校驗中']){
    const next=changeEquipmentStatus(original,{...params,status});
    assert.equal(next[0].status,status);
    assert.equal(next[0].records.length,1);
    assert.equal(next[0].activeService.actorId,'user1');
    assert.equal(next[0].activeService.reason,'定期保養');
    assert.ok(next[0].activeService.startedAt);
    assert.equal(next[1],original[1]);
  }
  assert.equal(original[0].status,'待機中');
  assert.equal(original[0].records.length,1);
});
test('same status, stale changes, missing reason and invalid targets are rejected',()=>{
  const equipment=[{id:'EQ-1',status:'待機中'}];
  assert.throws(()=>changeEquipmentStatus(equipment,{...params,reason:'  '}));
  assert.throws(()=>changeEquipmentStatus(equipment,{...params,status:'使用中'}));
  assert.throws(()=>changeEquipmentStatus(equipment,{...params,actorId:''}));
  assert.throws(()=>changeEquipmentStatus(equipment,{...params,id:'unknown'}));
  assert.throws(()=>changeEquipmentStatus(equipment,{...params,expectedStatus:'使用中'}));
  assert.throws(()=>changeEquipmentStatus([{id:'EQ-1',status:'使用中'}],{...params,status:'校驗中'}));
  const changed=changeEquipmentStatus(equipment,params);
  assert.throws(()=>changeEquipmentStatus(changed,params));
});

test('a running device can enter maintenance and complete three days later',()=>{
  const original=[{id:'EQ-1',status:'使用中',currentRequest:'REQ-1',records:[]}];
  const started=changeEquipmentStatus(original,{...params,reason:'試驗中止，壓縮機故障',at:'2026-10-28T02:00:00Z'});
  assert.equal(started[0].status,'維護中');
  assert.equal(started[0].currentRequest,'');
  assert.equal(started[0].records.length,0);
  const finished=changeEquipmentStatus(JSON.parse(JSON.stringify(started)),{...params,status:'待機中',reason:'更換壓縮機，試機正常',at:'2026-10-31T02:00:00Z'});
  const record=finished[0].records[0];
  assert.equal(finished[0].status,'待機中');
  assert.equal(finished[0].activeService,null);
  assert.equal(record.type,'維護完成');
  assert.equal(record.startedAt,'2026-10-28T02:00:00Z');
  assert.equal(record.endedAt,'2026-10-31T02:00:00Z');
  assert.equal(formatServiceDuration(record.durationMs),'3 天');
  assert.equal(record.requestId,'REQ-1');
  assert.equal(record.startReason,'試驗中止，壓縮機故障');
  assert.equal(record.detail,'更換壓縮機，試機正常');
  assert.equal(finished[0].lastMaintenance,'2026-10-31');
  assert.equal(original[0].status,'使用中');
});

test('old calibration records do not invent an unknown start time',()=>{
  const completed=changeEquipmentStatus([{id:'EQ-1',status:'校驗中',records:[]}],{...params,status:'待機中',at:'2026-10-31T17:00:00Z'});
  assert.equal(completed[0].lastCalibration,'2026-11-01');
  assert.equal(completed[0].records[0].type,'校驗完成');
  assert.equal(completed[0].records[0].durationMs,null);
  assert.equal(formatServiceDuration(null),'未記錄開始時間');
});

test('multiple maintenance rounds retain independent durations',()=>{
  let rows=[{id:'EQ-1',status:'待機中',records:[]}];
  rows=changeEquipmentStatus(rows,{...params,at:'2026-10-01T00:00:00Z'});
  assert.throws(()=>changeEquipmentStatus(rows,{...params,status:'待機中',at:'2026-09-30T00:00:00Z'}));
  rows=changeEquipmentStatus(rows,{...params,status:'待機中',at:'2026-10-02T00:00:00Z'});
  rows=changeEquipmentStatus(rows,{...params,at:'2026-10-10T00:00:00Z'});
  rows=changeEquipmentStatus(rows,{...params,status:'待機中',at:'2026-10-12T02:30:00Z'});
  assert.equal(rows[0].records.length,2);
  assert.equal(formatServiceDuration(rows[0].records[0].durationMs),'2 天 2 小時 30 分鐘');
  assert.equal(rows[0].records[1].durationMs,86400000);
});
