import test from 'node:test';
import assert from 'node:assert/strict';
import {resetSystemCases,CASE_RESET_KEY,caseResetActive} from '../src/resetCases.mjs';
import {readLabSnapshot} from '../src/labData.mjs';
import {syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
const arrayKeys=['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'];
function memory(){const data=new Map(arrayKeys.map(key=>[key,JSON.stringify([{id:'CASE',status:'待確認'}])]));return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
test('reset clears all case lists and histories while preserving accounts, signatures, roles and asset ledgers',async()=>{
 const storage=memory();const kept={'dqa-shared-demo-accounts-v1':'[{"id":"ADMIN"}]','dqa-custom-roles-v1':'[{"id":"ROLE"}]','default-signature':'image','dqa-materials-demo-v1':'[{"id":"MAT","available":4}]'};
 for(const [key,value]of Object.entries(kept))storage.setItem(key,value);
 storage.setItem('dqa-equipment-demo-v1',JSON.stringify([{id:'EQ',status:'使用中',currentRequest:'CASE',records:[{id:'H',type:'保養'}]},{id:'SERVICE',status:'維護中'},{id:'BORROWED',status:'借用',activeBorrowId:'BOR-OLD',borrower:'示範借用者'}]));
 await resetSystemCases(storage,null);
 for(const key of arrayKeys)assert.deepEqual(JSON.parse(storage.getItem(key)),[]);
 for(const [key,value]of Object.entries(kept))assert.equal(storage.getItem(key),value);
 assert.equal(JSON.parse(storage.getItem('dqa-equipment-demo-v1'))[0].status,'待機中');assert.equal(JSON.parse(storage.getItem('dqa-equipment-demo-v1'))[0].records.length,1);assert.equal(JSON.parse(storage.getItem('dqa-equipment-demo-v1'))[1].status,'維護中');
 assert.equal(JSON.parse(storage.getItem('dqa-equipment-demo-v1'))[2].status,'待機中');assert.equal(JSON.parse(storage.getItem('dqa-equipment-demo-v1'))[2].activeBorrowId,null);
 assert.equal(JSON.parse(storage.getItem(CASE_RESET_KEY)).phase,'done');assert.equal(caseResetActive(storage),false);
 const snapshot=readLabSnapshot(storage);assert.equal(snapshot.requests.length,0);assert.equal(snapshot.schedules.length,0);syncScheduleLifecycle(storage,Date.now());assert.deepEqual(JSON.parse(storage.getItem('dqa-schedules-demo-v1')),[]);
});
test('uploaded reports are cleared before reset is reported complete',async()=>{
 const storage=memory(),reports=new Map([['CASE','report.xlsx']]);let closed=false;
 const database={open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},transaction(){const transaction={objectStore:()=>({clear:()=>reports.clear()})};queueMicrotask(()=>transaction.oncomplete?.());return transaction;},close(){closed=true;}};request.onsuccess();});return request;}};
 await resetSystemCases(storage,database);assert.equal(reports.size,0);assert.equal(closed,true);assert.equal(JSON.parse(storage.getItem(CASE_RESET_KEY)).phase,'done');
});
test('reset never overwrites unreadable equipment data',async()=>{
 const storage=memory();storage.setItem('dqa-equipment-demo-v1','invalid');await assert.rejects(()=>resetSystemCases(storage,null));assert.notEqual(storage.getItem('dqa-request-demo-v2'),'[]');assert.equal(storage.getItem('dqa-equipment-demo-v1'),'invalid');
});
