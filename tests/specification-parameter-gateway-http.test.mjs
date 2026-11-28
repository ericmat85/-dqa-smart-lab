import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createBusinessHandler,sealSession,COOKIE} from '../server/business/handler.mjs';
import {createBusinessClient} from '../src/businessClient.mjs';
import {DEFAULT_SPEC_PARAMETERS} from '../src/specificationParameters.mjs';
import {fixedBusinessRouter} from './helpers/fixedBusinessRouter.mjs';
const T='a0000000-0000-4000-8000-000000000001',U='10000000-0000-4000-8000-000000000001',M='20000000-0000-4000-8000-000000000001',O='30000000-0000-4000-8000-000000000001',K='CUSTOM_1234567890ABCDEF1234567890ABCDEF',origin='https://preview.test';
const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:Buffer.alloc(32,7).toString('base64url')};
const servers=[];
after(async()=>{for(const s of servers){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}});
async function fixture(){
 const state={rows:structuredClone(DEFAULT_SPEC_PARAMETERS),calls:[],intents:new Map(),receipts:new Map(),canManage:true,lostAcknowledgement:false,executions:0};
 const handler=createBusinessHandler({env,fetchImpl:async(raw,options)=>{
  const url=new URL(raw),b=options.body?JSON.parse(options.body):{};assert.equal(url.origin,env.BUSINESS_SUPABASE_URL);assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ACCESS');
  if(url.pathname==='/auth/v1/user')return Response.json({id:U,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(url.pathname.endsWith('/check_browser_session'))return Response.json(T);
  assert.equal(b.p_tenant,T);state.calls.push({rpc:url.pathname.split('/').at(-1),body:b});
  if(!state.canManage)return Response.json({message:'SPEC_PARAMETER_ACCESS_DENIED'},{status:403});
  switch(state.calls.at(-1).rpc){
   case 'spec_parameter_context':return Response.json({can_manage:true,rows:state.rows});
   case 'prepare_spec_parameter':assert.equal(b.p_member,M);state.intents.set(b.p_operation,b);return Response.json({state:'PLANNED',id:b.p_operation});
   case 'save_spec_parameter':{
    assert.equal(b.p_member,M);const old=state.receipts.get(b.p_operation);if(old)return Response.json(old);assert.deepEqual(b,state.intents.get(b.p_operation));state.executions++;
    const row=state.rows.find(r=>r.id===b.p_kind);assert.equal(row?.revision??0,b.p_expected);state.rows=state.rows.filter(r=>r.id!==b.p_kind);
    if(b.p_action==='SAVE')state.rows.push({id:b.p_kind,...b.p_data,revision:(row?.revision??0)+1,builtin:false});
    const result={state:'SAVED',id:b.p_operation,parameter_id:b.p_kind};state.receipts.set(b.p_operation,result);
    if(state.lostAcknowledgement)throw Error('Synthetic acknowledgement interrupted after commit');return Response.json(result);
   }
   case 'spec_parameter_result':return Response.json(state.receipts.get(b.p_operation)||{state:'NOT_FOUND',id:b.p_operation});
   default:throw Error('Unexpected parameter upstream');
  }
 }});
 const route=await fixedBusinessRouter(handler),server=createServer((req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};void route(req,res);});servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const cookie=COOKIE+'='+sealSession({id:crypto.randomUUID(),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
 const transport=(path,{method='GET',body,authenticated=true,requestOrigin=origin}={})=>fetch(base+path,{method,headers:{Origin:requestOrigin,...(authenticated?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const client=createBusinessClient((path,options)=>transport(path,{method:options.method,body:options.body?JSON.parse(options.body):undefined}));return {state,transport,client};
}
const command=(data={label:'流量',units:['L/min','m³/h']},patch={})=>({action:'SAVE',parameter_id:K,expected_revision:0,expected_member:M,data,...patch});
async function write(f,c,operation_id=crypto.randomUUID()){
 const body={operation_id,command:c};assert.equal((await f.client.request('/specification-parameters/prepare',{method:'POST',body})).data.state,'PLANNED');assert.equal((await f.client.request('/specification-parameters/execute',{method:'POST',body})).data.state,'SAVED');return operation_id;
}
test('parameter context reaches authenticated handler through physical Vercel rewrite',async()=>{const f=await fixture();const result=await f.client.request('/specification-parameters/context');assert.deepEqual(result.data.rows,DEFAULT_SPEC_PARAMETERS);assert.equal(f.state.calls[0].rpc,'spec_parameter_context');});
test('explicit rewritten gateway context resolves the same logical parameter route',async()=>{const f=await fixture();const response=await f.transport('/api/business?path=specification-parameters%2Fcontext');assert.equal(response.status,200);assert.equal((await response.json()).data.rows.length,8);});
test('parameter create, readback, edit, delete and receipt traverse the complete gateway',async()=>{const f=await fixture();const id=await write(f,command());assert.equal((await f.client.request('/specification-parameters/result/'+id)).data.state,'SAVED');assert.equal((await f.client.request('/specification-parameters/context')).data.rows.at(-1).label,'流量');await write(f,command({label:'液體流量',units:['L/min','m³/h','mL/min']},{expected_revision:1}));assert.equal((await f.client.request('/specification-parameters/context')).data.rows.at(-1).label,'液體流量');await write(f,command({},{action:'DELETE',expected_revision:2}));assert.equal((await f.client.request('/specification-parameters/context')).data.rows.some(r=>r.id===K),false);assert.equal(f.state.executions,3);});
test('lost parameter save acknowledgement recovers by result lookup without a second save',async()=>{const f=await fixture(),body={operation_id:O,command:command()};await f.client.request('/specification-parameters/prepare',{method:'POST',body});f.state.lostAcknowledgement=true;await assert.rejects(f.client.request('/specification-parameters/execute',{method:'POST',body}),e=>e.outcomeUnknown===true);assert.equal((await f.client.request('/specification-parameters/result/'+O)).data.state,'SAVED');assert.equal(f.state.executions,1);});
test('all four parameter routes still require a valid authenticated session',async()=>{const f=await fixture();for(const suffix of ['context','prepare','execute','result/'+O]){const response=await f.transport('/api/business/specification-parameters/'+suffix,{authenticated:false,method:['prepare','execute'].includes(suffix)?'POST':'GET',body:['prepare','execute'].includes(suffix)?{operation_id:O,command:command()}:undefined});assert.equal(response.status,401,suffix);}assert.equal(f.state.calls.length,0);});
test('parameter origin and native permission checks remain enforced through gateway',async()=>{const f=await fixture();assert.equal((await f.transport('/api/business/specification-parameters/context',{requestOrigin:'https://foreign.test'})).status,403);f.state.canManage=false;await assert.rejects(f.client.request('/specification-parameters/context'),e=>e.code==='SPEC_PARAMETER_ACCESS_DENIED'&&e.status===403);await assert.rejects(f.client.request('/specification-parameters/prepare',{method:'POST',body:{operation_id:O,command:command()}}),e=>e.code==='SPEC_PARAMETER_ACCESS_DENIED'&&e.status===403);assert.equal(f.state.intents.size,0);});
test('unknown parameter routes and malformed result IDs are never forwarded upstream',async()=>{const f=await fixture();for(const path of ['unknown','result','result/not-a-uuid','result/'+O+'/extra','result/'+O+'?tenant_id=forged']){const r=await f.transport('/api/business/specification-parameters/'+path);assert.ok([404,422].includes(r.status),path);}assert.equal(f.state.calls.length,0);});
test('ambiguous route hints and injected command scopes cannot reach parameter RPCs',async()=>{const f=await fixture();for(const path of ['/api/business?path=specification-parameters/context&path=config','/api/business/specification-parameters/context?path=config'])assert.equal((await f.transport(path)).status,422);for(const body of [{operation_id:O,command:command(),tenant_id:T},{operation_id:O,command:{...command(),tenant_id:T}}])assert.equal((await f.transport('/api/business/specification-parameters/prepare',{method:'POST',body})).status,422);assert.equal(f.state.calls.length,0);});
