import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
export const COOKIE='__Host-dqa_business';
const REF='mmazbwzdiizabikmiily',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const RESOURCE={
 trials:['trial_definitions','id,legacy_id,name,aliases,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision','name'],
 equipment:['equipment','id,legacy_id,name,category,model,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision','name'],
 materials:['materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,status,revision','name'],
 requests:['requests','id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details','legacy_id'],
 schedules:['schedules','id,legacy_id,request_id,executor_member_id,starts_at,ends_at,status,preparation_minutes,cleanup_minutes,revision','legacy_id'],
 reports:['reports','id,request_id,status,revision,created_at,updated_at',null],
 documents:['artifacts','id,legacy_id,kind,name,request_id,trial_id,revision,updated_at','name'],
 borrows:['borrows','id,legacy_id,borrower_member_id,equipment_id,material_id,quantity,purpose,starts_at,due_at,status,revision','legacy_id'],
 qualifications:['qualifications','id,member_id,equipment_id,trial_id,training,issued_on,expires_on,status,revision','training'],
 quality:['quality_records','id,title,owner_member_id,request_id,equipment_id,trial_id,status,severity,cause,action,resolution,due_on,revision','title'],
 sites:['sites','id,legacy_id,name,location,revision','name'],
 departments:['departments','id,legacy_id,name,parent_id,revision','name'],
 audit:['audit_events','id,table_name,record_id,operation,changed_columns,created_at','table_name'],
};
class ApiError extends Error{constructor(status,code,extra={}){super(code);this.status=status;this.code=code;this.extra=extra;}}
const sha=value=>createHash('sha256').update(value).digest('hex');
function anonymousKey(value){try{if(/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value||''))return true;const payload=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));return payload.role==='anon'&&payload.ref===REF;}catch{return false;}}
export function sealSession(session,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64url'),iv);cipher.setAAD(Buffer.from(COOKIE));const bytes=Buffer.concat([cipher.update(JSON.stringify(session)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
export function openSession(value,key){try{if(!value||value.length>5500)throw Error();const b=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64url'),b.subarray(0,12));cipher.setAAD(Buffer.from(COOKIE));cipher.setAuthTag(b.subarray(12,28));const s=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]));if(!UUID.test(s.id)||!UUID.test(s.tenant)||typeof s.nonce!=='string'||typeof s.access!=='string'||typeof s.refresh!=='string'||!Number.isSafeInteger(s.expires)||!Number.isSafeInteger(s.absolute)||s.absolute<=Date.now())throw Error();return s;}catch{throw new ApiError(401,'AUTHENTICATION_REQUIRED');}}
function cookie(value,seconds=28800){return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;}
async function bodyOf(req,maxBytes=24576){if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new ApiError(415,'JSON_REQUIRED');let body=req.body;if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>maxBytes)throw new ApiError(413,'PAYLOAD_TOO_LARGE');}body=raw;}if(typeof body==='string'){if(Buffer.byteLength(body)>maxBytes)throw new ApiError(413,'PAYLOAD_TOO_LARGE');try{body=JSON.parse(body);}catch{throw new ApiError(400,'INVALID_JSON');}}if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>maxBytes)throw new ApiError(400,'INVALID_BODY');return body;}
function fields(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new ApiError(422,'UNKNOWN_FIELDS');}
function businessRoute(req,origin){
 const raw=String(req.url||'');if(raw.length>4096||/[\\#\r\n]/.test(raw))throw new ApiError(404,'ROUTE_NOT_FOUND');
 const rawPath=raw.split('?')[0].replace(/^https:\/\/[^/]+/,'');if(/%|\/\//.test(rawPath)||rawPath.split('/').some(x=>x==='.'||x==='..'))throw new ApiError(404,'ROUTE_NOT_FOUND');
 const parsed=new URL(raw,origin);if(parsed.origin!==origin)throw new ApiError(404,'ROUTE_NOT_FOUND');
 const allowed=path=>/^\/(?:config|login|claim|refresh|logout|me|password|snapshot|data\/[a-z]+(?:\/[a-f0-9-]{36})?)$/.test(path);
 const hint=value=>{const parts=Array.isArray(value)?value:typeof value==='string'?value.split('/'):[];if(!parts.length||parts.length>3||parts.some(x=>typeof x!=='string'||!x||!/^[A-Za-z0-9_-]+$/.test(x)))throw new ApiError(422,'ROUTE_PARAMETER_INVALID');const path='/'+parts.join('/');if(!allowed(path))throw new ApiError(404,'ROUTE_NOT_FOUND');return path;};
 if(parsed.searchParams.getAll('path').length>1)throw new ApiError(422,'ROUTE_PARAMETER_INVALID');
 const hints=[parsed.searchParams.has('path')?parsed.searchParams.get('path'):undefined,req.query?.path,req.params?.path].filter(x=>x!==undefined).map(hint);
 if(hints.some(x=>x!==hints[0]))throw new ApiError(422,'ROUTE_PARAMETER_INVALID');
 const pathname=parsed.pathname.replace(/\/$/,'');let path=pathname.startsWith('/api/business/')?pathname.slice('/api/business'.length):null;
 if(allowed(path)){if(hints.length&&hints[0]!==path)throw new ApiError(422,'ROUTE_PARAMETER_INVALID');}
 else if(['/api/business','/api/business/[...path]','/api/business/[...path].js'].includes(pathname)&&hints.length)path=hints[0];
 else throw new ApiError(404,'ROUTE_NOT_FOUND');
 parsed.searchParams.delete('path');return {parsed,path};
}
export function createBusinessHandler({env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 return async(req,res)=>{
  const trace='I-'+randomUUID().replaceAll('-','');let dispatchedWrite=false;
  const reply=(status,data)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Trace-ID',trace);res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json({...data,trace_id:trace});};
  try{
   if(env.BUSINESS_ENABLED!=='true')throw new ApiError(503,'BUSINESS_CONNECTION_DISABLED');
   const origin=new URL(env.BUSINESS_ORIGIN||'https://'+env.VERCEL_URL).origin;
   if(!origin.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw new ApiError(503,'CONFIGURATION_REQUIRED');
   if(req.headers.origin&&req.headers.origin!==origin)throw new ApiError(403,'ORIGIN_DENIED');
   if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'ORIGIN_DENIED');
   if(!['GET','POST','PATCH'].includes(req.method))throw new ApiError(405,'METHOD_DENIED');
   if(req.method!=='GET'&&req.headers.origin!==origin)throw new ApiError(403,'ORIGIN_REQUIRED');
   if(env.BUSINESS_SUPABASE_URL!==`https://${REF}.supabase.co`||!anonymousKey(env.BUSINESS_SUPABASE_ANON_KEY)||!/^[A-Za-z0-9_-]{43}$/.test(env.BUSINESS_COOKIE_KEY||''))throw new ApiError(503,'CONFIGURATION_REQUIRED');
   const {parsed,path}=businessRoute(req,origin);
   if(path==='/config'&&req.method==='GET')return reply(200,{enabled:true,auth:'supabase',workflow_gate:'RULE_NOT_APPROVED',write_scope:'OWN_REQUEST_DRAFT_ONLY'});
   async function upstream(path,{token,method='GET',body,profile=false,headers={}}={}){
    let response;try{response=await fetchImpl(env.BUSINESS_SUPABASE_URL+path,{method,headers:{apikey:env.BUSINESS_SUPABASE_ANON_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(profile?{'Accept-Profile':'dqa_business','Content-Profile':'dqa_business'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new ApiError(503,dispatchedWrite?'WRITE_OUTCOME_UNKNOWN':'UPSTREAM_UNAVAILABLE',{outcome_unknown:dispatchedWrite});}
    const text=await response.text();if(Buffer.byteLength(text)>2097152)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');let data;try{data=text?JSON.parse(text):null;}catch{throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID',{outcome_unknown:dispatchedWrite});}
    if(!response.ok){
     const known=['REVISION_CONFLICT','DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY','DRAFT_NOT_AVAILABLE','DRAFT_WRITE_DENIED','MEMBERSHIP_REQUIRED','TRIAL_NOT_AVAILABLE','DRAFT_FIELDS_INVALID','DRAFT_FIELDS_TOO_LONG','ORIGINAL_FORM_INVALID','DRAFT_SIGNATURE_INVALID','SNAPSHOT_PAGINATION_REQUIRED','RULE_NOT_APPROVED'];const code=known.find(k=>data?.message===k);
     if(code)throw new ApiError(code==='REVISION_CONFLICT'||code.startsWith('DRAFT_ID')?409:['RULE_NOT_APPROVED','DRAFT_NOT_AVAILABLE','DRAFT_WRITE_DENIED','MEMBERSHIP_REQUIRED'].includes(code)?403:422,code);
     throw new ApiError(response.status===401?401:response.status===429?429:response.status>=500?503:response.status===403?403:422,response.status===401?'AUTHENTICATION_REQUIRED':response.status===429?'RATE_LIMITED':'UPSTREAM_REQUEST_REJECTED');
    }
    return {data,response};
   }
   const rpc=async(name,args,token)=>(await upstream('/rest/v1/rpc/'+name,{token,method:'POST',body:args,profile:true})).data;
   const rawCookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
   const read=()=>openSession(rawCookie,env.BUSINESS_COOKIE_KEY);
   async function user(token){const {data}=await upstream('/auth/v1/user',{token});if(!UUID.test(data?.id)||!data.email_confirmed_at)throw new ApiError(401,'AUTHENTICATION_REQUIRED');return data;}
   async function valid(s){const identity=await user(s.access),tenant=await rpc('check_browser_session',{p_id:s.id,p_nonce_sha256:sha(s.nonce)},s.access);if(tenant!==s.tenant)throw new ApiError(401,'SESSION_REVOKED');return identity;}
   async function refreshTokens(s){const {data}=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh}});if(!data?.access_token||!data?.refresh_token||!Number.isSafeInteger(data.expires_in)||data.expires_in<=0)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');return {...s,access:data.access_token,refresh:data.refresh_token,expires:now()+data.expires_in*1000};}
   function save(s){const encrypted=sealSession(s,env.BUSINESS_COOKIE_KEY);if(encrypted.length>3800)throw new ApiError(503,'SESSION_COOKIE_TOO_LARGE');res.setHeader('Set-Cookie',cookie(encrypted,Math.max(0,Math.floor((s.absolute-now())/1000))));}
   if(path==='/login'||path==='/claim'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);fields(body,path==='/login'?['email','password','tenant_id']:['access_token','refresh_token','tenant_id']);let tokens;
    if(path==='/login'){
     if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254||typeof body.password!=='string'||body.password.length<1||body.password.length>256)throw new ApiError(422,'CREDENTIALS_REQUIRED');
     try{tokens=(await upstream('/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email,password:body.password}})).data;}catch(error){if([401,422].includes(error.status))throw new ApiError(401,'AUTHENTICATION_FAILED');throw error;}
    }else{
     if(typeof body.access_token!=='string'||body.access_token.length>5000||typeof body.refresh_token!=='string'||body.refresh_token.length>500)throw new ApiError(422,'INVALID_TOKEN');
     tokens={access_token:body.access_token,refresh_token:body.refresh_token,expires_in:300};
    }
    if(!tokens?.access_token||!tokens?.refresh_token||!Number.isSafeInteger(tokens.expires_in)||tokens.expires_in<=0)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    const identity=await user(tokens.access_token),context=await rpc('connection_context',{},tokens.access_token);
    if(context?.user_id!==identity.id||!Array.isArray(context.memberships))throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    const membership=body.tenant_id?context.memberships.find(m=>m.tenant_id===body.tenant_id):context.memberships.length===1?context.memberships[0]:null;
    if(!membership)throw new ApiError(403,context.memberships.length>1?'TENANT_SELECTION_REQUIRED':'MEMBERSHIP_REQUIRED',context.memberships.length>1?{workspaces:context.memberships.map(m=>({id:m.tenant_id,name:m.tenant_name}))}:{});
    const id=randomUUID(),nonce=randomBytes(32).toString('base64url'),opened=await rpc('open_browser_session',{p_tenant:membership.tenant_id,p_id:id,p_nonce_sha256:sha(nonce)},tokens.access_token);
    const absolute=Date.parse(opened?.expires_at);if(opened?.id!==id||!Number.isSafeInteger(absolute)||absolute<=now()||absolute>now()+28900000)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    save({id,nonce,tenant:membership.tenant_id,access:tokens.access_token,refresh:tokens.refresh_token,expires:now()+tokens.expires_in*1000,absolute});return reply(200,{authenticated:true,member:membership,expires_at:absolute});
   }
   let session=read();
   if(path==='/refresh'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');fields(await bodyOf(req),[]);session=await refreshTokens(session);await valid(session);save(session);return reply(200,{authenticated:true,expires_at:session.absolute});
   }
   if(path==='/logout'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');fields(await bodyOf(req),[]);res.setHeader('Set-Cookie',cookie('',0));
    if(session.expires<=now())session=await refreshTokens(session);
    const revoked=await rpc('revoke_browser_session',{p_id:session.id,p_nonce_sha256:sha(session.nonce)},session.access);
    if(!revoked)throw new ApiError(503,'SESSION_REVOCATION_UNCONFIRMED');
    // Durable DB revocation protects this application even if the Auth logout request fails.
    let authRevoked=true;try{await upstream('/auth/v1/logout?scope=local',{token:session.access,method:'POST'});}catch{authRevoked=false;}
    return reply(200,{signed_out:true,server_session_revoked:true,auth_refresh_revocation_confirmed:authRevoked});
   }
   if(session.expires<=now()+10000)throw new ApiError(401,'SESSION_REFRESH_REQUIRED');
   const identity=await valid(session);
   if(path==='/me'&&req.method==='GET'){
    const context=await rpc('connection_context',{},session.access),member=context?.memberships?.find(m=>m.tenant_id===session.tenant);if(!member||context.user_id!==identity.id)throw new ApiError(401,'SESSION_REVOKED');return reply(200,{user:{id:identity.id,email:identity.email},member,expires_at:session.absolute,workflow_gate:'RULE_NOT_APPROVED'});
   }
   if(path==='/snapshot'&&req.method==='GET')return reply(200,{data:await rpc('original_ui_snapshot',{p_tenant:session.tenant},session.access)});
   if(path==='/password'&&req.method==='POST'){
    const body=await bodyOf(req);fields(body,['password']);if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new ApiError(422,'PASSWORD_TOO_SHORT');await upstream('/auth/v1/user',{token:session.access,method:'PUT',body:{password:body.password}});return reply(200,{password_updated:true});
   }
   const match=path.match(/^\/data\/([a-z]+)(?:\/([a-f0-9-]{36}))?$/),resource=match?.[1],id=match?.[2];
   if(!match||!Object.hasOwn(RESOURCE,resource)||id&&!UUID.test(id))throw new ApiError(404,'ROUTE_NOT_FOUND');
   const [table,select,searchColumn]=RESOURCE[resource];
   if(req.method==='GET'){
    if([...parsed.searchParams.keys()].some(k=>!['page','limit','q'].includes(k)))throw new ApiError(422,'QUERY_INVALID');
    const page=Number(parsed.searchParams.get('page')||1),limit=Number(parsed.searchParams.get('limit')||25),q=parsed.searchParams.get('q')||'';
    if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(limit)||limit<1||limit>100||q.length>80||q&&!/^[\p{L}\p{N} _.-]+$/u.test(q))throw new ApiError(422,'QUERY_INVALID');
    const params=new URLSearchParams({select:resource==='requests'&&id?select+',draft_signature_data':select,tenant_id:'eq.'+session.tenant,order:resource==='trials'?'legacy_id.asc':'created_at.desc,id.asc',limit:String(limit),offset:String((page-1)*limit)});if(id)params.set('id','eq.'+id);if(q&&searchColumn)params.set(searchColumn,'ilike.*'+q.replaceAll('_','\\_')+'*');
    const {data,response}=await upstream('/rest/v1/'+table+'?'+params,{token:session.access,profile:true,headers:{Prefer:'count=exact'}});if(!Array.isArray(data))throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');const range=response.headers.get('content-range'),total=range&&/\/(\d+)$/.test(range)?Number(range.split('/').pop()):null;return reply(200,{data,page,limit,total,source:'SUPABASE_BUSINESS'});
   }
   if(resource!=='requests'||!['POST','PATCH'].includes(req.method))throw new ApiError(403,'RULE_NOT_APPROVED');
   const body=await bodyOf(req,2097152);fields(body,req.method==='POST'?['id','data']:['expected_revision','data']);
   const requestId=req.method==='POST'?body.id:id;if(!UUID.test(requestId||'')||req.method==='POST'&&id||req.method==='PATCH'&&(!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1))throw new ApiError(422,'DRAFT_FIELDS_INVALID');
   if(!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new ApiError(422,'DRAFT_FIELDS_INVALID');
   dispatchedWrite=true;const data=await rpc(req.method==='POST'?'create_request_draft':'update_request_draft',{p_tenant:session.tenant,p_id:requestId,...(req.method==='PATCH'?{p_expected_revision:body.expected_revision}:{}),p_data:body.data},session.access);return reply(req.method==='POST'?201:200,{data});
  }catch(error){return reply(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'BUSINESS_SERVICE_UNAVAILABLE'},...(error.extra||{}),...(dispatchedWrite&&!(error instanceof ApiError)?{outcome_unknown:true}:{})});}
 };
}
export default createBusinessHandler();
