import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../api/preview/[...path].js';
import {resolvePreviewRoute} from '../server/previewRouting.mjs';
const env={VERCEL_ENV:'preview',PREVIEW_ORIGIN:'https://preview.test',PREVIEW_GATEWAY_SECRET:'FAKE_E2_GATEWAY_TEST_ONLY_1234567890',PREVIEW_SESSION_SECRET:'FAKE_E2_SESSION_TEST_ONLY_1234567890',RENDER_BACKEND_URL:'https://backend.test',LIVE_PROVIDER_ENABLED:'false',LIVE_AI_ENABLED:'false',E4_PREVIEW_PROVIDER_MODE:'CONTROLLED_LIVE'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(p){this.body=p;return this;}};}
async function call(handler,path,body,headers={},method='POST'){
 const res=response();await handler({url:'/api/preview'+path,method,body,headers:{origin:env.PREVIEW_ORIGIN,'content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}},res);return res;
}
async function cookie(){const r=await call(createHandler({env} ),'/session',{system:'lms',accountId:'DEMO-LEVEL1',password:'demo1234'});assert.equal(r.code,200);return r.headers['Set-Cookie'].split(';')[0];}
test('E2 explicit entry safely ignores non-route query metadata and refuses polluted route hints',()=>{
 const good=resolvePreviewRoute({url:'/api/preview/ui/live/E2?platform_metadata=opaque',query:{platform_metadata:'opaque'}},{origin:env.PREVIEW_ORIGIN,entrypointPath:'/ui/live/E2'});assert.equal(good.path,'/ui/live/E2');
 for(const url of ['/api/preview/ui/live/E2?path=ui/live/E4','/api/preview/ui/live/E2?path=x&path=y','/api/preview/ui/live/%45%32','/api/preview/ui/live/E2?path[0]=ui'])assert.equal(resolvePreviewRoute({url},{origin:env.PREVIEW_ORIGIN,entrypointPath:'/ui/live/E2'}).path,null);
});
test('E2 uses its exact private upstream with 45s timeout, server role and signed capability',async t=>{
 const timers=[];t.mock.method(AbortSignal,'timeout',ms=>{timers.push(ms);return new AbortController().signal;});let sent;
 const h=createHandler({env,entrypointPath:'/ui/live/E2',fetchImpl:async(url,opts)=>{sent={url,opts};return {status:200,json:async()=>({trace_id:'I-MOCK-E2',data:{engine:'E2'}})};}});
 const c=await cookie(),r=await call(h,'/ui/live/E2',{synthetic:true},{cookie:c,'x-preview-system':'lms','x-demo-actor':'admin','x-preview-gateway':'FORGED','x-preview-idempotency-key':'e2-local-unique-operation'});
 assert.equal(r.code,200);assert.equal(sent.url,env.RENDER_BACKEND_URL+'/__integration_live/ui/live/E2');assert.equal(sent.opts.redirect,'error');assert.equal(sent.opts.headers['X-Demo-Actor'],'level1');assert.equal(sent.opts.headers['X-Preview-Gateway'],env.PREVIEW_GATEWAY_SECRET);assert.match(sent.opts.headers['X-Preview-Session'],/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);assert.match(sent.opts.headers['X-Preview-Operation-ID'],/^O-[a-f0-9]{64}$/);assert.deepEqual(timers,[45000]);assert.equal(r.headers['X-Trace-ID'],'I-MOCK-E2');
 for(const secret of [env.PREVIEW_GATEWAY_SECRET,env.PREVIEW_SESSION_SECRET,sent.opts.headers['X-Preview-Session']])assert.ok(!JSON.stringify(r.body).includes(secret));
});
test('E2 GET, missing login and foreign Origin never forward a request',async()=>{
 let calls=0;const h=createHandler({env,entrypointPath:'/ui/live/E2',fetchImpl:()=>{calls++;throw Error('MUST_NOT_FORWARD');}});
 assert.equal((await call(h,'/ui/live/E2',undefined,{},'GET')).code,405);assert.equal((await call(h,'/ui/live/E2',{}, {'x-preview-system':'lms'})).code,401);assert.equal((await call(h,'/ui/live/E2',{}, {origin:'https://evil.invalid'})).code,403);assert.equal(calls,0);
});
test('E2 upstream timeout and non-timeout failures remain distinguishable with safe Trace',async t=>{
 const c=await cookie();let controller;
 t.mock.method(AbortSignal,'timeout',()=>{controller=new AbortController();return controller.signal;});
 const timeout=createHandler({env,entrypointPath:'/ui/live/E2',fetchImpl:async()=>{controller.abort(new DOMException('PRIVATE_TEST_ONLY','TimeoutError'));throw controller.signal.reason;}});
 const a=await call(timeout,'/ui/live/E2',{}, {cookie:c,'x-preview-system':'lms'});assert.equal(a.code,504);assert.equal(a.body.error.code,'UPSTREAM_TIMEOUT');assert.equal(a.body.trace_id,a.headers['X-Trace-ID']);
 const invalid=createHandler({env,entrypointPath:'/ui/live/E2',fetchImpl:async()=>({status:200,json:async()=>{throw Error(env.PREVIEW_GATEWAY_SECRET);}})});
 const b=await call(invalid,'/ui/live/E2',{}, {cookie:c,'x-preview-system':'lms'});assert.equal(b.code,503);assert.equal(b.body.error.code,'UPSTREAM_RESPONSE_INVALID');assert.ok(!JSON.stringify(b.body).includes(env.PREVIEW_GATEWAY_SECRET));
});
