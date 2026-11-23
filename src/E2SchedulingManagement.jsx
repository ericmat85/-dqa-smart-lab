import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import {useEffect,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import {describeE2Reason} from './e2Scheduling.mjs';
import {canEditAdmin} from './adminCenterStore.mjs';
import {E2_SETTINGS_KEY,E2_SETTINGS_EVENT,readE2Settings,saveE2Settings,resetE2Settings} from './e2PlanningSettings.mjs';
import {E2_ACTIVITY_EVENT,readE2Activity,clearE2Activity,summarizeE2Activity} from './e2Activity.mjs';
import './E4AssistantMonitor.css';
import './E2SchedulingManagement.css';

const STATUS={PENDING:'處理中',SUCCESS:'已回應',ERROR:'失敗',CANCELLED:'已取消'};
const ASSESSMENT={PROPOSAL_AVAILABLE:'有候選方案',UNKNOWN:'資料不足',INFEASIBLE_IN_WINDOW:'搜尋範圍內無可用時段'};
const EXECUTION={UNKNOWN:'尚未確認',MOCK:'Mock 測試',RULE_BASED_ONLY:'僅規則檢查',LIVE_PROVIDER:'Provider 回應'};
const DRAFT={NONE:'未帶入表單',APPLIED:'已帶入，尚未儲存',SAVED:'使用者已儲存',REJECTED:'未通過套用檢查'};
const PHASE={READING:'讀取試驗資料',SESSION:'建立應用程式 Session',UPSTREAM:'等候排程服務',VERIFYING:'驗證候選方案'};
const time=v=>new Date(v).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
const seconds=v=>v===null||v===undefined?'—':(v/1000).toFixed(1)+' 秒';
const display=v=>v===null||v===undefined?'—':v;
function SettingsEditor({snapshot,account,onClose,onSaved}){
 const [draft,setDraft]=useState({...snapshot.settings}),[error,setError]=useState('');
 return <CompactDialog title="調整 AI 排程設定" onClose={onClose} className="admin-edit-dialog"><form className="admin-edit-form" onSubmit={e=>{e.preventDefault();try{saveE2Settings(draft,account,{expectedRevision:snapshot.revision});onSaved();onClose();}catch(error){setError(error.message);}}}>
  <p>儲存於目前瀏覽器，僅套用至之後的新排程請求；既有排程及正在處理的請求維持原內容。</p>
  <label className="admin-checkbox"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/><span>允許新的自動化排程請求</span></label>
  <div className="admin-form-grid">{[['searchDays','搜尋範圍上限（天）',1,14],['preparationMinutes','準備保留時間下限（分鐘）',0,120],['cleanupMinutes','清理保留時間下限（分鐘）',0,120]].map(([key,label,min,max])=><label key={key}><span>{label}</span><input type="number" aria-label={label} required min={min} max={max} step="1" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value===''?'':Number(e.target.value)})}/></label>)}</div>
  <p className="e2-management-hint">搜尋不會延後委託交期；試驗工時、設備相容性、容量 U 與操作型試驗的週末限制保持有效。既有準備／清理時間較長時保留較長值。此頁不啟用模型或調高預算。</p>
  {error&&<p role="alert" className="management-error">{error}</p>}<footer><button type="button" className="template-btn" onClick={onClose}>取消</button><button type="submit" className="management-primary">儲存排程設定</button></footer>
 </form></CompactDialog>;
}
export default function E2SchedulingManagement({account,preferencesOnly=false}){
 const [,refresh]=useState(0),[editing,setEditing]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState('ALL'),[execution,setExecution]=useState('ALL');
 useEffect(()=>{const update=()=>refresh(v=>v+1),storage=e=>{if(e.key===E2_SETTINGS_KEY||e.key===null)update();};window.addEventListener(E2_SETTINGS_EVENT,update);window.addEventListener(E2_ACTIVITY_EVENT,update);window.addEventListener('storage',storage);const timer=setInterval(update,1000);return()=>{window.removeEventListener(E2_SETTINGS_EVENT,update);window.removeEventListener(E2_ACTIVITY_EVENT,update);window.removeEventListener('storage',storage);clearInterval(timer);};},[]);
 let snapshot,readError;try{snapshot=readE2Settings();}catch(error){readError=error.message;}
 const editable=canEditAdmin(account),settings=snapshot?.settings,rows=readE2Activity(account?.id),stats=summarizeE2Activity(rows),latest=rows[0],visible=rows.filter(r=>(filter==='ALL'||r.status===filter||r.assessment===filter)&&(execution==='ALL'||r.execution===execution));
 const durations=rows.filter(r=>r.durationMs!==null).map(r=>r.durationMs).sort((a,b)=>a-b),p95=durations.length?durations[Math.ceil(durations.length*.95)-1]:null;
 return <section id="e2-scheduling-management" className="e4-monitor e2-management" aria-label="AI 排程設定與運行監控">
  <header className="e4-monitor-heading"><div><span className="e4-monitor-eyebrow">E2 · AI 排程智慧化</span><h3>排程設定與運行監控</h3><p>讀取既有試驗條件、核對資源，再由服務端模型提出候選方案建議。</p></div><span className="e4-monitor-mode">{readError?'設定無法讀取':settings.enabled?'接受新請求':'新請求已暫停'}</span></header>
  <div className="e2-management-overview"><article className="e2-settings-card"><div className="e2-settings-heading"><h4>排程偏好</h4><button type="button" className="template-btn" disabled={!editable||!snapshot} onClick={()=>{setError('');setEditing(snapshot);}}><LmsHeaderActionLabel icon="settings">調整排程設定</LmsHeaderActionLabel></button></div>
   {readError?<p role="alert" className="management-error">{readError}</p>:<dl className="e2-setting-values"><div><dt>新請求</dt><dd>{settings.enabled?'允許':'暫停'}</dd></div><div><dt>搜尋範圍上限</dt><dd>{settings.searchDays} 天</dd></div><div><dt>準備保留下限</dt><dd>{settings.preparationMinutes} 分鐘</dd></div><div><dt>清理保留下限</dt><dd>{settings.cleanupMinutes} 分鐘</dd></div></dl>}
   <p className="e2-management-hint">設定限目前瀏覽器，其他分頁會同步；不回寫既有案件。{!editable&&'目前帳號為唯讀，請由具既有管理權限的帳號調整。'}</p>
   {snapshot?.events[0]&&<p className="e2-management-hint">最近更新：{time(Date.parse(snapshot.events[0].at))}（台灣時間）・{snapshot.events[0].actorId}</p>}
   {editable&&<button className="template-btn" type="button" onClick={()=>{if(!window.confirm('還原本瀏覽器的排程偏好為預設值？既有排程、請求紀錄與服務端預算不會改變。'))return;try{resetE2Settings(account);setError('');setNotice('已還原排程預設值。');}catch(error){setError(error.message);}}}>還原排程預設值</button>}
  </article><article className="e2-settings-card"><h4>固定執行保護</h4><ul className="e2-guard-list"><li>條件取自試驗資料，不從設備能力反推</li><li>容量、設備、人員及占用資料不足時回報資料不足</li><li>高溫高濕連續 250H；振動每顆 20H、跳過週末</li><li>候選方案經驗證後帶入草稿，按儲存才生效</li><li>不自動重送；模型、Token 與預算由服務端授權及帳本控制</li></ul><p className="e2-management-hint">模型、API Key 與費用上限請使用「模型與費用設定」。</p></article></div>
  {notice&&<p className="management-notice" role="status">{notice}</p>}{error&&<p className="management-error" role="alert">{error}</p>}
  {!preferencesOnly&&<><p className="e4-monitor-scope">目前帳號・本分頁最近 30 分鐘，最多 40 筆，重新整理或登出即清除。只保存狀態、數量、用量及追蹤識別碼，不保存試驗內容或憑證；不是全站監控或正式費用帳本。獨立導覽模擬不列入 API 請求。清除觀察紀錄不會取消請求或釋放預算。</p>
  <div className="e4-monitor-stats e2-monitor-stats" aria-label="E2 排程請求統計">
   <article><span>排程請求</span><strong>{stats.requests}</strong><small>處理中 {stats.pending}・已儲存 {stats.saved}</small></article>
   <article><span>有方案請求／資料不足</span><strong>{stats.proposals}<em>／{stats.unknown}</em></strong><small>範圍內無可用時段 {stats.infeasible}</small></article>
   <article><span>失敗／取消</span><strong>{stats.errors}<em>／{stats.cancelled}</em></strong><small>P95 請求耗時 {seconds(p95)}</small></article>
   <article><span>Provider Token 輸入／輸出</span><strong>{stats.live.inputTokens}<em>／{stats.live.outputTokens}</em></strong><small>{stats.live.count?`${stats.live.count} 筆回應${stats.live.complete?'':'，部分用量未確認'}`:'尚無 Provider 回應'}</small></article>
  </div>
  <div className="e2-provider-summary"><span>僅規則檢查 {stats.rules} 筆</span><span>Mock {stats.mock.count} 筆・模擬費用 {stats.mock.costUsd===null?'未確認':'USD '+stats.mock.costUsd}</span><span>Provider 估算費用 {stats.live.count?(stats.live.costUsd===null?'未確認':'USD '+stats.live.costUsd):'尚無回應'}</span></div>
  <p className="e2-management-hint">失敗、逾時或取消不代表零費用；顯示的用量只來自已驗證的回應，仍以服務端持久帳本為準。</p>
  {latest?.status==='PENDING'&&<div role="status" className="e2-pending"><span className="e2-pending-dot"/>{PHASE[latest.phase]}・已等待 {seconds(Date.now()-latest.startedAt)}</div>}
  <div className="e4-monitor-toolbar"><h4>近期排程請求</h4><div><label>狀態<select aria-label="排程監控狀態篩選" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">全部狀態</option>{Object.entries({...STATUS,...ASSESSMENT}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>執行方式<select aria-label="排程監控方式篩選" value={execution} onChange={e=>setExecution(e.target.value)}><option value="ALL">全部方式</option>{Object.entries(EXECUTION).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="template-btn" disabled={!rows.length} onClick={()=>clearE2Activity(account.id)}><LmsHeaderActionLabel icon="clear">清除本分頁排程紀錄</LmsHeaderActionLabel></button></div></div>
  <div className="admin-table-wrap e4-monitor-table" role="region" aria-label="E2 即時排程紀錄" tabIndex={0}><table className="admin-table"><thead><tr><th scope="col">時間／狀態</th><th scope="col">規劃結果／草稿</th><th scope="col">模型／用量</th><th scope="col">耗時／範圍</th><th scope="col">追蹤資訊</th></tr></thead><tbody>{visible.length?visible.map(r=><tr key={r.id}><td>{time(r.startedAt)}<span className={`e4-monitor-status is-${r.status.toLowerCase()}`}>{STATUS[r.status]}{r.httpStatus?' · HTTP '+r.httpStatus:''}</span>{r.errorCode&&<small>{r.errorCode}</small>}{r.failurePhase&&<small>{PHASE[r.failurePhase]}</small>}</td><td>{ASSESSMENT[r.assessment]||'尚無結果'}<small>{r.candidateCount===null?'—':r.candidateCount+' 個候選方案'}</small><small>{DRAFT[r.draft]}</small>{r.reasonCodes.length>0&&<details><summary>查看規劃原因</summary><ul className="e2-reason-list">{r.reasonCodes.map(code=><li key={code}>{describeE2Reason(code)}</li>)}</ul></details>}</td><td>{EXECUTION[r.execution]}<small>{display(r.model)}</small><small>Token {display(r.inputTokens)}／{display(r.outputTokens)}</small><small>{r.costUsd===null?'費用未確認':(r.execution==='MOCK'?'模擬':'估算')+' USD '+r.costUsd}</small></td><td>{seconds(r.durationMs??(r.status==='PENDING'?Date.now()-r.startedAt:null))}<small>搜尋上限 {display(r.searchDays)} 天</small><small>準備／清理 {display(r.preparationMinutes)}／{display(r.cleanupMinutes)} 分鐘</small></td><td><details><summary>查看 Trace／Provider</summary><dl>{[['Trace',r.traceId],['Request',r.operationId],['Provider',r.providerId],['Response',r.responseId],['合成排程',r.trialId],['試驗規則',r.profileId]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{display(value)}</dd></div>)}</dl></details></td></tr>):<tr><td colSpan={5}><p className="e4-monitor-empty">{rows.length?'沒有符合篩選的請求。':'尚無排程請求；使用原排程頁的「AI 自動化排程」後，這裡會即時更新。'}</p></td></tr>}</tbody></table></div>
  </>}
  {editing&&editable&&<SettingsEditor snapshot={editing} account={account} onClose={()=>setEditing(null)} onSaved={()=>setNotice('排程設定已儲存，將套用至本瀏覽器之後的新請求。')}/>}
 </section>;
}
