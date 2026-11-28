import {RequestText} from './RequestIdentifier.jsx';
import {useEffect,useRef} from 'react';
export default function CompactDialog({title,onClose,children,className='',preventClose=false,headerContent}){
 const ref=useRef(null);
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;if(!dialog.open)dialog.showModal();return()=>{dialog.close();previous?.focus?.();};},[]);
 return <dialog ref={ref} className={`compact-management-dialog ${className}`} aria-label={title} onCancel={event=>{event.preventDefault();event.stopPropagation();if(!preventClose)onClose();}}><header>{headerContent?<div><h3><RequestText>{title}</RequestText></h3>{headerContent}</div>:<h3><RequestText>{title}</RequestText></h3>}<button type="button" aria-label={`關閉${title}`} disabled={preventClose} onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>{children}</dialog>;
}
