import {createBusinessHandler,sealSession,COOKIE} from '../../server/business/handler.mjs';
import {fixedBusinessRouter} from '../../tests/helpers/fixedBusinessRouter.mjs';
const tenant='ec000000-0000-4000-8000-000000000008',user='ec000000-0000-4000-8000-000000000009',member='ec000000-0000-4000-8000-000000000001';
const key=Buffer.alloc(32,7).toString('base64url');
// Only the database transport is synthetic: browser requests cross the physical
// rewrite, route allowlist, authenticated handler and parameter API validation.
export async function specificationParameterGateway(request,state,{canManage}){
 const url=new URL(request.url()),origin=url.origin;
 const refs=()=>[...state.trials.flatMap(t=>(t.definition_details?.conditions||[]).map(c=>({...c,source:'trials',id:t.id}))),...state.equipment.flatMap(t=>(t.capabilities||[]).map(c=>({...c,source:'equipment',id:t.id})))];
 const handler=createBusinessHandler({env:{BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:key},fetchImpl:async(raw,options)=>{
  const path=new URL(raw).pathname,b=options.body?JSON.parse(options.body):{};
  if(path==='/auth/v1/user')return Response.json({id:user,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(path.endsWith('/check_browser_session'))return Response.json(tenant);
  if(b.p_tenant!==tenant)throw Error('Unexpected synthetic parameter tenant');
  const rpc=path.split('/').at(-1);state.parameterGatewayCalls.push(rpc);
  if(!canManage)return Response.json({message:'SPEC_PARAMETER_ACCESS_DENIED'},{status:403});
  const reject=message=>Response.json({message},{status:409});
  if(rpc==='spec_parameter_context'){
   const source=refs();return Response.json({can_manage:true,rows:state.parameters.map(t=>({...t,usage:{trials:new Set(source.filter(r=>r.kind===t.id&&r.source==='trials').map(r=>r.id)).size,equipment:new Set(source.filter(r=>r.kind===t.id&&r.source==='equipment').map(r=>r.id)).size,plans:0},unit_usage:Object.fromEntries(t.units.map(u=>[u,source.filter(r=>r.kind===t.id&&r.unit===u).length]))}))});
  }
  if(rpc==='spec_parameter_result')return Response.json(state.parameterResults[b.p_operation]||{state:'NOT_FOUND'});
  if(b.p_member!==member)return reject('SPEC_PARAMETER_ACCESS_DENIED');
  const packet={operation_id:b.p_operation,command:{action:b.p_action,parameter_id:b.p_kind,expected_revision:b.p_expected,expected_member:b.p_member,data:b.p_data}};
  if(rpc==='prepare_spec_parameter'){state.parameterPrepares.push(packet);return Response.json({id:b.p_operation,state:'PLANNED'});}
  if(rpc==='save_spec_parameter'){
   state.parameterWrites.push(packet);const old=state.parameters.find(t=>t.id===b.p_kind),source=refs();
   if((old?.revision||0)!==b.p_expected)return reject('SPEC_PARAMETER_REVISION_CONFLICT');
   if(b.p_action==='DELETE'){if(source.some(r=>r.kind===b.p_kind))return reject('SPEC_PARAMETER_IN_USE');state.parameters=state.parameters.filter(t=>t.id!==b.p_kind);}
   else{if(old&&source.some(r=>r.kind===old.id&&!b.p_data.units.includes(r.unit)))return reject('SPEC_PARAMETER_IN_USE');state.parameters=[...state.parameters.filter(t=>t.id!==b.p_kind),{...old,...b.p_data,id:b.p_kind,revision:(old?.revision||0)+1,builtin:old?.builtin??false}];}
   const result={id:b.p_operation,state:'SAVED',parameter_id:b.p_kind,revision:(old?.revision||0)+1};state.parameterResults[b.p_operation]=result;
   if(state.parameterUnknown){state.parameterUnknown=false;throw Error('Synthetic lost acknowledgement');}return Response.json(result);
  }
  throw Error('Unexpected parameter gateway RPC');
 }});
 const route=await fixedBusinessRouter(handler),headers={};let status=200,packet;
 const req={url:url.pathname+url.search,method:request.method(),headers:{...request.headers(),origin,cookie:COOKIE+'='+sealSession({id:crypto.randomUUID(),tenant,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},key)},body:request.postDataJSON()};
 const res={setHeader:(k,v)=>{headers[k]=v;},status:n=>{status=n;return res;},json:value=>{packet=value;},end:value=>{packet={fixture_error:value};},get statusCode(){return status;},set statusCode(n){status=n;}};
 await route(req,res);return {status,headers,json:packet};
}
