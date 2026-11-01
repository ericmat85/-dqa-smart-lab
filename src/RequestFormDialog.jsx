import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
export default function RequestFormDialog({label,dark,onClose,children}){
 const ref=useRef(null),closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose;},[onClose]);
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow,root=document.getElementById('root'),inert=root?.inert;
  document.body.style.overflow='hidden';if(root)root.inert=true;
  ref.current?.querySelector('button:not(.help-tip-trigger),input,select,textarea')?.focus();
  const keydown=event=>{
   const dialogs=document.querySelectorAll('[role="dialog"],[role="alertdialog"]');if(dialogs[dialogs.length-1]!==ref.current)return;
   if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
   if(event.key!=='Tab')return;
   const items=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
   const first=items[0],last=items[items.length-1];if(!first){event.preventDefault();ref.current.focus();return;}
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(root)root.inert=inert;previous?.focus?.();};
 },[]);
 return createPortal(<div className={`rq-app rq-enterprise rq-modal-backdrop rq-entry-backdrop ${dark?'rq-theme-dark':'rq-theme-light'}`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={ref} className="rq-form-modal rq-form-modal-reference rq-entry-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</section></div>,document.body);
}
