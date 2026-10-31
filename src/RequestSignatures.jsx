import {displayTaipei} from './requestWorkspace.mjs';
import {PaginatedList} from './Pagination.jsx';
import { getSignatureHistory } from './signatureHistory.mjs';

export function LmsReviewSignatures({ request }) {
  const records = getSignatureHistory(request).filter(record => typeof record.stage === 'number');
  if (!records.length) return null;
  return <section className="rq-detail-section"><h3>LMS 主管簽核</h3><div className="rq-detail-grid">
    <PaginatedList items={records}>{page=>page.map((record, index) => <div key={record.id || `${displayTaipei(record.at)}-${index}`}>
      <label>第 {record.stage} 階主管 · {record.decision}</label>
      <p>{record.actor || record.actorId} · {displayTaipei(record.at)}</p>
      {/^data:image\/(png|jpeg);base64,/i.test(record.signature || '') && <img src={record.signature} alt={`第${record.stage}階主管簽名`} style={{display:'block',width:'100%',maxWidth:240,height:64,objectFit:'contain',objectPosition:'left center',background:'#fff'}} />}
      {record.comment && <p>{record.comment}</p>}
    </div>)}</PaginatedList>
  </div></section>;
}

export function SignatureImage({ request, supervisor = false }) {
  const field = supervisor ? 'supervisorSignature' : 'requesterSignature';
  const stage = supervisor ? '直屬主管簽核' : '委託送出';
  const signature = request[field] ?? getSignatureHistory(request).filter(record => record.stage === stage).at(-1)?.signature;
  return /^data:image\/(png|jpeg);base64,/i.test(signature || '')
    ? <img src={signature} alt={supervisor ? '主管簽名' : '委託者簽名'} style={{ display: 'block', width: '100%', maxWidth: 300, height: 80, objectFit: 'contain', objectPosition: 'left center', background: '#fff', borderRadius: 4 }} />
    : <span>—</span>;
}

export default function RequestSignatures({ request }) {
  return <section className="rq-detail-section"><h3>委託簽名與主管簽核</h3><div className="rq-detail-grid">
    <div><label>委託者簽名</label><SignatureImage request={request} /></div>
    <div><label>簽名日期</label><p>{displayTaipei(request.requesterSignatureAt||request.requestDate)}</p></div>
    <div><label>主管簽名</label><SignatureImage request={request} supervisor /></div>
    <div><label>簽核日期</label><p>{displayTaipei(request.approvalDate)}</p></div>
    <div><label>主管簽核意見</label><p>{request.approvalNote || '—'}</p></div>
  </div></section>;
}
