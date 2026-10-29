import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import ClearCasesButton from './ClearCasesButton.jsx';
import {submitReportWorkflow} from './reportWorkflow.mjs';
import {createReportTemplate} from './reportWorkbook.mjs';
import {DEFAULT_SIGNATURE_CELLS} from './reportRules.mjs';
import useReportSnapshot,{refreshReportSnapshot} from './useReportSnapshot.js';
import {createDemoApprovalSignature} from './demoApprovalSignature.mjs';
import {confirmLabReceipt,completeLabTrial} from './labReceipts.mjs';
import {submitLabOperation,applyLabOperationResults} from './labOperations.mjs';
import ScheduleTimeline from './ScheduleTimeline.jsx';
import useScheduleLifecycle from './useScheduleLifecycle.js';
import {PaginatedTable} from './Pagination.jsx';
import RequestInfoModal from './RequestInfoModal.jsx';
import useLabSnapshot,{refreshLabSnapshot} from './useLabSnapshot.js';
import {mergeLabSchedules,labRequestInformation} from './labScheduleBridge.mjs';
import SignatureHistory from './SignatureHistory.jsx';
import { auditSignatures } from './signatureHistory.mjs';
import useDemoPersistence from './useDemoPersistence.js';
import { readDemoAccounts } from "./demoAccounts.mjs";
import React, { useEffect, useState } from "react";
import "./LabApp.css";
import './LoginEntry.css';
import './LabLoginDetails.css';
import './LabDashboardFrame.css';
import ApprovalSignature from "./ApprovalSignature.jsx";
import {accessSystem} from "./demoPermissions.mjs";

const DEMO_REQUESTS = [];
const LEGACY_DEMO_IDS = new Set(['LAB-2026-001','LAB-2026-002','LAB-2026-003']);
const STORAGE_KEY = "dqa_lab_demo_requests_v1";
const AUDIT_KEY = "dqa_lab_demo_audit_v1";

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
const now = () => new Date().toLocaleString("zh-TW", { hour12: false });



export default function LabApp({ path, navigate }) {
  const lifecycleError=useScheduleLifecycle();
  useReportSnapshot();
  const sharedSnapshot=useLabSnapshot();
  const [username, setUsername] = useState(() => { try { const id=window.sessionStorage.getItem("dqa-lab-account-id"), a=readDemoAccounts(); const selected=a.find(x=>x.id===id&&accessSystem(x,'lab'))||a.find(x=>x.role==='實驗室工程師'&&accessSystem(x,'lab'))||a.find(x=>accessSystem(x,'lab')); return selected?.email || selected?.name || ""; } catch { return ""; } });
  const [password, setPassword] = useState("demo1234");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [account, setAccount] = useState(() => {
    try { const id=window.sessionStorage.getItem("dqa-lab-account-id"); const accounts=readDemoAccounts(); const found=Array.isArray(accounts) ? accounts.find(a=>a.id===id) : null; return accessSystem(found,"lab") ? found : null; } catch { return null; }
  });
  const loggedIn=Boolean(account);
  const {dark,toggleTheme}=useSystemTheme();

  useEffect(() => {
    if (path === "/lab" || (path === "/lab/dashboard" && !loggedIn)) {
      navigate("/lab/login", true);
    } else if (path === "/lab/login" && loggedIn) {
      navigate("/lab/dashboard", true);
    }
  }, [path, loggedIn, navigate]);

  const login = () => {
    try { const all=readDemoAccounts(); const key=username.trim().toLowerCase(); const matches=Array.isArray(all)?all.filter(a=>accessSystem(a,"lab") && (String(a.email||"").toLowerCase()===key || a.name===username.trim())):[]; const found=matches.length===1?matches[0]:null; if(!found || password!=="demo1234"){setLoginError("帳號沒有實驗室權限，或密碼不正確。");return;} window.sessionStorage.setItem("dqa-lab-account-id",found.id);setAccount(found);setUsername(found.name);setLoginError("");navigate("/lab/dashboard"); } catch { setLoginError("無法讀取帳號資料。"); }
  };
  const logout = () => { window.sessionStorage.removeItem("dqa-lab-account-id"); setAccount(null); navigate("/lab/login", true); };
  const [requests, setRequests] = useState(() => readStorage(STORAGE_KEY, DEMO_REQUESTS).filter(row=>!LEGACY_DEMO_IDS.has(row.id)));
  useEffect(()=>{
    // Synchronize persisted lab work items with the shared browser schedule source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequests(previous=>{const next=applyLabOperationResults(mergeLabSchedules(sharedSnapshot.labWorkItems.filter(row=>!LEGACY_DEMO_IDS.has(row.id)),sharedSnapshot.schedules),sharedSnapshot.labOperations);return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});
  },[sharedSnapshot]);
  const [audit, setAudit] = useState(() => readStorage(AUDIT_KEY, []));
  useEffect(()=>{
    const stored=readStorage(AUDIT_KEY,[]);
    // Synchronize supervisor review records written by another LMS view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudit(previous=>{const ids=new Set(previous.map(row=>row.id));const added=stored.filter(row=>!ids.has(row.id));return added.length?[...added,...previous]:previous;});
  },[sharedSnapshot.labOperations]);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [labSignature, setLabSignature] = useState("");
  const [signatureMode,setSignatureMode]=useState("draw");
  const [action, setAction] = useState("");
  const [tab, setTab] = useState("requests");
  const [notice, setNotice] = useState("");
  const [reportFile, setReportFile] = useState(null);
  const [modalError, setModalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportProgress,setReportProgress]=useState(0);
  const [reportMessage,setReportMessage]=useState('');
  const [reportCheck,setReportCheck]=useState(null);
  const [signatureCells,setSignatureCells]=useState(DEFAULT_SIGNATURE_CELLS);
  const [detail, setDetail] = useState(null);
  const [downloadJob, setDownloadJob] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    if (!downloadJob) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const progress = Math.min(100, Math.floor((Date.now() - started) / 30));
      setDownloadProgress(progress);
      if (progress >= 100) {
        window.clearInterval(timer);
        const id=downloadJob.id;
        createReportTemplate(readStorage('dqa-request-demo-v2',[]).find(row=>row.id===id)||{id}).then(bytes=>{const url=URL.createObjectURL(new Blob([bytes]));const link=document.createElement('a');link.href=url;link.download=`試驗報告單_${id}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}).catch(error=>setNotice(error.message));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [downloadJob]);

  const sampleNumbers = item => item.sampleIds || ({
    "LAB-2026-001": "SAMPLE-001、SAMPLE-002、SAMPLE-003",
    "LAB-2026-002": "SAMPLE-004、SAMPLE-005",
    "LAB-2026-003": "SAMPLE-006、SAMPLE-007、SAMPLE-008",
  }[item.id] || "尚未設定");
  const requestStorage = useDemoPersistence(STORAGE_KEY, requests);
  const auditStorage = useDemoPersistence(AUDIT_KEY, audit);

  const navigateHome = () => { window.location.assign("/"); };
  const openAction = (item, type) => { setSelected(item); setAction(type); setReason(""); setLabSignature(""); setReportFile(null); setModalError(""); setNotice(""); setReportCheck(null); setReportProgress(0); setReportMessage(""); };
  const performAction = () => {
    if (!selected) return;
    if ((action === "cancel" || action === "interrupt") && !reason.trim()) {
      setModalError("此操作必須填寫原因。");
      return;
    }
    if (!['confirm','cancel'].includes(action) && !labSignature) { setModalError("送出此操作前請先簽名。"); return; }
    if(action==='confirm'){
      try{const receipt=confirmLabReceipt({requestId:selected.id,actorId:account.id,expected:{scheduleId:selected.scheduleId,reservationId:selected.reservationId,time:selected.scheduledStart,end:selected.scheduledEnd}});
       setRequests(previous=>previous.map(row=>row.id===receipt.id?receipt:row));setAudit(readStorage(AUDIT_KEY,[]));refreshLabSnapshot();setNotice('確認接收已儲存，等待排程開始。');setDownloadProgress(0);setDownloadJob({id:selected.id});setSelected(null);
      }catch(error){setModalError(error.message);}return;
    }
    if(action==='complete'){
      try{const completed=completeLabTrial({requestId:selected.id,actorId:account.id,signature:labSignature});setRequests(previous=>previous.map(row=>row.id===completed.id?completed:row));setAudit(readStorage(AUDIT_KEY,[]));refreshLabSnapshot();setNotice('試驗已完成，LMS 與設備狀態已同步。');setSelected(null);}catch(error){setModalError(error.message);}return;
    }
    if(action==='cancel'||action==='interrupt'){
      try{const operation=submitLabOperation({requestId:selected.id,action,reason,signature:labSignature,actorId:account.id});
        setRequests(previous=>applyLabOperationResults(previous,[operation,...sharedSnapshot.labOperations]));
      }catch(error){setModalError(error.message);return;}
    }
    const nextStatus = action === "complete" ? "已完成" : selected.status;
    const eventName = { confirm: "確認接收", interrupt: "提出試驗中斷申請", cancel: "提出取消申請", complete: "完成試驗" }[action];
    if (action === "confirm" || action === "complete") {
      setRequests(prev => prev.map(item => item.id === selected.id ? { ...item, status: nextStatus } : item));
    }
    setAudit(prev => [{ id: `${Date.now()}-${prev.length}`, requestId: selected.id, action: eventName, actor: username || "demo-user", time: now(), signature: ['confirm','cancel'].includes(action) ? '' : labSignature, actorId: account.id, at: new Date().toISOString(), reason: reason.trim() || "示範確認" }, ...prev]);
    setNotice(action === "cancel" ? "取消申請已送至 LMS 待核准。" : action === "interrupt" ? "申請已送至 LMS 一階主管審核。" : `${eventName}已記錄。`);
    if (action === "confirm") { setDownloadProgress(0); setDownloadJob({ id: selected.id }); }
    setSelected(null);
  };
  async function downloadCaseTemplate(id,demo=false){
    const source=sharedSnapshot.electronic.find(row=>row.id===id)||{id};
    const bytes=await createReportTemplate(source,demo);
    if(demo){setReportFile(new File([bytes],id+'-DEMO.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));setSignatureMode('upload');setLabSignature(createDemoApprovalSignature('測試人員簽名（DEMO）'));return;}
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='試驗報告單_'+id+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  const submitReport = async () => {
    setSubmitting(true);setModalError('');setReportCheck(null);
    try{await submitReportWorkflow({requestId:selected.id,file:reportFile,signature:labSignature,actorId:account.id,cells:signatureCells,onProgress:(value,message)=>{setReportProgress(value);setReportMessage(message);}});setRequests(readStorage(STORAGE_KEY,[]));await refreshReportSnapshot();refreshLabSnapshot();setNotice('報告已通過 Demo 防呆檢查，送至 LMS 二階主管審核。');setSelected(null);}catch(error){setModalError(error.message);setReportCheck(error.check||null);}finally{setSubmitting(false);}
  };

  if (!loggedIn || path !== "/lab/dashboard") return (
    <div className={`lab-login-shell ${dark ? "lab-login-dark" : ""}`}>
      <header className="lab-login-header"><CompanyBrandLogo dark={dark}/><button type="button" className="lab-theme-pill" onClick={toggleTheme} aria-label="切換淺色或深色模式"><span>{dark ? "☾" : "☼"}</span><span>{dark ? "深色模式" : "淺色模式"}</span><i className={dark ? "is-dark" : ""}><b /></i></button></header>
      <main className="lab-login-main"><form className="lab-login-card" onSubmit={e => { e.preventDefault(); login(); }}>
        <div className="lab-login-icon">CL</div><div className="lab-eyebrow">DQA LAB SYSTEM</div>
        <h1>造隆實驗室系統</h1><p className="lab-login-description">試驗接收、執行與歷程管理</p>
        <label htmlFor="lab-username">登入帳號</label><input id="lab-username" autoComplete="username" placeholder="請輸入您的帳號" value={username} onChange={e => setUsername(e.target.value)} />
        <label htmlFor="lab-password">密碼</label><div className="lab-login-password"><input id="lab-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="請輸入您的密碼" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} aria-pressed={showPassword}>{showPassword ? "隱藏" : "顯示"}</button></div>
        {loginError && <p role="alert" className="lab-login-error">{loginError}</p>}
        <button className="lab-primary lab-login-submit" type="submit" disabled={!username.trim()}>登入系統 <span>→</span></button>
        <button className="lab-login-return" type="button" onClick={navigateHome}>←　返回系統入口</button>
        <small className="lab-login-note">Demo 原型：此處僅用於角色流程展示，尚未串接正式帳號驗證。</small>
      </form></main>
    </div>
  );

  return (
    <div className={`lab-shell ${dark ? "lab-theme-dark" : "lab-theme-light"}`}>
      <header className="lab-global-header">
        <CompanyBrandLogo dark={dark}/>
        <SystemHeaderActions dark={dark} onToggle={toggleTheme} account={sharedSnapshot.accounts.find(row=>row.id===account.id)||account} onLogout={logout} notifications={[{title:'待接收試驗',detail:'等待實驗室確認接收',count:requests.filter(row=>row.status==='待確認').length,icon:'✓',onClick:()=>setTab('requests')}]}/>
      </header>
      <aside className="lab-sidebar">
        <div className="lab-sidebar-label">WORKSPACE</div>
        <button className={tab === "requests" ? "active" : ""} aria-current={tab === 'requests'?'page':undefined} onClick={() => setTab("requests")}><span aria-hidden="true">▤</span>試驗委託與接收</button>
        <button className={tab === "audit" ? "active" : ""} aria-current={tab === 'audit'?'page':undefined} onClick={() => setTab("audit")}><span aria-hidden="true">◷</span>操作歷程</button>
        <div className="lab-demo-banner lab-side-note">展示環境 · LMS 已排程委託會同步至待確認清單。實驗室接收與操作歷程儲存於此瀏覽器，取消原安排需先進入 LMS 待核准；中斷申請由 LMS 一階主管審核。</div>
        <button className="lab-back" onClick={navigateHome}>← 返回系統入口</button>
      </aside>
      <main className="lab-main">
        <header className="lab-topbar"><div><span className="lab-eyebrow">DQA LAB SYSTEM</span><h1>{tab === "requests" ? "實驗室工作台" : "操作歷程"}</h1><p>管理試驗接收、執行進度與操作紀錄。</p></div></header>
        {lifecycleError&&<div className="lab-notice" role="alert">{lifecycleError}</div>}
        {(requestStorage.error || auditStorage.error) && <div role="alert" className="lab-notice">{requestStorage.error || auditStorage.error}<button onClick={() => { requestStorage.retry(); auditStorage.retry(); }}>重試儲存</button></div>}{notice && <div className="lab-notice" role="status">{notice}</div>}
        {tab === "requests" ? <>
          <div className="lab-stats lab-stats-with-scheduled">
            <div><span>待確認</span><strong>{requests.filter(x => x.status === "待確認").length}</strong></div>
            <div><span>已排程</span><strong>{requests.filter(x=>x.status === "已排程").length}</strong></div>
            <div><span>試驗中</span><strong>{requests.filter(x => x.status === "試驗中").length}</strong></div>
            <div><span>已完成</span><strong>{requests.filter(x => x.status === "已完成").length}</strong></div>
          </div>
          <section className="lab-panel"><div className="lab-panel-heading"><div><h2>試驗委託清單</h2><p>確認接收、試驗執行與主管審核申請</p></div></div>
            <div className="lab-table-wrap"><PaginatedTable><thead><tr><th>委託編號</th><th>專案／試驗</th><th>設備</th><th>樣品編號</th><th>試驗日程</th><th>狀態</th><th>操作</th></tr></thead><tbody>{requests.filter(item=>item.status!=="已結案").map(item => <tr key={item.id}>
              <td><button type="button" className="lab-request-link" onClick={() => setDetail(item)}>{item.id}</button></td><td>{item.project}<small>{item.test}</small><small className="lab-trial-hours">{item.hours} h</small></td><td>{item.equipment}</td><td>{sampleNumbers(item)}</td><td><ScheduleTimeline row={sharedSnapshot.schedules.find(row=>row.id===item.scheduleId||row.requestId===item.id)||{time:item.scheduledStart,end:item.scheduledEnd,status:item.status==='取消'?'取消':'已排程'}}/></td><td><span className={`lab-status ${item.status === "試驗中" ? "running" : ""}`}>{item.status}</span>{item.lastOperationStatus==='已退回'&&<small>申請已退回，請查看操作歷程</small>}</td>
              <td><div className="lab-actions">{item.status==='已排程'&&!item.pendingOperationId&&<span className="lab-review-indicator">已接收，等待開始</span>}{item.pendingOperationId?<span className="lab-review-indicator">待一階主管審核</span>:null}{!item.pendingOperationId&&item.status === "待確認" && <><button onClick={() => openAction(item,"confirm")}>確認接收</button><button className="lab-danger" onClick={() => openAction(item,"cancel")}>申請取消</button></>}{!item.pendingOperationId&&item.status === "試驗中" && <><button onClick={() => openAction(item,"complete")}>試驗完成</button><button className="lab-danger" onClick={() => openAction(item,"interrupt")}>申請中斷</button></>}{item.status === "已完成" && <button type="button" onClick={() => openAction(item,"submitReport")}>提交報告</button>}</div></td>
            </tr>)}</tbody></PaginatedTable></div>
          </section>
        </> : <section className="lab-panel"><div className="lab-panel-heading"><div><h2>本機操作歷程</h2><p>示範用追加紀錄，尚未具備正式後端不可竄改稽核機制</p></div></div><div className="lab-table-wrap"><PaginatedTable><thead><tr><th>時間</th><th>委託編號</th><th>操作</th><th>操作者</th><th>原因</th><th>簽名</th></tr></thead><tbody>{audit.length ? audit.map(event => <tr key={event.id}><td>{event.time}</td><td><button type="button" className="lab-request-link" onClick={()=>setDetail(requests.find(row=>row.id===event.requestId)||{id:event.requestId})}>{event.requestId}</button></td><td>{event.action}</td><td>{event.actor}</td><td>{event.reason}</td><td>{event.signature ? <SignatureHistory records={auditSignatures([event], event.requestId)} /> : "舊紀錄未提供簽名"}</td></tr>) : <tr><td colSpan="6">尚無操作紀錄</td></tr>}</tbody></PaginatedTable></div></section>}
      </main>
      <ClearCasesButton />
      {detail && <RequestInfoModal account={account} request={labRequestInformation(detail,sharedSnapshot)} onClose={()=>setDetail(null)}/>}
      {downloadJob && <div className="lab-modal-backdrop"><section className="lab-modal" role="dialog" aria-modal="true" aria-labelledby="download-title"><h2 id="download-title">取得試驗報告單</h2><p>委託編號：{downloadJob.id}</p><p>正在準備 Excel 範本</p><div style={{height:12,background:"#e5edf8",borderRadius:8,overflow:"hidden"}} role="progressbar" aria-label="下載準備進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress}><div style={{height:"100%",width:`${downloadProgress}%`,background:"#286bc4"}} /></div><p>{downloadProgress}%</p>{downloadProgress === 100 && <><p>已開始下載空白範本，請依委託資料填寫。</p><div className="lab-modal-actions"><button onClick={()=>downloadCaseTemplate(downloadJob.id).catch(error=>setNotice(error.message))}>重新下載</button><button className="lab-primary" onClick={() => setDownloadJob(null)}>關閉</button></div></>}</section></div>}
      {selected && <div className="lab-modal-backdrop" role="presentation" onMouseDown={e => { if (!submitting && e.target === e.currentTarget) setSelected(null); }}><section className={`lab-modal ${action==="submitReport"?"report-submit-modal":""}`} role="dialog" aria-modal="true" aria-labelledby="lab-modal-title"><h2 id="lab-modal-title">{({confirm:"確認接收",cancel:"申請取消",interrupt:"申請試驗中斷",complete:"完成試驗",submitReport:"提交試驗報告"})[action]}</h2><p>{selected.id} · {selected.project}</p>{!['confirm','cancel'].includes(action) && <ApprovalSignature key={selected.id} label="本次操作簽名" accountId={account.id} mode={signatureMode} onModeChange={setSignatureMode} value={labSignature} onChange={setLabSignature} onError={setModalError} />}{(action === "cancel" || action === "interrupt") && <><label htmlFor="lab-reason">原因（必填）</label><textarea id="lab-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="請填寫操作原因" rows="4" /></>}{action === "submitReport" && <><div className="report-actions"><button type="button" disabled={submitting} onClick={()=>downloadCaseTemplate(selected.id).catch(error=>setModalError(error.message))}>下載本案 Excel 範本</button><button type="button" disabled={submitting} onClick={()=>downloadCaseTemplate(selected.id,true).catch(error=>setModalError(error.message))}>DEMO 填寫報告</button></div><label htmlFor="lab-report-file">上傳 Excel 報告（必填）</label><input id="lab-report-file" type="file" disabled={submitting} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setReportFile(e.target.files?.[0]||null);setModalError('');setReportCheck(null);}}/><p>{reportFile?.name||'尚未選擇檔案'}</p><small>請使用本案範本（.xlsx，10 MB 以內）。Demo 依規則檢查編號、結果與公式；PDF 支援標準表格及簽名，複雜圖表與巨集不適用。</small><details><summary>主管簽名位置設定</summary><div className="report-cell-inputs">{[2,3].map(level=><label key={level}>{level} 階簽名儲存格<input disabled={submitting} value={signatureCells['level'+level]} onChange={e=>setSignatureCells(previous=>({...previous,['level'+level]:e.target.value.toUpperCase().trim()}))}/></label>)}</div></details>{submitting&&<div className="report-progress" role="status"><p>AI 防呆審查 · Demo 規則檢查：{reportMessage}</p><progress max="100" value={reportProgress}/></div>}{reportCheck&&<div className="report-checks">{reportCheck.checks.map(row=><p key={row.label}>{row.ok?'✓':'!'} {row.label}：{row.detail}</p>)}</div>}</>}{modalError && <p className="lab-warning" role="alert">{modalError}</p>}{(action === "cancel" || action === "interrupt") && <p className="lab-warning">{action==='cancel'?'送出後進入 LMS 待核准，一階主管核准後才退回待排程。':'中斷申請將交由 LMS 一階主管審核。'}</p>}<div className="lab-modal-actions"><button disabled={submitting} onClick={() => setSelected(null)}>返回</button><button className="lab-primary" disabled={submitting} onClick={action === "submitReport" ? submitReport : performAction}>{submitting ? "檢查與儲存中…" : action === "submitReport" ? "提交" : "確認送出"}</button></div></section></div>}
    </div>
  );
}
