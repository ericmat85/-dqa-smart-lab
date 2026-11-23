import ResourceOperationNotice from './ResourceOperationNotice.jsx';
import useSystemTheme from './useSystemTheme.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './StopScheduleDialog.css';

export default function StopScheduleDialog({requestId,onClose,onConfirm,error,operation,onSaved}) {
  const {dark}=useSystemTheme();
  const [reason,setReason]=useState('');
  const [submitting,setBusy]=useState(false);
  const busy=submitting||!!operation?.busy,locked=busy||!!operation?.pending;
  const ref=useRef(null),back=useRef(null);
  useEffect(()=>{const previous=document.activeElement;back.current?.focus();return()=>previous?.focus?.();},[]);
  const keyboard=event=>{
    if(event.key==='Escape'&&!busy){event.stopPropagation();onClose();}
    if(event.key==='Tab'){
      const items=[...ref.current.querySelectorAll('button:not(:disabled),textarea')];
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
    }
  };
  return createPortal(<div className={`request-modal-backdrop schedule-stop-backdrop lms-enterprise ${dark?'theme-dark':'theme-light'}`} onKeyDown={keyboard}><section ref={ref} className="request-modal schedule-stop-dialog" role="alertdialog" aria-modal="true" aria-labelledby="stop-schedule-title" aria-describedby="stop-schedule-description"><header className="request-modal-header"><div><h3 id="stop-schedule-title">確認中止排程？</h3><p>{requestId}</p></div></header><div className="request-modal-body"><p id="stop-schedule-description">確認後會取消整張委託單及其所有相關排程，並保留操作紀錄。未被其他試驗占用的設備會恢復待機。</p><label>中止原因（選填）<textarea className="template-input" rows={3} disabled={locked} value={reason} onChange={event=>setReason(event.target.value)} placeholder="請說明中止原因"/></label>{error&&<p className="equipment-status-error" role="alert">{error}</p>}{operation&&<ResourceOperationNotice operation={operation} onSaved={onSaved}/>}<div className="template-form-actions"><button ref={back} type="button" className="template-btn secondary" disabled={busy} onClick={onClose}>返回編輯</button><button type="button" className="template-btn danger" disabled={locked} onClick={async()=>{setBusy(true);try{await onConfirm(reason);}finally{setBusy(false);}}}>確認中止並取消委託</button></div></div></section></div>,document.body);
}
