import test from 'node:test';
import assert from 'node:assert/strict';
import {makeE2Context,verifyE2Result,makeE2Draft,validateE2Applied,e2Fingerprint} from '../src/e2Scheduling.mjs';
import {e2Fixture,e2Packet} from './e2-fixture.mjs';

test('E2 projects only synthetic resource IDs and numeric/date conditions, with current statuses',()=>{
 const f=e2Fixture();f.equipment[2].status='維護中';f.equipment[2].password='FAKE_DO_NOT_TRANSMIT';f.equipment[2].customer='DO_NOT_TRANSMIT_CUSTOMER';
 const c=makeE2Context(f);assert.equal(c.equipment.find(x=>x.id==='EQ-003').status,'MAINTENANCE');
 const text=JSON.stringify(c);for(const value of ['FAKE_DO_NOT_TRANSMIT','DO_NOT_TRANSMIT_CUSTOMER','demo1234','@','usableVolumeLitres','password'])assert.ok(!text.includes(value));
 assert.equal(c.request.conditions.temperature_min,-20);assert.equal(c.request.sample_volume_litres,1);assert.equal(c.reservations_complete,true);
});
test('missing sample volume remains missing and missing duration is never assumed to be three days',()=>{
 const f=e2Fixture();f.form.sampleVolumeLitres='';f.form.time='';f.form.end='';const c=makeE2Context(f);
 assert.equal(c.request.sample_volume_litres,null);assert.equal(c.request.duration_days,null);
});
test('a changed device specification cannot silently reuse old evidence and disabled engineers are not offered',()=>{
 const f=e2Fixture();f.equipment[2].specification='UNVERIFIED_NEW_SPECIFICATION';assert.throws(()=>makeE2Context(f),/EQUIPMENT_IDENTITY_OR_SPEC_CHANGED/);
 f.equipment[2].specification=e2Fixture().equipment[2].specification;f.accounts.find(x=>x.id==='U003').role='系統管理員';assert.equal(makeE2Context(f).personnel.find(x=>x.id==='U003').enabled,false);
});
test('incomplete resource reads are explicit and oversized reservation evidence is not truncated',()=>{
 const f=e2Fixture();f.equipment.pop();assert.equal(makeE2Context(f).equipment_complete,false);
 f.accounts.push({id:'UNVERIFIED-ENGINEER',role:'實驗室工程師',status:'啟用中'});assert.equal(makeE2Context(f).personnel_complete,false);
 const day=f.form.time;f.rows=Array.from({length:33},(_,i)=>({id:'RES-'+i,equipmentId:'EQ-003',ownerId:'U003',time:day,end:day,status:'已排程'}));assert.throws(()=>makeE2Context(f),/NO_TRUNCATION/);
});
test('paused reservations keep an open-ended interval rather than disappearing',()=>{
 const f=e2Fixture();f.rows=[{id:'RES-PAUSED',equipmentId:'EQ-003',ownerId:'U003',time:f.form.time,end:f.form.end,status:'暫停中',pauseStartedAt:new Date(f.now).toISOString()}];const c=makeE2Context(f);
 assert.equal(c.reservations.length,1);assert.equal(c.reservations[0].open_ended,true);assert.equal(c.reservations[0].end_ms,null);
});
test('valid Rule-based result verifies and only produces an unsaved form draft',async()=>{
 const f=e2Fixture(),packet=await e2Packet(f.context),before=JSON.stringify(f.rows);await verifyE2Result(packet,f.context);
 const approved=makeE2Draft({...f,candidate:packet.data.assessment.candidates[0]});assert.equal(approved.form.equipmentId,'EQ-003');assert.equal(JSON.stringify(f.rows),before);
 const proposal=validateE2Applied({...f,form:approved.form,approved});assert.equal(proposal.status,'已排程');assert.deepEqual(proposal.allocations,[{equipmentId:'EQ-003',quantity:1}]);assert.equal(JSON.stringify(f.rows),before);
});
test('resource changes or stale results cannot overwrite a newer schedule',async()=>{
 const f=e2Fixture(),packet=await e2Packet(f.context),candidate=packet.data.assessment.candidates[0];
 f.equipment[2].status='使用中';assert.throws(()=>makeE2Draft({...f,candidate}),/STALE_RESOURCES/);f.equipment[2].status='待機中';assert.throws(()=>makeE2Draft({...f,candidate,now:f.now+300001}),/RESULT_EXPIRED/);
 const approved=makeE2Draft({...f,candidate});assert.throws(()=>validateE2Applied({...f,form:{...approved.form,note:'MANUAL_CHANGE'},approved}),/APPLIED_FORM_CHANGED/);
});
test('forged capacity, conflicts, unsupported dates and false provider claims are rejected',async()=>{
 const f=e2Fixture();
 for(const mutate of [p=>p.data.real_ai=true,p=>p.data.assessment.candidates[0].allocations[0].capacity=999,p=>p.data.assessment.candidates[0].end='2099-12-31',p=>p.data.selected_candidate_id='P-FAKE',p=>p.data.writes='APPLIED',p=>p.data.engine='E4']){
  const packet=await e2Packet(f.context);mutate(packet);await assert.rejects(()=>verifyE2Result(packet,f.context));
 }
 const c=structuredClone(f.context);c.reservations.push({id:'RES-COLLISION',equipment_ids:['EQ-003'],owner_id:'U003',start_ms:Date.parse(f.form.time+'T00:00:00+08:00'),end_ms:null,open_ended:true});const packet=await e2Packet(c);await assert.rejects(()=>verifyE2Result(packet,c),/RESERVATION_CONFLICT/);
});
test('a syntactically valid candidate hash cannot authorize invented capacity or conditions',async()=>{
 const f=e2Fixture(),p=await e2Packet(f.context),candidate=p.data.assessment.candidates[0];candidate.allocations[0].capacity=100;const {id:_id,...unsigned}=candidate;candidate.id='P-'+(await e2Fingerprint(unsigned)).slice(0,20);p.data.selected_candidate_id=candidate.id;
 await assert.rejects(()=>verifyE2Result(p,f.context),/CAPACITY_OR_GEOMETRY/);
});
