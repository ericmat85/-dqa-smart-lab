import {ActionTable} from './tableActionIcons.jsx';
import {useCallback,useEffect,useState} from 'react';
import {businessClient} from './businessClient.mjs';
import {BUSINESS_AI_EVENT,pendingBusinessAI,lookupBusinessAI,aiErrorMessage} from './businessAIClient.mjs';
import EnginePreferences from './EnginePreferences.jsx';
import {E2InlinePreferences} from './E2SchedulingManagement.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import AssistantIcon from './AssistantIcon.jsx';
import BusinessAISettings from './BusinessAISettings.jsx';
export default function BusinessAIMonitor({engine,account}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(pendingBusinessAI),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setBusy(true);setError('');try{const p=await businessClient.request('/ai/status');setData(p.data);}catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}},[]);
 useEffect(()=>{void load();const refresh=()=>{setPending(pendingBusinessAI());};window.addEventListener(BUSINESS_AI_EVENT,refresh);return()=>window.removeEventListener(BUSINESS_AI_EVENT,refresh);},[load]);
 const state=data?.engines?.[engine],rows=(data?.observations?.records||[]).filter(r=>r.engine===engine),labels={PREPARED:'核對來源',DISPATCHED:'模型處理中／待確認',SUCCEEDED:'已完成',FAILED:'未完成',UNKNOWN:'結果待確認'};
 async function lookup(id){setError('');try{const r=await lookupBusinessAI(id);setPending(pendingBusinessAI());setNotice(r.state==='SUCCEEDED'?'已確認原模型請求完成；未重新呼叫模型。':r.state==='FAILED'?'原請求未完成：'+(r.error_code||'請重新核對資料'):r.state==='NOT_FOUND'?'查無這筆操作；尚未重新送出。':'原請求仍待確認；不會自動重送。');await load();}catch(e){setError(aiErrorMessage(e));}}
 return <section className="e4-monitor engine-workspace-monitor" aria-label={engine+' 真實模型與監控'}><header className="e4-monitor-heading"><div><span className="e4-monitor-eyebrow"><AssistantIcon size={18}/> {engine} · 真實模型</span><h3>模型連線與請求監控</h3><p>來源由後端依登入帳號與資料權限讀取；模型只提供建議或草稿。</p></div><button type="button" className="template-btn" disabled={busy} onClick={load}>重新檢查</button></header>
 {error&&<p role="alert" className="management-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div className="e4-monitor-stats admin-summary-surface" aria-label="引擎狀態摘要"><article><span><LmsSidebarIcon name="settings"/>後端狀態</span><strong>{state?state.ready?'就緒':'未就緒':'待確認'}</strong><small>{state?.code||'尚未取得連線狀態'}；實際回應待使用者驗證</small></article><article><span><AssistantIcon size={16}/>模型</span><strong>{state?.model||data?.model||'—'}</strong><small>目前連線檢查不會呼叫模型</small></article><article><span><LmsSidebarIcon name="finance"/>{engine==='E2'?'E2 獨立剩餘額度':'E1／E3／E4 共用剩餘額度'}</span><strong>USD {state?.available_usd??'—'}</strong><small>單次上限 USD {state?.per_call_usd||'0.05'}；保留既有用量</small></article><article><span><LmsSidebarIcon name="reports"/>目前帳號的近期請求</span><strong>{rows.length}</strong><small>資料庫最近 40 筆；成功 {rows.filter(r=>r.state==='SUCCEEDED').length} 筆</small></article></div>
 <BusinessAISettings key={engine+':'+account?.id} engine={engine} onSaved={load} preferences={engine==='E2'?<E2InlinePreferences account={account}/>:['E3','E4'].includes(engine)?<EnginePreferences engine={engine} account={account} inline/>:null}/>
 {pending.filter(p=>p.engine===engine).map(p=><div className="template-info" key={p.id}>有一筆結果待確認 <button type="button" className="template-btn" disabled={busy} onClick={()=>lookup(p.id)}>查詢原操作結果</button></div>)}

 <section className="engine-recent-requests" aria-label={engine+' 近期請求紀錄'}><header><h4>近期請求紀錄</h4><span className="admin-badge">{rows.length} 筆</span></header><div className="admin-table-wrap" role="region" aria-label={engine+' 請求資料表'} tabIndex={0}><ActionTable className="admin-table"><thead><tr><th>時間／狀態</th><th>模型／用量</th><th>估算費用</th><th>Trace／結果</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}<small>{labels[r.state]||r.state}</small></td><td>{r.model||'—'}<small>{r.usage?`${r.usage.input_tokens}／${r.usage.output_tokens} Tokens`:'尚無可確認用量'}</small></td><td>{r.estimated_cost_usd?'USD '+r.estimated_cost_usd:'待確認'}</td><td>{r.trace_id||r.error_code||'待回應'}</td></tr>):<tr><td colSpan={4}>目前帳號尚無此引擎的資料庫請求紀錄。</td></tr>}</tbody></ActionTable></div></section></section>;
}
