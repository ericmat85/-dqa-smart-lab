import {useEffect,useRef} from 'react';
export default function CompactDialog({title,onClose,children,className=''}){
 const ref=useRef(null);
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;if(!dialog.open)dialog.showModal();return()=>{dialog.close();previous?.focus?.();};},[]);
 return <dialog ref={ref} className={`compact-management-dialog ${className}`} aria-label={title} onCancel={event=>{event.stopPropagation();onClose();}}><header><h3>{title}</h3><button type="button" aria-label={`關閉${title}`} onClick={onClose}>×</button></header>{children}</dialog>;
}
