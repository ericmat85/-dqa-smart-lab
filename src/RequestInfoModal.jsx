import {ReportCasePanel} from './ReportUi.jsx';
import useLabSnapshot from './useLabSnapshot.js';
import {PaginatedList} from './Pagination.jsx';
import SignatureHistory from './SignatureHistory.jsx';
import {auditSignatures} from './signatureHistory.mjs';
import { useEffect } from 'react';
import { SignatureImage, LmsReviewSignatures } from './RequestSignatures.jsx';
import RequestProgress from './RequestProgress.jsx';
import './RequestApp.css';

export default function RequestInfoModal({ request: supplied, onClose, onEdit, account }) {
  const snapshot=useLabSnapshot();
  const original=snapshot.electronic.find(row=>row.id===supplied.id);
  const selected=original?{...original,...(supplied.status==='待核准'?{status:supplied.status}:{})}:supplied;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', escape); previous?.focus?.(); };
  }, [onClose]);
  return <div className="rq-app" style={{minHeight:0}}><div className="rq-modal-backdrop rq-request-detail-backdrop" style={{zIndex:1400}} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="rq-request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="rq-request-detail-title">
      <header className="rq-request-detail-header">
        <div><p className="rq-eyebrow">ELECTRONIC TEST REQUEST</p><h2 id="rq-request-detail-title">{selected.id}｜委託單資訊</h2><p>完整委託內容、試驗需求與簽核進度</p></div>
        <button type="button" className="rq-close" onClick={() => onClose()} aria-label="關閉委託單資訊">×</button>
      </header>
      <div className="rq-request-detail-body"><ReportCasePanel request={selected} account={account}/>
        {selected.cancellation && <section className="rq-detail-section"><h3>委託取消紀錄</h3><div className="rq-detail-grid"><div><label>操作者</label><p>{selected.cancellation.actor}</p></div><div><label>取消時間</label><p>{selected.cancellation.at}</p></div><div><label>中止原因</label><p>{selected.cancellation.reason}</p></div></div></section>}
        {selected.demoFlow&&<section className="rq-detail-section"><h3>DEMO 完整流程測試</h3><p>此筆為系統模擬資料，簽名僅供流程展示。</p><PaginatedList items={selected.demoFlow.steps}>{rows=><ol>{rows.map(row=><li key={row.id} style={{fontSize:12,lineHeight:2}}>{row.label} · {new Date(row.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</li>)}</ol>}</PaginatedList></section>}
        {selected.execution&&<section className="rq-detail-section"><h3>試驗執行結果</h3><div className="rq-detail-grid">{[['狀態',selected.execution.status],['設備',selected.execution.equipment],['執行人',selected.execution.operator],['樣品編號',selected.execution.sampleCode],['開始時間',selected.execution.startedAt],['完成時間',selected.execution.completedAt],['報告提交',selected.execution.reportSubmitted?'已提交':'尚未提交']].map(([label,value])=><div key={label}><label>{label}</label><p>{value||'—'}</p></div>)}</div><SignatureHistory records={auditSignatures(snapshot.labAudit,selected.id)}/></section>}
        <div className="rq-request-detail-status"><span>目前狀態</span><b className={`rq-status ${selected.status === '已核准' || selected.status === '執行中' || selected.status === '已完成' ? 'good' : selected.status === '待主管簽核' ? 'pending' : selected.status === '退件' || selected.status === '補件中' ? 'warning' : ''}`}>{selected.status === '待主管簽核' ? '待簽核' : selected.status === '已核准' ? '待審查' : (selected.status || '草稿')}</b><span>委託單號：{selected.id}</span></div>
        {[
          {title:'1　委託基本資料', fields:[['產品代碼',selected.productCode || selected.product],['產品類型',selected.productType],['客戶名稱',selected.customer || selected.project],['客戶品番',selected.customerPartNo],['需求日期',selected.dueDate],['測試數量',selected.quantity ? `${selected.quantity} 件` : ''],['委託部門',selected.department],['委託者姓名',selected.requester],['優先程度',selected.priority],['建立日期',selected.createdAt]]},
          {title:'2　試驗目的', fields:[['試驗目的',(Array.isArray(selected.purpose) ? selected.purpose.join('、') : (selected.purpose || ''))],['其他目的說明',selected.purposeOther]]},
          {title:'3　樣品來源與樣品資訊', fields:[['樣品來源',(Array.isArray(selected.sampleSource) ? selected.sampleSource.join('、') : (selected.sampleSource || ''))],['來源補充說明',selected.sampleSourceOther],['製品版次',selected.productVersion],['PCBA 版次',selected.pcbaVersion],['軟體版次',selected.softwareVersion],['製造日期',selected.manufactureDate],['其他說明',selected.sampleDescription]]},
          {title:'4　試驗項目與試驗規範', fields:[['試驗項目',(Array.isArray(selected.testItems) ? selected.testItems.join('、') : (selected.testItems || ''))],['試驗規範／試驗手法',selected.specification]]},
          {title:'5　判定基準與備註', fields:[['判定方式',selected.judgementRequired],['判定基準',selected.judgementCriteria],['備註',selected.notes]]},
          {title:'6　委託簽名與主管簽核', fields:[['委託者簽名',selected.requester],['簽名日期',selected.requestDate || selected.createdAt],['主管簽名',selected.approver],['簽核日期',selected.approvalDate],['主管簽核意見',selected.approvalNote]]}
        ].map(group => <section className="rq-detail-section" key={group.title}><h3>{group.title}</h3><div className="rq-detail-grid">{group.fields.map(([label,value]) => <div key={label}><label>{label}</label>{label === '委託者簽名' ? <SignatureImage request={selected} /> : label === '主管簽名' ? <SignatureImage request={selected} supervisor /> : <p>{value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : '—'}</p>}</div>)}</div></section>)}
        <LmsReviewSignatures request={selected} /><RequestProgress status={(selected).status} />
      </div>
      <footer className="rq-request-detail-footer">{onEdit && ['退件','補件中'].includes(selected.status) && <button type="button" className="rq-btn rq-btn-primary" onClick={onEdit}>編輯並重新送出</button>}<button type="button" className="rq-btn rq-btn-light" onClick={() => onClose()}>關閉</button></footer>
    </section>
  </div></div>;
}
