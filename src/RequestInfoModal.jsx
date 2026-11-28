import './RequestIdentifier.css';
import RequestInformation,{RequestInformationHistory} from './RequestInformation.jsx';
import ExecutionKindBadge from './ExecutionKindBadge.jsx';
import RequestCloseIcon from './RequestCloseIcon.jsx';
import HelpTip from './HelpTip.jsx';
import useLabSnapshot from './useLabSnapshot.js';
import { useEffect,useRef } from 'react';
import useSystemTheme from './useSystemTheme.js';
import './RequestApp.css';
import './RequestInfoModal.css';

export default function RequestInfoModal({ request: supplied, onClose, onEdit, account }) {
  const root=useRef(null),close=useRef(onClose);const {dark}=useSystemTheme();
  useEffect(()=>{close.current=onClose;},[onClose]);
  const snapshot=useLabSnapshot();
  const original=snapshot.electronic.find(row=>row.id===supplied.id);
  const selected=original?{...original,...(supplied.status==='待核准'?{status:supplied.status}:{})}:supplied;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('.rq-request-detail-header .rq-close')?.focus({preventScroll:true});
    const body = root.current?.querySelector('.rq-request-detail-body');
    if (body) body.scrollTop = 0;
    const escape=event=>{if(document.querySelector('dialog[open]'))return;if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close.current();return;}if(event.key==='Tab'){const items=[...root.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',escape);previous?.focus?.({preventScroll:true});};
  },[]);
  return <div className={`rq-app ${dark?'rq-theme-dark':'rq-theme-light'}`} style={{minHeight:0}}><div className="rq-modal-backdrop rq-request-detail-backdrop" style={{zIndex:1400}} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={root} tabIndex={-1} className="rq-request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="rq-request-detail-title">
      <header className="rq-request-detail-header">
        <div><p className="rq-eyebrow">ELECTRONIC TEST REQUEST</p><div className="help-title-row"><h2 id="rq-request-detail-title" aria-label={`${selected.id}｜委託單資訊`}><span className="request-info-id">{selected.id}</span><span className="request-info-divider">｜</span><span className="request-info-name">{(Array.isArray(selected.testItems)?selected.testItems.join('、'):selected.testItems)||selected.title||'委託單資訊'}</span></h2><ExecutionKindBadge request={selected}/><HelpTip>完整委託內容、試驗需求與簽核進度</HelpTip></div></div>
        <button type="button" className="rq-close" onClick={() => onClose()} aria-label="關閉委託單資訊"><RequestCloseIcon/></button>
      </header>
      <div className="rq-request-detail-body"><RequestInformation request={selected} account={account}/><RequestInformationHistory request={selected} account={account}/></div>
      {onEdit && ['退件','補件中'].includes(selected.status) && <footer className="rq-request-detail-footer"><button type="button" className="rq-btn rq-btn-primary" onClick={onEdit}>編輯並重新送出</button></footer>}
    </section>
  </div></div>;
}
