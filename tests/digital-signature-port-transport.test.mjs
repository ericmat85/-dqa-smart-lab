import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {SIGNATURE_PORT_DEFAULTS} from '../src/digitalSignaturePortConfig.mjs';
import {requestPortJSON} from '../server/business/digitalSignaturePort.mjs';

const plan={config:{...SIGNATURE_PORT_DEFAULTS,base_url:'https://signer.example.invalid/dqa',timeout_seconds:2},host:'signer.example.invalid',pinned:{address:'93.184.216.34',family:4},authorization:'Bearer SYNTHETIC_TRANSPORT_TOKEN'};
// Instrument the Node transport without connecting sockets, bypassing TLS, or exposing secrets.
function transport(t,{status=200,type='application/json',chunks=['{"ok":true}'],error,hang=false}={}){
 const captured={};t.mock.method(https,'request',(url,options,receive)=>{
  captured.url=url;captured.options=options;const req=new EventEmitter();req.write=bytes=>{captured.body=Buffer.from(bytes);};
  req.destroy=e=>{queueMicrotask(()=>{req.emit('error',e);req.emit('close');});};
  req.end=()=>queueMicrotask(()=>{if(error){req.emit('error',Error(error));req.emit('close');return;}if(hang)return;const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':type};res.destroy=()=>{res.destroyed=true;};receive(res);if(!res.destroyed){for(const chunk of chunks){res.emit('data',Buffer.from(chunk));if(res.destroyed)break;}if(!res.destroyed)res.emit('end');}req.emit('close');});return req;
 });return captured;
}
test('HTTPS transport pins approved DNS, verifies TLS and binds exact endpoint path',async t=>{
 const out=transport(t);assert.deepEqual(await requestPortJSON(plan,'/v1/capabilities'),{ok:true});assert.equal(out.url.href,'https://signer.example.invalid/dqa/v1/capabilities');assert.equal(out.options.rejectUnauthorized,true);assert.equal(out.options.headers.Authorization,'Bearer SYNTHETIC_TRANSPORT_TOKEN');
 const found=await new Promise((resolve,reject)=>out.options.lookup(plan.host,{all:true},(e,rows)=>e?reject(e):resolve(rows)));assert.deepEqual(found,[plan.pinned]);
 await assert.rejects(new Promise((resolve,reject)=>out.options.lookup('different.example.invalid',{},(e,address)=>e?reject(e):resolve(address))),/ADDRESS_NOT_ALLOWED/);
});
test('HTTPS transport emits JSON POST with byte length and no query credentials',async t=>{const out=transport(t);await requestPortJSON(plan,'/v1/verify',{document:'SYNTHETIC'});assert.equal(out.options.method,'POST');assert.equal(out.options.headers['Content-Type'],'application/json');assert.equal(out.options.headers['Content-Length'],out.body.length);assert.equal(out.url.search,'');assert.deepEqual(JSON.parse(out.body),{document:'SYNTHETIC'});});
test('redirect responses fail instead of following a new credential destination',async t=>{transport(t,{status:302});await assert.rejects(requestPortJSON(plan,'/v1/capabilities'),/REDIRECT_DENIED/);});
test('HTML, malformed JSON and oversized responses never count as successful checks',async t=>{for(const response of [{type:'text/html'}, {chunks:['not json']}, {chunks:['x'.repeat(131073)]}]){transport(t,response);await assert.rejects(requestPortJSON(plan,'/v1/capabilities'),/RESPONSE_INVALID/);t.mock.restoreAll();}});
test('TLS/socket error details are replaced with a safe code',async t=>{transport(t,{error:'SYNTHETIC_CERT_OR_KEY_DETAILS'});await assert.rejects(requestPortJSON(plan,'/v1/capabilities'),e=>e.code==='SIGNATURE_PORT_UNAVAILABLE'&&!e.message.includes('SYNTHETIC'));});
test('HTTPS request has a hard time limit even if the service never replies',async t=>{transport(t,{hang:true});await assert.rejects(requestPortJSON({...plan,config:{...plan.config,timeout_seconds:.01}},'/v1/capabilities'),e=>e.code==='SIGNATURE_PORT_TIMEOUT');});
