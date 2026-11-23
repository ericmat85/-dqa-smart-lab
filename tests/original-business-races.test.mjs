import test from 'node:test';import assert from 'node:assert/strict';
import {businessClient} from '../src/businessClient.mjs';
import {configureOriginalBusiness,businessIdentity,refreshOriginalBusiness,loadOriginalDraft,saveOriginalDraft,clearOriginalIdentity,appStorage} from '../src/originalBusiness.mjs';
const identity={user:{id:'user-synthetic',email:'synthetic@example.invalid'},member:{id:'member-synthetic',display_name:'合成委託者',permissions:['requests.draft'],systems:['request']}};
const row={id:'request-synthetic',legacy_id:'REQ-RACE',owner_member_id:identity.member.id,status:'DRAFT',revision:1,form_details:{},draft_signature_data:'signature-synthetic'};
const snapshot={members:[{id:identity.member.id,display_name:'合成委託者',enabled:true}],requests:[row],trials:[]},storage={getItem:()=>null};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const kind of ['load','save'])test('same-account background refresh does not revoke an in-flight draft '+kind,async()=>{
 configureOriginalBusiness({identity:structuredClone(identity),snapshot,storage});const pending=defer(),original=businessClient.request;
 businessClient.request=async(path)=>path==='/me'?structuredClone(identity):path==='/snapshot'?{data:structuredClone(snapshot)}:pending.promise;
 try{const action=kind==='load'?loadOriginalDraft(row.legacy_id):saveOriginalDraft({id:row.id,existingId:row.legacy_id,form:{productCode:'SYNTHETIC',purpose:['合成'],testItems:[],quantity:'1'},signature:'signature-synthetic'});await refreshOriginalBusiness();pending.resolve({data:kind==='load'?[row]:{...row,revision:2}});const result=await action;assert.equal(result.id,row.legacy_id);assert.equal(businessIdentity().user.id,identity.user.id);assert.equal(result.draftSignature,'signature-synthetic');}finally{businessClient.request=original;clearOriginalIdentity();}
});
for(const kind of ['load','save'])test('logout still discards a late draft '+kind+' response',async()=>{
 configureOriginalBusiness({identity:structuredClone(identity),snapshot,storage});const pending=defer(),original=businessClient.request;businessClient.request=()=>pending.promise;
 try{const action=kind==='load'?loadOriginalDraft(row.legacy_id):saveOriginalDraft({id:row.id,existingId:row.legacy_id,form:{productCode:'SYNTHETIC',purpose:['合成'],testItems:[],quantity:'1'}});clearOriginalIdentity();pending.resolve({data:kind==='load'?[row]:row});await assert.rejects(action,e=>e.code==='SESSION_REVOKED');assert.equal(businessIdentity(),null);assert.deepEqual(JSON.parse(appStorage().getItem('dqa-request-demo-v2')),[]);}finally{businessClient.request=original;}
});
test('a background snapshot started before a saved draft cannot overwrite its acknowledged revision',async()=>{
 configureOriginalBusiness({identity:structuredClone(identity),snapshot,storage});const pending=defer(),original=businessClient.request;let snapshotStarted;const entered=new Promise(resolve=>snapshotStarted=resolve);
 businessClient.request=async(path)=>{if(path==='/me')return structuredClone(identity);if(path==='/snapshot'){snapshotStarted();return pending.promise;}return {data:{...row,revision:2,product_code:'ACKNOWLEDGED'}};};
 try{const background=refreshOriginalBusiness();await entered;await saveOriginalDraft({id:row.id,existingId:row.legacy_id,form:{productCode:'ACKNOWLEDGED',purpose:['合成'],testItems:[],quantity:'1'}});pending.resolve({data:structuredClone(snapshot)});await background;const saved=JSON.parse(appStorage().getItem('dqa-request-demo-v2')).find(r=>r.id===row.legacy_id);assert.equal(saved.sourceRevision,2);assert.equal(saved.productCode,'ACKNOWLEDGED');}finally{businessClient.request=original;clearOriginalIdentity();}
});
