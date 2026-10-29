import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewElectronicRequest, reviewRevision, REQUEST_KEY, readElectronicRequestsForLms } from '../src/electronicReview.mjs';
import { ROLE } from '../src/demoPermissions.mjs';

const signature = 'data:image/png;base64,example';
const accounts = [{id:'l1',name:'一階',role:ROLE.LEVEL1,status:'啟用中'},{id:'l2',name:'二階',role:ROLE.LEVEL2,status:'啟用中'},{id:'admin',role:ROLE.ADMIN,status:'啟用中'}];
function setup() {
  const request = {id:'case',ownerId:'owner',supervisorId:'manager',status:'已核准',signatureRecords:[]};
  const data = new Map([[REQUEST_KEY,JSON.stringify([request])],['dqa-shared-demo-accounts-v1',JSON.stringify(accounts)]]);
  const storage = {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  return {request,storage,read:()=>JSON.parse(storage.getItem(REQUEST_KEY))[0]};
}
const decide = (storage,request,accountId,extra={}) => reviewElectronicRequest({id:request.id,expectedRevision:reviewRevision(request),accountId,signature,comment:'checked',returnIt:false,...extra},storage);
test('two-stage approval writes signatures, opinions, status, and history to the source', () => {
  const {request,storage,read} = setup();
  const first=decide(storage,request,'l1');
  assert.equal(first.status,'已核准');
  assert.equal(read().lmsReview.approval,1);
  assert.equal(readElectronicRequestsForLms(storage)[0].approval,1);
  const second=decide(storage,first,'l2');
  assert.equal(second.status,'待排程');
  assert.equal(read().lmsReview.status,'完成');
  assert.equal(readElectronicRequestsForLms(storage)[0].status,'完成');
  assert.equal(read().signatureRecords.length,2);
  assert.equal(read().lmsReview.history.length,2);
  assert.equal(read().signatureRecords[1].comment,'checked');
});
test('stale submissions and invalid stage roles cannot overwrite a decision', () => {
  const {request,storage,read}=setup();
  assert.throws(()=>decide(storage,request,'l2'));
  assert.throws(()=>decide(storage,request,'admin'));
  const first=decide(storage,request,'l1');
  assert.throws(()=>decide(storage,request,'l1'));
  assert.throws(()=>decide(storage,first,'l1'));
  assert.equal(read().signatureRecords.length,1);
});
test('return requires a reason but no signature; resubmission resets active approvals', () => {
  const {request,storage}=setup();
  assert.throws(()=>decide(storage,request,'l1',{returnIt:true,signature:'',comment:' '}));
  const returned=decide(storage,request,'l1',{returnIt:true,signature:'',comment:'補件'});
  assert.equal(returned.status,'退件');
  assert.equal(readElectronicRequestsForLms(storage)[0].status,'退回');
  assert.match(returned.approvalNote,/補件/);
  const resubmitted={...returned,status:'已核准',lmsReview:null,requesterSignatureAt:'new-round'};
  storage.setItem(REQUEST_KEY,JSON.stringify([resubmitted]));
  const approved=decide(storage,resubmitted,'l1');
  assert.equal(approved.lmsReview.approval,1);
  assert.equal(approved.signatureRecords.length,2);
  assert.equal(approved.signatureRecords[0].decision,'退回');
});
test('self review, disabled accounts, missing signature and storage failures are rejected', () => {
  const {request,storage,read}=setup();
  assert.throws(()=>decide(storage,request,'l1',{signature:''}));
  storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts.map(a=>({...a,status:'已停用'}))));
  assert.throws(()=>decide(storage,request,'l1'));
  storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  const own={...request,ownerId:'l1'};
  storage.setItem(REQUEST_KEY,JSON.stringify([own]));
  assert.throws(()=>decide(storage,own,'l1'));
  storage.setItem(REQUEST_KEY,JSON.stringify([request]));
  const denied={getItem:storage.getItem,setItem(){throw Error('quota');}};
  assert.throws(()=>decide(denied,request,'l1'));
  assert.equal(read().lmsReview,undefined);
});
