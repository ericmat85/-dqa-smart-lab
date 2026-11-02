import test from 'node:test';
import assert from 'node:assert/strict';
import {submitBorrowRequest,decideBorrowRequest,returnBorrowMaterial,BORROW_KEY} from '../src/borrowApprovals.mjs';
import {requestApprovalRows} from '../src/requestApprovalRows.mjs';
import {recoverLifecycleTransaction} from '../src/scheduleLifecycle.mjs';
const key='dqa-materials-demo-v1';
function storage(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify([{id:'R',name:'委託者',role:'委託者',status:'啟用中'},{id:'L1',name:'主管',role:'一階主管',status:'啟用中'},{id:'L2',name:'二階',role:'二階主管',status:'啟用中'}])],[key,JSON.stringify([{id:'MAT-TEST',name:'測試治具',status:'可用',quantity:5,available:5,unit:'組',records:[]}])],['dqa-equipment-demo-v1','[]'],['dqa-schedules-demo-v1','[]']]);return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const form={resourceType:'material',materialId:'MAT-TEST',requester:'委託者',department:'研發',purpose:'試驗固定',borrowDate:'2026-11-02',returnDate:'2026-11-05',quantity:'3'};
const material=s=>JSON.parse(s.getItem(key))[0];
test('material request is pending without stock deduction; approval and return update both ledgers',()=>{
 const s=storage(),row=submitBorrowRequest(form,'R',s);assert.equal(material(s).available,5);assert.equal(row.material,'測試治具');assert.equal(row.unit,'組');assert.match(requestApprovalRows([],[],[],[row])[0].title,/物料借用/);
 decideBorrowRequest({id:row.id,actorId:'L1',approve:true},s);assert.equal(material(s).available,2);assert.equal(material(s).quantity,5);assert.deepEqual(material(s).activeBorrowIds,[row.id]);assert.equal(s.getItem('dqa-equipment-demo-v1'),'[]');assert.equal(s.getItem('dqa-schedules-demo-v1'),'[]');
 returnBorrowMaterial({borrowId:row.id,actorId:'L1',comment:'全數清點完成'},s);assert.equal(material(s).available,5);assert.equal(material(s).records.length,2);assert.deepEqual(material(s).activeBorrowIds,[]);assert.equal(JSON.parse(s.getItem(BORROW_KEY))[0].status,'已歸還');assert.throws(()=>returnBorrowMaterial({borrowId:row.id,actorId:'L1',comment:'再次歸還'},s),/重複/);assert.equal(material(s).available,5);
});
test('quantity, item status and dates are validated before writing a request',()=>{
 for(const change of [{quantity:'0'},{quantity:'-1'},{quantity:'1.5'},{quantity:'6'},{materialId:'MISSING'},{returnDate:'2026-10-01'}]){const s=storage();assert.throws(()=>submitBorrowRequest({...form,...change},'R',s));assert.equal(s.getItem(BORROW_KEY),null);assert.equal(material(s).available,5);}
 const s=storage();s.setItem(key,JSON.stringify([{...material(s),status:'維護中'}]));assert.throws(()=>submitBorrowRequest(form,'R',s),/不可借用/);
});
test('approval rereads stock, prevents over-allocation and rejection never deducts',()=>{
 const s=storage(),first=submitBorrowRequest(form,'R',s),second=submitBorrowRequest(form,'R',s);decideBorrowRequest({id:first.id,actorId:'L1',approve:true},s);assert.throws(()=>decideBorrowRequest({id:second.id,actorId:'L1',approve:true},s),/不足/);assert.equal(material(s).available,2);assert.equal(JSON.parse(s.getItem(BORROW_KEY)).find(r=>r.id===second.id).status,'待核准');decideBorrowRequest({id:second.id,actorId:'L1',approve:false,comment:'庫存不足'},s);assert.equal(material(s).available,2);assert.throws(()=>decideBorrowRequest({id:first.id,actorId:'L1',approve:true},s),/已處理/);
});
test('multiple loans can be returned independently and permissions are enforced',()=>{
 const s=storage(),a=submitBorrowRequest({...form,quantity:2},'R',s),b=submitBorrowRequest({...form,quantity:3},'R',s);assert.throws(()=>decideBorrowRequest({id:a.id,actorId:'R',approve:true},s),/一階/);assert.throws(()=>decideBorrowRequest({id:a.id,actorId:'L2',approve:true},s),/一階/);for(const row of [a,b])decideBorrowRequest({id:row.id,actorId:'L1',approve:true},s);assert.equal(material(s).available,0);assert.equal(material(s).status,'借出');assert.throws(()=>returnBorrowMaterial({borrowId:a.id,actorId:'R',comment:'自行歸還'},s),/一階/);assert.throws(()=>returnBorrowMaterial({borrowId:a.id,actorId:'L1'},s),/確認結果/);returnBorrowMaterial({borrowId:a.id,actorId:'L1',comment:'清點2組'},s);assert.equal(material(s).available,2);assert.deepEqual(material(s).activeBorrowIds,[b.id]);returnBorrowMaterial({borrowId:b.id,actorId:'L1',comment:'清點3組'},s);assert.equal(material(s).available,5);
});
test('interrupted approval recovers material and borrow ledgers together without duplicate stock changes',()=>{
 const s=storage(),row=submitBorrowRequest(form,'R',s),set=s.setItem;let failed=false;s.setItem=(k,v)=>{if(k===BORROW_KEY&&!failed){failed=true;throw Error('disk full');}return set(k,v);};assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true},s),/disk full/);s.setItem=set;recoverLifecycleTransaction(s);assert.equal(material(s).available,2);assert.equal(JSON.parse(s.getItem(BORROW_KEY))[0].status,'已核准');recoverLifecycleTransaction(s);assert.equal(material(s).available,2);assert.equal(material(s).records.length,1);
});
test('case reset releases material loans without deleting the material ledger',async()=>{
 const {resetSystemCases}=await import('../src/resetCases.mjs');const s=storage(),row=submitBorrowRequest(form,'R',s);decideBorrowRequest({id:row.id,actorId:'L1',approve:true},s);await resetSystemCases(s,null);assert.equal(material(s).quantity,5);assert.equal(material(s).available,5);assert.deepEqual(material(s).activeBorrowIds,[]);assert.equal(material(s).records[0].type,'Demo 案件重設');assert.deepEqual(JSON.parse(s.getItem(BORROW_KEY)),[]);
});
test('changed units and duplicate material IDs cannot silently debit or credit inventory',()=>{
 const s=storage(),row=submitBorrowRequest(form,'R',s);s.setItem(key,JSON.stringify([{...material(s),unit:'件'}]));assert.throws(()=>decideBorrowRequest({id:row.id,actorId:'L1',approve:true},s),/單位已變更/);assert.equal(material(s).available,5);
 const duplicate=storage();duplicate.setItem(key,JSON.stringify([material(duplicate),material(duplicate)]));assert.throws(()=>submitBorrowRequest(form,'R',duplicate),/台帳/);
 const approved=storage(),loan=submitBorrowRequest(form,'R',approved);decideBorrowRequest({id:loan.id,actorId:'L1',approve:true},approved);approved.setItem(key,JSON.stringify([{...material(approved),available:-1}]));assert.throws(()=>returnBorrowMaterial({borrowId:loan.id,actorId:'L1',comment:'確認'},approved),/台帳/);assert.equal(JSON.parse(approved.getItem(BORROW_KEY))[0].status,'已核准');
});
