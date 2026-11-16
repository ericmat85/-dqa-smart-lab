// Read-only fixed upstream health adapter. No model calls, URLs or secrets are returned.
export async function previewHealth({env,fetchImpl,trace}){
 let endpoint;try{const u=new URL(env.RENDER_BACKEND_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();endpoint=u.origin+'/healthz';}catch{return {status:503,code:'BACKEND_CONFIGURATION_REQUIRED'};}
 const signal=AbortSignal.timeout(10000);
 try{
  const r=await fetchImpl(endpoint,{method:'GET',headers:{Accept:'application/json','X-Preview-Gateway':env.PREVIEW_GATEWAY_SECRET},redirect:'error',signal});
  const raw=await r.text();if(raw.length>16384)throw Error('INVALID');const d=JSON.parse(raw);
  if(!r.ok)return {status:503,code:'UPSTREAM_HEALTH_UNAVAILABLE'};
  const fields=['status','e4_provider','mock_provider','live_provider','live_ledger','paid_inference_approved','e2_provider','e2_ledger','e2_paid_inference_approved'];
  // Only recognized enum values and booleans survive. Never forward arbitrary upstream text.
  const enums=new Set(['alive','DISABLED','AVAILABLE','UNAVAILABLE','UNAVAILABLE_OR_EXPIRED','CONTROLLED_LIVE_CONFIGURED_NOT_MODEL_PROOF','E2_CONTROLLED_LIVE_CONFIGURED_NOT_MODEL_PROOF','MOCK_ONLY','EXPIRED','NOT_CONFIGURED']);
  const data=Object.fromEntries(fields.map(k=>[k,typeof d[k]==='boolean'?d[k]:enums.has(d[k])?d[k]:'UNKNOWN']));
  if(data.status!=='alive')return {status:503,code:'UPSTREAM_HEALTH_INVALID'};
  return {status:200,body:{scope:'SANDBOX_ONLY',synthetic:true,trace_id:trace,checked_at:new Date().toISOString(),provider_call_performed:false,gateway_auth_verified:false,data}};
 }catch(e){const timeout=signal.aborted&&['TimeoutError','AbortError'].includes(e?.name);return {status:timeout?504:503,code:timeout?'UPSTREAM_HEALTH_TIMEOUT':'UPSTREAM_HEALTH_UNAVAILABLE'};}
}
