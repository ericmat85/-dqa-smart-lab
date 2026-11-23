import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE, canReview, accessSystem } from '../src/demoPermissions.mjs';
import { readStoredRequests, writeStoredRequests, mergeImportedRequests } from '../src/requestStorage.mjs';
import { readDemoAccounts } from '../src/demoAccounts.mjs';

const account = role => ({ id: 'reviewer', role, status: '啟用中' });
test('review stages require the matching role and prohibit repeated/self review', () => {
  assert.equal(canReview(account(ROLE.LEVEL1), { status: '待審查', approval: 0 }), true);
  assert.equal(canReview(account(ROLE.LEVEL2), { status: '待審查', approval: 0 }), false);
  assert.equal(canReview(account(ROLE.LEVEL1), { status: '待審查', approval: 1 }), false);
  assert.equal(canReview(account(ROLE.LEVEL2), { status: '待審查', approval: 1 }), true);
  for (const extra of [{participantIds:['reviewer']}, {approvals:[{actorId:'reviewer'}]}, {status:'完成'}]) {
    assert.equal(canReview(account(ROLE.LEVEL1), {status:'待審查', approval:0, ...extra}), false);
  }
});
test('review records and signatures survive storage round trips', () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key,value) => entries.set(key,value) };
  const requests = [{id:'case1',status:'完成',history:['approved'],signatureRecords:[{signature:'data:image/png;base64,example'}]}];
  assert.equal(writeStoredRequests(requests,storage),true);
  assert.deepEqual(readStoredRequests([],storage),requests);
  assert.equal(writeStoredRequests(requests,{setItem(){throw Error('quota');}}),false);
  assert.deepEqual(readStoredRequests(requests,{getItem(){return '[null]';}}),requests);
});
test('refreshing imported requests preserves local approvals', () => {
  const local={id:'local',status:'完成',history:['approved']};
  assert.deepEqual(mergeImportedRequests([local,{id:'old',source:'electronic-request'}],[{id:'new',source:'electronic-request'}]),[{id:'new',source:'electronic-request'},local]);
});
test('fresh entry points have demo accounts and preserve existing accounts', () => {
  const previousWindow=globalThis.window,previousStorage=globalThis.localStorage;
  globalThis.window={localStorage:{getItem:()=>null}};globalThis.localStorage=window.localStorage;
  try {
  const defaults=readDemoAccounts();
  assert.ok(defaults.some(a=>a.email==='requester@example.com'));
  assert.ok(defaults.some(a=>a.email==='chen@example.com'));
  assert.equal(accessSystem(defaults.find(a=>a.email==='requester@example.com'),'request'),true);
  assert.equal(accessSystem(defaults.find(a=>a.email==='chen@example.com'),'lab'),true);
  assert.equal(accessSystem(defaults.find(a=>a.email==='level1@example.com'),'lms'),true);
  const existing=[{id:'custom',name:'Existing'}];
  window.localStorage.getItem=()=>JSON.stringify(existing);
  assert.deepEqual(readDemoAccounts(),existing);
  window.localStorage.getItem=()=> '[]';
  assert.deepEqual(readDemoAccounts(),[]);
  } finally {if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}
});
