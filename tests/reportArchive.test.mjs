import test from 'node:test';
import assert from 'node:assert/strict';
import {canOpenReportArchive,canReadArchivedReport,readArchivedPdf} from '../src/reportArchive.mjs';
import {ROLE} from '../src/demoPermissions.mjs';
const account=(id,role)=>({id,role,status:'啟用中'});
const request={id:'CASE',status:'已結案',ownerId:'OWNER',supervisorId:'SUP',signatureRecords:[{actorId:'TECH',decision:'核准'}]};
const report={requestId:'CASE',stage:'archived',submitterId:'LAB',approvals:[{actorId:'L2',level:2}],confirmedAt:'2026-10-30',archivedAt:'2026-10-30',pdfName:'CASE.pdf',pdf:new Uint8Array([1,2,3]).buffer};
const storage=accounts=>{const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(accounts)],['dqa-request-demo-v2',JSON.stringify([request])]]);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
test('archive entry and case visibility use system permission and case participation',()=>{
 for(const [id,role,system]of [['OWNER',ROLE.REQUESTER,'request'],['SUP',ROLE.REQUEST_MANAGER,'request'],['LAB',ROLE.LAB,'lab'],['L2',ROLE.LEVEL2,'lms'],['TECH',ROLE.LEVEL1,'lms'],['ADMIN',ROLE.ADMIN,'lms']])assert.equal(canReadArchivedReport(account(id,role),report,request,system),true);
 assert.equal(canReadArchivedReport(account('OTHER',ROLE.REQUESTER),report,request,'request'),false);
 assert.equal(canReadArchivedReport(account('OTHER',ROLE.LAB),report,request,'lab'),false);
 assert.equal(canOpenReportArchive(account('X',ROLE.VIEWER),'lms'),false);
 assert.equal(canOpenReportArchive({...account('X',ROLE.LAB),status:'停用'},'lab'),false);
 assert.equal(canOpenReportArchive(account('LAB',ROLE.LAB),'request'),false);
});
test('pending, viewed-but-not-confirmed and incomplete archives never expose a PDF',async()=>{
 const actor=account('OWNER',ROLE.REQUESTER),db=storage([actor]);
 for(const candidate of [{...report,stage:'view'},{...report,confirmedAt:null},{...report,archivedAt:null},{...report,pdfName:null}]){
  assert.equal(canReadArchivedReport(actor,candidate,request,'request'),false);
  await assert.rejects(readArchivedPdf({actorId:actor.id,requestId:'CASE',system:'request'},db,{get:async()=>candidate}),/尚未完成/);
 }
 await assert.rejects(readArchivedPdf({actorId:actor.id,requestId:'CASE',system:'request'},db,{get:async()=>({...report,pdf:null})}),/不存在/);
});
test('downloads reread current account and request permissions after asynchronous file access',async()=>{
 const actor=account('OWNER',ROLE.REQUESTER),db=storage([actor]);
 assert.equal((await readArchivedPdf({actorId:'OWNER',requestId:'CASE',system:'request'},db,{get:async()=>report})).name,'CASE.pdf');
 await assert.rejects(readArchivedPdf({actorId:'OWNER',requestId:'CASE',system:'request'},db,{get:async()=>{db.setItem('dqa-shared-demo-accounts-v1',JSON.stringify([{...actor,status:'停用'}]));return report;}}),/沒有查閱權限/);
});
test('custom roles require explicit archive permission and still cannot read unrelated cases',()=>{
 const actor=account('L2','CUSTOM'),db=storage([actor]);
 db.setItem('dqa-custom-roles-v1',JSON.stringify([{id:'CUSTOM',name:'CUSTOM',level:2,pages:['dashboard','requests']}]));
 assert.equal(canOpenReportArchive(actor,'lms',db),false);
 db.setItem('dqa-custom-roles-v1',JSON.stringify([{id:'CUSTOM',name:'CUSTOM',level:2,pages:['dashboard','requests','archive']}]));
 assert.equal(canReadArchivedReport(actor,report,request,'lms',db),true);
 assert.equal(canReadArchivedReport({...actor,id:'OTHER'},report,request,'lms',db),false);
});
