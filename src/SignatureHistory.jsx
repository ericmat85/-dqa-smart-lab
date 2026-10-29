import {PaginatedList} from './Pagination.jsx';
import { getSignatureHistory } from './signatureHistory.mjs';
import './SignatureInput.css';

export default function SignatureHistory({ request, records }) {
  const history = records ?? getSignatureHistory(request);
  return <section className="dqa-signature-history" aria-label="簽名歷程">
    <h3>簽名歷程</h3>
    <p style={{ fontSize: 12 }}>本機 Demo 紀錄，依簽署順序顯示；清除網站資料後將無法保留。</p>
    {!history.length ? <p>尚無簽名紀錄；舊示範資料未提供簽名圖片。</p> : <PaginatedList items={history}>{page=>page.map((record, index) => <article className="dqa-signature-record" key={record.id || `${record.at}-${index}`}>
      <strong>{typeof record.stage === 'number' ? `LMS 第 ${record.stage} 階主管審查` : record.stage || '簽署'} · {record.decision || '已簽署'}</strong>
      <p>簽署人：{record.actor || record.actorId || '舊紀錄未提供'}{record.actor && record.actorId ? `（${record.actorId}）` : ''}</p>
      <p>簽署時間：{record.at || '舊紀錄未提供'}</p>
      {record.comment && <p>意見／原因：{record.comment}</p>}
      {/^data:image\/(png|jpeg);base64,/i.test(record.signature || '') ? <a href={record.signature} download={`signature-${record.id || index}.${/^data:image\/jpeg/i.test(record.signature) ? 'jpg' : 'png'}`} aria-label={`下載第 ${index + 1} 筆簽名`}><img src={record.signature} alt={`${record.actor || record.actorId || '簽署人'}的簽名`} /></a> : <p>此紀錄沒有可顯示的簽名圖片。</p>}
    </article>)}</PaginatedList>}
  </section>;
}
