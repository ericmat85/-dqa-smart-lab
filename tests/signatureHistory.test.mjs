import test from 'node:test';
import assert from 'node:assert/strict';
import { getSignatureHistory, appendSignature, auditSignatures } from '../src/signatureHistory.mjs';
import { mergeImportedRequests, readStoredRequests, writeStoredRequests } from '../src/requestStorage.mjs';

const signature = 'data:image/png;base64,example';
test('legacy requester and supervisor signatures remain viewable', () => {
  const request = { requester:'委託人', requesterSignature:signature, requesterSignatureAt:'2026-10-28T01:00:00Z', supervisorSignature:signature, supervisorSignatureAt:'2026-10-28T02:00:00Z', approver:'主管', status:'退件', approvalNote:'補件' };
  const history = getSignatureHistory(request);
  assert.equal(history.length,2);
  assert.equal(history[1].decision,'退回');
  assert.equal(history[1].comment,'補件');
  assert.equal(request.signatureRecords,undefined);
});
test('resubmission appends a signature and retains prior rejection without duplicates', () => {
  const original={requesterSignature:signature,requesterSignatureAt:'old',signatureRecords:[{stage:'委託送出',signature,at:'slightly-different',actor:'委託人'},{stage:'直屬主管簽核',signature:'rejected',decision:'退回'}]};
  const records=appendSignature(original,{stage:'委託送出',signature,actor:'委託人',decision:'重新送出'});
  assert.equal(records.length,3);
  assert.equal(records[1].decision,'退回');
  assert.equal(records[2].decision,'重新送出');
  assert.ok(records[2].id);
  assert.equal(original.signatureRecords.length,2);
  assert.equal(getSignatureHistory({...original,signatureRecords:records}).length,3);
});
test('import and persistence retain the complete signature history', () => {
  const imported={id:'request1',source:'electronic-request',history:[],signatureRecords:appendSignature({},{stage:'委託送出',signature,actorId:'owner'})};
  const merged=mergeImportedRequests([{id:'local',history:[]}],[imported]);
  let value;
  const storage={setItem:(key,data)=>{value=data;},getItem:()=>value};
  assert.equal(writeStoredRequests(merged,storage),true);
  assert.deepEqual(readStoredRequests([],storage)[0].signatureRecords,imported.signatureRecords);
});
test('lab records are isolated per case and preserve actor, action, and reason', () => {
  const events=[{requestId:'one',signature,actor:'工程師',actorId:'u1',action:'提交試驗報告',at:'timestamp',reason:'report.xlsx'},{requestId:'two',signature},{requestId:'one',action:'舊紀錄'}];
  const records=auditSignatures(events,'one');
  assert.equal(records.length,1);
  assert.equal(records[0].stage,'提交試驗報告');
  assert.equal(records[0].comment,'report.xlsx');
  assert.equal(records[0].actorId,'u1');
  assert.deepEqual(getSignatureHistory({}),[]);
});
