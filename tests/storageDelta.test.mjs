import test from 'node:test';
import assert from 'node:assert/strict';
import {storageDelta,applyStorageDelta} from '../src/storageDelta.mjs';
import {commitLifecycleTransaction,recoverLifecycleTransaction} from '../src/scheduleLifecycle.mjs';
const journal='dqa-schedule-lifecycle-pending-v1';
test('large existing signatures do not get duplicated when approval fields change',()=>{
 const signature='data:image/png;base64,'+'A'.repeat(1500000);
 const before=[{id:'OP1',status:'待審核',signature},{id:'OP2',status:'已核准',signature}];
 const after=[{...before[0],status:'已核准',reviewerId:'ADMIN',reviewSignature:''},before[1]];
 const patch=storageDelta(before,after);assert.ok(JSON.stringify(patch).length<500);assert.deepEqual(applyStorageDelta(before,patch),after);assert.deepEqual(applyStorageDelta(after,patch),after);
});
test('approval transaction fits tight storage with large signatures and updates pending schedule',()=>{
 const signature='data:image/png;base64,'+'A'.repeat(1500000);
 const data=new Map([['dqa-lab-operations-v1',JSON.stringify([{id:'OP',status:'待審核',signature}])],['dqa-schedules-demo-v1',JSON.stringify([{id:'S',requestId:'R',status:'待核准',time:'2026-11-01',end:'2026-11-02'}])],['dqa-equipment-demo-v1','[]']]);
 const size=()=>[...data].reduce((total,[key,value])=>total+key.length+value.length,0),limit=size()+4000;let journalSize=0;
 const storage={getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem(key,value){if(size()-(data.get(key)?.length||0)+value.length+(data.has(key)?0:key.length)>limit){const error=Error('quota');error.name='QuotaExceededError';throw error;}if(key===journal)journalSize=value.length;data.set(key,value);}};
 commitLifecycleTransaction(storage,{schedules:JSON.stringify([{id:'S',requestId:'R',status:'未排程',time:'',end:''}]),equipment:'[]',labOperations:JSON.stringify([{id:'OP',status:'已核准',signature,reviewerId:'ADMIN'}])});
 assert.ok(journalSize<1500);assert.equal(JSON.parse(storage.getItem('dqa-schedules-demo-v1'))[0].status,'未排程');assert.equal(JSON.parse(storage.getItem('dqa-lab-operations-v1'))[0].signature,signature);assert.equal(storage.getItem(journal),null);
});
test('compact journal recovers partial writes without duplicating audit entries',()=>{
 const data=new Map([['dqa-schedules-demo-v1','[{"id":"S","status":"待核准"}]'],['dqa-equipment-demo-v1','[]'],['dqa_lab_demo_audit_v1','[{"id":"OLD","reason":"old"}]']]);let fail=true;
 const storage={getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem(key,value){if(key==='dqa_lab_demo_audit_v1'&&fail){fail=false;throw Error('temporary');}data.set(key,value);}};
 assert.throws(()=>commitLifecycleTransaction(storage,{schedules:'[{"id":"S","status":"未排程"}]',equipment:'[]',labAudit:'[{"id":"NEW","reason":"approved"},{"id":"OLD","reason":"old"}]'}),/temporary/);
 assert.ok(storage.getItem(journal));recoverLifecycleTransaction(storage);assert.equal(JSON.parse(storage.getItem('dqa_lab_demo_audit_v1')).length,2);assert.equal(recoverLifecycleTransaction(storage),false);
});
