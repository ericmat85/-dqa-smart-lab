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
 for(const url of ['/api/preview/session?path=session&path=session','/api/preview/session?path=../session','/api/preview/session?path=https://example.com','/api/preview/%73ession','/api/preview/../session','/api/preview//session','/api/preview/session#token','https://foreign.test/api/preview/session','/api/preview/[...path]?path=ui%252Flive%252FE4'])assert.equal((await invoke(url)).status,404,url);
 const bad=await invoke('/api/preview/[...path]',{query:{path:'session'},params:{path:['ui','live','E4']}});assert.equal(bad.status,404);
});
test('diagnostic reports safe pathname and shape, never query secrets',async()=>{
 const secret='SHOULD_NOT_APPEAR_IN_RESPONSE';const r=await invoke('/api/preview/session?token='+secret);assert.equal(r.status,405);assert.ok(!JSON.stringify(r).includes(secret));assert.deepEqual(r.packet.routing.query_keys,['OTHER_QUERY']);
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

for(const [label,url,query] of [
 ['query in req.url','/api/preview/session?_platform=synthetic',{_platform:'synthetic'}],
 ['query object only','/api/preview/session',{_platform:'synthetic'}],
 ['multiple unrelated keys','/api/preview/session?role=manager&noise=synthetic',{role:'manager',noise:'synthetic'}],
 ['matching route hint plus unrelated key','/api/preview/session?path=session&noise=synthetic',{path:'session',noise:'synthetic'}],
 ['trailing slash with unrelated query','/api/preview/session/?noise=synthetic',{noise:'synthetic'}],
])test('diagnostic-equivalent OTHER_QUERY Session: '+label,async()=>{
 const get=await invoke(url,{query});assert.equal(get.status,405);assert.equal(get.packet.error.code,'METHOD_DENIED');assert.equal(get.packet.routing.pathname,new URL(url,origin).pathname);assert.equal(get.packet.routing.query_policy,'IGNORED_NON_ROUTING_QUERY');assert.match(get.packet.trace_id,/^I-/);
 const valid=await invoke(url,{query,method:'POST'});assert.equal(valid.status,200);assert.equal(valid.requests.length,0);assert.match(valid.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Strict/);
 const invalid=await invoke(url,{query,method:'POST',body:{system:'lms',accountId:'INVALID',password:'demo1234'}});assert.equal(invalid.status,401);
 const evil=await invoke(url,{query,method:'POST',requestOrigin:'https://invalid.test'});assert.equal(evil.status,403);
});
test('unrelated queries never widen unresolved aliases or other API routes',async()=>{
 for(const url of ['/api/preview/invalid?noise=synthetic','/api/preview/[...path]?path=session&noise=synthetic','/api/preview/ui/bootstrap?url=https://evil.test'])assert.equal((await invoke(url)).status,404);
});
test('duplicate, polluted and inconsistent route hints still reject',async()=>{
 for(const url of ['/api/preview/session?path=session&%70ath=session','/api/preview/session?path=ui/live/E4&noise=synthetic','/api/preview/session?path[]=session','/api/preview/session?path[0]=session','/api/preview/session?path.route=session','/api/preview/session?PATH=session','/api/preview/session?__proto__[path]=session','/api/preview/session?constructor[prototype][path]=session','/api/preview/session?path=%252e%252e'])assert.equal((await invoke(url)).status,404,url);
 const inherited=await invoke('/api/preview/session',{query:Object.create({path:'ui/live/E4'})});assert.equal(inherited.status,404);
 const disagree=await invoke('/api/preview/session?noise=synthetic',{query:{noise:'synthetic',path:'ui/live/E4'}});assert.equal(disagree.status,404);
});
test('canonical E4 with unrelated query still enforces Session before upstream',async()=>{
 const r=await invoke('/api/preview/ui/live/E4?role=manager&url=https://evil.test',{method:'POST',query:{role:'manager',url:'https://evil.test'},body:{synthetic:true,question:'SYNTH CHECK'}});
 assert.equal(r.status,401);assert.equal(r.packet.error.code,'AUTHENTICATION_REQUIRED');assert.equal(r.headers['X-Preview-Route'],'/ui/live/E4');assert.equal(r.requests.length,0);
});

test('unrelated Query cannot bypass the existing per-IP rate limit',async()=>{
 const handler=createHandler({env,fetchImpl:()=>assert.fail('Session must not call upstream')});
 for(let i=0;i<61;i++){
  let status;const res={setHeader(){},status(v){status=v;return this},json(){return this}};
  await handler({url:'/api/preview/session?noise='+i,method:'GET',headers:{origin},socket:{remoteAddress:'QUERY_RATE_TEST'}},res);
  assert.equal(status,i<60?405:429);
 }
});
