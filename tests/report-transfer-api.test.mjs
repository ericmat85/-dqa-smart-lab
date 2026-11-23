import test from 'node:test';import assert from 'node:assert/strict';
import {createBusinessHandler,sealSession,COOKIE} from '../server/business/handler.mjs';
import {REPORT_FILE_MAX_BYTES as MAX} from '../src/reportFilePolicy.mjs';
const id=n=>'fa000000-0000-4000-8000-'+String(n).padStart(12,'0'),T=id(1),Q=id(2),V=id(3),object='dqa-business-reports/'+T+'/'+Q+'/'+V+'.xlsx';
function fixture(){
 const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:'https://preview.test',BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.fake',BUSINESS_COOKIE_KEY:Buffer.alloc(32,8).toString('base64url')};
 const state={size:MAX,foreign:false,badUrl:false},calls=[];const handler=createBusinessHandler({env,fetchImpl:async(raw,options={})=>{
  const url=new URL(raw),body=options.body?JSON.parse(options.body):{};calls.push({path:url.pathname,body});assert.equal(url.origin,env.BUSINESS_SUPABASE_URL);const json=v=>Response.json(v);
  if(url.pathname==='/auth/v1/user')return json({id:id(4),email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(url.pathname.endsWith('check_browser_session'))return json(T);
  if(url.pathname.endsWith('human_report_file')){assert.equal(body.p_tenant,T);assert.equal(body.p_id,V);return json(state.foreign?null:{id:V,bucket:'dqa-business-reports',object_key:object.slice('dqa-business-reports/'.length),sha256:'a'.repeat(64),byte_size:state.size,mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
  if(url.pathname==='/storage/v1/object/sign/'+object){assert.equal(body.expiresIn,60);return json({signedURL:state.badUrl?'https://wrong.invalid/secret':'/object/sign/'+object+'?token=SYNTHETIC'});}
  if(url.pathname.endsWith('prepare_report_upload'))return json({id:V,bucket:'dqa-business-reports',object_key:object.slice('dqa-business-reports/'.length),byte_size:body.p_size,mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if(url.pathname==='/storage/v1/object/upload/sign/'+object)return json({url:'/object/upload/sign/'+object+'?token=SYNTHETIC'});
  throw Error('Unexpected upstream request: '+url.pathname);
 }});
 const cookie=COOKIE+'='+sealSession({id:id(5),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
 async function call(path,{body,authenticated=true,rewritten=false}={}){let packet;const headers={};await handler({url:rewritten?'/api/business?path='+encodeURIComponent(path.slice(1)):'/api/business'+path,...(rewritten?{query:{path:path.slice(1)}}:{}),method:body?'POST':'GET',body,headers:{origin:env.BUSINESS_ORIGIN,...(authenticated?{cookie}:{}),...(body?{'content-type':'application/json'}:{})}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(p){packet={status:this.statusCode,body:p,headers};}});return packet;}
 return {state,calls,call};
}
const upload={id:V,request_id:Q,kind:'REPORT',file_name:'synthetic.xlsx',byte_size:MAX,sha256:'a'.repeat(64),request_revision:1,report_revision:0};
test('20 MiB upload metadata is accepted and signed without routing bytes through the account API',async()=>{const f=fixture(),r=await f.call('/execution/upload',{body:upload});assert.equal(r.status,200,JSON.stringify(r.body));assert.match(r.body.data.url,/\/object\/upload\/sign\//);assert.equal(f.calls.find(c=>c.path.endsWith('prepare_report_upload')).body.p_size,MAX);});
test('over-limit upload is rejected before any upload intent or signed URL',async()=>{const f=fixture(),r=await f.call('/execution/upload',{body:{...upload,byte_size:MAX+1}});assert.equal(r.status,422);assert.equal(r.body.error.code,'HUMAN_FILE_INVALID');assert.ok(!f.calls.some(c=>/prepare_report_upload|\/storage\//.test(c.path)));});
test('download authorization returns a 60-second private URL and immutable hash/size; no report bytes cross the BFF',async()=>{const f=fixture(),r=await f.call('/execution/download/'+V);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.byte_size,MAX);assert.equal(r.body.data.sha256,'a'.repeat(64));assert.equal(r.body.data.expires_in,60);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!f.calls.some(c=>c.path.includes('/object/authenticated/')));assert.match(r.body.data.url,/\/storage\/v1\/object\/sign\/dqa-business-reports\//);});
test('unauthenticated or inaccessible cases cannot obtain a signed download',async()=>{for(const foreign of [false,true]){const f=fixture();f.state.foreign=foreign;const r=await f.call('/execution/download/'+V,{authenticated:foreign});assert.equal(r.status,foreign?404:401);assert.ok(!f.calls.some(c=>c.path.startsWith('/storage/')));}});
test('over-limit saved metadata and unexpected signing URLs fail closed',async()=>{const f=fixture();f.state.size=MAX+1;assert.equal((await f.call('/execution/download/'+V)).status,422);assert.ok(!f.calls.some(c=>c.path.startsWith('/storage/')));const g=fixture();g.state.badUrl=true;assert.equal((await g.call('/execution/download/'+V)).status,502);});

test('signed download route also survives the deployed fixed-handler rewrite',async()=>{const f=fixture(),r=await f.call('/execution/download/'+V,{rewritten:true});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.byte_size,MAX);});
