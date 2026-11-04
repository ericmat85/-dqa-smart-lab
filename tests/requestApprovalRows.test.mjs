import test from 'node:test';
import assert from 'node:assert/strict';
import {requestApprovalRows,requestActionLabel} from '../src/requestApprovalRows.mjs';
test('pending approval shares the request list without altering original review state',()=>{
 const requests=[{id:'R1',title:'高溫試驗',status:'完成',productCode:'P1'},{id:'R2',status:'待審查'}];
 const operations=[{id:'OP',requestId:'R1',action:'interrupt',status:'待審核',at:'2026-10-29T00:00:00Z',actor:'工程師',reason:'故障'}];
 const rows=requestApprovalRows(requests,operations);assert.equal(rows.length,2);assert.equal(rows[0].status,'待核准');assert.equal(rows[0].operationId,'OP');assert.equal(rows[0].productCode,'P1');assert.equal(rows[1].status,'待審查');assert.equal(requests[0].status,'完成');
 assert.equal(requestApprovalRows(requests,[{...operations[0],status:'已核准'}]).length,1);
});
test('cancel returns stay outside approval list and schedule fields fill missing request metadata',()=>{
 const rows=requestApprovalRows([],[{id:'C',requestId:'C1',action:'cancel',status:'已退回排程'},{id:'I',requestId:'R',action:'interrupt',status:'待審核',actor:'Engineer',at:'2026-10-29',reason:'Reason'}],[{requestId:'R',productCode:'P',title:'Test'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].productCode,'P');assert.equal(rows[0].title,'Test');
});
test('an approval replaces a duplicate pending request row in the unified list',()=>{
 const rows=requestApprovalRows([{id:'R',status:'待審查'}],[{id:'I',requestId:'R',action:'interrupt',status:'待審核',at:'2026-10-29'}]);assert.equal(rows.length,1);assert.equal(rows[0].status,'待核准');
});
test('cancellation applications are pending approval alongside interruptions and borrowing',()=>{
 const rows=requestApprovalRows([],[{id:'C',requestId:'R1',action:'cancel',status:'待審核',actor:'A',at:'2026-10-29'}],[],[{id:'BOR1',status:'待核准',requester:'B',createdAt:'2026-10-29'}]);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.status==='待核准'));
});

test('request and report action labels follow the pending level without changing source rows',()=>{
 const requests=[{id:'R1',status:'待審查',approval:0},{id:'R2',status:'待審查',approval:1}];
 const reports=[{requestId:'REPORT2',stage:'level2'},{requestId:'REPORT3',stage:'level3'}];
 const before=JSON.stringify({requests,reports});const rows=requestApprovalRows(requests,[],[],[],reports);
 assert.deepEqual(rows.map(requestActionLabel),['LV2審核','LV3審核','LV1審查','LV2審查']);
 assert.equal(JSON.stringify({requests,reports}),before);
 assert.equal(requestActionLabel({operationId:'borrow:1',status:'待核准'}),'核准');
 assert.equal(requestActionLabel({status:'退回'}),'補件');assert.equal(requestActionLabel({status:'完成'}),'查看');
});
