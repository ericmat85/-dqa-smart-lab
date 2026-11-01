import {useId, useRef, useState} from 'react';
import './HelpTip.css';

// Kept in the normal tree so tips also work inside modal dialogs.
export default function HelpTip({children, label='說明'}) {
  const id=useId();
  const trigger=useRef(null);
  const [position,setPosition]=useState({});
  const show=()=>{const rect=trigger.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-Math.min(320,window.innerWidth*.65)-28)),...(rect.bottom+160>window.innerHeight?{bottom:window.innerHeight-rect.top+6}:{top:rect.bottom+6})});setOpen(true);};
  const [open,setOpen]=useState(false);
  return <span className="help-tip" onMouseEnter={show} onMouseLeave={()=>setOpen(false)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);}}}>
    <button ref={trigger} type="button" className="help-tip-trigger" aria-label={label} aria-describedby={open?id:undefined} aria-expanded={open} onFocus={show} onClick={event=>{event.preventDefault();event.stopPropagation();show();}}><svg className="help-tip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle className="help-tip-disc" cx="12" cy="12" r="12"/><g className="help-tip-mark"><path d="M8 9a4 4 0 0 1 8 0c0 2-1.2 3-2.4 3.8-.9.6-1.1.9-1.1 2.2h-2c0-2.2.7-2.9 2-3.8C13.6 10.5 14 10 14 9a2 2 0 0 0-4 0Z"/><circle cx="12" cy="18" r="1"/></g></svg></button>
    {open&&<span id={id} role="tooltip" className="help-tip-content" style={position}>{children}</span>}
  </span>;
}
