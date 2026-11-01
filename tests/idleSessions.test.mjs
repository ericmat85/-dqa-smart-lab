import test from 'node:test';
import assert from 'node:assert/strict';
import {IDLE_TIMEOUT_MS,SESSION_KEYS,startSession,endSession,expireIdleSessions,recordSessionActivity,pendingSessionNotices,dismissSessionNotices} from '../src/idleSessions.mjs';
function store(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
test('each system expires after 30 minutes and trusted activity keeps only the active session alive',()=>{
 const storage=store();startSession('lms','A',storage,100);startSession('request','B',storage,100);startSession('lab','C',storage,100);
 assert.deepEqual(expireIdleSessions(storage,100+IDLE_TIMEOUT_MS-1),[]);recordSessionActivity(['request'],storage,100+IDLE_TIMEOUT_MS-1);
 assert.deepEqual(expireIdleSessions(storage,100+IDLE_TIMEOUT_MS),['lms','lab']);assert.equal(storage.getItem(SESSION_KEYS.request),'B');
 assert.deepEqual(expireIdleSessions(storage,100+2*IDLE_TIMEOUT_MS-1),['request']);assert.deepEqual(pendingSessionNotices(storage),['lms','request','lab']);
});
test('navigation and remount do not refresh an existing deadline; legacy sessions initialize once',()=>{
 const storage=store();storage.setItem(SESSION_KEYS.lms,'A');assert.deepEqual(expireIdleSessions(storage,100),[]);assert.deepEqual(expireIdleSessions(storage,500),[]);assert.deepEqual(expireIdleSessions(storage,100+IDLE_TIMEOUT_MS),['lms']);
});
test('expiration clears authentication but preserves remembered accounts; login and acknowledgement clear notices',()=>{
 const storage=store();storage.setItem('dqa-remembered-login-v1:request-requester','a@example.com');startSession('request','A',storage,100);storage.setItem('dqa-request-role','requester');storage.setItem('dqa-request-user','A');
 expireIdleSessions(storage,100+IDLE_TIMEOUT_MS);assert.equal(storage.getItem('dqa-request-role'),null);assert.equal(storage.getItem('dqa-request-user'),null);assert.equal(storage.getItem('dqa-remembered-login-v1:request-requester'),'a@example.com');
 dismissSessionNotices(['request'],storage);assert.equal(storage.getItem(SESSION_KEYS.request),null);assert.deepEqual(pendingSessionNotices(storage),[]);startSession('request','A',storage,200+IDLE_TIMEOUT_MS);assert.deepEqual(pendingSessionNotices(storage),[]);endSession('request',storage);assert.equal(storage.getItem(SESSION_KEYS.request),null);
});
test('invalid stored timestamps expire instead of silently renewing authentication',()=>{
 const storage=store();startSession('lab','A',storage,100);storage.setItem('dqa-session-activity-v1:lab','invalid');assert.deepEqual(expireIdleSessions(storage,200),['lab']);
});


test('failed session writes do not leave partial authentication behind',()=>{
 const storage=store(),original=storage.setItem;let fail=true;storage.setItem=(key,value)=>{if(key===SESSION_KEYS.lms&&fail){fail=false;throw Error('quota');}original(key,value);};
 assert.throws(()=>startSession('lms','A',storage,100),/quota/);assert.equal(storage.getItem(SESSION_KEYS.lms),null);assert.equal(storage.getItem('dqa-session-activity-v1:lms'),null);
});
