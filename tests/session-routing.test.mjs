import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolvePreviewRoute} from '../server/previewRouting.mjs';
import {createHandler} from '../api/preview/[...path].js';
const origin='https://preview.test';
const env={VERCEL_ENV:'preview',VERCEL_URL:'preview.test',PREVIEW_GATEWAY_SECRET:'FAKE_GATEWAY_ROUTE_TEST_ONLY_20261111',PREVIEW_SESSION_SECRET:'FAKE_SESSION_ROUTE_TEST_ONLY_20261111',RENDER_BACKEND_URL:'https://backend.test',LIVE_PROVIDER_ENABLED:'false',LIVE_AI_ENABLED:'false'};
async function invoke(url,{method='GET',query,params,body={system:'lms',accountId:'DEMO-LEVEL1',password:'demo1234'},entrypointPath,requestOrigin=origin}={}){
 const headers={};let status,packet;const requests=[];
 const handler=createHandler({env,entrypointPath,fetchImpl:async(u,o)=>{requests.push({url:u,opts:o});return {status:503,json:async()=>({scope:'SYNTHETIC_PREVIEW_ADVICE_ONLY',trace_id:'I-upstream-route',error:{code:'LIVE_PROVIDER_DISABLED'}})}}});
 const res={setHeader(k,v){headers[k]=v;return this},status(v){status=v;return this},json(v){packet=v;return this}};
 await handler({url,method,query,params,body,headers:{origin:requestOrigin,'content-type':'application/json'},socket:{remoteAddress:'LOCAL_TEST'}},res);
 return {status,packet,headers,requests};
}
const forms=[['/api/preview/session',{}],['/api/preview/session/',{}],['/api/preview/session?path=session',{query:{path:'session'}}],['/api/preview/[...path]?path=session',{query:{path:['session']}}],['/api/preview/[...path].js',{params:{path:['session']}}],['https://preview.test/api/preview/session',{}],['/session',{entrypointPath:'/session'}],['/api/preview/session.js',{entrypointPath:'/session'}]];
for(const [url,options] of forms)test('GET405 and valid POST200: '+url,async()=>{
 const get=await invoke(url,options);assert.equal(get.status,405);assert.equal(get.packet.error.code,'METHOD_DENIED');assert.equal(get.headers['X-Preview-Route'],'/session');assert.match(get.packet.trace_id,/^I-/);
 const post=await invoke(url,{...options,method:'POST'});assert.equal(post.status,200);assert.match(post.headers['X-Trace-ID'],/^I-/);assert.match(post.headers['Set-Cookie'],/Path=\/api\/preview; Secure; HttpOnly; SameSite=Strict; Max-Age=1800/);assert.equal(post.requests.length,0);
});
test('invalid account401 and wrong Origin403 retain same security logic',async()=>{
 assert.equal((await invoke('/api/preview/session',{method:'POST',body:{system:'lms',accountId:'INVALID',password:'demo1234'}})).status,401);
 assert.equal((await invoke('/api/preview/session',{method:'POST',requestOrigin:'https://invalid.test'})).status,403);
});
test('routing hints cannot override an explicit or public path',async()=>{
 for(const [url,options] of [['/api/preview/session?path=ui/live/E4',{}],['/api/preview/session?path=session',{query:{path:['ui','live','E4']}}],['/api/preview/ui/live/E4',{entrypointPath:'/session'}]])assert.equal((await invoke(url,options)).status,404);
});
test('unexpected queries, double encodings, traversal, URLs and conflicting params rejected',async()=>{
 for(const url of ['/api/preview/session?role=manager','/api/preview/session?path=session&path=session','/api/preview/session?path=../session','/api/preview/session?path=https://example.com','/api/preview/%73ession','/api/preview/../session','/api/preview//session','/api/preview/session#token','https://foreign.test/api/preview/session','/api/preview/[...path]?path=ui%252Flive%252FE4'])assert.equal((await invoke(url)).status,404,url);
 const bad=await invoke('/api/preview/[...path]',{query:{path:'session'},params:{path:['ui','live','E4']}});assert.equal(bad.status,404);
});
test('diagnostic reports safe pathname and shape, never query secrets',async()=>{
 const secret='SHOULD_NOT_APPEAR_IN_RESPONSE';const r=await invoke('/api/preview/session?token='+secret);assert.equal(r.status,404);assert.ok(!JSON.stringify(r).includes(secret));assert.deepEqual(r.packet.routing.query_keys,['OTHER_QUERY']);
 const info=resolvePreviewRoute({url:'/api/preview/[...path]?path=session',query:{path:['session']}},{origin});assert.equal(info.diagnostic.pathname,'/api/preview/[...path]');assert.equal(info.diagnostic.parameter_shape,'array');assert.equal(info.path,'/session');
});
test('E4 normalizes only its allowed route and remains401 without signed session',async()=>{
 for(const url of ['/api/preview/ui/live/E4','/api/preview/[...path]?path=ui%2Flive%2FE4']){
  const r=await invoke(url,{method:'POST',body:{synthetic:true,question:'SYNTH ROUTE CHECK'}});assert.equal(r.status,401);assert.equal(r.requests.length,0);assert.equal(r.headers['X-Preview-Route'],'/ui/live/E4');
 }
});

test('explicit entry and catchall have identical public Session semantics',async()=>{
 for(const method of ['GET','POST'])for(const url of ['/api/preview/session','/api/preview/session/','/api/preview/session?path=session']){
  const generic=await invoke(url,{method});const explicit=await invoke(url,{method,entrypointPath:'/session'});
  assert.equal(explicit.status,generic.status);assert.equal(explicit.headers['X-Preview-Route'],generic.headers['X-Preview-Route']);
  assert.equal(explicit.packet.authenticated,generic.packet.authenticated);assert.equal(explicit.packet.error?.code,generic.packet.error?.code);
 }
});
