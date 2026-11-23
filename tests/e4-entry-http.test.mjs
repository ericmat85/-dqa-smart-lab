import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
Object.assign(process.env,{VERCEL_ENV:'preview',PREVIEW_ORIGIN:'https://preview.test',PREVIEW_GATEWAY_SECRET:'FAKE_E4_ENTRY_GATEWAY_LOCAL_TEST_ONLY',PREVIEW_SESSION_SECRET:'FAKE_E4_ENTRY_SESSION_LOCAL_TEST_ONLY',RENDER_BACKEND_URL:'https://fixture-render.test',LIVE_PROVIDER_ENABLED:'false',LIVE_AI_ENABLED:'false'});
const realFetch=globalThis.fetch,outbound=[];
globalThis.fetch=async(url,opts)=>{
 outbound.push({url,opts});assert.equal(url,'https://fixture-render.test/__integration_demo/ui/live/E4');assert.equal(opts.method,'POST');assert.equal(opts.headers['X-Preview-Gateway'],process.env.PREVIEW_GATEWAY_SECRET);assert.equal(opts.redirect,'error');
 const body=JSON.parse(opts.body);const status=opts.headers['X-Demo-Actor']==='outsider'?403:body.question==='SYNTH INVALID DTO FIXTURE'?422:503;
 const code=status===403?'AUTHORIZATION_DENIED':status===422?'INVALID_SYNTHETIC_PAYLOAD':'LIVE_PROVIDER_DISABLED';
 return {status,json:async()=>({scope:'LOCAL_FIXTURE_UPSTREAM_NOT_REAL_PROVIDER',trace_id:'I-E4-LOCAL-UPSTREAM',error:{code},...(body.question==='SYNTH SECRET REFLECTION FIXTURE'?{should_be_blocked:process.env.PREVIEW_GATEWAY_SECRET}:{})})};
};
const {default:e4}=await import('../api/preview/ui/live/E4.js');
const {default:session}=await import('../api/preview/session.js');
const {default:catchall,createHandler}=await import('../api/preview/[...path].js');
const selected=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local.test');req.query={};for(const key of new Set(url.searchParams.keys())){const all=url.searchParams.getAll(key);req.query[key]=all.length===1?all[0]:all;}
 const entry=/^\/api\/preview\/ui\/live\/E4(?:\/|\.js)?$/.test(url.pathname)?e4:/^\/api\/preview\/session\/?$/.test(url.pathname)?session:catchall;
 selected.push(entry===e4?'EXPLICIT_E4':entry===session?'EXPLICIT_SESSION':'CATCHALL');
 res.status=n=>{res.statusCode=n;return res};res.json=packet=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(packet));return res};entry(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{await new Promise(r=>server.close(r));globalThis.fetch=realFetch});
const payload={synthetic:true,question:'SYNTH ROUTE TEST ONLY'};
async function send(path='/api/preview/ui/live/E4',method='POST',body=payload,headers={}){
 return realFetch(origin+path,{method,headers:{Origin:'https://preview.test','Content-Type':'application/json','X-Preview-System':'lms',...headers},...(['GET','HEAD'].includes(method)||body===undefined?{}:{body:JSON.stringify(body)})});
}
async function login(accountId='DEMO-LEVEL1'){
 const r=await send('/api/preview/session','POST',{system:'lms',accountId,password:'demo1234'});assert.equal(r.status,200);assert.equal(selected.at(-1),'EXPLICIT_SESSION');assert.match(r.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);return r.headers.get('set-cookie').split(';')[0];
}
test('explicit E4 module handles real local HTTP GET405 with route and Trace',async()=>{
 const r=await send(undefined,'GET');assert.equal(selected.at(-1),'EXPLICIT_E4');assert.equal(r.status,405);assert.match(r.headers.get('content-type'),/application\/json/);assert.equal(r.headers.get('x-preview-route'),'/ui/live/E4');assert.equal(r.headers.get('x-preview-entrypoint'),'E4_EXPLICIT');const body=await r.json();assert.equal(body.error.code,'METHOD_DENIED');assert.equal(body.trace_id,r.headers.get('x-trace-id'));assert.match(body.trace_id,/^I-/);
});
test('unsigned and forged client roles stay401 without any upstream call',async()=>{
 const before=outbound.length;const r=await send(undefined,'POST',payload,{'X-Demo-Actor':'manager','X-Preview-Gateway':'FORGED'});assert.equal(r.status,401);assert.equal((await r.json()).error.code,'AUTHENTICATION_REQUIRED');assert.equal(outbound.length,before);
});
test('illegal Origin403 and tampered Cookie401 stay before upstream',async()=>{
 const before=outbound.length;assert.equal((await send(undefined,'POST',payload,{Origin:'https://evil.test'})).status,403);
 const cookie=await login();assert.equal((await send(undefined,'POST',payload,{Cookie:cookie+'tampered'})).status,401);assert.equal(outbound.length,before);
});
test('signed Session forwards exact E4 JSON path and preserves disabled response/Trace',async()=>{
 const cookie=await login();const r=await send(undefined,'POST',payload,{Cookie:cookie,'X-Demo-Actor':'manager'});assert.equal(selected.at(-1),'EXPLICIT_E4');assert.equal(r.status,503);const body=await r.json();assert.equal(body.error.code,'LIVE_PROVIDER_DISABLED');assert.equal(body.trace_id,'I-E4-LOCAL-UPSTREAM');assert.equal(r.headers.get('x-trace-id'),body.trace_id);assert.equal(outbound.at(-1).opts.headers['X-Demo-Actor'],'level1');assert.equal(body.scope,'LOCAL_FIXTURE_UPSTREAM_NOT_REAL_PROVIDER');
});
test('upstream fixture403 and422 are preserved, caller role never upgrades signed actor',async()=>{
 const outsider=await login('U001');let r=await send(undefined,'POST',payload,{Cookie:outsider,'X-Demo-Actor':'level2'});assert.equal(r.status,403);assert.equal(outbound.at(-1).opts.headers['X-Demo-Actor'],'outsider');assert.equal((await r.json()).error.code,'AUTHORIZATION_DENIED');
 const cookie=await login();r=await send(undefined,'POST',{synthetic:true,question:'SYNTH INVALID DTO FIXTURE'},{Cookie:cookie});assert.equal(r.status,422);assert.equal((await r.json()).error.code,'INVALID_SYNTHETIC_PAYLOAD');
});
test('noise queries and consistent hints preserve E4 route without forwarding Query',async()=>{
 const cookie=await login();for(const path of ['/api/preview/ui/live/E4?noise=synthetic&role=manager','/api/preview/ui/live/E4?path=ui%2Flive%2FE4&noise=synthetic','/api/preview/ui/live/E4/?noise=synthetic']){
  const r=await send(path,'POST',payload,{Cookie:cookie});assert.equal(r.status,503);assert.equal(outbound.at(-1).url,'https://fixture-render.test/__integration_demo/ui/live/E4');assert.equal(outbound.at(-1).opts.headers['X-Demo-Actor'],'level1');
 }
});
test('conflicting/duplicate/polluted hints reject with404 before upstream',async()=>{
 const before=outbound.length;const cookie=await login();for(const path of ['/api/preview/ui/live/E4?path=session','/api/preview/ui/live/E4?path=ui/live/E4&path=ui/live/E4','/api/preview/ui/live/E4?path[]=ui/live/E4'])assert.equal((await send(path,'POST',payload,{Cookie:cookie})).status,404,path);assert.equal(outbound.length,before);
});
test('entrypoint binding cannot serve Session, another engine or a general proxy',async()=>{
 for(const url of ['/api/preview/session','/api/preview/ui/live/E1','/api/preview/ui/live/E2','/api/preview/ui/live/E3','/api/preview/https://evil.test']){
  let status,packet;const handler=createHandler({entrypointPath:'/ui/live/E4',fetchImpl:()=>assert.fail('must not reach upstream')});const res={setHeader(){},status(v){status=v;return this},json(v){packet=v;return this}};
  await handler({url,method:'POST',headers:{origin:'https://preview.test','content-type':'application/json'},body:payload,socket:{remoteAddress:'BOUND_ENTRY_TEST'}},res);assert.equal(status,404);assert.equal(packet.error.code,'ROUTE_NOT_FOUND');
 }
});
test('secret reflection rejected and unrelated Query values never echoed',async()=>{
 const cookie=await login();const r=await send(undefined,'POST',{synthetic:true,question:'SYNTH SECRET REFLECTION FIXTURE'},{Cookie:cookie});assert.equal(r.status,503);const body=await r.json();assert.equal(body.error.code,'UPSTREAM_RESPONSE_REJECTED');assert.ok(!JSON.stringify(body).includes(process.env.PREVIEW_GATEWAY_SECRET));
 const q=await send('/api/preview/ui/live/E4?token=FAKE_QUERY_CANARY_NOT_SECRET','GET');assert.equal(q.status,405);assert.ok(!(await q.text()).includes('FAKE_QUERY_CANARY_NOT_SECRET'));
});
test('existing Session405/200/401/403 and Query fix are unchanged',async()=>{
 const path='/api/preview/session?noise=synthetic';assert.equal((await send(path,'GET')).status,405);await login();assert.equal((await send(path,'POST',{system:'lms',accountId:'INVALID',password:'demo1234'})).status,401);assert.equal((await send(path,'POST',{}, {Origin:'https://evil.test'})).status,403);
});
