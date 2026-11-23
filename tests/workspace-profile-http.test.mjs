import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const realFetch=globalThis.fetch;
const A='a0000000-0000-0000-0000-000000000001',M='a2000000-0000-0000-0000-000000000001',U='10000000-0000-0000-0000-000000000001';
const origin='https://synthetic-preview.test',key=Buffer.alloc(32,9).toString('base64url');
const originalEnv={...process.env};
Object.assign(process.env,{BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'synthetic.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:key});
let profile={configuration:{workspaceName:'Synthetic',dateFormat:'YYYY/MM/DD',timeZone:'Asia/Taipei',labName:'',address:'',phone:'',email:'',website:'',identifier:'',qualityLead:'',technicalLead:''},revision:0,can_manage:true};
let signatureMethod={method:'IMAGE',revision:0,digital_ready:false,can_manage:true};
let prefs={member_id:M,enabled:false,configured:true,revision:1,service_enabled:true,service_ready:true},lost=false;const calls=[],operations=new Map();
globalThis.fetch=async(raw,options={})=>{
 const url=new URL(raw),body=options.body?JSON.parse(options.body):{};calls.push({path:url.pathname,body});assert.equal(url.origin,process.env.BUSINESS_SUPABASE_URL);assert.equal(options.redirect,'error');
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
 if(url.pathname==='/auth/v1/user')return json({id:U,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
 const rpc=url.pathname.split('/').at(-1);assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ACCESS');
 if(rpc==='check_browser_session')return json(A);
 assert.equal(body.p_tenant,A);
 if(rpc==='workspace_profile')return json(profile);
 if(rpc==='save_workspace_profile'){if(body.p_expected_revision!==profile.revision)return json({message:'REVISION_CONFLICT'},400);profile={...profile,configuration:body.p_configuration,revision:profile.revision+1};return json(profile);}
 if(rpc==='signature_method_settings')return json(signatureMethod);
 if(rpc==='save_signature_method_settings'){if(body.p_method==='DIGITAL')return json({message:'SIGNATURE_DIGITAL_NOT_CONFIGURED'},400);signatureMethod={...signatureMethod,revision:1};return json(signatureMethod);}
 if(rpc==='notification_settings')return json(prefs);
 if(rpc==='notification_status')return json({settings:prefs,counts:{},records:[],scope:'OWN'});
 if(rpc==='save_notification_settings'){
  assert.equal(body.p_member,M);if(body.p_expected_revision!==prefs.revision)return json({message:'REVISION_CONFLICT'},400);
  prefs={...prefs,enabled:body.p_enabled,revision:prefs.revision+1};if(lost)throw Error('synthetic lost receipt');return json(prefs);
 }
 if(rpc==='test_notification_email'){
  assert.equal(body.p_member,M);assert.equal(body.p_system,'lms');const old=operations.get(body.p_operation);if(old)return json({...old,replayed:true});const d={id:body.p_operation,state:'QUEUED',replayed:false};operations.set(body.p_operation,d);return json(d);
 }
 throw Error('unexpected RPC');
};
const handler=await import('../server/business/handler.mjs');
const entries=new Map();
for(const leaf of ['settings','status','test']){const entry=await import('../api/business/notifications/'+leaf+'.js');assert.equal(entry.default,handler.default);entries.set('/api/business/notifications/'+leaf,entry.default);}
entries.set('/api/business/access',(await import('../api/business/access.js')).default);
const session=handler.sealSession({id:crypto.randomUUID(),tenant:A,nonce:'synthetic-only',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},key);const cookie=handler.COOKIE+'='+session;
const server=createServer((req,res)=>{const fn=entries.get(new URL(req.url,'http://localhost').pathname);if(!fn){res.statusCode=404;return res.end('unmapped fixture path');}res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};void fn(req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));globalThis.fetch=realFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);});
async function call(leaf,{method='GET',body,authenticated=true,requestOrigin=origin}={}){const r=await realFetch(base+'/api/business/access'+leaf,{method,headers:{Origin:requestOrigin,...(authenticated?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.match(r.headers.get('content-type'),/application\/json/);const packet=await r.json();assert.match(packet.trace_id,/^I-[a-f0-9]{32}$/);return {status:r.status,packet};}


test('shared profile read/save uses session tenant and streamed JSON',async()=>{assert.equal((await call('?section=profile')).status,200);const r=await call('',{method:'POST',body:{action:'save_profile',expected_revision:0,configuration:{...profile.configuration,labName:'Synthetic lab'}}});assert.equal(r.status,200);assert.equal((await call('?section=profile')).packet.data.configuration.labName,'Synthetic lab');});
test('profile rejects tenant injection, extra query, stale revision, unauthenticated and cross-origin',async()=>{assert.equal((await call('?section=profile&tenant_id=other')).status,422);assert.equal((await call('?section=profile',{authenticated:false})).status,401);const body={action:'save_profile',expected_revision:0,configuration:profile.configuration};assert.equal((await call('',{method:'POST',body})).status,409);assert.equal((await call('',{method:'POST',body:{...body,tenant_id:A}})).status,422);assert.equal((await call('',{method:'POST',body,requestOrigin:'https://foreign.invalid'})).status,403);});
