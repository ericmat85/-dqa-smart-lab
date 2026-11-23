import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {DEMO_SCHEDULES} from '../src/demoSchedules.mjs';
import {ALL_DEMO_REQUESTS} from '../src/demoLmsRequests.mjs';
import {readLabSnapshot} from '../src/labData.mjs';
import {trialAcceleratorAvailability,accelerateTrial} from '../src/trialControls.mjs';
const now=Date.parse('2026-11-14T02:35:00+08:00');
const actor=INITIAL_ACCOUNTS.find(a=>a.role==='實驗室工程師'&&a.status==='啟用中');
function fixture(id='REQ-2026-005'){
 const schedule={...DEMO_SCHEDULES.find(x=>x.requestId===id),equipmentId:'EQ-001',equipmentIds:['EQ-001'],ownerId:actor.id,reservationId:'LOCAL-LEGACY-RESERVATION',time:'2026-11-16',end:'2026-11-26',status:'已排程'};
 const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS)],['dqa-equipment-demo-v1',JSON.stringify(DEMO_EQUIPMENT.map(e=>e.id==='EQ-001'?{...e,status:'待機中',currentRequest:''}:e))],['dqa-schedules-demo-v1',JSON.stringify([schedule])],['dqa_lab_demo_requests_v1',JSON.stringify([{id,scheduleId:schedule.id,reservationId:schedule.reservationId,status:'已排程',acceptedAt:new Date(now-1000).toISOString(),scheduledStart:schedule.time,scheduledEnd:schedule.end}])]]);
 return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
test('REQ-2026-005 uses the same missing-key approved Demo fallback as the UI without writing reviews',()=>{
 const s=fixture(),before=[...s.data],visible=readLabSnapshot(s,now).reviews.find(x=>x.id==='REQ-2026-005');assert.equal(visible.approval,2);assert.equal(visible.status,'完成');
 const state=trialAcceleratorAvailability({actorId:actor.id,now},s);assert.equal(state.enabled,true);assert.equal(state.id,'REQ-2026-005');assert.deepEqual([...s.data],before);assert.equal(s.getItem('dqa-lms-reviews-v1'),null);
 for(const percent of [50,100])assert.equal(accelerateTrial({actorId:actor.id,signature:'data:image/png;base64,LOCAL_SYNTHETIC_ONLY',now},s).percent,percent);
 assert.equal(s.getItem('dqa-lms-reviews-v1'),null);assert.equal(JSON.parse(s.getItem('dqa-schedules-demo-v1')).length,1);assert.deepEqual(JSON.parse(s.getItem('dqa_lab_demo_requests_v1')).map(x=>x.id),['REQ-2026-005']);assert.equal(trialAcceleratorAvailability({actorId:actor.id,now},s).enabled,false);
});
test('stored empty, missing-case or unapproved reviews never fall back to an approved default',()=>{
 for(const reviews of [[],[{id:'OTHER',approval:2,status:'完成'}],[{id:'REQ-2026-005',approval:0,status:'待審查'}],[{id:'REQ-2026-005',approval:2,status:'取消'}]]){
  const s=fixture();s.setItem('dqa-lms-reviews-v1',JSON.stringify(reviews));const before=[...s.data];assert.equal(trialAcceleratorAvailability({actorId:actor.id,now},s).enabled,false);assert.throws(()=>accelerateTrial({actorId:actor.id,signature:'LOCAL_ONLY',now},s));assert.deepEqual([...s.data],before);
 }
});
test('malformed or non-array persisted review data is rejected rather than replaced',()=>{
 for(const raw of ['', '{bad','null','{}']){const s=fixture();s.setItem('dqa-lms-reviews-v1',raw);const before=[...s.data];const state=trialAcceleratorAvailability({actorId:actor.id,now},s);assert.equal(state.enabled,false);assert.match(state.reason,/審查資料/);assert.deepEqual([...s.data],before);}
});
test('the original REQ-2026-001 pending review remains blocked without automatic approval',()=>{
 assert.equal(ALL_DEMO_REQUESTS.find(x=>x.id==='REQ-2026-001').approval,0);const s=fixture('REQ-2026-001'),before=[...s.data];assert.equal(trialAcceleratorAvailability({actorId:actor.id,now},s).enabled,false);assert.deepEqual([...s.data],before);
});
test('fallback does not waive receipt, reservation, pending-operation or account guards',()=>{
 const edits=[s=>{const r=JSON.parse(s.getItem('dqa_lab_demo_requests_v1'));delete r[0].acceptedAt;s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(r));},s=>{const r=JSON.parse(s.getItem('dqa_lab_demo_requests_v1'));r[0].reservationId='STALE';s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(r));},s=>s.setItem('dqa-lab-operations-v1',JSON.stringify([{requestId:'REQ-2026-005',status:'待審核'}]))];
 for(const edit of edits){const s=fixture();edit(s);const before=[...s.data];assert.equal(trialAcceleratorAvailability({actorId:actor.id,now},s).enabled,false);assert.deepEqual([...s.data],before);}
 const s=fixture();assert.equal(trialAcceleratorAvailability({actorId:'NOT-AN-ACCOUNT',now},s).enabled,false);
});
