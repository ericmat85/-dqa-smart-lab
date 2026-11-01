import HelpTip from './HelpTip.jsx';
import {useEffect,useRef,useState} from 'react';
import {resetSystemCases} from './resetCases.mjs';
import './ClearCasesButton.css';
export default function ClearCasesButton({inline=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);const root=useRef(null),trigger=useRef(null);
 useEffect(()=>{if(!open)return;const close=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}else if(e.type==='pointerdown'&&!root.current?.contains(e.target))setOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};},[open]);
 async function clear(){
  if(!window.confirm('僅清除本專案此瀏覽器的 Demo 案件、委託、排程、借用與報告。其他網站資料、帳號、角色、預設簽名及設備／物料台帳不會清除。此操作無法復原。確定重設 Demo 案件？'))return;
  setBusy(true);setError('');try{await resetSystemCases();window.dispatchEvent(new Event('dqa:cases-reset'));window.location.reload();}catch(err){setError(err.message||'清除尚未完成，請重試。');setBusy(false);}
 }
 return <div className={`clear-cases-control ${inline?'demo-tools-inline':''}`} ref={root}>{error&&<div role="alert" className="clear-cases-error">{error}</div>}{open&&<div className="demo-tools-panel" role="group" aria-label="Demo 工具"><strong>僅供展示測試</strong><HelpTip>資料儲存在此瀏覽器，不連接正式資料。</HelpTip><button type="button" disabled={busy} onClick={clear}>{busy?'重設中…':'重設 Demo 案件…'}</button></div>}<button ref={trigger} type="button" className="clear-cases-button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Demo 工具</button></div>;
}
