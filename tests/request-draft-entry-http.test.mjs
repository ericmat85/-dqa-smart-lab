import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createBusinessHandler,sealSession,COOKIE} from '../server/business/handler.mjs';
import handler from '../server/business/handler.mjs';
import entry from '../api/business/data/requests.js';
import {createBusinessClient} from '../src/businessClient.mjs';
const T='a0000000-0000-0000-0000-000000000001',ID='ab000000-0000-4000-8000-000000000001',U='10000000-0000-0000-0000-000000000001',origin='https://preview.test';
const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:origin,BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.synthetic',BUSINESS_COOKIE_KEY:Buffer.alloc(32,3).toString('base64url')};
const calls=[];let row;
const fixed=createBusinessHandler({env,fetchImpl:async(raw,options)=>{
 const url=new URL(raw),body=options.body?JSON.parse(options.body):null;calls.push({url,body});assert.equal(url.origin,env.BUSINESS_SUPABASE_URL);
 if(url.pathname==='/auth/v1/user')return Response.json({id:U,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
 if(url.pathname.endsWith('/check_browser_session'))return Response.json(T);
 if(url.pathname.endsWith('/create_request_draft')){assert.equal(body.p_tenant,T);row={id:body.p_id,...body.p_data,status:'DRAFT',revision:1};return Response.json(row);}
 if(url.pathname.endsWith('/update_request_draft')){assert.equal(body.p_tenant,T);assert.equal(body.p_id,ID);assert.equal(body.p_expected_revision,1);row={...row,...body.p_data,revision:2};return Response.json(row);}
 if(url.pathname==='/rest/v1/requests'){assert.equal(url.searchParams.get('tenant_id'),'eq.'+T);assert.equal(url.searchParams.get('id'),'eq.'+ID);return Response.json([row]);}
 throw Error('Unexpected synthetic upstream');
}});
const cookie=COOKIE+'='+sealSession({id:crypto.randomUUID(),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
const server=createServer((req,res)=>{if(new URL(req.url,'http://local').pathname!=='/api/business/data/requests'){res.statusCode=404;return res.end('Unmapped fixture route');}res.status=n=>{res.statusCode=n;return res;};res.json=v=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(v));};void fixed(req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
async function call(suffix='',{method='GET',body,authenticated=true,requestOrigin=origin}={}){const res=await fetch(base+'/api/business/data/requests'+suffix,{method,headers:{Origin:requestOrigin,...(authenticated?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};}
test('fixed draft entry exports existing business security handler',()=>assert.equal(entry,handler));
test('request creation succeeds without requester U through streamed HTTP body',async()=>{const r=await call('',{method:'POST',body:{id:ID,data:{product_code:'SYNTHETIC',quantity:3}}});assert.equal(r.status,201);assert.equal(r.body.data.id,ID);assert.ok(!Object.hasOwn(calls.find(c=>c.url.pathname.endsWith('/create_request_draft')).body.p_data,'sample_space_units'));});
test('fixed row query routes GET and PATCH to the same tenant-bound draft',async()=>{const edit=await call('?id='+ID,{method:'PATCH',body:{expected_revision:1,data:{customer_name:'Synthetic customer'}}});assert.equal(edit.status,200);const read=await call('?id='+ID);assert.equal(read.status,200);assert.equal(read.body.data[0].revision,2);});
test('invalid, duplicated and POST row IDs fail before any data write',async()=>{for(const [suffix,method] of [['?id=bad','GET'],['?id='+ID+'&id='+ID,'GET'],['?id='+ID,'POST']])assert.equal((await call(suffix,{method,body:method==='POST'?{id:ID,data:{}}:undefined})).status,422);});
test('fixed draft endpoint preserves authentication and origin checks',async()=>{assert.equal((await call('',{authenticated:false})).status,401);assert.equal((await call('',{method:'POST',requestOrigin:'https://other.test',body:{id:ID,data:{}}})).status,403);});
test('business client uses fixed row endpoint without retrying a non-JSON write',async()=>{let requests=[];const client=createBusinessClient(async(url,options)=>{requests.push({url,options});return new Response('<html>synthetic unknown result</html>',{status:502});});await assert.rejects(client.request('/data/requests/'+ID,{method:'PATCH',body:{expected_revision:2,data:{}}}),e=>e.outcomeUnknown===true);assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/business/data/requests?id='+ID);});
