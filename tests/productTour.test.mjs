import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProductTour,TOUR_STEPS} from '../src/productTour.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('one isolated tour case completes all nine real workflow stages, archive and distinct approvals',async()=>{
 const fontBytes=await readFile(new URL('../public/fonts/NotoSansCJKtc-Regular.otf',import.meta.url));
 const tour=createProductTour({signature,fontBytes});assert.equal(TOUR_STEPS.length,9);assert.equal(tour.stage,1);assert.equal(tour.pdf,null);
 const statuses=['已核准','待排程','待排程','執行中','已完成','待審核','待查閱','已結案'];
 for(let index=0;index<8;index++){const view=await tour.next();assert.equal(view.stage,index+2);assert.equal(view.request.status,statuses[index]);if(index<7)assert.equal(tour.pdf,null);}
 assert.equal(tour.views[3].lab.status,'待確認');assert.equal(tour.views[4].lab.status,'試驗中');assert.equal(tour.views[5].lab.status,'已完成');assert.equal(tour.views.length,9);assert.equal(tour.views[0].request.status,'待主管簽核');assert.equal(tour.views[8].request.status,'已結案');
 const report=await tour.repository.get('TOUR-DEMO-001');assert.equal(report.stage,'archived');assert.equal(new Set(report.approvals.map(a=>a.actorId)).size,2);assert.ok(tour.pdf.byteLength>1000);assert.equal(Buffer.from(tour.pdf).subarray(0,4).toString(),'%PDF');await tour.next();assert.equal(tour.views.length,9);
});
test('failed private transition rolls back and permits retry without duplicate approvals',async()=>{
 const tour=createProductTour({signature});const accounts=JSON.parse(tour.storage.getItem('dqa-shared-demo-accounts-v1'));tour.storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts.map(a=>({...a,status:'停用'}))));
 // First transition resolves the designated actor fixture; the existing LMS reviewer checks stored permissions.
 await tour.next();await assert.rejects(tour.next());assert.equal(tour.stage,2);assert.equal(tour.views.length,2);tour.storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));await tour.next();assert.equal(tour.stage,3);
});
