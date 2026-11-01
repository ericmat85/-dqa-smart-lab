import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentActivity,equipmentActivityWindow} from '../src/equipmentActivity.mjs';
import {readManagementPreferences,saveManagementPreferences} from '../src/managementPreferences.mjs';
const now=Date.parse('2030-01-01T04:00:00Z'),machines=[{id:'A',name:'設備 A'},{id:'B',name:'設備 B'}];
const trial=(id,extra={})=>({id,equipmentId:'A',time:'2030-01-01',end:'2030-01-07',status:'已排程',...extra});
test('activity merges overlapping trials per device, counts multiple devices and respects the configured interval',()=>{
 const schedules=[trial('one',{equipmentIds:['A','B']}),trial('overlap'),trial('cancelled',{status:'取消'})];
 assert.equal(equipmentActivity(schedules,machines,{equipmentDays:7},now).rate,100);
 assert.equal(equipmentActivity(schedules,machines,{equipmentDays:14},now).rate,50);
 assert.equal(equipmentActivity([trial('one')],machines,{equipmentDays:7},now).rate,50);
 assert.equal(equipmentActivity(schedules,[],{equipmentDays:7},now).rate,0);
});
test('Taipei boundaries, fixed start dates and completed trial endpoints are honored',()=>{
 const window=equipmentActivityWindow({equipmentDays:7},Date.parse('2029-12-31T18:00:00Z'));assert.equal(window.from,'2030-01-01');assert.equal(window.start,Date.parse('2029-12-31T16:00:00Z'));assert.equal(window.to,'2030-01-07');
 assert.equal(equipmentActivity([trial('past')],machines,{equipmentDays:7,equipmentStart:'2030-02-01'},now).rate,0);
 const completed=trial('done',{status:'已完成',completedAt:'2030-01-02T00:00:00+08:00'});
 assert.equal(equipmentActivity([completed],[machines[0]],{equipmentDays:7},now).occupiedMs,86400000);
 assert.equal(equipmentActivity([trial('unknown',{equipmentId:'UNKNOWN'})],machines,{equipmentDays:7},now).rate,0);
});
test('old saved preferences migrate and new horizon settings persist with validation',()=>{
 let data=JSON.stringify({reportPeriod:'month',exportSummary:false});const store={getItem:()=>data,setItem:(_,value)=>{data=value;}};
 assert.equal(readManagementPreferences(store).equipmentDays,14);assert.equal(readManagementPreferences(store).reportPeriod,'month');
 saveManagementPreferences({...readManagementPreferences(store),equipmentDays:30,equipmentStart:'2030-02-01'},store);assert.equal(readManagementPreferences(store).equipmentDays,30);assert.equal(readManagementPreferences(store).exportSummary,false);
 assert.throws(()=>saveManagementPreferences({equipmentStart:'2030-02-30'},store),/起始日期/);
});
