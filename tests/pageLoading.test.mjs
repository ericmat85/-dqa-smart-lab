import test from 'node:test';import assert from 'node:assert/strict';
import {beginPageLoading,loadingSnapshot,subscribeLoading} from '../src/pageLoading.mjs';
import {createBusinessClient} from '../src/businessClient.mjs';
test('pending concurrent work is reference counted and completion is idempotent',()=>{const seen=[],off=subscribeLoading(()=>seen.push(loadingSnapshot())),a=beginPageLoading(),b=beginPageLoading();assert.equal(loadingSnapshot(),true);a();a();assert.equal(loadingSnapshot(),true);b();assert.equal(loadingSnapshot(),false);off();assert.deepEqual(seen,[true,true,true,false]);});
test('client settles loading state on network failure without retrying a write',async()=>{let count=0;const c=createBusinessClient(async()=>{assert.equal(loadingSnapshot(),true);count++;throw Error('offline');});await assert.rejects(c.request('/recover',{method:'POST',body:{}}));assert.equal(count,1);assert.equal(loadingSnapshot(),false);});
