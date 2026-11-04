import {createDemoApprovalSignature} from './demoApprovalSignature.mjs';
import HelpTip from './HelpTip.jsx';
import {useEffect,useId,useRef,useState} from 'react';
import {resetSystemCases} from './resetCases.mjs';
import './ClearCasesButton.css';
export default function ClearCasesButton({inline=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false),[progress,setProgress]=useState('');const root=useRef(null),trigger=useRef(null),panelId=useId();
 useEffect(()=>{if(!open)return;const close=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}else if(e.type==='pointerdown'&&!root.current?.contains(e.target))setOpen(false);};document.addEventListener('keydown',close,true);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close,true);document.removeEventListener('pointerdown',close);};},[open]);
 async function seed(){
  if(!window.confirm('將清除目前瀏覽器本系統所有委託、排程、借用與報告，再載入DEMO-001～018。保留既有帳號／角色與設備／物料台帳，另加入專用假帳號及假設備。僅操作本機Demo資料，不連接正式資料庫。確定重設為九階18筆？'))return;
  setBusy(true);setError('');setProgress('準備九階模擬資料與Demo PDF，尚未清除原案件…');
  try{const {installNineStageSeed}=await import('./installNineStageSeed.mjs');await installNineStageSeed({signature:createDemoApprovalSignature('DEMO 模擬簽名／非本人',{compact:true}),onProgress:(done,total,label)=>setProgress(`${done}／${total} ${label}`)});window.location.reload();}catch(err){setError(err.message||'九階資料建立失敗');setProgress('');setBusy(false);}
 }
 async function clear(){
  if(!window.confirm('僅清除本專案此瀏覽器的 Demo 案件、委託、排程、借用與報告。其他網站資料、帳號、角色、預設簽名及設備／物料台帳不會清除。此操作無法復原。確定重設 Demo 案件？'))return;
  setBusy(true);setError('');try{await resetSystemCases();window.dispatchEvent(new Event('dqa:cases-reset'));window.location.reload();}catch(err){setError(err.message||'清除尚未完成，請重試。');setBusy(false);}
 }
 return <div className={`clear-cases-control ${inline?'demo-tools-inline':''}`} ref={root}><button ref={trigger} type="button" className="clear-cases-button" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(v=>!v)}>Demo 工具</button>{error&&<div role="alert" className="clear-cases-error">{error}</div>}{open&&<div id={panelId} className="demo-tools-panel" role="group" aria-label="Demo 工具"><div className="demo-tools-heading"><strong>僅供展示測試</strong><HelpTip>資料儲存在此瀏覽器，不連接正式資料。</HelpTip></div><button type="button" disabled={busy} onClick={seed}>清除並重設九階18筆 Demo</button>{progress&&<p role="status">{progress}</p>}<button type="button" disabled={busy} onClick={clear}>{busy?'重設中…':'僅清空 Demo 案件…'}</button></div>}</div>;
}
