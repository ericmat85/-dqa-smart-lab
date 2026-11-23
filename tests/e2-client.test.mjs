import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {e2Fixture,e2Packet} from './e2-fixture.mjs';
import {readE2Activity,clearE2Activity,beginE2Activity} from '../src/e2Activity.mjs';
import {E2_DEFAULTS} from '../src/e2PlanningSettings.mjs';
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const previewURL=new URL('../src/previewAssistant.mjs',import.meta.url);
let preview=await fs.readFile(previewURL,'utf8');preview=preview.replaceAll('import.meta.env?.VITE_PRIVATE_PREVIEW',"'1'").replaceAll('import.meta.env?.VITE_SANDBOX_API_BASE',"'/api/preview'").replace(/from '(\.\/[^']+)'/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,previewURL).href));
const clientURL=new URL('../src/e2PreviewClient.mjs',import.meta.url);
let client=await fs.readFile(clientURL,'utf8');client=client.replace("from './previewAssistant.mjs'",'from '+JSON.stringify(moduleURL(preview))).replace("from './e2Scheduling.mjs'",'from '+JSON.stringify(new URL('../src/e2Scheduling.mjs',import.meta.url).href));
client=client.replace(/from '(\.\/[^']+)'/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,clientURL).href));
const {askE2Scheduling}=await import(moduleURL(client));
const storage={getItem:key=>key==='dqa-lms-account-id'?'DEMO-LEVEL1':null};
beforeEach(()=>clearE2Activity());
const reply=(status,body)=>({ok:status<400,status,headers:new Headers({'Content-Type':'application/json'}),json:async()=>body});
test('E2 client sends the current structured context through one signed Session path and one E2 route',async()=>{
 const f=e2Fixture(),packet=await e2Packet(f.context),sent=[],stages=[];
 const fetchImpl=async(url,opts)=>{sent.push({url,opts});return reply(200,url.endsWith('/session')?{authenticated:true}:packet);};
 const result=await askE2Scheduling(f.context,{fetchImpl,storage,onStage:x=>stages.push(x),idempotencyKey:'e2-local-unique-operation'});
 assert.equal(result.execution_mode,'RULE_BASED_ONLY');assert.equal(result.real_ai,false);assert.deepEqual(sent.map(x=>x.url),['/api/preview/session','/api/preview/ui/live/E2']);assert.deepEqual(stages,[0,1,2]);
 const req=sent[1];assert.equal(req.opts.credentials,'same-origin');assert.equal(req.opts.headers['X-Preview-System'],'lms');assert.equal(req.opts.headers['X-Preview-Idempotency-Key'],'e2-local-unique-operation');assert.deepEqual(JSON.parse(req.opts.body).schedule_context,f.context);assert.ok(!('X-Demo-Actor' in req.opts.headers));assert.ok(!('X-Preview-Gateway' in req.opts.headers));
});
test('E2 refuses missing login and preserves application 401 403 422 503 with Trace, without retry',async()=>{
 const f=e2Fixture();let calls=0;
 await assert.rejects(()=>askE2Scheduling(f.context,{storage:{getItem:()=>null},fetchImpl:()=>{calls++;}}),/SESSION_REQUIRED/);assert.equal(calls,0);
 for(const status of [401,403,422,503]){
  const sent=[];const fetchImpl=async(url)=>{sent.push(url);return url.endsWith('/session')?reply(200,{authenticated:true}):reply(status,{trace_id:'I-E2-FAILURE',error:{code:'SAFE_E2_TEST_ERROR'}});};
  await assert.rejects(()=>askE2Scheduling(f.context,{fetchImpl,storage}),error=>error.httpStatus===status&&error.trace==='I-E2-FAILURE');assert.equal(sent.length,2);
 }
});
test('E2 rejects non-JSON responses and aborted operations without producing fallback advice',async()=>{
 const f=e2Fixture();let count=0;
 await assert.rejects(()=>askE2Scheduling(f.context,{storage,fetchImpl:async url=>{count++;return url.endsWith('/session')?reply(200,{}):{status:503,ok:false,json:async()=>{throw Error('NOT_JSON');}};}}),/NON_JSON_RESPONSE/);assert.equal(count,2);
 const controller=new AbortController();controller.abort();count=0;
 await assert.rejects(()=>askE2Scheduling(f.context,{storage,signal:controller.signal,fetchImpl:async()=>{count++;return reply(200,{});}}));assert.equal(count,1);
});

test('paused preferences stop before session/network calls and record the block',async()=>{
 const f=e2Fixture();let calls=0;const preferenceStorage={getItem:()=>JSON.stringify({version:1,revision:1,settings:{...E2_DEFAULTS,enabled:false},events:[]})};
 await assert.rejects(()=>askE2Scheduling(f.context,{storage,preferenceStorage,fetchImpl:()=>{calls++;}}),e=>e.code==='E2_CLIENT_PAUSED');assert.equal(calls,0);assert.equal(readE2Activity('DEMO-LEVEL1')[0].errorCode,'E2_CLIENT_PAUSED');
});
test('monitor pending precedes the session response and logout clears late completion',async()=>{
 const f=e2Fixture(),packet=await e2Packet(f.context);let resolve;const gate=new Promise(r=>resolve=r);
 const pending=askE2Scheduling(f.context,{storage,fetchImpl:async url=>url.endsWith('/session')?(await gate,reply(200,{})):reply(200,packet)});
 assert.equal(readE2Activity('DEMO-LEVEL1')[0].phase,'SESSION');clearE2Activity();resolve();await pending;assert.deepEqual(readE2Activity('DEMO-LEVEL1'),[]);
});
test('a mismatched observation account refuses dispatch and preserves account isolation',async()=>{
 const f=e2Fixture();let calls=0;const ticket=beginE2Activity('DEMO-LEVEL2');
 await assert.rejects(()=>askE2Scheduling(f.context,{storage,activityTicket:ticket,fetchImpl:()=>{calls++;}}),e=>e.code==='SESSION_CONTEXT_CHANGED');assert.equal(calls,0);assert.deepEqual(readE2Activity('DEMO-LEVEL1'),[]);
});
test('HTTP errors preserve trace in E2 monitoring and never invent usage or retry',async()=>{
 const f=e2Fixture();for(const status of [401,403,422,429,503,504]){
  let calls=0;await assert.rejects(()=>askE2Scheduling(f.context,{storage,fetchImpl:async url=>{calls++;return reply(url.endsWith('/session')?200:status,url.endsWith('/session')?{}:{trace_id:'I-MONITOR-ERROR',error:{code:'SAFE_ERROR'}});}}));
  const row=readE2Activity('DEMO-LEVEL1')[0];assert.equal(row.httpStatus,status);assert.equal(row.traceId,'I-MONITOR-ERROR');assert.equal(row.costUsd,null);assert.equal(row.inputTokens,null);assert.equal(calls,2);
 }
});

test('Session failures remain separate from upstream failures and keep their application Trace',async()=>{
 const f=e2Fixture();let calls=0;
 await assert.rejects(()=>askE2Scheduling(f.context,{storage,fetchImpl:async()=>{calls++;return reply(403,{scope:'SANDBOX_ONLY',trace_id:'I-SESSION-ORIGIN-TEST',error:{code:'ORIGIN_DENIED'}});}}),/ORIGIN_DENIED/);
 const row=readE2Activity('DEMO-LEVEL1')[0];assert.equal(calls,1);assert.equal(row.failurePhase,'SESSION');assert.equal(row.httpStatus,403);assert.equal(row.traceId,'I-SESSION-ORIGIN-TEST');assert.equal(row.costUsd,null);
});
