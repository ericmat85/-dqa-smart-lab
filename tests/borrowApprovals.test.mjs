import test from 'node:test';
import assert from 'node:assert/strict';
import {submitBorrowRequest,decideBorrowRequest,BORROW_KEY} from '../src/borrowApprovals.mjs';
import {requestApprovalRows} from '../src/requestApprovalRows.mjs';
function storage(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify([{id:'R',name:'委託者',role:'委託者',status:'啟用中'},{id:'L1',name:'主管',role:'一階主管',status:'啟用中'},{id:'L2',role:'二階主管',status:'啟用中'}])]]);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
const form={requester:'委託者',department:'研發',equipment:'振動試驗機',purpose:'測試使用',borrowDate:'2026-11-01',returnDate:'2026-11-03',quantity:'1',notes:''};
test('borrow approval needs no signature and retains its reviewer and decision',()=>{
 const store=storage(),row=submitBorrowRequest(form,'R',store);
 const result=decideBorrowRequest({id:row.id,actorId:'L1',approve:true},store);
 assert.equal(result.status,'已核准');assert.equal(result.reviewSignature,'');assert.equal(result.reviewerId,'L1');assert.equal(result.history.length,1);
});
test('borrow submission enters the same pending approval list and approval writes back the reviewer and signature',()=>{
 const store=storage(),row=submitBorrowRequest(form,'R',store);assert.equal(row.status,'待核准');assert.equal(requestApprovalRows([],[],[],[row])[0].operationId,`borrow:${row.id}`);
 const approved=decideBorrowRequest({id:row.id,actorId:'L1',approve:true,signature:'image',comment:'核准'},store);assert.equal(approved.status,'已核准');assert.equal(JSON.parse(store.getItem(BORROW_KEY))[0].reviewSignature,'image');assert.equal(approved.reviewerId,'L1');assert.equal(requestApprovalRows([],[],[],[approved]).length,0);
 assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true,signature:'x'},store),/已處理/);
});
test('borrow validation, stage permissions and required review inputs are enforced',()=>{
 const store=storage();assert.throws(()=>submitBorrowRequest({...form,returnDate:'2026-10-01'},'R',store));const row=submitBorrowRequest(form,'R',store);
 assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L2',approve:true,signature:'x'},store),/一階/);assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:false},store),/原因/);
 assert.equal(decideBorrowRequest({id:row.id,actorId:'L1',approve:false,comment:'請補充用途'},store).status,'已退回');
});
test('legacy unconfirmed borrow requests appear as pending approvals without another submit',()=>{
 const rows=requestApprovalRows([],[],[],[{id:'OLD',status:'待確認',requester:'工程師',equipment:'Tool',createdAt:'2026-10-28'}]);assert.equal(rows[0].status,'待核准');
});
