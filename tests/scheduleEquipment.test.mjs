import test from 'node:test';
import assert from 'node:assert/strict';
import {readScheduleEquipment,validateSchedule,recommendSchedule,findScheduleConflict,equipmentMatches} from '../src/scheduleEquipment.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';

const equipment=[{id:'EQ-A',name:'環境試驗箱 A',status:'待機中',capacity:10},{id:'EQ-B',name:'環境試驗箱 B',status:'維護中',capacity:10}];
const accounts=[{id:'engineer',name:'工程師',role:'實驗室工程師',status:'啟用中'}];
const editing={id:'SCH-1',requestId:'REQ-1',title:'高溫試驗',quantity:5};
const form={equipmentId:'EQ-A',eq:'環境試驗箱 A',ownerId:'engineer',owner:'工程師',sampleCode:'SAMPLE-1',time:'2026-10-28',end:'2026-10-30',note:''};
const validate=(overrides={})=>validateSchedule({editing,form,equipment,accounts,rows:[],...overrides});
test('schedule equipment reads the shared twenty-machine catalog and updated statuses',()=>{
  assert.equal(readScheduleEquipment({getItem:()=>null}).length,20);
  assert.deepEqual(readScheduleEquipment({getItem:()=>JSON.stringify(equipment)}),equipment);
  assert.throws(()=>readScheduleEquipment({getItem:()=>'{invalid'}));
  assert.ok(!DEMO_EQUIPMENT.some(row=>row.id.startsWith('MAT')));
});
test('manual scheduling validates status, equipment type, capacity, executor and dates',()=>{
  assert.equal(validate().status,'已排程');
  assert.equal(validate({editing:{...editing,requestStatus:'待審查'}}).status,'已排程');
  const rescheduled=validate({editing:{...editing,status:'已完成',completedAt:'old',equipmentReleaseHandledAt:'old'}});
  assert.equal(rescheduled.completedAt,undefined);
  assert.equal(rescheduled.equipmentReleaseHandledAt,undefined);
  for(const status of ['使用中','維護中','校驗中'])assert.throws(()=>validate({equipment:[{...equipment[0],status}]}));
  assert.throws(()=>validate({equipment:[{...equipment[0],capacity:2}]}));
  assert.throws(()=>validate({equipment:[{...equipment[0],name:'鹽霧試驗機'}]}));
  assert.throws(()=>validate({accounts:[{...accounts[0],status:'已停用'}]}));
  assert.throws(()=>validate({form:{...form,end:'2026-10-27'}}));
  assert.throws(()=>validate({form:{...form,equipmentId:'MAT-1'}}));
});
test('equipment and executor conflicts are checked separately; current row is excluded',()=>{
  const conflict={id:'SCH-2',requestId:'REQ-2',equipmentId:'EQ-A',eq:'環境試驗箱 A',ownerId:'other',owner:'other',time:'2026-10-29',end:'2026-10-31',status:'已排程'};
  assert.throws(()=>validate({rows:[conflict]}));
  assert.throws(()=>validate({rows:[{...conflict,equipmentId:'other',eq:'other',ownerId:'engineer'}]}));
  assert.equal(findScheduleConflict([{...conflict,id:editing.id}],{...editing,...form}),undefined);
  assert.equal(validate({rows:[{...conflict,time:'2026-11-01',end:'2026-11-03'}]}).status,'已排程');
});
test('AI recommends only standby equipment, active executors and a free date range',()=>{
  const rows=[{id:'SCH-2',equipmentId:'EQ-A',eq:'環境試驗箱 A',ownerId:'engineer',owner:'工程師',time:'2026-10-28',end:'2026-10-30',status:'已排程'}];
  const result=recommendSchedule({editing,form,equipment,accounts,rows,today:'2026-10-28'});
  assert.equal(result.equipmentId,'EQ-A');
  assert.equal(result.time,'2026-10-31');
  assert.equal(result.end,'2026-11-02');
  assert.equal(result.duration,3);
  assert.equal(validateSchedule({editing,form:{...form,...result},equipment,accounts,rows}).status,'已排程');
  assert.throws(()=>recommendSchedule({editing,form,equipment:[equipment[1]],accounts,rows:[],today:'2026-10-28'}));
  assert.throws(()=>validateSchedule({editing,form:{...form,...result},equipment:[{...equipment[0],status:'校驗中'}],accounts,rows:[]}));
});
test('AI does not substitute unrelated equipment when a required type is unavailable',()=>{
  assert.equal(equipmentMatches('機械衝擊試驗',{name:'冷熱衝擊機'}),false);
  assert.throws(()=>recommendSchedule({editing:{...editing,title:'機械衝擊試驗'},form,equipment:DEMO_EQUIPMENT,accounts,rows:[],today:'2026-10-28'}));
});
