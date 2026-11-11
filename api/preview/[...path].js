import {resolvePreviewRoute,isAllowedPreviewPath} from '../../server/previewRouting.mjs';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
const ACCOUNTS={
 'DEMO-REQUESTER':{actor:'requester',systems:['request']},
 'DEMO-SUPERVISOR':{actor:'manager',systems:['request']},
 'DEMO-LEVEL1':{actor:'level1',systems:['lms']},
 'DEMO-LEVEL2':{actor:'level2',systems:['lms']},
 'U001':{actor:'outsider',systems:['lms']},'U003':{actor:'outsider',systems:['lab']},
};
const safeEqual=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const sign=(text,key)=>createHmac('sha256',key).update(text).digest('base64url');
export function createHandler({env=process.env,fetchImpl=globalThis.fetch,entrypointPath}={}){
 const counters=new Map();
 return async(req,res)=>{
  const trace='I-'+randomUUID().replaceAll('-','');
  let routing;
  const reply=(status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Trace-ID',trace);return res.status(status).json(body);};
  const fail=(status,code)=>reply(status,{scope:'SANDBOX_ONLY',synthetic:true,trace_id:trace,error:{code},...(routing?{routing}:{})});
  try{
   if(env.VERCEL_ENV!=='preview'||!env.PREVIEW_GATEWAY_SECRET||env.PREVIEW_GATEWAY_SECRET.length<32||!env.PREVIEW_SESSION_SECRET||env.PREVIEW_SESSION_SECRET.length<32)return fail(503,'PREVIEW_CONFIGURATION_REQUIRED');
   if(![undefined,'false','0'].includes(env.LIVE_PROVIDER_ENABLED?.toLowerCase())||![undefined,'false','0'].includes(env.LIVE_AI_ENABLED?.toLowerCase()))return fail(503,'LIVE_FLAGS_MUST_REMAIN_DISABLED');
   const origin=env.PREVIEW_ORIGIN||'https://'+env.VERCEL_URL;
   if(!origin.startsWith('https://')||req.headers.origin&&req.headers.origin!==origin)return fail(403,'ORIGIN_DENIED');
   if(req.method!=='GET'&&req.headers.origin!==origin)return fail(403,'ORIGIN_REQUIRED');
   const ip=req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown';const now=Date.now();
   if(counters.size>5000)counters.clear();const c=counters.get(ip)||{at:now,count:0};if(now-c.at>60000){c.at=now;c.count=0;}c.count++;counters.set(ip,c);if(c.count>60)return fail(429,'PREVIEW_RATE_LIMIT');
   const resolved=resolvePreviewRoute(req,{origin,entrypointPath});routing=resolved.diagnostic;
   res.setHeader('X-Preview-Pathname',routing.pathname);res.setHeader('X-Preview-Route',routing.resolved_path||'REJECTED');res.setHeader('X-Preview-Route-Source',routing.source);
   if(!resolved.path)return fail(404,'ROUTE_NOT_FOUND');
   const path=resolved.path;
   let body;
   if(req.method==='POST'){
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return fail(415,'JSON_REQUIRED');
    if(req.body!==undefined){body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(Buffer.byteLength(JSON.stringify(body))>8192)return fail(413,'PAYLOAD_TOO_LARGE');}
    else{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return fail(413,'PAYLOAD_TOO_LARGE');}body=JSON.parse(raw);}
   }
   if(path==='/session'){
    if(req.method!=='POST')return fail(405,'METHOD_DENIED');
    const {system,accountId,password,logout}=body||{};
    if(!['request','lms','lab'].includes(system))return fail(401,'AUTHENTICATION_REQUIRED');
    if(logout){res.setHeader('Set-Cookie',`dqa_preview_${system}=; Path=/api/preview; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);return reply(200,{signed_out:true});}
    const account=ACCOUNTS[accountId];if(!account?.systems.includes(system)||!safeEqual(password,'demo1234'))return fail(401,'AUTHENTICATION_REQUIRED');
    const data=Buffer.from(JSON.stringify({accountId,system,actor:account.actor,exp:now+30*60*1000})).toString('base64url');
    res.setHeader('Set-Cookie',`dqa_preview_${system}=${data}.${sign(data,env.PREVIEW_SESSION_SECRET)}; Path=/api/preview; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`);
    return reply(200,{authenticated:true,accountId,system,scope:'SYNTHETIC_PREVIEW_ONLY'});
   }
   if(!isAllowedPreviewPath(path))return fail(404,'ROUTE_NOT_FOUND');
   const expectedMethod=path.startsWith('/health/')||path==='/ui/bootstrap'?'GET':'POST';
   if(req.method!==expectedMethod)return fail(405,'METHOD_DENIED');
   const system=req.headers['x-preview-system'];let actor;
   if(['request','lms','lab'].includes(system)){
    const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());const token=cookies.find(x=>x.startsWith('dqa_preview_'+system+'='))?.split('=').slice(1).join('=');
    if(token){const [data,sig,...extra]=token.split('.');if(!extra.length&&safeEqual(sig,sign(data,env.PREVIEW_SESSION_SECRET))){const session=JSON.parse(Buffer.from(data,'base64url'));if(session.exp>now&&session.system===system&&ACCOUNTS[session.accountId]?.actor===session.actor)actor=session.actor;}}
   }
   const bootstrap=path==='/ui/bootstrap'&&req.method==='GET';if(!actor&&!bootstrap)return fail(401,'AUTHENTICATION_REQUIRED');
   // Ignore all caller-supplied role and gateway headers. Only signed server sessions assign a role.
   const upstream=new URL(env.RENDER_BACKEND_URL);if(upstream.protocol!=='https:'||upstream.username||upstream.password||upstream.pathname!=='/')return fail(503,'BACKEND_CONFIGURATION_REQUIRED');
   const upstreamSignal=AbortSignal.timeout(path==='/ui/live/E4'?45000:10000);
   let upstreamStage='request';
   try{
    const response=await fetchImpl(upstream.origin+'/__integration_demo'+path,{method:req.method,headers:{'Content-Type':'application/json','X-Preview-Gateway':env.PREVIEW_GATEWAY_SECRET,'X-Demo-Actor':actor||'outsider'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:upstreamSignal});
    upstreamStage='response';
    const packet=await response.json();
    const serialized=JSON.stringify(packet);if(serialized.includes(env.PREVIEW_GATEWAY_SECRET)||serialized.includes(env.PREVIEW_SESSION_SECRET))return fail(503,'UPSTREAM_RESPONSE_REJECTED');
    if(bootstrap&&!actor&&packet.data)packet.data.requests=[];
    if(packet.trace_id)res.setHeader('X-Trace-ID',packet.trace_id);
    res.setHeader('Cache-Control','no-store');return res.status(response.status).json(packet);
   }catch(error){
    if(path!=='/ui/live/E4')throw error;
    const timedOut=upstreamSignal.aborted&&upstreamSignal.reason?.name==='TimeoutError'&&(error===upstreamSignal.reason||['AbortError','TimeoutError'].includes(error?.name));
    return fail(timedOut?504:503,timedOut?'UPSTREAM_TIMEOUT':upstreamStage==='response'?'UPSTREAM_RESPONSE_INVALID':'UPSTREAM_CONNECTION_FAILED');
   }
  }catch{return fail(503,'PREVIEW_SERVICE_UNAVAILABLE');}
 };
}
export default createHandler();
