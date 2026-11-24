import test from 'node:test';
import assert from 'node:assert/strict';
import {assetBytes} from '../src/assetBytes.mjs';
const limits={timeoutMs:25,message:'範本無法讀取。'};
test('asset loading times out on a hung body after headers and performs no retry',async()=>{let count=0,signal;await assert.rejects(assetBytes('/template.xlsx',{...limits,fetchImpl:async(_url,options)=>{signal=options.signal;count++;return {ok:true,arrayBuffer:()=>new Promise(()=>{})};}}),e=>e.code==='ASSET_TIMEOUT'&&e.message.includes('範本無法讀取。'));assert.equal(count,1);assert.equal(signal.aborted,true);});
test('asset cancellation preserves AbortError and settles a non-cooperative fetch',async()=>{const c=new AbortController();let ready;const started=new Promise(r=>{ready=r;});const p=assetBytes('/font.otf',{...limits,signal:c.signal,fetchImpl:()=>{ready();return new Promise(()=>{});}});await started;c.abort();await assert.rejects(p,e=>e.name==='AbortError');});
test('valid asset bytes are unchanged and non-success responses preserve caller errors',async()=>{const bytes=new Uint8Array([80,75,3,4]);const result=await assetBytes('/template.xlsx',{fetchImpl:async()=>new Response(bytes)});assert.deepEqual(new Uint8Array(result),bytes);await assert.rejects(assetBytes('/font.otf',{...limits,fetchImpl:async()=>new Response('',{status:503})}),/範本無法讀取。/);});

test('report layout assets release a stalled image body without changing valid image bytes',async()=>{
 const {formAssets}=await import('../src/labFormLayout.mjs');let calls=0,signal;
 await assert.rejects(formAssets(async(url,options)=>{calls++;if(url.includes('transparent')){signal=options.signal;return {ok:true,arrayBuffer:()=>new Promise(()=>{})};}return new Response(new Uint8Array([1,2,3]));},{photos:false,timeoutMs:25}),e=>e.code==='ASSET_TIMEOUT');assert.equal(calls,2);assert.equal(signal.aborted,true);
 const bytes=new Uint8Array([1,2,3]);const assets=await formAssets(async()=>new Response(bytes),{photos:false});assert.deepEqual(assets,{logo:bytes,footer:bytes});
});
