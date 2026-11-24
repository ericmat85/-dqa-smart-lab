import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessClient} from '../src/businessClient.mjs';
import {loadingSnapshot} from '../src/pageLoading.mjs';
const limits={readTimeoutMs:25,writeTimeoutMs:25,aiTimeoutMs:25};
const never=()=>new Promise(()=>{});
test('a transport that never settles times out and releases the loading indicator',async()=>{
 let calls=0,signal;const client=createBusinessClient(async(_url,options)=>{calls++;signal=options.signal;return never();},limits);
 const p=client.request('/snapshot');assert.equal(loadingSnapshot(),true);await assert.rejects(p,e=>e.code==='REQUEST_TIMEOUT'&&!e.outcomeUnknown);assert.equal(signal.aborted,true);assert.equal(calls,1);assert.equal(loadingSnapshot(),false);
});
test('the deadline also covers a stalled JSON body after response headers arrive',async()=>{
 const client=createBusinessClient(async()=>({ok:true,status:200,json:never}),limits);await assert.rejects(client.request('/me'),e=>e.code==='REQUEST_TIMEOUT');assert.equal(loadingSnapshot(),false);
});
for(const path of ['/data/requests','/execution/execute','/ai/generate'])test('timed-out '+path+' stays uncertain and is dispatched exactly once',async()=>{
 let calls=0;const client=createBusinessClient(async()=>{calls++;return never();},limits);await assert.rejects(client.request(path,{method:'POST',body:{}}),e=>e.code==='WRITE_OUTCOME_UNKNOWN'&&e.outcomeUnknown);assert.equal(calls,1);assert.equal(loadingSnapshot(),false);
});
test('cancelling a dispatched write preserves unknown outcome without retry',async()=>{
 const c=new AbortController();let sent;const gate=new Promise(r=>{sent=r;});let calls=0;const client=createBusinessClient(async()=>{calls++;sent();return never();},limits);const pending=client.request('/execution/execute',{method:'POST',signal:c.signal});await gate;c.abort();await assert.rejects(pending,e=>e.outcomeUnknown);assert.equal(calls,1);assert.equal(loadingSnapshot(),false);
});
test('an already cancelled request never dispatches and leaves no spinner',async()=>{
 const c=new AbortController();c.abort();let calls=0;const client=createBusinessClient(()=>{calls++;},limits);await assert.rejects(client.request('/data/requests',{method:'POST',signal:c.signal}),e=>e.name==='AbortError'&&!e.outcomeUnknown);assert.equal(calls,0);assert.equal(loadingSnapshot(),false);
});
test('a late 401 cannot refresh or replay an expired write',async()=>{
 let release,calls=0;const client=createBusinessClient(()=>{calls++;return new Promise(r=>{release=r;});},limits);await assert.rejects(client.request('/execution/execute',{method:'POST'}),e=>e.outcomeUnknown);release(Response.json({error:{code:'SESSION_REFRESH_REQUIRED'}},{status:401}));await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(loadingSnapshot(),false);
});
test('cancelling one reader does not cancel another reader sharing session refresh',async()=>{
 const c=new AbortController();let release,ready,refreshes=0,fresh=false;const started=new Promise(r=>{ready=r;});const client=createBusinessClient(async url=>{if(url.endsWith('/refresh')){refreshes++;ready();return new Promise(r=>{release=()=>{fresh=true;r(Response.json({authenticated:true}));};});}return fresh?Response.json({data:[]}):Response.json({error:{code:'SESSION_REFRESH_REQUIRED'}},{status:401});},{readTimeoutMs:1000,writeTimeoutMs:1000});
 const first=client.request('/me',{signal:c.signal}),second=client.request('/snapshot');await started;c.abort();await assert.rejects(first,e=>e.name==='AbortError');assert.equal(loadingSnapshot(),true);release();await second;assert.equal(refreshes,1);assert.equal(loadingSnapshot(),false);
});

test('background reads stay bounded without occupying the foreground indicator',async()=>{
 let signal;const client=createBusinessClient(async(_url,options)=>{signal=options.signal;return never();},limits);
 const pending=client.request('/snapshot',{background:true});assert.equal(loadingSnapshot(),false);await assert.rejects(pending,e=>e.code==='REQUEST_TIMEOUT');assert.equal(signal.aborted,true);assert.equal(loadingSnapshot(),false);
});
test('background option never hides writes and a foreground read remains visible',async()=>{
 const client=createBusinessClient(never,limits);const background=client.request('/snapshot',{background:true});
 const write=client.request('/execution/execute',{method:'POST',background:true});assert.equal(loadingSnapshot(),true);
 const foreground=client.request('/me');assert.equal(loadingSnapshot(),true);
 await Promise.all([assert.rejects(background,e=>e.code==='REQUEST_TIMEOUT'),assert.rejects(write,e=>e.outcomeUnknown),assert.rejects(foreground,e=>e.code==='REQUEST_TIMEOUT')]);assert.equal(loadingSnapshot(),false);
});
