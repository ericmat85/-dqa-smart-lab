import {useState} from 'react';
import {resetSystemCases} from './resetCases.mjs';
import './ClearCasesButton.css';
export default function ClearCasesButton(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function clear(){
  if(!window.confirm('確定要清除系統所有案件嗎？\n\n將清除電子委託、LMS、實驗室的案件、排程、取消／中斷與借用申請、案件歷程及已上傳報告。\n帳號、角色權限、預設簽名、設備與物料台帳會保留。\n此操作無法復原，完成後會重新載入各系統頁面。'))return;
  setBusy(true);setError('');
  try{await resetSystemCases();window.dispatchEvent(new Event('dqa:cases-reset'));window.location.reload();}catch(err){setError(err.message||'清除尚未完成，請重試。');setBusy(false);}
 }
 return <div className="clear-cases-control">{error&&<div role="alert" className="clear-cases-error">{error}</div>}<button type="button" disabled={busy} className="clear-cases-button" onClick={clear}>{busy?'清除中…':'↻ 清除重設'}</button></div>;
}
