import test from 'node:test';
import assert from 'node:assert/strict';
import {createTourSeed} from '../src/productTour.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('tour starts with one pending request and no automatically completed business actions',()=>{
 const {storage}=createTourSeed({signature}),read=key=>JSON.parse(storage.getItem(key)||'[]');const requests=read('dqa-request-demo-v2');assert.equal(requests.length,1);assert.equal(requests[0].id,'TOUR-DEMO-001');assert.equal(requests[0].status,'待主管簽核');assert.equal(requests[0].signatureRecords.length,1);assert.equal(requests[0].lmsReview,undefined);
 for(const key of ['dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa-lms-reviews-v1'])assert.deepEqual(read(key),[]);assert.equal(read('dqa-equipment-demo-v1').length,1);assert.equal(read('dqa-equipment-demo-v1')[0].status,'待機中');assert.notEqual(requests[0].ownerId,requests[0].supervisorId);
 const second=createTourSeed({signature}).storage;storage.setItem('test','private');assert.equal(second.getItem('test'),null);assert.throws(()=>createTourSeed({signature:'not-an-image'}));
});
