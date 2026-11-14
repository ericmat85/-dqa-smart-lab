import './EngineWorkspaces.css';
import {useEffect,useRef,useState} from 'react';
import {reviewE1Report} from './e1Review.mjs';
export default function E1ReviewPanel({requestId,account,revision}){
 const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const task=useRef(0);useEffect(()=>{setResult(null);setBusy(false);setError('');task.current++;return()=>{task.current++;};},[requestId,revision,account?.id]);
 async function run(){if(busy)return;const token=++task.current;setBusy(true);setError('');setResult(null);try{const r=await reviewE1Report({actorId:account?.id,requestId,expectedRevision:revision});if(token===task.current)setResult(r);}catch(e){if(token===task.current)setError(e.message);}finally{if(token===task.current)setBusy(false);}}
 return <section className="e1-review-panel" aria-label="智能審查系統"><h4>AI 智能審查系統</h4><p>核對委託欄位、電子簽名完整性與報告格式。現階段使用來源規則檢查，模型尚未啟用；不驗證簽名真偽，不改動簽核結果。</p><button type="button" className="template-btn secondary" disabled={busy} onClick={run}>{busy?'正在查核報告與簽名…':'執行智能審查'}</button>{busy&&<p role="status">正在讀取並核對目前版本…</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><strong>規則檢查・未呼叫 AI 模型</strong><p>{result.summary}</p><ul>{result.checks.map((c,i)=><li key={i}>{c.status==='PASS'?'✓':c.status==='UNKNOWN'?'待確認':'!'} {c.title}：{c.detail}</li>)}</ul><small>Trace {result.trace_id}</small></div>}</section>;
}
