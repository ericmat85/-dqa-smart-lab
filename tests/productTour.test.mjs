import test from 'node:test';
import assert from 'node:assert/strict';
import {createTourSeed} from '../src/productTour.mjs';
import {prepareManualTrialForm} from '../src/scheduleTrialInput.mjs';
import {recommendSchedule,validateSchedule} from '../src/scheduleEquipment.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('tour starts with one pending request and no automatically completed business actions',()=>{
 const {storage}=createTourSeed({signature}),read=key=>JSON.parse(storage.getItem(key)||'[]');const requests=read('dqa-request-demo-v2');assert.equal(requests.length,1);assert.equal(requests[0].id,'TOUR-DEMO-001');assert.equal(requests[0].status,'待主管簽核');assert.equal(requests[0].signatureRecords.length,1);assert.equal(requests[0].lmsReview,undefined);
 for(const key of ['dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa-lms-reviews-v1'])assert.deepEqual(read(key),[]);assert.equal(read('dqa-equipment-demo-v1').length,1);assert.equal(read('dqa-equipment-demo-v1')[0].status,'待機中');assert.notEqual(requests[0].ownerId,requests[0].supervisorId);
 const second=createTourSeed({signature}).storage;storage.setItem('test','private');assert.equal(second.getItem('test'),null);assert.throws(()=>createTourSeed({signature:'not-an-image'}));
});
function tourScheduling(){
 const {storage}=createTourSeed({signature,now:Date.parse('2026-11-14T12:00:00+08:00')}),read=key=>JSON.parse(storage.getItem(key)||'[]'),request=read('dqa-request-demo-v2')[0];
 const editing={id:'SCH-'+request.id,requestId:request.id,title:request.testItems[0],quantity:Number(request.quantity),status:'未排程',testSpec:request.specification,conditions:request.conditions,durationHours:request.durationHours};
 const form=prepareManualTrialForm({editing,form:{equipmentCount:1,sampleSpaceUnits:1,sampleCode:'SMP-'+request.id,time:'',end:''}});
 return {storage,editing,form,equipment:read('dqa-equipment-demo-v1'),accounts:read('dqa-shared-demo-accounts-v1'),rows:[],today:'2026-11-14'};
}
test('the isolated tour can recommend and validate its 48-hour trial using documented synthetic equipment',()=>{
 const c=tourScheduling(),before={...c.storage},suggestion=recommendSchedule(c);
 const saved=validateSchedule({...c,form:{...c.form,...suggestion}});
 assert.equal(saved.equipmentId,'TOUR-EQ-001');assert.equal(saved.time,'2026-11-15');assert.equal(saved.end,'2026-11-16');assert.equal(saved.durationHours,48);
 assert.equal(saved.trialExecution.end_ms-saved.trialExecution.start_ms,48*3600000);
 assert.equal(saved.capacityValidation.basis,'DEMO_SPACE_UNITS_ONLY');assert.match(c.equipment[0].specification,/DEMO/);
 assert.equal(saved.status,'已排程');assert.deepEqual({...c.storage},before); // Recommendation and validation never save or advance the tour.
});
test('tour scheduling still rejects missing, incompatible, busy or undersized equipment',()=>{
 for(const patch of [{specification:''},{specification:'DEMO：-40～80°C'},{name:'導覽振動機'},{status:'使用中'},{capacity:0}]){
  const c=tourScheduling();c.equipment=c.equipment.map(row=>({...row,...patch}));
  assert.throws(()=>recommendSchedule(c),/沒有足夠符合/);
 }
});
