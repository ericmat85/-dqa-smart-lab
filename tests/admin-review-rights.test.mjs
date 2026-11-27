import test from 'node:test';
import assert from 'node:assert/strict';
import {canReview,canApproveRequestManager,accessSystem} from '../src/demoPermissions.mjs';
import {canReviewReport,canConfirmReport} from '../src/reportRules.mjs';
import {configureOriginalBusiness,originalBusinessAccount,clearOriginalIdentity} from '../src/originalBusiness.mjs';
const admin={id:'admin',status:'啟用中',businessIdentity:true,businessAdmin:true,businessReviewLevel:0,businessPermissions:[]};
const source={ownerId:'admin',supervisorId:'manager',status:'待審查',participantIds:['admin'],approval:0,signatureRecords:[{actorId:'admin',stage:1,decision:'核准'}]};
test('workspace admin can review each current level using the same identity',()=>{
 for(const approval of [0,1])assert.equal(canReview(admin,{...source,approval}),true);
 for(const status of ['草稿','待主管簽核','已完成','取消'])assert.equal(canReview(admin,{...source,status}),false);
 assert.equal(canReview(admin,{...source,approval:2}),false);
 assert.equal(canReview(admin,{...source,readOnly:true}),false);
 assert.equal(canApproveRequestManager(admin,source),true);
 for(const stage of ['level2','level3'])assert.equal(canReviewReport(admin,{businessDatabase:true,stage,submitterId:'admin',approvals:[{actorId:'admin',level:2}]},source),true);
 assert.equal(canReviewReport(admin,{businessDatabase:true,stage:'view'},source),false);
 assert.equal(canConfirmReport(admin,{businessDatabase:true,stage:'view'},{...source,status:'待查閱'}),true);
 assert.equal(canConfirmReport(admin,{stage:'view'},{...source,status:'已結案'}),false);
});
test('ordinary and custom roles retain assigned manager, exact level, and separation rules',()=>{
 const normal={...admin,role:'一階主管',businessAdmin:false,businessReviewLevel:1,businessPermissions:['requests.review_lms','requests.review_manager','reports.review','reports.confirm']};
 assert.equal(canApproveRequestManager(normal,source),false);
 assert.equal(canReview(normal,source),false);
 assert.equal(canReviewReport({...normal,businessReviewLevel:2},{businessDatabase:true,stage:'level2',submitterId:'admin'},source),false);
 assert.equal(canConfirmReport(normal,{stage:'view'},source),false);
 const request={status:'待審查',approval:0,ownerId:'owner',supervisorId:'manager',participantIds:[]};
 assert.equal(canReview(normal,request),true);
 assert.equal(canReview(normal,{...request,approval:1}),false);
 assert.equal(canApproveRequestManager({...normal,id:'manager'},request),true);
 assert.equal(canApproveRequestManager({...normal,id:'owner'},{...request,supervisorId:'owner'}),false);
 assert.equal(canReview({...normal,role:'系統管理員',businessReviewLevel:0},request),false);
});
test('disabled, unverified demo, or missing identities do not receive workspace admin rights',()=>{
 for(const actor of [{...admin,status:'已停用'},{...admin,businessIdentity:false},{...admin,id:''}]){
  assert.equal(canReview(actor,source),false);
  assert.equal(canReviewReport(actor,{businessDatabase:true,stage:'level2'},source),false);
  assert.equal(canApproveRequestManager(actor,source),false);
 }
});
test('request login projects combined manager rights without changing the real actor or supervisor membership',()=>{
 const storage={getItem:()=>null};
 configureOriginalBusiness({identity:{user:{id:'auth-admin',email:'admin@example.invalid'},member:{id:'admin',display_name:'管理者',is_admin:true,permissions:[],systems:['lms'],review_level:0}},snapshot:{members:[{id:'admin',supervisor_member_id:null}]},storage});
 const account=originalBusinessAccount('request');
 assert.equal(account.id,'admin');assert.equal(account.role,'委託者主管');assert.equal(account.supervisorId,'admin');
 for(const system of ['request','lms'])assert.equal(accessSystem(account,system),true);
 clearOriginalIdentity();
});
