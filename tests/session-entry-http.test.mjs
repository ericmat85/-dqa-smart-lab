import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
Object.assign(process.env,{VERCEL_ENV:'preview',PREVIEW_ORIGIN:'https://preview.test',PREVIEW_GATEWAY_SECRET:'FAKE_GATEWAY_ROUTE_HTTP_ONLY_20261111',PREVIEW_SESSION_SECRET:'FAKE_SESSION_ROUTE_HTTP_ONLY_20261111',RENDER_BACKEND_URL:'https://unused-backend.test',LIVE_PROVIDER_ENABLED:'false',LIVE_AI_ENABLED:'false'});
const realFetch=globalThis.fetch;let upstreamCalls=0;
globalThis.fetch=async(url,opts)=>{upstreamCalls++;assert.equal(url,'https://unused-backend.test/__integration_demo/ui/live/E4');assert.equal(opts.headers['X-Preview-Gateway'],process.env.PREVIEW_GATEWAY_SECRET);return {status:503,json:async()=>({trace_id:'I-LOCAL-UPSTREAM',error:{code:'LIVE_PROVIDER_DISABLED'}})}};
const {default:sessionEntry}=await import('../api/preview/session.js');const {default:catchallEntry}=await import('../api/preview/[...path].js');
const selected=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local.test');req.query={};for(const key of new Set(url.searchParams.keys())){const all=url.searchParams.getAll(key);req.query[key]=all.length===1?all[0]:all;}
 const staticSession=['/api/preview/session','/api/preview/session/'].includes(url.pathname);selected.push(staticSession?'EXPLICIT_SESSION':'CATCHALL');
 res.status=n=>{res.statusCode=n;return res};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return res};
 (staticSession?sessionEntry:catchallEntry)(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function req(path,method='POST',body,extra={}){return realFetch(url+path,{method,headers:{Origin:'https://preview.test','Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});}
const valid={system:'lms',accountId:'DEMO-LEVEL1',password:'demo1234'};
test('HTTP filesystem entry and catchall coexist, security and cookies retained',async()=>{
 try{
  const login=await req('/api/preview/session','POST',valid);assert.equal(login.status,200);assert.equal(selected.at(-1),'EXPLICIT_SESSION');assert.equal(login.headers.get('x-preview-route'),'/session');assert.match(login.headers.get('x-trace-id'),/^I-/);const cookie=login.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict; Max-Age=1800/);
  const get=await req('/api/preview/session','GET');assert.equal(get.status,405);assert.equal((await get.json()).error.code,'METHOD_DENIED');
  assert.equal((await req('/api/preview/session','PUT')).status,405);
  assert.equal((await req('/api/preview/session','POST',{...valid,accountId:'INVALID'})).status,401);
  assert.equal((await req('/api/preview/session','POST',valid,{Origin:'https://invalid.test'})).status,403);
  assert.equal((await req('/api/preview/session/','POST',valid)).status,200);
  const body={synthetic:true,question:'SYNTH ROUTE CHECK'};const noLogin=await req('/api/preview/ui/live/E4','POST',body,{'X-Preview-System':'lms','X-Demo-Actor':'manager'});assert.equal(noLogin.status,401);assert.equal(upstreamCalls,0);assert.equal(selected.at(-1),'CATCHALL');
  const forwarded=await req('/api/preview/ui/live/E4','POST',body,{'X-Preview-System':'lms',Cookie:cookie.split(';')[0]});assert.equal(forwarded.status,503);assert.equal(upstreamCalls,1);assert.equal(forwarded.headers.get('x-preview-route'),'/ui/live/E4');assert.equal((await forwarded.json()).error.code,'LIVE_PROVIDER_DISABLED');
  const badCookie=await req('/api/preview/ui/live/E4','POST',body,{'X-Preview-System':'lms',Cookie:cookie.split(';')[0]+'tampered'});assert.equal(badCookie.status,401);assert.equal(upstreamCalls,1);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=realFetch;}
});
