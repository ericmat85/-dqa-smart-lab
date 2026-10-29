import { canReview } from './demoPermissions.mjs';
import { appendSignature, getSignatureHistory } from './signatureHistory.mjs';

export const REQUEST_KEY = 'dqa-request-demo-v2';
export function reviewRevision(request) {
  return JSON.stringify([request.status, request.requesterSignatureAt, request.supervisorSignatureAt, request.updatedAt, request.lmsReview]);
}

export function reviewElectronicRequest({ id, accountId, expectedRevision, returnIt, signature, comment, now=Date.now() }, storage = window.localStorage) {
  const requests = JSON.parse(storage.getItem(REQUEST_KEY) || 'null');
  if (!Array.isArray(requests)) throw Error('無法讀取電子委託資料，尚未提交審查。');
  const request = requests.find(r => r.id === id);
  if (!request || reviewRevision(request) !== expectedRevision) throw Error('案件已更新，請關閉後重新開啟案件再審查。');
  const accounts = JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1') || '[]');
  const actor = Array.isArray(accounts) ? accounts.find(a => a.id === accountId) : null;
  const previous = request.lmsReview || { approval: 0, approvalRecords: [], history: [] };
  if (request.status !== '已核准' || !canReview(actor, {
    status: '待審查', approval: previous.approval,
    participantIds: [request.ownerId, request.supervisorId], approvals: previous.approvalRecords,
  },storage)) throw Error('此帳號無權審核目前階段，或已參與本案件簽核。');
  if (!returnIt && !/^data:image\/(png|jpeg);base64,/i.test(signature || '')) throw Error('核准前請先完成電子簽名。');
  const reason = String(comment || '').trim();
  if (returnIt && !reason) throw Error('退回原因必填。');
  const stage = previous.approval + 1;
  const at = new Date(now).toISOString();
  const decision = returnIt ? '退回' : '核准';
  const lmsReview = {
    approval: returnIt ? 0 : stage,
    status: returnIt ? '退回' : stage >= 2 ? '完成' : '待審查',
    approvalRecords: [...(previous.approvalRecords || []), { stage, actorId: actor.id, action: decision, at }],
    history: [...(previous.history || []), `${at} ${actor.name} 第${stage}階主管${decision}${reason ? `：${reason}` : ''}`],
  };
  const next = {
    ...request, lmsReview, updatedAt: at,
    status: returnIt ? '退件' : stage >= 2 ? '待排程' : '已核准',
    approvalNote: returnIt ? `LMS 第${stage}階主管退回：${reason}` : request.approvalNote,
    signatureRecords: appendSignature(request, { stage, actor: actor.name, actorId: actor.id, signature: signature || '', decision, comment: reason, at }),
  };
  // A single source write saves decision, signatures, and status together.
  // On failure the caller keeps its form open for retry.
  storage.setItem(REQUEST_KEY, JSON.stringify(requests.map(r => r.id === id ? next : r)));
  return next;
}

export function readElectronicRequestsForLms(storage = window.localStorage) {
 try {
  const data = JSON.parse(storage.getItem("dqa-request-demo-v2") || "[]");
  if (!Array.isArray(data)) return [];
  const list = value => Array.isArray(value) ? value : value ? [String(value)] : [];
  return data.filter(r => r && r.id && (r.status === "已核准" || r.lmsReview)).map(r => ({
   id:r.id, sourceRevision:reviewRevision(r), participantIds:[r.ownerId,r.supervisorId], approvalRecords:r.lmsReview?.approvalRecords || [], signatureRecords:getSignatureHistory(r), source:"electronic-request", title:list(r.testItems).join("、") || "未填寫試驗項目", department:r.department || "—", applicant:r.requester || "—", priority:r.priority || "—", submitted:r.createdAt || "—", status:r.lmsReview?.status || "待審查", approval:r.lmsReview?.approval || 0,
   productCode:r.productCode || r.product || "", productType:r.productType || "", customerName:r.customer || "", customerPartNo:r.customerPartNo || "", requestedDate:r.dueDate || "", quantity:r.quantity || "", intentions:list(r.purpose), sampleSource:list(r.sampleSource), productVersion:r.productVersion || "", pcbaVersion:r.pcbaVersion || "", softwareVersion:r.softwareVersion || "", manufactureDate:r.manufactureDate || "", specification:r.specification || "", judgment:r.judgementCriteria || "", remarks:r.notes || "", history:[`${r.approvalDate || r.createdAt || "日期未提供"} ${r.approver || "申請人主管"}完成簽核`, ...(r.lmsReview?.history || [])]
  }));
 } catch { return []; }
}
