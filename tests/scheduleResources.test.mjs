import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule,recommendSchedule,findScheduleConflict} from '../src/scheduleEquipment.mjs';
import {reconcileSchedules} from '../src/scheduleLifecycle.mjs';
import {reservationWindow} from '../src/scheduleResources.mjs';
const accounts=[{id:'LAB',name:'工程師',role:'實驗室工程師',status:'啟用中'}];
const equipment=['A','B','C'].map(id=>({id,name:`環境試驗箱 ${id}`,status:'待機中',capacity:3,usableVolumeLitres:30,specification:'-40～150°C；20～98%RH'}));
const editing={id:'S',requestId:'R',title:'低溫試驗',quantity:5};
const form={equipmentId:'A',equipmentIds:['A','B'],equipmentCount:2,ownerId:'LAB',sampleCode:'SAMPLE',time:'2026-11-07',end:'2026-11-07',conditions:{temperatureMin:-20,temperatureMax:50},sampleVolumeLitres:10,preparationMinutes:60,cleanupMinutes:60};
const validate=(overrides={})=>validateSchedule({editing,form,equipment,accounts,rows:[],...overrides});
test('multiple physical machines allocate samples within both slot and space capacities',()=>{
 const row=validate();assert.equal(row.equipmentIds.length,2);assert.deepEqual(row.allocations.map(row=>row.quantity),[3,2]);
 assert.throws(()=>validate({form:{...form,equipmentIds:[]}}),/台數/);
 assert.throws(()=>validate({form:{...form,sampleVolumeLitres:16}}),/空間/);
 assert.throws(()=>validate({form:{...form,sampleVolumeLitres:-1}}),/正數/);
 assert.throws(()=>validate({equipment:equipment.slice(0,1)}),/台帳/);
 assert.throws(()=>validate({equipment:equipment.map(row=>({...row,usableVolumeLitres:null}))}),/空間/);
 const result=recommendSchedule({editing,form,equipment,accounts,rows:[],today:'2026-11-06'});assert.equal(result.equipmentIds.length,2);
 assert.doesNotThrow(()=>validate({form:{...form,...result}}));
});
test('preparation and cleanup intervals block both primary and secondary equipment',()=>{
 const row=validate(),bounds=reservationWindow(row);assert.equal(bounds.start,Date.parse('2026-11-06T23:00:00+08:00'));assert.equal(bounds.end,Date.parse('2026-11-08T01:00:00+08:00'));
 const other={id:'OTHER',equipmentId:'B',ownerId:'OTHER-PERSON',time:'2026-11-08',end:'2026-11-08',status:'已排程'};
 assert.equal(findScheduleConflict([row],other).id,row.id);
 assert.equal(findScheduleConflict([{...row,cleanupMinutes:0}],other),undefined);
 assert.throws(()=>validate({form:{...form,preparationMinutes:-1}}),/分鐘/);
 assert.throws(()=>validate({form:{...form,cleanupMinutes:1.5}}),/分鐘/);
});
test('every selected machine is held through preparation and cleanup, then released once',()=>{
 const row=validate();let result=reconcileSchedules([row],equipment,Date.parse('2026-11-06T23:30:00+08:00'));
 assert.deepEqual(result.equipment.map(row=>row.status),['使用中','使用中','待機中']);assert.equal(result.schedules[0].status,'已排程');
 result=reconcileSchedules(result.schedules,result.equipment,Date.parse('2026-11-08T00:30:00+08:00'));
 assert.equal(result.schedules[0].status,'已完成');assert.equal(result.equipment[1].status,'使用中');
 result=reconcileSchedules(result.schedules,result.equipment,Date.parse('2026-11-08T01:00:00+08:00'));
 assert.ok(result.equipment.every(row=>row.status==='待機中'));const records=result.equipment[0].records.length;
 result=reconcileSchedules(result.schedules,result.equipment,Date.parse('2026-11-08T02:00:00+08:00'));assert.equal(result.equipment[0].records.length,records);
});

test('archiving during cleanup neither drops the hold nor leaves machines occupied forever',()=>{
 const completedAt='2026-11-07T10:00:00+08:00';
 const archived={...validate(),status:'已結案',completedAt};
 let result=reconcileSchedules([archived],equipment,Date.parse('2026-11-07T10:30:00+08:00'));
 assert.equal(result.equipment[0].status,'使用中');assert.equal(result.equipment[1].status,'使用中');
 result=reconcileSchedules(result.schedules,result.equipment,Date.parse('2026-11-07T11:00:00+08:00'));
 assert.ok(result.equipment.every(row=>row.status==='待機中'));assert.ok(result.schedules[0].equipmentReleaseHandledAt);
});
