import {useEffect,useRef} from 'react';
export default function CompactDialog({title,onClose,children}){
 const ref=useRef(null);
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;if(!dialog.open)dialog.showModal();return()=>{dialog.close();previous?.focus?.();};},[]);
 return <dialog ref={ref} className="compact-management-dialog" aria-label={title} onCancel={onClose}><header><h3>{title}</h3><button type="button" aria-label={`關閉${title}`} onClick={onClose}>×</button></header>{children}</dialog>;
}
