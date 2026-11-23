import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule,recommendSchedule} from '../src/scheduleEquipment.mjs';
import {makeE2Context,e2InputIssues} from '../src/e2Scheduling.mjs';
import {e2Fixture} from './e2-fixture.mjs';
const equipment=[{id:'EQ-001',name:'環境試驗箱 #01',status:'待機中',capacity:6,usableVolumeLitres:600},{id:'EQ-002',name:'環境試驗箱 #02',status:'待機中',capacity:4,usableVolumeLitres:600}];
const accounts=[{id:'LOCAL-ENGINEER',name:'合成工程師',role:'實驗室工程師',status:'啟用中'}];
const editing={id:'SCH-REQ-2026-e4f9f4b8',requestId:'REQ-2026-e4f9f4b8',title:'高溫儲存試驗',quantity:5,status:'未排程'};
const form={equipmentId:'EQ-001',ownerId:'LOCAL-ENGINEER',sampleCode:'SMP-REQ-2026-e4f9f4b8',sampleSpaceUnits:1,sampleVolumeLitres:'',time:'2026-11-16',end:'2026-11-20',note:'合成展示資料'};
const validate=(overrides={})=>validateSchedule({editing,form,equipment,accounts,rows:[],today:'2026-11-14',...overrides});
test('screenshot case saves a U-only Demo schedule without inventing litres or physical feasibility',()=>{
 const before=structuredClone(form);const result=validate();assert.equal(result.status,'已排程');assert.equal(result.sampleSpaceUnits,1);assert.equal(result.sampleVolumeLitres,'');assert.deepEqual(result.allocations,[{equipmentId:'EQ-001',quantity:5}]);assert.deepEqual(result.capacityValidation,{basis:'DEMO_SPACE_UNITS_ONLY',physicalFeasibility:'NOT_ASSESSED'});assert.deepEqual(form,before);
});
test('U quota remains enforced without a hidden litre field',()=>{
 assert.throws(()=>validate({editing:{...editing,quantity:7}}),/容量|空間/);assert.throws(()=>validate({form:{...form,sampleSpaceUnits:2}}),/容量|空間/);
 assert.equal(validate({editing:{...editing,quantity:3},form:{...form,sampleSpaceUnits:2}}).allocations[0].quantity,3);
 for(const units of ['',null,0,-1,1.5,'oops'])assert.throws(()=>validate({form:{...form,sampleSpaceUnits:units}}),/正整數.*U/);
});
test('multi-equipment U allocation is kept within independent quotas',()=>{
 const result=validate({form:{...form,sampleSpaceUnits:2,equipmentCount:2,equipmentIds:['EQ-001','EQ-002']}});assert.deepEqual(result.allocations,[{equipmentId:'EQ-001',quantity:3},{equipmentId:'EQ-002',quantity:2}]);assert.equal(result.sampleVolumeLitres,'');
});
test('dates, availability, personnel and reservation conflicts still reject invalid manual changes',()=>{
 assert.throws(()=>validate({form:{...form,time:'2026-11-14'}}),/明日/);assert.throws(()=>validate({equipment:equipment.map(e=>({...e,status:'維護中'}))}),/待機/);assert.throws(()=>validate({form:{...form,ownerId:'NO-ACCOUNT'}}),/工程師/);
 assert.throws(()=>validate({rows:[{...editing,id:'OTHER',requestId:'OTHER',equipmentId:'EQ-001',equipmentIds:['EQ-001'],ownerId:'LOCAL-ENGINEER',time:'2026-11-16',end:'2026-11-20',status:'已排程'}]}),/衝突/);
});
test('physical-volume validation is still mandatory for the guarded AI candidate caller',()=>{
 assert.throws(()=>validate({requirePhysicalVolume:true}),/體積.*必填/);
 assert.throws(()=>validate({requirePhysicalVolume:true,form:{...form,requirePhysicalVolume:false}}),/體積.*必填/);
 assert.throws(()=>validate({requirePhysicalVolume:true,form:{...form,sampleVolumeLitres:200}}),/容量|空間/);
 assert.equal(validate({requirePhysicalVolume:true,form:{...form,sampleVolumeLitres:2}}).sampleVolumeLitres,2);
});
test('local rule suggestions for a U-only form do not generate litre estimates',()=>{
 const suggestion=recommendSchedule({editing,form,equipment,accounts,rows:[],today:'2026-11-14'});assert.equal(suggestion.sampleVolumeLitres,'');assert.equal(suggestion.sampleVolumeEstimated,false);assert.equal(validate({form:{...form,...suggestion}}).status,'已排程');
});
test('AI context keeps missing physical volume unknown despite a valid U quota',()=>{
 const f=e2Fixture();f.form={...f.form,sampleSpaceUnits:1,sampleVolumeLitres:''};const c=makeE2Context({...f,rows:[]});assert.equal(c.request.sample_space_units,1);assert.equal(c.request.sample_volume_litres,null);assert(e2InputIssues(f).some(x=>x.field==='sampleVolumeLitres'));
});
