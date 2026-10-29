import test from 'node:test';
import assert from 'node:assert/strict';
import {submitLabOperation,decideLabOperation,LAB_OPERATIONS_KEY,applyLabOperationResults} from '../src/labOperations.mjs';
import {recoverLifecycleTransaction,syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
const actor={id:'LAB',name:'工程師',role:'實驗室工程師',status:'啟用中'},reviewer={id:'L1',name:'主管',role:'一階主管',status:'啟用中'};
function setup(status='待確認'){
 const data=new Map(Object.entries({'dqa-shared-demo-accounts-v1':JSON.stringify([actor,reviewer,{id:'L2',role:'二階主管',status:'啟用中'}]),'dqa_lab_demo_requests_v1':JSON.stringify([{id:'REQ',status}]),'dqa-schedules-demo-v1':JSON.stringify([{id:'SCH',requestId:'REQ',equipmentId:'EQ',time:'2099-01-01',end:'2099-01-02',status:'已排程'}]),'dqa-equipment-demo-v1':JSON.stringify([{id:'EQ',name:'Machine',status:'使用中',currentRequest:'REQ',records:[]}]),'dqa-request-demo-v2':JSON.stringify([{id:'REQ',status:'已核准',requesterSignature:'original'}]),'dqa-lms-reviews-v1':JSON.stringify([{id:'REQ',status:'完成'}])}));
 return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}
const submit=(storage,action='cancel')=>submitLabOperation({requestId:'REQ',action,actorId:'LAB',reason:'機台異常',signature:action==='interrupt'?'applicant-signature':''},storage);
test('pending approval permits unsigned cancellation and interruption approvals while retaining reviewer history',()=>{
 for(const action of ['cancel','interrupt']){
  const store=setup(action==='cancel'?'待確認':'試驗中'),operation=submit(store,action);
  const result=decideLabOperation({id:operation.id,actorId:'L1',approve:true},store);
  assert.equal(result.status,'已核准');assert.equal(result.reviewSignature,'');assert.equal(result.reviewerId,'L1');assert.ok(result.reviewedAt);
  assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'未排程');
 }
});
test('system administrator can approve operational cancellation and return the case to pending scheduling',()=>{
 const store=setup(),operation=submit(store);const accounts=JSON.parse(store.getItem('dqa-shared-demo-accounts-v1'));
 store.setItem('dqa-shared-demo-accounts-v1',JSON.stringify([...accounts,{id:'ADMIN',name:'管理員',role:'系統管理員',status:'啟用中'}]));
 const result=decideLabOperation({id:operation.id,actorId:'ADMIN',approve:true,signature:'admin-signature'},store);
 assert.equal(result.status,'已核准');assert.equal(result.reviewerId,'ADMIN');assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'未排程');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1')).length,0);
});
test('unsigned cancellation enters approval list and returns to scheduling only after approval',()=>{
 const store=setup(),operation=submit(store);assert.equal(operation.status,'待審核');assert.equal(operation.signature,'');
 assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'待核准');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1')).length,1);
 assert.throws(()=>submit(store),/待審核/);
 decideLabOperation({id:operation.id,actorId:'L1',approve:true,signature:'s'},store);
 const row=JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0];assert.equal(row.status,'未排程');assert.equal(row.time,'');assert.equal(row.end,'');
 assert.equal(JSON.parse(store.getItem('dqa-request-demo-v2'))[0].status,'已核准');assert.equal(JSON.parse(store.getItem('dqa-lms-reviews-v1'))[0].status,'完成');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1')).length,0);
});
test('pending cancellation stays awaiting approval when its start time passes and rejection restores its reservation',()=>{
 const store=setup(),operation=submit(store);syncScheduleLifecycle(store,Date.parse('2099-01-02T00:00:00+08:00'));
 assert.equal(JSON.parse(store.getItem(LAB_OPERATIONS_KEY))[0].status,'待審核');assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'待核准');
 decideLabOperation({id:operation.id,actorId:'L1',approve:false,comment:'請保留'},store);assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'已排程');
});
test('cancellation approval retains service state and recovers partial writes',()=>{
 const store=setup();store.setItem('dqa-equipment-demo-v1',JSON.stringify([{id:'EQ',status:'維護中',records:[]}]));const operation=submit(store),write=store.setItem;let fail=true;
 store.setItem=(key,value)=>{if(key==='dqa_lab_demo_requests_v1'&&fail){fail=false;throw Error('quota');}write(key,value);};
 assert.throws(()=>decideLabOperation({id:operation.id,actorId:'L1',approve:true,signature:'s'},store),/儲存空間/);recoverLifecycleTransaction(store);
 assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0].status,'維護中');assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'未排程');assert.equal(JSON.parse(store.getItem(LAB_OPERATIONS_KEY))[0].status,'已核准');
});
test('reject requires a reason, preserves trial and allows resubmission',()=>{
 const store=setup('試驗中'),operation=submit(store,'interrupt');assert.throws(()=>decideLabOperation({id:operation.id,actorId:'L1',approve:false},store),/原因/);
 decideLabOperation({id:operation.id,actorId:'L1',approve:false,comment:'請補資料'},store);assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0].status,'試驗中');assert.equal(JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0].status,'已排程');assert.equal(submit(store,'interrupt').status,'待審核');
});
test('disabled accounts, wrong levels and self approval are rejected',()=>{
 const store=setup('試驗中'),operation=submit(store,'interrupt');assert.throws(()=>decideLabOperation({id:operation.id,actorId:'L2',approve:true,signature:'s'},store),/一階/);
 store.setItem('dqa-shared-demo-accounts-v1',JSON.stringify([{...actor,role:'一階主管'},reviewer]));assert.throws(()=>decideLabOperation({id:operation.id,actorId:'LAB',approve:true,signature:'s'},store),/一階/);
 store.setItem('dqa-shared-demo-accounts-v1',JSON.stringify([{...actor,status:'已停用'},reviewer]));assert.throws(()=>submit(store),/權限/);
});
test('approved interruption returns schedules to unscheduled without cancelling request',()=>{
 const store=setup('試驗中'),operation=submit(store,'interrupt');decideLabOperation({id:operation.id,actorId:'L1',approve:true,signature:'s'},store);
 const row=JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0];assert.equal(row.status,'未排程');assert.equal(row.time,'');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0].status,'已中斷');assert.equal(JSON.parse(store.getItem('dqa-request-demo-v2'))[0].status,'已核准');
 const lab=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'));assert.equal(applyLabOperationResults(lab,JSON.parse(store.getItem(LAB_OPERATIONS_KEY)))[0],lab[0]);
});
test('interrupted writes recover review result and related data as one transaction',()=>{
 const store=setup('試驗中'),operation=submit(store,'interrupt'),write=store.setItem;let failed=false;store.setItem=(key,value)=>{if(key==='dqa_lab_demo_requests_v1'&&!failed){failed=true;throw Error('quota');}write(key,value);};
 assert.throws(()=>decideLabOperation({id:operation.id,actorId:'L1',approve:true,signature:'s'},store),/儲存空間/);recoverLifecycleTransaction(store);
 assert.equal(JSON.parse(store.getItem(LAB_OPERATIONS_KEY))[0].status,'已核准');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0].status,'已中斷');assert.equal(JSON.parse(store.getItem('dqa_lab_demo_audit_v1')).length,1);
});
