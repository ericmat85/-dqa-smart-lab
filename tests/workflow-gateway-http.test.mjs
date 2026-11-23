import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readdir} from 'node:fs/promises';
import {createBusinessHandler,sealSession,COOKIE} from '../server/business/handler.mjs';
import handler from '../server/business/handler.mjs';
import entry from '../api/business/index.js';
import {createBusinessClient} from '../src/businessClient.mjs';
import {preparationFailureMessage} from '../src/resourceOperationMessages.mjs';
import {fixedBusinessRouter} from './helpers/fixedBusinessRouter.mjs';
const T='a0000000-0000-0000-0000-000000000001',U='10000000-0000-0000-0000-000000000001',ID='ab000000-0000-4000-8000-000000000001',O='bc000000-0000-4000-8000-000000000001',origin='https://preview.test';
const SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=';
const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:Buffer.alloc(32,3).toString('base64url')};
const servers=[];
after(async()=>{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
async function fixture({rewrites=true}={}){
 const state={status:'DRAFT',revision:3,signature:SIG,prepared:[],executed:[],planning:[],receipt:new Map(),lostExecute:false,allowed:true};
 const business=createBusinessHandler({env,fetchImpl:async(raw,options)=>{
  const url=new URL(raw),body=options.body?JSON.parse(options.body):{};assert.equal(url.origin,env.BUSINESS_SUPABASE_URL);assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ACCESS');
  if(url.pathname==='/auth/v1/user')return Response.json({id:U,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(url.pathname.endsWith('/check_browser_session'))return Response.json(T);
  assert.equal(body.p_tenant,T);const rpc=url.pathname.split('/').at(-1);
  if(!state.allowed)return Response.json({message:'WORKFLOW_ACCESS_DENIED'},{status:403});
  if(rpc==='prepare_request_operation'){state.prepared.push(body);return Response.json({state:'PLANNED',id:body.p_operation});}
  if(rpc==='execute_request_operation'){
   state.executed.push(body);assert.equal(body.p_command.request_id,ID);assert.equal(body.p_command.expected_revision,3);assert.equal(body.p_command.signature_data,SIG);assert.ok(!Object.hasOwn(body.p_command,'sample_space_units'));
   const existing=state.receipt.get(body.p_operation);if(existing)return Response.json({...existing,replayed:true});state.status='AWAITING_REQUEST_MANAGER';state.revision++;const result={state:'SAVED',operation_id:body.p_operation,status:state.status,revision:state.revision};state.receipt.set(body.p_operation,result);if(state.lostExecute)throw Error('Synthetic lost acknowledgement');return Response.json(result);
  }
  if(rpc==='request_operation_result')return Response.json(state.receipt.get(body.p_operation)||{state:'PLANNED'});
  if(rpc==='request_document_version')return Response.json({canonical_text:'SYNTHETIC IMMUTABLE DOCUMENT'});
  if(rpc==='request_signature_image')return Response.json({signature_data:SIG});
  if(rpc==='prepare_schedule_draft'||rpc==='execute_schedule_draft'){state.planning.push(body);assert.equal(body.p_command.data.sample_space_units,2);return Response.json({state:rpc.startsWith('prepare')?'PLANNED':'SAVED'});}
  throw Error('Unexpected upstream in workflow transport test');
 }});
 const route=await fixedBusinessRouter(business,{rewrites}),server=createServer((req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};void route(req,res);});servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const cookie=COOKIE+'='+sealSession({id:crypto.randomUUID(),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
 async function transport(path,{method='GET',body,authenticated=true,requestOrigin=origin}={}){return fetch(base+path,{method,headers:{Origin:requestOrigin,...(authenticated?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 const client=createBusinessClient((url,options)=>transport(url,{method:options.method,body:options.body?JSON.parse(options.body):undefined}));return {state,transport,client};
}
const command={operation_id:O,command:{request_id:ID,expected_revision:3,action:'SUBMIT',signature_data:SIG,comment:''}};
test('fixed gateway exports the same authenticated business handler without adding a function',async()=>{assert.equal(entry,handler);const files=await readdir(new URL('../api/',import.meta.url),{recursive:true});assert.equal(files.filter(x=>x.endsWith('.js')).length,12);assert.ok(!files.some(x=>x==='business/[...path].js'));});
test('a missing physical route reproduces a preparation-only HTML error, with draft and signature retained',async()=>{const f=await fixture({rewrites:false});await assert.rejects(f.client.request('/workflow/prepare',{method:'POST',body:command}),error=>{assert.equal(error.status,404);assert.equal(error.code,'RESPONSE_INVALID');assert.match(preparationFailureMessage(error),/HTTP 404/);return true;});assert.equal(f.state.status,'DRAFT');assert.equal(f.state.signature,SIG);assert.equal(f.state.prepared.length,0);assert.equal(f.state.executed.length,0);});
test('nested prepare and execute cross physical HTTP routing, then receipt lookup reads the same result',async()=>{const f=await fixture();assert.equal((await f.client.request('/workflow/prepare',{method:'POST',body:command})).data.state,'PLANNED');assert.equal(f.state.status,'DRAFT');assert.equal((await f.client.request('/workflow/execute',{method:'POST',body:command})).data.status,'AWAITING_REQUEST_MANAGER');assert.equal((await f.client.request('/workflow/result/'+O)).data.state,'SAVED');assert.equal(f.state.prepared.length,1);assert.equal(f.state.executed.length,1);assert.equal(f.state.signature,SIG);});
test('three-segment document and signature reads retain authorized logical IDs',async()=>{const f=await fixture();assert.equal((await f.client.request('/workflow/document/'+ID)).data.canonical_text,'SYNTHETIC IMMUTABLE DOCUMENT');assert.equal((await f.client.request('/workflow/signature/'+ID)).data.signature_data,SIG);});
test('lost execute acknowledgement is looked up without automatic resend or duplicate approval',async()=>{const f=await fixture();f.state.lostExecute=true;await f.client.request('/workflow/prepare',{method:'POST',body:command});await assert.rejects(f.client.request('/workflow/execute',{method:'POST',body:command}),e=>e.outcomeUnknown);assert.equal((await f.client.request('/workflow/result/'+O)).data.state,'SAVED');assert.equal(f.state.executed.length,1);assert.equal(f.state.revision,4);});
test('gateway preserves authentication, origin and database permission checks',async()=>{const f=await fixture();for(const options of [{authenticated:false},{requestOrigin:'https://foreign.test'}]){const res=await f.transport('/api/business/workflow/prepare',{method:'POST',body:command,...options});assert.ok([401,403].includes(res.status));}f.state.allowed=false;const denied=await f.transport('/api/business/workflow/prepare',{method:'POST',body:command});assert.equal(denied.status,403);assert.equal(f.state.prepared.length,0);assert.equal(f.state.executed.length,0);});
test('duplicate path hints, traversal and forged command fields cannot reach a workflow RPC',async()=>{const f=await fixture();for(const path of ['/api/business?path=workflow/prepare&path=config','/api/business?path=workflow/../config','/api/business/workflow/prepare?path=config'])assert.equal((await f.transport(path,{method:'POST',body:command})).status,422);const res=await f.transport('/api/business/workflow/prepare',{method:'POST',body:{...command,command:{...command.command,tenant_id:'forged'}}});assert.equal(res.status,422);assert.equal(f.state.prepared.length,0);});
test('planner U passes through the actual BFF whitelist on both preparation and save',async()=>{const f=await fixture(),body={operation_id:O,command:{request_id:ID,expected_request_revision:3,expected_draft_revision:0,data:{sample_space_units:2,equipment_ids:[ID],equipment_revisions:{[ID]:1},executor_id:U,executor_revision:1,start_date:'2027-01-01',end_date:'2027-01-02',sample_code:'SYNTHETIC',note:'',preparation_minutes:0,cleanup_minutes:0}}};for(const path of ['/planning/prepare','/planning/execute'])await f.client.request(path,{method:'POST',body});assert.equal(f.state.planning.length,2);assert.equal(f.state.status,'DRAFT');for(const value of [undefined,null,0,-1,1.5,100001,'2']){const altered=structuredClone(body);altered.command.data.sample_space_units=value;await assert.rejects(f.client.request('/planning/prepare',{method:'POST',body:altered}),e=>e.code==='PLANNING_FIELDS_INVALID');}assert.equal(f.state.planning.length,2);});
test('other query data cannot change tenant scope or be forwarded to an operation RPC',async()=>{const f=await fixture();const res=await f.transport('/api/business/workflow/prepare?tenant_id=forged',{method:'POST',body:command});assert.equal(res.status,422);assert.equal(f.state.prepared.length,0);});
test('preparation diagnostic retains bounded HTTP and trace evidence',()=>{const message=preparationFailureMessage({status:502,code:'RESPONSE_INVALID',trace:'hkg1::SYNTHETIC'});assert.match(message,/HTTP 502/);assert.match(message,/hkg1::SYNTHETIC/);assert.ok(!message.includes('請稍後重試'));});
