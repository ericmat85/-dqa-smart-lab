import test from 'node:test';
import assert from 'node:assert/strict';
import {saveCustomRole,readCustomRoles,canAccessLmsPage,ROLE_KEY} from '../src/customRoles.mjs';
import {accessSystem,canManageAccounts,canReview} from '../src/demoPermissions.mjs';
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('custom roles persist, retain IDs on edit and reject duplicate built-in names',()=>{
 const store=storage();const rows=saveCustomRole([],{name:'排程專員',level:0,pages:['schedule'],manageAccounts:false},store);
 assert.deepEqual(readCustomRoles(store),rows);assert.ok(rows[0].pages.includes('dashboard'));
 const changed=saveCustomRole(rows,{...rows[0],pages:['reports']},store);assert.equal(changed.length,1);assert.equal(changed[0].id,rows[0].id);
 assert.throws(()=>saveCustomRole(rows,{name:'系統管理員',level:0,pages:[]},store));
 assert.throws(()=>saveCustomRole(rows,{name:'排程專員',level:0,pages:[]},store));
 assert.throws(()=>saveCustomRole(rows,{name:'審查人員',level:1,pages:[]},store));
});
test('custom role permissions control LMS access, page access, account management and exact review stage',()=>{
 const store=storage();saveCustomRole([],{name:'審查專員',level:1,pages:['requests','reports'],manageAccounts:false},store);
 const before=globalThis.window,oldStorage=globalThis.localStorage;globalThis.window={localStorage:store};globalThis.localStorage=store;
 try{const actor={id:'CUSTOM',role:'審查專員',status:'啟用中'};
 assert.equal(accessSystem(actor,'lms'),true);assert.equal(accessSystem(actor,'request'),false);
 assert.equal(canAccessLmsPage(actor,'reports'),true);assert.equal(canAccessLmsPage(actor,'equipment'),false);assert.equal(canManageAccounts(actor),false);
 assert.equal(canReview(actor,{status:'待審查',approval:0}),true);assert.equal(canReview(actor,{status:'待審查',approval:1}),false);
 assert.equal(canReview(actor,{status:'待審查',approval:0,participantIds:['CUSTOM']}),false);
 assert.equal(accessSystem({...actor,status:'停用'},'lms'),false);
 const rows=readCustomRoles(store);saveCustomRole(rows,{...rows[0],manageAccounts:true},store);assert.equal(canManageAccounts(actor),true);
 store.setItem(ROLE_KEY,'[]');assert.equal(accessSystem(actor,'lms'),false);
 }finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;if(before===undefined)delete globalThis.window;else globalThis.window=before;}
});
test('storage failures do not claim a role was saved',()=>{assert.throws(()=>saveCustomRole([],{name:'測試',level:0,pages:[]},{setItem(){throw Error('quota');}}),/quota/);});
