import test from 'node:test';
import assert from 'node:assert/strict';
import {labRequestOverdue} from '../src/labRequestFilters.mjs';
import {readBuiltinRoles,saveBuiltinRole,readCustomRoles,customRole} from '../src/customRoles.mjs';
import {accessSystem,canManageAccounts} from '../src/demoPermissions.mjs';
import {deleteDemoAccount} from '../src/accountManagement.mjs';
const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};};
test('lab overdue uses Taipei date and excludes finished or invalid dates',()=>{
 const now=new Date('2026-11-03T01:00:00Z');assert.equal(labRequestOverdue({id:'R',status:'試驗中',scheduledEnd:'2026-11-02'},[],now),true);assert.equal(labRequestOverdue({id:'R',status:'試驗中',scheduledEnd:'2026-11-03'},[],now),false);
 for(const status of ['已完成','已結案','取消'])assert.equal(labRequestOverdue({id:'R',status,scheduledEnd:'2026-11-01'},[],now),false);
 for(const date of ['','bad','2026-02-30','2026-11-01bad'])assert.equal(labRequestOverdue({id:'R',status:'待確認',scheduledEnd:date},[],now),false);
 assert.equal(labRequestOverdue({id:'R',status:'已排程',scheduledEnd:'2026-11-01'},[{requestId:'R',end:'2026-11-10'}],now),false);
});
test('builtin permissions persist independently and retain system boundaries by default',()=>{
 const store=memory(),role=readBuiltinRoles(store).find(r=>r.name==='實驗室工程師'),actor={id:'E',role:role.name,status:'啟用中'};saveBuiltinRole({...role,pages:['dashboard','equipment']},store);assert.equal(accessSystem(actor,'lab',store),true);assert.equal(accessSystem(actor,'lms',store),false);assert.equal(customRole(actor,store).pages.includes('maintenance'),false);assert.deepEqual(readCustomRoles(store),[]);
 const admin=readBuiltinRoles(store).find(r=>r.name==='系統管理員');saveBuiltinRole({...admin,manageAccounts:false},store);assert.equal(canManageAccounts({id:'A',role:admin.name,status:'啟用中'},store),false);
});
test('account deletion is authorized, protects active identity and supervisor references',()=>{
 const store=memory(),accounts=[{id:'A',role:'系統管理員',status:'啟用中'},{id:'E',role:'實驗室工程師',status:'啟用中'}];assert.deepEqual(deleteDemoAccount(accounts,'E','A',store),[accounts[0]]);assert.equal(accounts.length,2);assert.throws(()=>deleteDemoAccount(accounts,'A','A',store),/目前登入/);assert.throws(()=>deleteDemoAccount(accounts,'A','E',store),/權限/);assert.throws(()=>deleteDemoAccount([...accounts,{id:'R',supervisorId:'E'}],'E','A',store),/主管關係/);
});

test('editing builtin review level keeps stage and self-signature restrictions',async()=>{
 const {canReview}=await import('../src/demoPermissions.mjs');const store=memory(),viewer=readBuiltinRoles(store).find(role=>role.name==='檢視者'),actor={id:'V',role:'檢視者',status:'啟用中'};
 saveBuiltinRole({...viewer,systems:['lms'],pages:['dashboard','requests'],level:1},store);const request={status:'待審查',approval:0,participantIds:[]};assert.equal(canReview(actor,request,store),true);assert.equal(canReview(actor,{...request,participantIds:['V']},store),false);assert.equal(canReview(actor,{...request,approval:1},store),false);
});

test('Lab assistant counts its worklist and explains read-only equipment',async()=>{
 const {assistantReply}=await import('../src/assistantDemo.mjs');const snapshot={equipment:[],labWorkItems:[{status:'待確認'},{status:'試驗中'}]},metrics={counts:{'試驗中':99},lowStock:[]};assert.match(assistantReply('目前有多少試驗正在進行？',snapshot,metrics,'lab'),/1 筆/);assert.match(assistantReply('試驗中設備故障要怎麼處理？',snapshot,metrics,'lab'),/僅供查閱/);
});
