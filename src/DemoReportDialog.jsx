import {useEffect,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion,originalBusinessEnabled,refreshOriginalBusiness} from './originalBusiness.mjs';
import {isVirtualRequest} from './requestExecutionKind.mjs';
import {passedDemoReview} from './demoReportPreparation.mjs';
const messages={DEMO_REPORT_ACCESS_DENIED:'僅本案執行人能產生報告。',DEMO_REPORT_NOT_READY:'請先完成試驗前準備、確認簽名與虛擬試驗加速。',DEMO_REPORT_TOO_LARGE:'產生的報告超過 3 MB，請減少綁定範本內的圖片後重試。',DEMO_REPORT_CHECK_FAILED:'報告尚未通過檢查，請確認試驗規範與範本設定。',REVISION_CONFLICT:'委託或排程已變更，請關閉後重新開啟。'};
export default function DemoReportDialog({snapshot,onClose,onReady}){
 const actor=businessIdentity()?.member?.id;
 const candidates=(snapshot.labWorkItems||[]).filter(r=>r.businessDatabase&&isVirtualRequest(r)&&r.executorId===actor&&r.status==='已完成');
 const [selected,setSelected]=useState(candidates.length===1?candidates[0].id:''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);const generation=useRef(0),controller=useRef(null);
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 async function generate(){
  if(busy)return;const token=++generation.current,epoch=businessSessionVersion(),abort=new AbortController();controller.current=abort;setBusy(true);setError('');setResult(null);
  try{
   if(!originalBusinessEnabled())throw Error('請登入資料庫工作區後使用此指令。');await refreshOriginalBusiness();const q=candidates.find(r=>r.id===selected);if(!q)throw Error('請選擇已完成試驗的虛擬委託。');
   const {data}=await businessClient.request('/demo-reports/generate',{method:'POST',retry:false,signal:abort.signal,body:{request_id:q.databaseId,request_revision:q.sourceRevision,schedule_revision:q.scheduleRevision}});
   if(typeof data?.content!=='string'||data.content.length>4194304||data.request_id!==q.databaseId||data.request_revision!==q.sourceRevision||data.schedule_revision!==q.scheduleRevision||!passedDemoReview(data.check)||data.check.server_verified!==true)throw Error('報告檢查結果不完整，未下載。');
   const bytes=Uint8Array.from(atob(data.content),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(bytes.length!==data.byteLength||hash!==data.sha256)throw Error('報告檔案完整性驗證失敗。');
   if(token!==generation.current||epoch!==businessSessionVersion()||actor!==businessIdentity()?.member?.id||abort.signal.aborted)return;
   setResult({...data,owner:actor,epoch,file:new File([bytes],data.name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),legacyId:q.id});
  }catch(e){if(token===generation.current&&!abort.signal.aborted)setError(messages[e.code]||businessErrorMessage(e));}finally{if(token===generation.current)setBusy(false);}
 }
 function ensureOwner(){if(result?.owner!==businessIdentity()?.member?.id||result.epoch!==businessSessionVersion())throw Error('登入帳號已變更，請重新產生報告。');}
 function download(){if(!result)return;try{ensureOwner();}catch(e){setError(e.message);return;}const url=URL.createObjectURL(result.file),a=document.createElement('a');a.href=url;a.download=result.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 return <CompactDialog title="生成 Demo 試驗報告" className="demo-report-dialog" onClose={onClose} preventClose={busy}><div className="demo-report-body"><p>依已完成的虛擬委託與送簽時固定的範本產生 Excel，下載前以提交時相同的後端規則驗證。</p><label>虛擬委託<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setResult(null);setError('');}}><option value="">請選擇委託</option>{candidates.map(q=><option key={q.id} value={q.id}>{q.id} · {q.project||q.productCode} · {q.test||q.testItems?.join('、')}</option>)}</select></label>{!candidates.length&&<p role="status">目前沒有由你執行且已完成試驗的虛擬委託。請先完成準備、簽名及 /demo accelerator。</p>}{busy&&<p role="status">正在依委託生成並檢查報告…</p>}{error&&<p role="alert">{error}</p>}{result&&<div className="report-review-status is-passed" role="status"><strong>AI 審查：通過（Demo 規則驗證）</strong><span>{result.name}</span><span>委託、產品、試驗、虛擬用途與結果欄位已核對；簽名保留空白。</span></div>}</div><footer><button type="button" disabled={busy} onClick={onClose}>關閉</button>{result?<><button type="button" onClick={download}>下載 Demo 報告</button>{onReady&&<button type="button" className="lab-primary" onClick={()=>{try{ensureOwner();onReady(result);download();}catch(e){setError(e.message);}}}>下載並帶入報告提交視窗</button>}</>:<button type="button" className="lab-primary" disabled={busy||!selected} onClick={generate}>產生並檢查報告</button>}</footer></CompactDialog>;
}
