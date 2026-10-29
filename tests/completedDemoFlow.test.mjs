import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompletedDemoFlow,DEMO_FLOW_MARKER} from '../src/completedDemoFlow.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {resetSystemCases} from '../src/resetCases.mjs';
const signature='data:image/png;base64,DEMO',now=Date.parse('2026-10-29T01:30:00+08:00');
function storage(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS)],['dqa-request-demo-v2','[]'],['dqa-lms-reviews-v1','[]'],['dqa-schedules-demo-v1','[]'],['dqa-equipment-demo-v1',JSON.stringify(DEMO_EQUIPMENT)]]);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
test('one fixture runs from draft through all approvals to completed trial visible to its requester supervisor',()=>{
 const store=storage(),result=createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now},store);
 const request=JSON.parse(store.getItem('dqa-request-demo-v2'))[0],schedule=JSON.parse(store.getItem('dqa-schedules-demo-v1'))[0],lab=JSON.parse(store.getItem('dqa_lab_demo_requests_v1'))[0];
 assert.equal(request.id,result.id);assert.equal(request.status,'已完成');assert.equal(request.supervisorId,'DEMO-SUPERVISOR');assert.equal(request.execution.status,'已完成');assert.ok(request.execution.completedAt);assert.equal(request.lmsReview.approval,2);assert.equal(request.signatureRecords.length,4);assert.equal(request.demoFlow.steps.length,9);
 assert.equal(schedule.status,'已完成');assert.equal(lab.status,'已完成');assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1')).find(row=>row.id===schedule.equipmentId).status,'待機中');
 assert.deepEqual(request.executionHistory.map(row=>row.status),['已排程','執行中','已完成']);assert.equal(request.execution.reportSubmitted,false);
 assert.equal(createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now},store).created,false);assert.equal(JSON.parse(store.getItem('dqa-request-demo-v2')).length,1);
});
test('fixture preserves unrelated cases and survives cleanup without auto-recreating deleted cases',async()=>{
 const store=storage(),existing={id:'EXISTING',product:'original',status:'草稿'};store.setItem('dqa-request-demo-v2',JSON.stringify([existing]));
 createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now},store);assert.deepEqual(JSON.parse(store.getItem('dqa-request-demo-v2')).find(row=>row.id==='EXISTING'),existing);
 await resetSystemCases(store,null);assert.ok(store.getItem(DEMO_FLOW_MARKER));assert.equal(createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now},store).created,false);assert.deepEqual(JSON.parse(store.getItem('dqa-request-demo-v2')),[]);
});
test('missing workflow participants never create a partial example',()=>{
 const store=storage();store.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.filter(row=>row.role!=='二階主管')));assert.throws(()=>createCompletedDemoFlow({viewerId:'DEMO-SUPERVISOR',signature,now},store));assert.equal(store.getItem('dqa-request-demo-v2'),'[]');assert.equal(store.getItem(DEMO_FLOW_MARKER),null);
});
