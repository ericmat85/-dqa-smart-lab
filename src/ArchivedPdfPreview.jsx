import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import ActionIcon from './ActionIcon.jsx';
import ArchivedPdfPages from './ArchivedPdfPages.jsx';
import './ArchivedPdfPreview.css';

export default function ArchivedPdfPreview({preview,onClose}){
 const dialog=useRef(null),close=useRef(null);
 useEffect(()=>{
  const previous=preview.trigger||document.activeElement,element=dialog.current,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';element.showModal();close.current?.focus();
  return()=>{element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus?.({preventScroll:true});};
 },[preview.trigger]);
 return createPortal(<dialog ref={dialog} className="archived-pdf-viewer" aria-label="結案 PDF 預覽" onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="archived-pdf-toolbar"><div className="archived-pdf-title"><strong>{preview.name}</strong><span>A4 · 全螢幕預覽</span></div><div className="archived-pdf-actions">{preview.url&&<a href={preview.url} download={preview.name} aria-label="下載 PDF" title="下載 PDF"><ActionIcon name="download"/></a>}<button ref={close} type="button" aria-label="關閉預覽" title="關閉預覽（Esc）" onClick={onClose}><span aria-hidden="true">×</span></button></div></header>
  <div className="archived-pdf-canvas">{preview.loading?<div className="archived-pdf-loading" role="status">正在讀取結案 PDF…</div>:preview.guided?<figure className="guided-report-preview"><figcaption>Demo 報告示意圖 · 非正式試驗結果；實際結案 PDF 可下載。</figcaption><img src="/images/tour-demo-report.svg" alt="導覽 Demo 試驗報告：設備、試驗條件、結果與簽核版面示意"/></figure>:<ArchivedPdfPages url={preview.url}/>}</div>
 </dialog>,document.body);
}
