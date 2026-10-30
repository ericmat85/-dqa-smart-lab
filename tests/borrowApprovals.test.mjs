import test from 'node:test';
import assert from 'node:assert/strict';
import {submitBorrowRequest,decideBorrowRequest,returnBorrowEquipment,BORROW_KEY} from '../src/borrowApprovals.mjs';
import {requestApprovalRows} from '../src/requestApprovalRows.mjs';
function storage(){const data=new Map([['dqa-equipment-demo-v1',JSON.stringify([{id:'EQ-TEST',name:'振動試驗機',status:'待機中',records:[]}])],['dqa-schedules-demo-v1','[]'],['dqa-shared-demo-accounts-v1',JSON.stringify([{id:'R',name:'委託者',role:'委託者',status:'啟用中'},{id:'L1',name:'主管',role:'一階主管',status:'啟用中'},{id:'L2',role:'二階主管',status:'啟用中'}])]]);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const form={requester:'委託者',department:'研發',equipment:'振動試驗機',equipmentId:'EQ-TEST',purpose:'測試使用',borrowDate:'2026-11-01',returnDate:'2026-11-03',quantity:'1',notes:''};
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

test('LMS equipment ID, live state and quantity are validated at submit and approval',()=>{
 const store=storage();assert.throws(()=>submitBorrowRequest({...form,equipmentId:'MISSING'},'R',store),/LMS/);assert.throws(()=>submitBorrowRequest({...form,quantity:'2'},'R',store),/一台/);
 const row=submitBorrowRequest(form,'R',store);assert.equal(row.equipmentId,'EQ-TEST');store.setItem('dqa-equipment-demo-v1',JSON.stringify([{id:'EQ-TEST',name:'LMS 改名',status:'維護中'}]));assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true},store),/待機/);assert.equal(JSON.parse(store.getItem(BORROW_KEY))[0].status,'待核准');
});
test('approval locks the machine as borrowed until LMS confirms return and records both histories',()=>{
 const store=storage(),row=submitBorrowRequest(form,'R',store);decideBorrowRequest({id:row.id,actorId:'L1',approve:true},store);
 let machine=JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0];assert.equal(machine.status,'借用');assert.equal(machine.activeBorrowId,row.id);assert.throws(()=>submitBorrowRequest(form,'R',store),/待機/);
 assert.throws(()=>returnBorrowEquipment({equipmentId:machine.id,actorId:'R',comment:'歸還'},store),/一階/);
 returnBorrowEquipment({equipmentId:machine.id,actorId:'L1',comment:'設備完整，確認歸還'},store);machine=JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0];assert.equal(machine.status,'待機中');assert.equal(machine.activeBorrowId,null);assert.equal(machine.records.length,2);assert.equal(JSON.parse(store.getItem(BORROW_KEY))[0].status,'已歸還');
});
test('borrow approval rechecks new reservations and cannot bypass trial preparation or cleaning buffers',()=>{
 const store=storage(),row=submitBorrowRequest(form,'R',store);store.setItem('dqa-schedules-demo-v1',JSON.stringify([{id:'SCH',requestId:'REQ',equipmentId:'EQ-TEST',status:'已排程',time:'2026-11-03T23:30:00+08:00',end:'2026-11-04T01:00:00+08:00'}]));assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true},store),/衝突/);
 assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0].status,'待機中');
});
test('borrow approval journal recovers a partial write without duplicate equipment records',async()=>{
 const {recoverLifecycleTransaction}=await import('../src/scheduleLifecycle.mjs');const store=storage(),row=submitBorrowRequest(form,'R',store);let fail=true;const interrupted={...store,setItem:(key,value)=>{if(key==='dqa-equipment-demo-v1'&&fail){fail=false;throw Error('quota');}store.setItem(key,value);}};
 assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true},interrupted));recoverLifecycleTransaction(interrupted);assert.equal(JSON.parse(store.getItem(BORROW_KEY))[0].status,'已核准');assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0].status,'借用');assert.equal(JSON.parse(store.getItem('dqa-equipment-demo-v1'))[0].records.length,1);
 assert.throws(()=>returnBorrowEquipment({equipmentId:'EQ-TEST',actorId:'L1',comment:'歸還',expectedBorrowId:'stale-borrow'},store),/已更新/);
});
