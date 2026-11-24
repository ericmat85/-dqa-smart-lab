import test from 'node:test';
import assert from 'node:assert/strict';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
test('CI skips optional success evidence while local/explicit review captures the original target and options',async()=>{
 const calls=[],target={screenshot:async options=>{calls.push(options);}},options={path:'example.png',fullPage:true};assert.deepEqual(await captureBrowserEvidence(target,options,{ci:true,captureSuccess:false}),{captured:false});assert.equal(calls.length,0);assert.deepEqual(await captureBrowserEvidence(target,options,{ci:false,captureSuccess:false}),{captured:true,path:'example.png'});await captureBrowserEvidence(target,options,{ci:true,captureSuccess:true});assert.deepEqual(calls,[options,options]);
});
test('an enabled review capture preserves screenshot errors instead of marking them successful',async()=>{
 await assert.rejects(captureBrowserEvidence({screenshot:async()=>{throw Error('capture failed');}},{path:'x.png'},{ci:true,captureSuccess:true}),/capture failed/);
});
