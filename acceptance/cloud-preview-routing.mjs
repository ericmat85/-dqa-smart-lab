// Real HTTP acceptance against an immutable protected Vercel Preview.
// Uses only an existing authorized storage state / automation secret; creates none.
// Never sends an authenticated E4 Provider request or outputs cookie/token values.
import {request} from '@playwright/test';
import fs from 'node:fs';
const url=new URL(process.env.PREVIEW_URL||'https://dqa-smart-gvmyue4k0-ericmat85.vercel.app');
const rows=[];let ctx,anonymousApp;
const output={scope:'REAL_CLOUD_ROUTE_ACCEPTANCE_NOT_LOCAL_HANDLER',preview_url:url.origin,status:'NOT_TESTED',rows,paid_provider_requests:0};
const resultFile=process.env.ROUTING_RESULT_FILE||new URL('../../CLOUD_ROUTE_TEST_RESULTS.json',import.meta.url);
const headers={};
if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const options={baseURL:url.origin,extraHTTPHeaders:headers,maxRedirects:0,timeout:25000};
if(process.env.PREVIEW_STORAGE_STATE)options.storageState=process.env.PREVIEW_STORAGE_STATE;
if(process.env.HTTPS_PROXY)options.proxy={server:process.env.HTTPS_PROXY,bypass:process.env.NO_PROXY};
async function inspect(response){
 let data;try{data=await response.json();}catch{data=null;}
 const h=response.headers(),trace=data?.trace_id||h['x-trace-id'];
 const safeTrace=typeof trace==='string'&&/^I-[A-Za-z0-9_-]{1,80}$/.test(trace)?trace:null;
 return {http:response.status(),content_type:h['content-type']?.split(';')[0]||null,trace_id:safeTrace,error_code:typeof data?.error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(data.error.code)?data.error.code:null,app_response:Boolean(safeTrace),resolved_route:['/session','/ui/live/E4','REJECTED'].includes(h['x-preview-route'])?h['x-preview-route']:null,pathname:['/api/preview/session','/api/preview/session/','/api/preview/[...path]','/api/preview/[...path].js','/api/preview/ui/live/E4'].includes(h['x-preview-pathname'])?h['x-preview-pathname']:null,route_source:/^[A-Z_]{1,50}$/.test(h['x-preview-route-source']||'')?h['x-preview-route-source']:null};
}
async function check(name,response,expected){const result=await inspect(response);rows.push({check:name,...result,expected,status:result.http===expected&&result.app_response?'CLOUD_PASS':'FAIL'});if(rows.at(-1).status==='FAIL')throw Error('ACCEPTANCE_FAILED');return result;}
try{
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!/^dqa-smart(?:-lab)?-[a-z0-9]{8,}-ericmat85\.vercel\.app$/.test(url.hostname))throw Error('IMMUTABLE_PREVIEW_URL_REQUIRED');
 ctx=await request.newContext(options);
 const first=await ctx.get('/api/preview/session');const evidence=await inspect(first);
 if(!evidence.app_response&&[301,302,303,307,308,401,403].includes(evidence.http)){
  rows.push({check:'protection gate',...evidence,status:'BLOCKED_AUTH_SESSION_UNAVAILABLE'});output.status='BLOCKED_AUTH_SESSION_UNAVAILABLE';
 }else{
  await check('Session GET method',first,405);
  const noisySession='/api/preview/session?_preview_probe=synthetic';
  await check('Session GET with unrelated Query',await ctx.get(noisySession),405);
  const valid={system:'lms',accountId:'DEMO-LEVEL1',password:'demo1234'};
  await check('invalid account',await ctx.post('/api/preview/session',{headers:{Origin:url.origin},data:{...valid,accountId:'INVALID-ACCOUNT'}}),401);
  await check('invalid Origin',await ctx.post('/api/preview/session',{headers:{Origin:'https://invalid.example'},data:valid}),403);
  await check('invalid account with unrelated Query',await ctx.post(noisySession,{headers:{Origin:url.origin},data:{...valid,accountId:'INVALID-ACCOUNT'}}),401);
  await check('invalid Origin with unrelated Query',await ctx.post(noisySession,{headers:{Origin:'https://invalid.example'},data:valid}),403);
  const login=await ctx.post('/api/preview/session',{headers:{Origin:url.origin},data:valid});await check('valid Demo Session',login,200);
  const cookie=login.headers()['set-cookie']||'';const flags={present:Boolean(cookie),secure:/;\s*Secure(?:;|$)/i.test(cookie),http_only:/;\s*HttpOnly(?:;|$)/i.test(cookie),same_site_strict:/;\s*SameSite=Strict(?:;|$)/i.test(cookie),path_api_preview:/;\s*Path=\/api\/preview(?:;|$)/i.test(cookie)};
  rows.push({check:'Cookie security flags',...flags,status:Object.values(flags).every(Boolean)?'CLOUD_PASS':'FAIL'});if(rows.at(-1).status==='FAIL')throw Error('COOKIE_FLAGS_FAILED');
  let slash=await ctx.get('/api/preview/session/');
  if([307,308].includes(slash.status())&&new URL(slash.headers().location,url).href===url.origin+'/api/preview/session')slash=await ctx.get('/api/preview/session');
  await check('Session trailing slash',slash,405);
  await check('valid Demo Session with unrelated Query',await ctx.post(noisySession,{headers:{Origin:url.origin},data:valid}),200);
  await check('inconsistent path hint rejected',await ctx.get('/api/preview/session?path=ui/live/E4&_preview_probe=synthetic'),404);
  const state=await ctx.storageState();state.cookies=state.cookies.filter(c=>!c.name.startsWith('dqa_preview_'));
  anonymousApp=await request.newContext({...options,storageState:state});
  await check('E4 route exists and rejects unsigned app Session',await anonymousApp.post('/api/preview/ui/live/E4',{headers:{Origin:url.origin,'X-Preview-System':'lms'},data:{synthetic:true,question:'SYNTH ROUTE CHECK ONLY'}}),401);
  await check('E4 unrelated Query still denies unsigned app Session',await anonymousApp.post('/api/preview/ui/live/E4?_preview_probe=synthetic&role=manager',{headers:{Origin:url.origin,'X-Preview-System':'lms'},data:{synthetic:true,question:'SYNTH ROUTE CHECK ONLY'}}),401);
  await ctx.post('/api/preview/session',{headers:{Origin:url.origin},data:{system:'lms',logout:true}});
  output.status='CLOUD_ROUTE_PASS_NOT_PROVIDER_PASS';
 }
}catch(e){output.status='FAIL';output.failure=String(e.message).startsWith('ACCEPTANCE_')?'ACCEPTANCE_FAILED':e.message==='IMMUTABLE_PREVIEW_URL_REQUIRED'?e.message:'TRANSPORT_OR_ACCEPTANCE_FAILED';}
finally{await anonymousApp?.dispose();await ctx?.dispose();fs.writeFileSync(resultFile,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));if(!output.status.startsWith('CLOUD_ROUTE_PASS'))process.exitCode=1;}
