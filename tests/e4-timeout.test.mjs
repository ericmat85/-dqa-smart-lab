import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/preview/[...path].js';

// Offline transport only: these values are synthetic and no network is used.
const env={VERCEL_ENV:'preview',PREVIEW_ORIGIN:'https://preview.test',PREVIEW_GATEWAY_SECRET:'FAKE_TIMEOUT_GATEWAY_TEST_ONLY_123456',PREVIEW_SESSION_SECRET:'FAKE_TIMEOUT_SESSION_TEST_ONLY_123456',RENDER_BACKEND_URL:'https://backend.test',LIVE_PROVIDER_ENABLED:'false',LIVE_AI_ENABLED:'false'};
const input={synthetic:true,question:'SYNTH OFFLINE TIMEOUT TEST'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
async function invoke(handler,path,body,headers={},method=body===undefined?'GET':'POST'){
 const res=response();
 await handler({url:'/api/preview'+path,method,body,headers:{origin:env.PREVIEW_ORIGIN,'content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}},res);
 return res;
}
async function login(handler){
 const res=await invoke(handler,'/session',{system:'lms',accountId:'DEMO-LEVEL1',password:'demo1234'});
 assert.equal(res.code,200);
 assert.match(res.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Strict; Max-Age=1800/);
 return res.headers['Set-Cookie'].split(';')[0];
}
function deadlines(t){
 const controller=new AbortController(),calls=[];
 t.mock.method(AbortSignal,'timeout',ms=>{calls.push(ms);return controller.signal;});
 return {controller,calls};
}
function safeFailure(res,status,code){
 assert.equal(res.code,status);
 assert.equal(res.body.error.code,code);
 assert.match(res.body.trace_id,/^I-[0-9a-f]{32}$/);
 assert.equal(res.headers['X-Trace-ID'],res.body.trace_id);
 assert.equal(res.headers['Cache-Control'],'no-store');
 const serialized=JSON.stringify(res.body);
 for(const value of [env.PREVIEW_GATEWAY_SECRET,env.PREVIEW_SESSION_SECRET,env.RENDER_BACKEND_URL,'PRIVATE_UPSTREAM_CANARY'])assert.ok(!serialized.includes(value));
}

test('E4 uses 45000ms and keeps exact method, Gateway header and signed role',async t=>{
 const clock=deadlines(t);let sent;
 const handler=createHandler({env,entrypointPath:'/ui/live/E4',fetchImpl:async(url,opts)=>{
  sent={url,opts};return {status:503,json:async()=>({trace_id:'I-OFFLINE-UPSTREAM',error:{code:'LIVE_PROVIDER_DISABLED'}})};
 }});
 // An entrypoint-bound handler cannot log in: use the unchanged Session handler.
 const cookie=await login(createHandler({env,fetchImpl:()=>assert.fail('Session must not fetch')}));
 const res=await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms','x-preview-gateway':'FORGED','x-demo-actor':'manager'});
 assert.deepEqual(clock.calls,[45000]);
 assert.equal(sent.url,env.RENDER_BACKEND_URL+'/__integration_demo/ui/live/E4');
 assert.equal(sent.opts.method,'POST');assert.equal(sent.opts.redirect,'error');
 assert.equal(sent.opts.headers['X-Preview-Gateway'],env.PREVIEW_GATEWAY_SECRET);
 assert.equal(sent.opts.headers['X-Demo-Actor'],'level1');
 assert.deepEqual(JSON.parse(sent.opts.body),input);
 assert.equal(res.code,503);assert.equal(res.body.error.code,'LIVE_PROVIDER_DISABLED');
 assert.equal(res.body.trace_id,'I-OFFLINE-UPSTREAM');assert.equal(res.headers['X-Trace-ID'],res.body.trace_id);
});

test('Session remains local with no upstream timer or fetch',async t=>{
 const clock=deadlines(t),handler=createHandler({env,fetchImpl:()=>assert.fail('Session must not fetch')});
 await login(handler);
 assert.equal((await invoke(handler,'/session',{system:'lms',accountId:'INVALID',password:'invalid'})).code,401);
 assert.equal((await invoke(handler,'/session',{}, {origin:'https://invalid.test'})).code,403);
 assert.deepEqual(clock.calls,[]);
});

test('E1 through E3, bootstrap and health keep 10000ms',async t=>{
 const clock=deadlines(t),handler=createHandler({env,fetchImpl:async()=>({status:503,json:async()=>({trace_id:'I-OFFLINE',error:{code:'LIVE_PROVIDER_DISABLED'}})})});
 const cookie=await login(handler);
 for(const engine of ['E1','E2','E3'])await invoke(handler,'/ui/live/'+engine,input,{cookie,'x-preview-system':'lms'});
 await invoke(handler,'/ui/bootstrap');
 await invoke(handler,'/health/live',undefined,{cookie,'x-preview-system':'lms'});
 assert.deepEqual(clock.calls,[10000,10000,10000,10000,10000]);
});

test('E4 deadline aborts a pending fetch and returns safe 504 with Trace',async t=>{
 const clock=deadlines(t);let attempts=0;
 const handler=createHandler({env,fetchImpl:async(url,{signal})=>{
  attempts++;
  return new Promise((resolve,reject)=>{
   signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
   queueMicrotask(()=>clock.controller.abort(new DOMException('PRIVATE_UPSTREAM_CANARY','TimeoutError')));
  });
 }});
 const cookie=await login(handler);
 safeFailure(await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'}),504,'UPSTREAM_TIMEOUT');
 assert.deepEqual(clock.calls,[45000]);assert.equal(attempts,1);
});

test('E4 deadline during response body consumption also returns safe 504',async t=>{
 const clock=deadlines(t),handler=createHandler({env,fetchImpl:async()=>({status:200,json:async()=>{
  clock.controller.abort(new DOMException('PRIVATE_UPSTREAM_CANARY','TimeoutError'));
  throw new DOMException('PRIVATE_UPSTREAM_CANARY','AbortError');
 }})});
 const cookie=await login(handler);
 safeFailure(await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'}),504,'UPSTREAM_TIMEOUT');
});

for(const kind of ['TypeError','AbortError','TimeoutError']){
 test('E4 '+kind+' without its own expired deadline is not an upstream timeout',async t=>{
  deadlines(t);
  const handler=createHandler({env,fetchImpl:async()=>{const error=new Error('PRIVATE_UPSTREAM_CANARY '+env.RENDER_BACKEND_URL+' '+env.PREVIEW_GATEWAY_SECRET);error.name=kind;throw error;}});
  const cookie=await login(handler);
  safeFailure(await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'}),503,'UPSTREAM_CONNECTION_FAILED');
 });
}

test('E4 invalid JSON response is classified safely, not as a timeout',async t=>{
 deadlines(t);
 const handler=createHandler({env,fetchImpl:async()=>({status:502,json:async()=>{throw new SyntaxError('PRIVATE_UPSTREAM_CANARY '+env.RENDER_BACKEND_URL);}})});
 const cookie=await login(handler);
 safeFailure(await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'}),503,'UPSTREAM_RESPONSE_INVALID');
});

test('an unrelated parsing error coinciding with deadline expiry is not mislabeled',async t=>{
 const clock=deadlines(t),handler=createHandler({env,fetchImpl:async()=>({status:200,json:async()=>{
  clock.controller.abort(new DOMException('PRIVATE_UPSTREAM_CANARY','TimeoutError'));
  throw new SyntaxError('PRIVATE_UPSTREAM_CANARY');
 }})});
 const cookie=await login(handler);
 safeFailure(await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'}),503,'UPSTREAM_RESPONSE_INVALID');
});

test('E4 preserves upstream authentication, RBAC, DTO and Provider Disabled JSON',async t=>{
 deadlines(t);
 for(const [status,code] of [[401,'AUTHENTICATION_REQUIRED'],[403,'AUTHORIZATION_DENIED'],[422,'INVALID_SYNTHETIC_PAYLOAD'],[503,'LIVE_PROVIDER_DISABLED']]){
  const packet={trace_id:'I-OFFLINE-'+status,error:{code}};
  const handler=createHandler({env,fetchImpl:async()=>({status,json:async()=>packet})});
  const cookie=await login(handler),res=await invoke(handler,'/ui/live/E4',input,{cookie,'x-preview-system':'lms'});
  assert.equal(res.code,status);assert.deepEqual(res.body,packet);assert.equal(res.headers['X-Trace-ID'],packet.trace_id);
 }
});

test('non-E4 deadline errors retain existing 503 handling',async t=>{
 const clock=deadlines(t),handler=createHandler({env,fetchImpl:async()=>{
  clock.controller.abort(new DOMException('PRIVATE_UPSTREAM_CANARY','TimeoutError'));throw clock.controller.signal.reason;
 }});
 const cookie=await login(handler);
 safeFailure(await invoke(handler,'/ui/live/E1',input,{cookie,'x-preview-system':'lms'}),503,'PREVIEW_SERVICE_UNAVAILABLE');
 assert.deepEqual(clock.calls,[10000]);
});
