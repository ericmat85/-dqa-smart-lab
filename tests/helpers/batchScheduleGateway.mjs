import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createBusinessHandler,sealSession,COOKIE} from '../../server/business/handler.mjs';
import {createBusinessClient} from '../../src/businessClient.mjs';
import {fixedBusinessRouter} from './fixedBusinessRouter.mjs';
export const T='bd630000-0000-4000-8000-000000000001',U='bd630000-0000-4000-8000-000000000002',M='fc000000-0000-4000-8000-000000000001';
const origin='https://preview.test';
export async function batchGateway(){
 const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:Buffer.alloc(32,7).toString('base64url')};
 const state={calls:[],intents:new Map(),receipts:new Map(),canPlan:true,lostAck:false,executions:0,prepares:0,conflict:false,delay:false,onSave:null,onPrepare:null};
 const handler=createBusinessHandler({env,fetchImpl:async(raw,options)=>{
  const url=new URL(raw),b=options.body?JSON.parse(options.body):{};assert.equal(url.origin,env.BUSINESS_SUPABASE_URL);assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ACCESS');
  if(url.pathname==='/auth/v1/user')return Response.json({id:U,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(url.pathname.endsWith('/check_browser_session'))return Response.json(T);
  assert.equal(b.p_tenant,T);const rpc=url.pathname.split('/').at(-1);state.calls.push({rpc,body:b});if(!state.canPlan)return Response.json({message:'BATCH_ACCESS_DENIED'},{status:403});
  if(rpc==='prepare_schedule_batch'){
   if(state.intents.has(b.p_operation))return Response.json(state.intents.get(b.p_operation));state.prepares++;
   const jobs=b.p_command.selection.map((j,i)=>({request_id:j.request_id,legacy_id:'REQ-BATCH-'+(i+1),title:'合成溫濕度試驗',priority:i?'一般':'急件',execution_kind:'REAL',state:j.sample_space_units?'READY':'BLOCKED',reason_code:j.sample_space_units?null:'BATCH_UNITS_REQUIRED',equipment_labels:j.sample_space_units?['合成恆溫恆濕機']:[],plan:j.sample_space_units?{start_date:b.p_command.options.earliest,end_date:b.p_command.options.earliest,scheduling_days:1,calendar_days:1,calendar:'continuous',executor_label:'合成執行人',hours_per_batch:1,sample_space_units:j.sample_space_units}:null}));
   const packet={id:b.p_operation,state:'PLANNED',scope:'DRAFT_ONLY',reserved:false,mode:'VALIDATED_RULES',expires_at:new Date(Date.now()+600000).toISOString(),jobs,ready_count:jobs.filter(j=>j.state==='READY').length,blocked_count:jobs.filter(j=>j.state==='BLOCKED').length,results:[]};state.onPrepare?.(packet,b.p_command);state.intents.set(b.p_operation,packet);state.command=b.p_command;return Response.json(packet);
  }
  if(rpc==='execute_schedule_batch'){
   if(state.receipts.has(b.p_operation))return Response.json(state.receipts.get(b.p_operation));if(state.conflict)return Response.json({message:'BATCH_SOURCE_CHANGED'},{status:409});
   const p=state.intents.get(b.p_operation);assert.ok(p);state.executions++;const result={...p,state:'SAVED',results:p.jobs.filter(j=>j.state==='READY').map((j,i)=>({request_id:j.request_id,draft_id:'bd630099-0000-4000-8000-'+String(i+1).padStart(12,'0'),state:'SAVED',scope:'DRAFT_ONLY',reserved:false,revision:1}))};state.receipts.set(b.p_operation,result);state.onSave?.(result);if(state.delay)await new Promise(resolve=>state.release=resolve);if(state.lostAck)throw Error('Synthetic acknowledgement interrupted after commit');return Response.json(result);
  }
  if(rpc==='schedule_batch_result')return Response.json(state.receipts.get(b.p_operation)||state.intents.get(b.p_operation)||{id:b.p_operation,state:'NOT_FOUND'});
  throw Error('Unexpected upstream RPC');
 }});
 const router=await fixedBusinessRouter(handler),server=createServer((req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=v=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(v));};void router(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookie=COOKIE+'='+sealSession({id:crypto.randomUUID(),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
 const transport=(path,{method='GET',body,authenticated=true,requestOrigin=origin}={})=>fetch(base+path,{method,headers:{Origin:requestOrigin,...(authenticated?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const client=createBusinessClient((path,o)=>transport(path,{method:o.method,body:o.body?JSON.parse(o.body):undefined}));
 return {state,client,transport,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
