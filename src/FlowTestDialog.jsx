import {isVirtualRequest} from './requestExecutionKind.mjs';
import {useCallback,useEffect,useRef,useState} from 'react';
import {originalBusinessEnabled,originalHumanSource,refreshOriginalBusiness,appStorage} from './originalBusiness.mjs';
import {previewFlowTest,executeFlowTest,pendingFlowTest,recoverFlowTest} from './flowTestClient.mjs';
import {flowTestTiming,FLOW_TEST_WATERMARK} from './flowTestTiming.mjs';
import {accelerateTrial,trialAcceleratorAvailability} from './trialControls.mjs';
import {createDemoApprovalSignature} from './demoApprovalSignature.mjs';
import {refreshLabSnapshot} from './useLabSnapshot.js';
import './FlowTestDialog.css';
const timeLabel=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'}).format(new Date(value)):value||'尚未開始';
const messages={VIRTUAL_TRIAL_REQUIRED:'只有新增時標記為虛擬委託的案件可以加速；真實委託依正常時間執行。',FLOW_TEST_ACCESS_DENIED:'目前帳號無權操作此虛擬委託。',FLOW_TEST_ADMIN_REQUIRED:'請由工作區管理者建立並標記測試副本，再由本案執行人操作。',FLOW_TEST_RECEIPT_REQUIRED:'請先完成本案排程與確認接收。',FLOW_TEST_SOURCE_CHANGED:'來源已變更，請重新讀取後核對。',FLOW_TEST_ALREADY_EXISTS:'本案已有測試副本，請重新讀取。',FLOW_TEST_COMPLETED:'此虛擬委託已完成試驗，可接續提交報告。',FLOW_TEST_CONFIRMATION_REQUIRED:'請填寫原因及指定確認文字。',REVISION_CONFLICT:'測試進度已被其他人更新，請重新讀取。'};
export default function FlowTestDialog({snapshot,system,onClose}){
 const formal=originalBusinessEnabled();
 const initial=pendingFlowTest();
 const records=formal?(snapshot.schedules||[]).filter(s=>s.receivedAt&&isVirtualRequest(s)).map(s=>({id:s.requestId,databaseId:originalHumanSource(s.requestId).request?.id,name:s.title||s.test})).filter(s=>s.databaseId):[];
 let actorId='';try{actorId=sessionStorage.getItem('dqa-lab-account-id')||'';}catch{/* Deny missing actor below. */}
 const guidedBlocked=!formal?globalThis.__DQA_GUIDED_ACCELERATOR_BLOCK__||'':'';
 const demo=()=>trialAcceleratorAvailability({actorId,requestId:globalThis.__DQA_GUIDED_CASE_ID__},appStorage());
 const [selected,setSelected]=useState(initial?.request_id||records[0]?.databaseId||''),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[demoState,setDemoState]=useState(()=>formal?null:demo()),[demoResult,setDemoResult]=useState(null),[uncertain,setUncertain]=useState(Boolean(initial));
 const generation=useRef(0),mutation=useRef(false),closeButton=useRef(null);
 function trapFocus(event){if(event.key!=='Tab')return;const controls=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 const invalidate=useCallback(()=>{generation.current++;},[]);
 useEffect(()=>{closeButton.current?.focus();return invalidate;},[invalidate]);
 const load=useCallback(async(requestId)=>{
  if(!requestId)return;const token=++generation.current;setBusy(true);setError('');setData(null);
  try{if(pendingFlowTest()){const result=await recoverFlowTest();if(result?.state!=='SAVED')throw Error('測試操作結果尚未確認，請稍後重新讀取；不會再次送出。');setUncertain(false);}const value=await previewFlowTest(requestId);if(token===generation.current)setData(value);}
  catch(e){if(token===generation.current)setError(messages[e.code]||e.message);}finally{if(token===generation.current)setBusy(false);}
 },[]);
 useEffect(()=>{if(!formal)return;const task=setTimeout(()=>load(selected),0);return()=>clearTimeout(task);},[formal,selected,load]); // The selected source determines the readonly preview.
 useEffect(()=>{const escape=e=>{if(e.key==='Escape'&&!mutation.current)onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onClose]);
 async function apply(){
  if(mutation.current)return;mutation.current=true;setBusy(true);setError('');
  const token=generation.current;
  try{
   if(!formal){if(guidedBlocked)throw Error(guidedBlocked);if(system!=='lab')throw Error('請在獨立 Demo 實驗室登入後操作。');const available=demo();if(!available.enabled)throw Error(available.reason);const result=accelerateTrial({actorId,requestId:available.id,signature:createDemoApprovalSignature('流程展示，非本人簽署')});setDemoResult(result);setDemoState(demo());refreshLabSnapshot();return;}
   if(!data?.run||data.execution_kind!=='VIRTUAL')throw Error('請先選擇虛擬委託並讀取。');const r=data.run;
   const result=await executeFlowTest({action:'ADVANCE',request_id:selected,run_id:r.id,expected_revision:r.revision,source_sha256:r.source_sha256,reason:'',confirmation:''});
   if(token===generation.current)setData(previous=>({...previous,run:result.run,source:result.run.source,source_sha256:result.run.source_sha256}));await refreshOriginalBusiness({afterWrite:true});refreshLabSnapshot();
  }catch(e){if(token===generation.current){setError(messages[e.code]||e.message);setUncertain(Boolean(pendingFlowTest()));}}
  finally{mutation.current=false;if(token===generation.current)setBusy(false);}
 }
 async function downloadRecord(){
  const token=generation.current;setBusy(true);setError('');
  try{const response=await fetch('/api/business/flow-tests/report/'+selected,{credentials:'same-origin',cache:'no-store'});if(!response.ok){const packet=await response.json().catch(()=>null);throw Error(messages[packet?.error?.code]||'無法下載測試紀錄，請重新登入並確認權限。');}if(!response.headers.get('content-type')?.startsWith('text/html'))throw Error('測試紀錄格式不符，已停止下載。');const html=await response.text();if(!html.includes(FLOW_TEST_WATERMARK))throw Error('測試紀錄缺少測試用途標示，已停止下載。');if(token!==generation.current)return;const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='流程測試_'+data.run.source.legacy_id+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  catch(e){if(token===generation.current)setError(e.message);}finally{if(token===generation.current)setBusy(false);}
 }
 const run=data?.run,source=run?.source||data?.source;
 let timing;try{if(source)timing=flowTestTiming({startsAt:source.starts_at,endsAt:source.ends_at,nominalHours:source.nominal_hours,percent:run?.percent||0,actualStartedAt:run?.actual_started_at,actualCompletedAt:run?.actual_completed_at});}catch{/* Show incomplete source, do not invent timing. */}
 const next=run?Math.min(100,run.percent+50):null;
 return <div className="flow-test-backdrop"><section className="flow-test-dialog" role="dialog" aria-modal="true" aria-labelledby="flow-test-title" onKeyDown={trapFocus}><header><div><small>{formal?'虛擬委託・實際流程':'獨立 Demo 展示'}</small><h2 id="flow-test-title">流程測試加速器</h2></div><button ref={closeButton} aria-label="關閉流程測試加速器" disabled={busy} onClick={onClose}>×</button></header><div className="flow-test-body"><p className="flow-test-warning">{FLOW_TEST_WATERMARK}。{formal?'僅推進虛擬委託的實際試驗流程，完成後可提交報告與簽核。真實委託依正常時間執行；不占用實體設備。':'僅操作目前隔離 Demo 的案件，不連接正式資料庫。'}</p>
 {formal?<>{!records.length&&<p role="status">目前沒有已確認接收的虛擬委託。請新增虛擬委託（Demo 填入會自動標記），完成簽核、排程與接收。既有真實委託不能加速。</p>}<label>來源案件<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setData(null);}}><option value="">請選擇已確認接收的案件</option>{records.map(r=><option key={r.databaseId} value={r.databaseId}>{r.id} · {r.name}</option>)}</select></label><button disabled={busy||!selected} onClick={()=>load(selected)}>重新讀取測試資料</button>
 {source&&<><h3>{source.legacy_id} · {source.trial_name}</h3><dl><dt>原始工時</dt><dd>{source.nominal_hours} 小時</dd><dt>原排程</dt><dd>{timeLabel(source.starts_at)} → {timeLabel(source.ends_at)}</dd><dt>排程時窗</dt><dd>{timing?.schedulingDays.toLocaleString('zh-TW',{maximumFractionDigits:4})} 天</dd><dt>虛擬試驗進度</dt><dd>{run?.percent||0}%</dd><dt>模擬經過時間</dt><dd>{((timing?.virtualElapsedSeconds||0)/3600).toLocaleString()} 小時</dd><dt>模擬時間</dt><dd>{timing?timeLabel(timing.virtualAt):'待確認'}</dd><dt>實際操作時間</dt><dd>{timeLabel(run?.actual_started_at)}{run?.actual_completed_at&&' → '+timeLabel(run.actual_completed_at)}</dd></dl><p className="flow-test-formula">模擬時間＝原排程開始＋排程時窗 × 進度。{timing&&`若以 2 分鐘演練整段時窗，相當於 ${timing.referenceRatioForTwoMinutes.toLocaleString()} 倍；本功能由你逐次確認 50% 與 100%。`}</p>

 {run&&<p className="flow-test-identity">虛擬委託 · {({BOOKED:'等待開始',RUNNING:'試驗中',COMPLETED:'已完成'})[run.native_status]||run.state} · {run.id}<br/>來源版本：{source.request_revision} · 進度版本：{run.revision}</p>}
 </>}
 </>:<p role="status">{demoResult?`${demoResult.id}：模擬進度 ${demoResult.percent}%。`:demoState?.enabled?`${demoState.id}：下一步 ${demoState.nextPercent}%。`:demoState?.reason}</p>}
 {guidedBlocked&&<p role="status">{guidedBlocked}</p>}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在核對並讀取測試資料…</p>}</div><footer>{formal&&run&&<button className="flow-test-download" disabled={busy} onClick={downloadRecord}>下載流程測試紀錄</button>}<button disabled={busy} onClick={onClose}>關閉</button><button className="flow-test-primary" data-flow-test-action={formal?(next??0):(demoState?.nextPercent??0)} disabled={busy||uncertain||Boolean(guidedBlocked)||(formal?(!data||!timing||!run||data.execution_kind!=='VIRTUAL'||run.percent===100):!demoState?.enabled||system!=='lab')} onClick={apply}>{formal?`推進至 ${next??50}%`:`推進至 ${demoState?.nextPercent||100}%`}</button></footer></section></div>;
}
