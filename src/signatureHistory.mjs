export function getSignatureHistory(request = {}) {
  const records = Array.isArray(request.signatureRecords) ? [...request.signatureRecords] : [];
  const legacy = [
    { id: 'legacy-requester', stage: '委託送出', actor: request.requester, actorId: request.ownerId, signature: request.requesterSignature, at: request.requesterSignatureAt, decision: '送出' },
    { id: 'legacy-supervisor', stage: '直屬主管簽核', actor: request.approver, actorId: request.supervisorId, signature: request.supervisorSignature, at: request.supervisorSignatureAt, decision: request.status === '退件' ? '退回' : '核准', comment: request.approvalNote },
  ];
  for (const record of legacy) {
    if (record.signature && !records.some(r => r.signature === record.signature && (r.stage === record.stage || r.at === record.at))) records.push(record);
  }
  return records;
}

export function appendSignature(request, record) {
  return [...getSignatureHistory(request), { ...record, id: globalThis.crypto.randomUUID(), at: record.at || new Date().toISOString() }];
}

export function auditSignatures(events, requestId) {
  return events.filter(e => e.requestId === requestId && e.signature).map(e => ({ ...e, actorId: e.actorId, stage: e.action, at: e.at || e.time, decision: e.action, comment: e.reason }));
}
