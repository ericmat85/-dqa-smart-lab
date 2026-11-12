import {useEffect,useState} from 'react';
import {E4_ACTIVITY_EVENT,readE4Activity,clearE4Activity,summarizeE4Activity} from './e4Activity.mjs';
import './E4AssistantMonitor.css';
const STATUS={PENDING:'處理中',SUCCESS:'成功',ERROR:'失敗',CANCELLED:'已取消'};
const MODE={GENERAL_CHAT:'一般聊天',DOCUMENT_QA:'合成文件問答'};
const time=value=>new Date(value).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
const value=v=>v===null||v===undefined?'—':v;
export default function E4AssistantMonitor({account}){
 const [,refresh]=useState(0),[filter,setFilter]=useState('ALL'),[mode,setMode]=useState('ALL');
 useEffect(()=>{const update=()=>refresh(v=>v+1);window.addEventListener(E4_ACTIVITY_EVENT,update);const timer=setInterval(update,15000);return()=>{window.removeEventListener(E4_ACTIVITY_EVENT,update);clearInterval(timer);};},[]);
 const rows=readE4Activity('lms',account?.id),stats=summarizeE4Activity(rows),latest=rows.find(r=>r.kind==='CHAT'&&r.status==='SUCCESS'),visible=rows.filter(r=>(filter==='ALL'||r.status===filter)&&(mode==='ALL'||r.mode===mode));
 return <section id="e4-assistant-monitor" className="e4-monitor" aria-label="AI 智能助理運行監控">
  <header className="e4-monitor-heading"><div><span className="e4-monitor-eyebrow">E4 · AI 智能助理</span><h3>對話運行監控</h3><p>聊天保留回答與引用，請求細節集中在這裡。</p></div><span className={`e4-monitor-mode ${latest?.execution==='MOCK'?'is-mock':''}`}>{latest?.execution==='MOCK'?'Mock 測試':latest?.execution==='LIVE_PROVIDER'?'Provider 回應':'等待首次回應'}</span></header>
  <p className="e4-monitor-scope">目前帳號・此分頁最近 30 分鐘，最多 40 筆。重新整理或登出會清除觀察紀錄；這不是全站監控或正式費用帳本。未保存聊天內容與憑證。</p>
  <div className="e4-monitor-stats" aria-label="E4 請求統計">
   <article><span>聊天請求</span><strong>{stats.requests}</strong><small>成功 {stats.success}・處理中 {stats.pending}</small></article>
   <article><span>失敗／取消</span><strong>{stats.errors}<em>／{stats.cancelled}</em></strong><small>失敗與取消不推定為零費用</small></article>
   <article><span>Mock Token 用量</span><strong>{stats.mock.inputTokens.toLocaleString()}<em>／{stats.mock.outputTokens.toLocaleString()}</em></strong><small>{stats.mock.usageComplete?'輸入／輸出，均為模擬數值':'已知輸入／輸出，部分用量未確認'}</small></article>
   <article><span>Mock 模擬費用</span><strong>{stats.mock.costUsd===null?'未確認':<><em>USD </em>{stats.mock.costUsd}</>}</strong><small>不是 OpenAI 實際帳單</small></article>
  </div>
  {stats.live.count>0&&<p className="admin-note">收到 {stats.live.count} 筆已驗證格式的 Provider 回應；估算費用 {stats.live.costUsd===null?'未確認':'USD '+stats.live.costUsd}，與 Mock 統計分開，仍以服務端帳本為準。</p>}
  <div className="e4-monitor-latest"><div className="e4-monitor-latest-title"><h4>最近一次成功聊天</h4><span>{latest?time(latest.startedAt)+'（台灣時間）':'尚無紀錄'}</span></div>{latest?<dl>
   <div><dt>模型</dt><dd>{value(latest.model)}</dd></div><div><dt>上下文</dt><dd>{value(latest.contextPairs)} 回合</dd></div><div><dt>Token 輸入／輸出</dt><dd>{value(latest.inputTokens)}／{value(latest.outputTokens)}</dd></div><div><dt>{latest.execution==='MOCK'?'模擬費用':'估算費用'}</dt><dd>USD {value(latest.costUsd)}</dd></div><div><dt>Provider 請求 ID</dt><dd className="e4-monitor-id">{value(latest.providerId)}</dd></div><div><dt>Trace ID</dt><dd className="e4-monitor-id">{value(latest.traceId)}</dd></div>
  </dl>:<p className="e4-monitor-empty">尚未觀察到 E4 回應。請在原本的 AI 智能助理送出問題，這裡會即時更新。</p>}</div>
  <div className="e4-monitor-toolbar"><h4>近期請求</h4><div><label>狀態<select aria-label="監控狀態篩選" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">全部狀態</option>{Object.entries(STATUS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>模式<select aria-label="監控模式篩選" value={mode} onChange={e=>setMode(e.target.value)}><option value="ALL">全部模式</option>{Object.entries(MODE).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><button type="button" className="template-btn" disabled={!rows.length} onClick={()=>clearE4Activity('lms',account.id)}>清除本分頁紀錄</button></div></div>
  <div className="admin-table-wrap e4-monitor-table" tabIndex={0} role="region" aria-label="E4 即時請求紀錄"><table className="admin-table"><thead><tr><th scope="col">時間／狀態</th><th scope="col">模式／模型</th><th scope="col">Token／費用</th><th scope="col">回合／耗時</th><th scope="col">追蹤資訊</th></tr></thead><tbody>{visible.length?visible.map(row=><tr key={row.id}><td><time>{time(row.startedAt)}</time><span className={`e4-monitor-status is-${row.status.toLowerCase()}`}>{STATUS[row.status]}{row.httpStatus?' · HTTP '+row.httpStatus:''}</span>{row.errorCode&&<small>{row.errorCode}</small>}</td><td>{row.kind==='CONTROL'?'對話控制':MODE[row.mode]}<small>{value(row.model)}</small></td><td>{row.inputTokens===null?'—':`${row.inputTokens}／${row.outputTokens}`}<small>{row.costUsd===null?'用量／費用未確認':`${row.execution==='MOCK'?'模擬':'估算'} USD ${row.costUsd}`}</small></td><td>{row.contextPairs===null?'—':row.contextPairs+' 回合'}<small>{row.durationMs===null?'等待回應':row.durationMs.toLocaleString()+' ms'}</small></td><td><details><summary>查看 Trace／Provider</summary><dl><dt>Trace ID</dt><dd>{value(row.traceId)}</dd><dt>Provider 請求 ID</dt><dd>{value(row.providerId)}</dd></dl></details></td></tr>):<tr><td colSpan={5}><p className="e4-monitor-empty">{rows.length?'沒有符合篩選條件的請求。':'尚無請求紀錄，不使用固定示例填入用量。'}</p></td></tr>}</tbody></table></div>
 </section>;
}
