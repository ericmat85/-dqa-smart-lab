import test from 'node:test';
import assert from 'node:assert/strict';
import {ownsRequest,assertEditableRequest,deleteDraft,reviewRequesterDecision} from '../src/requestWorkflow.mjs';
const owner={id:'OWNER',name:'同名',role:'委託者',status:'啟用中'};
const manager={id:'SUP',name:'同名',role:'委託者主管',status:'啟用中'};
const request={id:'REQ',ownerId:'OWNER',requester:'同名',supervisorId:'SUP',status:'草稿'};
const signature='data:image/png;base64,DEMO';
test('only the owner can edit drafts or returned cases; sent cases cannot be deleted',()=>{
 assert.equal(ownsRequest(owner,request),true);assert.equal(ownsRequest({...owner,id:'OTHER'},request),false);
 for(const status of ['草稿','退件','補件中'])assert.doesNotThrow(()=>assertEditableRequest(owner,{...request,status}));
 for(const status of ['待主管簽核','待排程','已排程','已結案'])assert.throws(()=>assertEditableRequest(owner,{...request,status}));
 assert.deepEqual(deleteDraft([request],'REQ',owner),[]);
 assert.throws(()=>deleteDraft([{...request,status:'待主管簽核'}],'REQ',owner));
 assert.throws(()=>deleteDraft([request],'REQ',{...owner,id:'OTHER'}));
 assert.throws(()=>deleteDraft([request],'missing',owner));
});
test('different people with the same name can approve; ID prevents self approval',()=>{
 const pending={...request,status:'待主管簽核'};
 const approved=reviewRequesterDecision(pending,manager,{status:'已核准',signature});
 assert.equal(approved.status,'已核准');assert.equal(approved.signatureRecords.at(-1).actorId,'SUP');
 assert.throws(()=>reviewRequesterDecision({...pending,ownerId:'SUP'},manager,{status:'已核准',signature}));
 assert.throws(()=>reviewRequesterDecision(pending,{...manager,status:'停用'},{status:'已核准',signature}));
 assert.throws(()=>reviewRequesterDecision(pending,{...manager,id:'OTHER'},{status:'已核准',signature}));
});
test('approval needs signature; return needs reason and retains history',()=>{
 const pending={...request,status:'待主管簽核',signatureRecords:[{id:'OLD',stage:'委託送出'}]};
 assert.throws(()=>reviewRequesterDecision(pending,manager,{status:'已核准'}));
 assert.throws(()=>reviewRequesterDecision(pending,manager,{status:'退件',comment:' '}));
 const returned=reviewRequesterDecision(pending,manager,{status:'退件',comment:'補充規範'});
 assert.equal(returned.status,'退件');assert.equal(returned.signatureRecords.length,2);assert.equal(returned.approvalNote,'補充規範');
 assert.throws(()=>reviewRequesterDecision(returned,manager,{status:'已核准',signature}));
});
