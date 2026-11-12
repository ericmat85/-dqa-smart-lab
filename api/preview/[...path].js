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
const locallyRevokedSessions=new Map();
function isLocallyRevoked(session){for(const [sid,expires] of locallyRevokedSessions)if(expires<=Date.now())locallyRevokedSessions.delete(sid);return !!session?.sid&&locallyRevokedSessions.has(session.sid);}
function readSignedSession(cookie,system,key,allowRevoked=false){
 try{
  const token=String(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('dqa_preview_'+system+'='))?.split('=').slice(1).join('=');
  if(!token||token.length>2048)return null;
  const [data,sig,...extra]=token.split('.');if(extra.length||!safeEqual(sig,sign(data,key)))return null;
  const session=JSON.parse(Buffer.from(data,'base64url'));
  if(!Number.isSafeInteger(session.exp)||session.exp<=Date.now()||session.exp>Date.now()+1805000||session.system!==system||ACCOUNTS[session.accountId]?.actor!==session.actor||!ACCOUNTS[session.accountId]?.systems.includes(system))return null;
  return !allowRevoked&&isLocallyRevoked(session)?null:session;
 }catch{return null;}
}

export function createHandler({env=process.env,fetchImpl=globalThis.fetch,entrypointPath}={}){
 const counters=new Map();
 return async(req,res)=>{
  const trace='I-'+randomUUID().replaceAll('-','');
  let routing;
  const reply=(status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Trace-ID',trace);return res.status(status).json(body);};
  const fail=(status,code,details={})=>reply(status,{...details,scope:'SANDBOX_ONLY',synthetic:true,trace_id:trace,error:{code},...(routing?{routing}:{})});
  try{
   if(env.VERCEL_ENV!=='preview'||!env.PREVIEW_GATEWAY_SECRET||env.PREVIEW_GATEWAY_SECRET.length<32||!env.PREVIEW_SESSION_SECRET||env.PREVIEW_SESSION_SECRET.length<32)return fail(503,'PREVIEW_CONFIGURATION_REQUIRED');
   if(![undefined,'false','0'].includes(env.LIVE_PROVIDER_ENABLED?.toLowerCase())||![undefined,'false','0'].includes(env.LIVE_AI_ENABLED?.toLowerCase()))return fail(503,'LIVE_FLAGS_MUST_REMAIN_DISABLED');
   if(![undefined,'MOCK','CONTROLLED_LIVE'].includes(env.E4_PREVIEW_PROVIDER_MODE))return fail(503,'E4_PROVIDER_MODE_INVALID');
   const origin=env.PREVIEW_ORIGIN||'https://'+env.VERCEL_URL;
   if(!origin.startsWith('https://')||req.headers.origin&&req.headers.origin!==origin)return fail(403,'ORIGIN_DENIED');
   if(req.method!=='GET'&&req.headers.origin!==origin)return fail(403,'ORIGIN_REQUIRED');
   const ip=req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown';const now=Date.now();
   if(counters.size>5000)counters.clear();const c=counters.get(ip)||{at:now,count:0};if(now-c.at>60000){c.at=now;c.count=0;}c.count++;counters.set(ip,c);if(c.count>60)return fail(429,'PREVIEW_RATE_LIMIT');
   const resolved=resolvePreviewRoute(req,{origin,entrypointPath});routing=resolved.diagnostic;
   res.setHeader('X-Preview-Pathname',routing.pathname);res.setHeader('X-Preview-Route',routing.resolved_path||'REJECTED');res.setHeader('X-Preview-Route-Source',routing.source);
   if(!resolved.path)return fail(404,'ROUTE_NOT_FOUND');
   const path=resolved.path;
   function e4Headers(session){
    if(!/^[a-f0-9]{32}$/.test(session?.sid||''))return null;
    const binding={sid:session.sid,accountId:session.accountId,system:session.system,actor:session.actor,exp:session.exp};
    const data=Buffer.from(JSON.stringify(binding)).toString('base64url');
    const headers={'X-Preview-Session':data+'.'+sign('E4_SESSION_V2.'+data,env.PREVIEW_GATEWAY_SECRET),'X-Preview-System':session.system,'X-Preview-Request-ID':trace};
    const id=req.headers['x-preview-idempotency-key'];
    if(id!==undefined){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(id))return null;headers['X-Preview-Operation-ID']='O-'+createHmac('sha256',env.PREVIEW_SESSION_SECRET).update('E4_OP_V1.'+session.sid+'.'+session.system+'.'+session.accountId+'.'+id).digest('hex');}
    return headers;
   }
   async function forward(path,body,actor,extraHeaders={},bootstrap=false,revoke=false){
   const upstream=new URL(env.RENDER_BACKEND_URL);if(upstream.protocol!=='https:'||upstream.username||upstream.password||upstream.pathname!=='/')return fail(503,'BACKEND_CONFIGURATION_REQUIRED');
   const upstreamDeadline=AbortSignal.timeout(path==='/ui/live/E4'?45000:10000);
   const clientAbort=new AbortController();const isE4=path==='/ui/live/E4';
   const aborted=()=>clientAbort.abort(new DOMException('Client request cancelled','AbortError'));
   const closed=()=>{if(!res.writableEnded)aborted();};
   if(isE4){req.once?.('aborted',aborted);res.once?.('close',closed);}
   const upstreamSignal=isE4?AbortSignal.any([upstreamDeadline,clientAbort.signal]):upstreamDeadline;
   let upstreamStage='request';
   try{
    const prefix=path==='/ui/live/E4'&&env.E4_PREVIEW_PROVIDER_MODE==='CONTROLLED_LIVE'?'/__integration_live':'/__integration_demo';
    const response=await fetchImpl(upstream.origin+prefix+path,{method:req.method,headers:{'Content-Type':'application/json','X-Preview-Gateway':env.PREVIEW_GATEWAY_SECRET,'X-Demo-Actor':actor||'outsider',...extraHeaders},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:upstreamSignal});
    upstreamStage='response';
    const packet=await response.json();
    const serialized=JSON.stringify(packet);if(serialized.includes(env.PREVIEW_GATEWAY_SECRET)||serialized.includes(env.PREVIEW_SESSION_SECRET)||(extraHeaders['X-Preview-Session']&&serialized.includes(extraHeaders['X-Preview-Session'])))return fail(503,'UPSTREAM_RESPONSE_REJECTED');
    if(revoke){if(response.status===200&&packet.data?.control==='SESSION_REVOKED'||response.status===401&&packet.error?.code==='SESSION_REVOKED')return reply(200,{signed_out:true});return fail(503,'SESSION_REVOCATION_UNCONFIRMED');}
    if(bootstrap&&!actor&&packet.data)packet.data.requests=[];
    if(packet.trace_id)res.setHeader('X-Trace-ID',packet.trace_id);
    res.setHeader('Cache-Control','no-store');return res.status(response.status).json(packet);
   }catch(error){
    if(path!=='/ui/live/E4')throw error;
    const timedOut=upstreamDeadline.aborted&&upstreamDeadline.reason?.name==='TimeoutError'&&(error===upstreamDeadline.reason||['AbortError','TimeoutError'].includes(error?.name));
    return fail(timedOut?504:503,timedOut?'UPSTREAM_TIMEOUT':upstreamStage==='response'?'UPSTREAM_RESPONSE_INVALID':'UPSTREAM_CONNECTION_FAILED',{request_id:extraHeaders['X-Preview-Operation-ID']||trace});
   }finally{if(isE4){req.removeListener?.('aborted',aborted);res.removeListener?.('close',closed);}}
   }

   let body;
   if(req.method==='POST'){
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return fail(415,'JSON_REQUIRED');
    if(req.body!==undefined){body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(Buffer.byteLength(JSON.stringify(body))>8192)return fail(413,'PAYLOAD_TOO_LARGE');}
    else{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return fail(413,'PAYLOAD_TOO_LARGE');}body=JSON.parse(raw);}
   }
   if(path==='/session'){
    if(req.method!=='POST')return fail(405,'METHOD_DENIED');
    const {system,accountId,password,logout,freshConversation}=body||{};
    if(freshConversation!==undefined&&typeof freshConversation!=='boolean')return fail(422,'INVALID_SESSION_DTO');
    if(!['request','lms','lab'].includes(system))return fail(401,'AUTHENTICATION_REQUIRED');
    if(logout){
     res.setHeader('Set-Cookie',`dqa_preview_${system}=; Path=/api/preview; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
     const prior=readSignedSession(req.headers.cookie,system,env.PREVIEW_SESSION_SECRET,true);
     if(!prior?.sid||prior.actor==='outsider')return reply(200,{signed_out:true});
     locallyRevokedSessions.set(prior.sid,prior.exp);
     const headers=e4Headers(prior);if(!headers)return fail(401,'SESSION_REFRESH_REQUIRED');
     return await forward('/ui/live/E4',{synthetic:true,question:'/logout'},prior.actor,headers,false,true);
    }
    const account=typeof accountId==='string'&&Object.hasOwn(ACCOUNTS,accountId)?ACCOUNTS[accountId]:null;if(!account?.systems.includes(system)||!safeEqual(password,'demo1234'))return fail(401,'AUTHENTICATION_REQUIRED');
    const prior=readSignedSession(req.headers.cookie,system,env.PREVIEW_SESSION_SECRET);const reuse=!freshConversation&&prior?.accountId===accountId&&/^[a-f0-9]{32}$/.test(prior.sid||'');
    const sessionClaims={accountId,system,actor:account.actor,exp:reuse?prior.exp:now+30*60*1000,sid:reuse?prior.sid:randomUUID().replaceAll('-','')};
    const data=Buffer.from(JSON.stringify(sessionClaims)).toString('base64url');
    res.setHeader('Set-Cookie',`dqa_preview_${system}=${data}.${sign(data,env.PREVIEW_SESSION_SECRET)}; Path=/api/preview; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`);
    return reply(200,{authenticated:true,accountId,system,conversation_id:sessionClaims.sid,session_created:!reuse,scope:'SYNTHETIC_PREVIEW_ONLY'});
   }
   if(!isAllowedPreviewPath(path))return fail(404,'ROUTE_NOT_FOUND');
   const expectedMethod=path.startsWith('/health/')||path==='/ui/bootstrap'?'GET':'POST';
   if(req.method!==expectedMethod)return fail(405,'METHOD_DENIED');
   const system=req.headers['x-preview-system'];const session=['request','lms','lab'].includes(system)?readSignedSession(req.headers.cookie,system,env.PREVIEW_SESSION_SECRET,true):null;const actor=session?.actor;
   if(isLocallyRevoked(session))return fail(401,'SESSION_REVOKED');
   const bootstrap=path==='/ui/bootstrap'&&req.method==='GET';if(!actor&&!bootstrap)return fail(401,'AUTHENTICATION_REQUIRED');
   // Ignore all caller-supplied role and gateway headers. Only signed server sessions assign a role.
   const extraHeaders=/^\/ui\/live\/E[1-4]$/.test(path)?e4Headers(session):{};
   if(!extraHeaders)return fail(401,'SESSION_REFRESH_REQUIRED');
   return await forward(path,body,actor,extraHeaders,bootstrap);

  }catch{return fail(503,'PREVIEW_SERVICE_UNAVAILABLE');}
 };
}
export default createHandler();
