import test from 'node:test';
import assert from 'node:assert/strict';
import {e2Fixture,e2Packet} from './e2-fixture.mjs';
import {makeE2Context,e2Fingerprint,verifyE2Result,makeE2Draft,e2InputIssues} from '../src/e2Scheduling.mjs';
import {prepareScheduleTrialForm} from '../src/scheduleTrialInput.mjs';

test('U is a separate integer quota and never changes the physical litre value',()=>{
 const f=e2Fixture();f.form.sampleSpaceUnits=3;f.form.sampleVolumeLitres=2;
 const resolved=prepareScheduleTrialForm(f),c=makeE2Context({...f,form:resolved.form,rows:[]});
 assert.equal(c.request.sample_space_units,3);assert.equal(c.request.sample_volume_litres,2);
 f.form.sampleVolumeLitres='';const derived=prepareScheduleTrialForm(f);
 assert.equal(derived.form.sampleSpaceUnits,3);assert.equal(derived.form.sampleVolumeLitres,1);
});
test('legacy requests keep the original field set while explicit blank or fractional U is rejected',()=>{
 const f=e2Fixture();assert(!Object.hasOwn(f.context.request,'sample_space_units'));
 for(const value of ['',null,0,-1,1.5])assert(e2InputIssues({...f,form:{...f.form,sampleSpaceUnits:value}}).some(x=>x.field==='sampleSpaceUnits'));
});
test('candidate verification and draft application enforce U quota independently of geometry',async()=>{
 const f=e2Fixture();f.editing.quantity=2;f.form.sampleSpaceUnits=3;f.form.sampleVolumeLitres=2;
 const c=makeE2Context({...f,rows:[]}),packet=await e2Packet(c),candidate=packet.data.assessment.candidates[0];
 candidate.allocations[0].capacity=3;delete candidate.id;candidate.id='P-'+(await e2Fingerprint(candidate)).slice(0,20);packet.data.selected_candidate_id=candidate.id;
 const result=await verifyE2Result(packet,c);const draft=makeE2Draft({...f,rows:[],context:c,candidate:result.assessment.candidates[0]});
 assert.equal(draft.form.sampleSpaceUnits,3);assert.equal(draft.form.sampleVolumeLitres,2);
 candidate.allocations[0].capacity=8;delete candidate.id;candidate.id='P-'+(await e2Fingerprint(candidate)).slice(0,20);packet.data.selected_candidate_id=candidate.id;
 await assert.rejects(()=>verifyE2Result(packet,c),/CAPACITY_OR_GEOMETRY_MISMATCH/);
});
test('editing displayed equipment U does not silently change trusted backend capacity evidence',()=>{
 const f=e2Fixture();f.form.sampleSpaceUnits=1;f.equipment[0].capacity=999;
 const issues=[],c=makeE2Context({...f,onCoverageIssue:x=>issues.push(x)});
 assert.equal(c.equipment_complete,false);assert(issues.some(x=>x.code==='EQUIPMENT_SPACE_UNITS_CHANGED'));
});
