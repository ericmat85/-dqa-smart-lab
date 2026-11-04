import TrialEquipmentDialog from './TrialEquipmentDialog.jsx';
import AiReviewProgress from './AiReviewProgress.jsx';
import {canAccessLabPage} from './customRoles.mjs';
import './LabWorkspaceExpansion.css';
import MaterialsPage from './MaterialsPage.jsx';
import EquipmentPage from './EquipmentPage.jsx';
import IntelligentAssistant from './IntelligentAssistant.jsx';
import useLabView from './useLabView.js';
import WorkspaceDiagonalArrow from './WorkspaceDiagonalArrow.jsx';
import {labRequestOverdue} from './labRequestFilters.mjs';
import WorkspaceMenuToggle from './WorkspaceMenuToggle.jsx';
import useSidebarMobile from './useSidebarMobile.js';
import './LabDashboardCompactV2.css';
import './WorkspacePageHeader.css';
import WorkspaceSidebarBrand from './WorkspaceSidebarBrand.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import EnterpriseLoginLayout,{LoginSystemIcon} from './EnterpriseLoginLayout.jsx';
import './EnterpriseLab.css';
import HelpTip from './HelpTip.jsx';
import {startSession,endSession} from './idleSessions.mjs';
import LoginCredentials from './LoginCredentials.jsx';
import {PORTAL_TITLES} from './portalLabels.mjs';
import {createCompletedDemoFlow} from './completedDemoFlow.mjs';
import ReportArchive from './ReportArchive.jsx';
import {canOpenReportArchive} from './reportArchive.mjs';
import {accelerateTrial} from './trialControls.mjs';
import EquipmentInfoModal from './EquipmentInfoModal.jsx';
import {usesEquipment} from './scheduleResources.mjs';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import ClearCasesButton from './ClearCasesButton.jsx';
import {submitReportWorkflow} from './reportWorkflow.mjs';
import {prepareDemoReport,passedDemoReview,DEMO_REVIEW_PASSED} from './demoReportPreparation.mjs';
import {createReportTemplate,inspectReport} from './reportWorkbook.mjs';
import useReportSnapshot,{refreshReportSnapshot} from './useReportSnapshot.js';
import {createDemoApprovalSignature} from './demoApprovalSignature.mjs';
import {confirmLabReceipt} from './labReceipts.mjs';
import {submitLabOperation,applyLabOperationResults} from './labOperations.mjs';
import ScheduleTimeline from './ScheduleTimeline.jsx';
import useScheduleLifecycle from './useScheduleLifecycle.js';
import {PaginatedTable} from './Pagination.jsx';
import RequestInfoModal from './RequestInfoModal.jsx';
import {refreshLabSnapshot} from './useLabSnapshot.js';
import {mergeLabSchedules,labRequestInformation} from './labScheduleBridge.mjs';
import SignatureHistory from './SignatureHistory.jsx';
import { auditSignatures } from './signatureHistory.mjs';
import useDemoPersistence from './useDemoPersistence.js';
import { readDemoAccounts } from "./demoAccounts.mjs";
import React, { useEffect, useRef, useState } from "react";
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
  const {snapshot:sharedSnapshot,metrics:labMetrics,now:labNow}=useLabView();
  const [username, setUsername] = useState(() => { try { const id=window.sessionStorage.getItem("dqa-lab-account-id"), a=readDemoAccounts(); const selected=a.find(x=>x.id===id&&accessSystem(x,'lab'))||a.find(x=>x.role==='實驗室工程師'&&accessSystem(x,'lab'))||a.find(x=>accessSystem(x,'lab')); return selected?.email || selected?.name || ""; } catch { return ""; } });
  const [password, setPassword] = useState("demo1234");
  const [loginError, setLoginError] = useState("");

  const [account, setAccount] = useState(() => {
    try { const id=window.sessionStorage.getItem("dqa-lab-account-id"); const accounts=readDemoAccounts(); const found=Array.isArray(accounts) ? accounts.find(a=>a.id===id) : null; return accessSystem(found,"lab") ? found : null; } catch { return null; }
  });
  const loggedIn=Boolean(account&&sharedSnapshot.accounts.some(row=>row.id===account.id&&accessSystem(row,'lab')));
  const [,refreshRoleAccess]=useState(0);useEffect(()=>{const refresh=()=>refreshRoleAccess(v=>v+1);window.addEventListener('dqa:roles-updated',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('dqa:roles-updated',refresh);window.removeEventListener('storage',refresh);};},[]);
  const {dark,toggleTheme}=useSystemTheme();

  useEffect(() => {
    if (path === "/lab" || (path === "/lab/dashboard" && !loggedIn)) {
      navigate("/lab/login", true);
    } else if (path === "/lab/login" && loggedIn) {
      navigate("/lab/dashboard", true);
    }
  }, [path, loggedIn, navigate]);

  const login = () => {
    try { const all=readDemoAccounts(); const key=username.trim().toLowerCase(); const matches=Array.isArray(all)?all.filter(a=>accessSystem(a,"lab") && (String(a.email||"").toLowerCase()===key || a.name===username.trim())):[]; const found=matches.length===1?matches[0]:null; if(!found || password!=="demo1234"){setLoginError("帳號沒有實驗室權限，或密碼不正確。");return;} startSession('lab',found.id);setAccount(found);setUsername(found.name);setLoginError("");navigate("/lab/dashboard"); } catch { setLoginError("無法讀取帳號資料。"); }
  };
  const logout = () => { endSession('lab'); setAccount(null); navigate("/lab/login", true); };
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
  const [menuOpen,setMenuOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);const sidebarMobile=useSidebarMobile(720);
  const [requestFilter,setRequestFilter]=useState('all');
  const chooseTab=next=>{setTab(next);setMenuOpen(false);if(next==='requests')setRequestFilter('all');};
  const [notice, setNotice] = useState("");
  const [reportFile, setReportFile] = useState(null);
  const [preparingReport,setPreparingReport]=useState(false);
  const [modalError, setModalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportProgress,setReportProgress]=useState(0);
  const reportSubmitButton=useRef(null);
  const [reportMessage,setReportMessage]=useState('');
  const [reportCheck,setReportCheck]=useState(null);
  const [detail, setDetail] = useState(null);
  const [equipmentRequest,setEquipmentRequest]=useState(null);
  const [equipmentChoice,setEquipmentChoice]=useState(null);
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

  const addReportExample = () => {
    try {
      const result=accelerateTrial({actorId:account.id,requestId:globalThis.__DQA_GUIDED_CASE_ID__,signature:createDemoApprovalSignature('DEMO 模擬流程，非本人簽署')});
      refreshLabSnapshot();setNotice(`${result.id}：${result.stage==='running'?'試驗中，進度 50%；再次按下將完成試驗。':'已完成，可提交報告。'}（Demo 模擬）`);
    }catch(error){setNotice(error.message);}
  };
  const createLinkedDemoTrial = () => {
    try {
      const result=createCompletedDemoFlow({viewerId:account.id,signature:createDemoApprovalSignature('DEMO 模擬流程，非本人簽署'),newExample:true,halfway:true});
      refreshLabSnapshot();setSelected(null);setModalError('');setNotice(`${result.id}：已建立完整流程 Demo 案件，目前試驗中 50%。再次按 Demo試驗加速器完成後，即可提交報告。原案件未變更。`);
    }catch(error){setModalError(error.message);}
  };
  const navigateHome = () => { window.location.assign("/"); };
  const openAction = (item, type) => { setSelected(item); setAction(type); setReason(""); setLabSignature(""); setReportFile(null); setModalError(""); setNotice(""); setReportCheck(null); setReportProgress(0); setReportMessage(""); };
  const performAction = () => {
    if (!selected) return;
    if (!["confirm","cancel"].includes(action)) { setModalError("試驗中的決策請由 lv1 主管在編輯排程處理。"); return; }
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
    setPreparingReport(true);setModalError('');setReportCheck(null);
    try{
    const source=sharedSnapshot.electronic.find(row=>row.id===id);
    if(!source)throw Error('此舊版 Demo 案件沒有對應的電子委託資料，無法產生或提交報告。請建立完整流程 Demo 案件；原案件將保留。');
    if(demo){
      setReportFile(null);
      const prepared=await prepareDemoReport(source);
      setReportFile(new File([prepared.bytes],prepared.fileName,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      setSignatureMode('upload');setLabSignature(createDemoApprovalSignature(`${account.name}（DEMO）`));setReportCheck(prepared.check);return;
    }
    const bytes=await createReportTemplate(source);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='試驗報告單_'+id+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    }catch(error){setReportCheck(error.check||null);throw error;}finally{setPreparingReport(false);}
  }
  function downloadPreparedReport(){
    if(!reportFile)return;
    const url=URL.createObjectURL(reportFile),link=document.createElement('a');link.href=url;link.download=reportFile.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function previewReportCheck(){
    if(!reportFile||!selected||preparingReport||submitting)return;
    setPreparingReport(true);setReportCheck(null);setModalError('');
    try{
      const source=sharedSnapshot.electronic.find(row=>row.id===selected.id);
      if(!source)throw Error('此舊版 Demo 案件沒有對應的電子委託資料，無法產生或提交報告。請建立完整流程 Demo 案件；原案件將保留。');
      const check=await inspectReport(new Uint8Array(await reportFile.arrayBuffer()),selected.id,reportFile.name,source);
      setReportCheck(check);if(!check.ok)setModalError('報告未通過目前規則，請修正後重新檢查。');
    }catch(error){setModalError(error.message);}finally{setPreparingReport(false);}
  }
  const submitReport = async () => {
    if(preparingReport||submitting)return;
    setSubmitting(true);setReportProgress(0);setReportMessage('準備讀取報告');setModalError('');setReportCheck(null);
    try{await submitReportWorkflow({requestId:selected.id,file:reportFile,signature:labSignature,actorId:account.id,onProgress:(value,message)=>{setReportProgress(value);setReportMessage(message);}});setRequests(readStorage(STORAGE_KEY,[]));await refreshReportSnapshot();refreshLabSnapshot();setNotice('報告已通過 Demo 防呆檢查，送至 LMS 二階主管審核。');setSelected(null);}catch(error){setModalError(error.message);setReportCheck(error.check||null);}finally{setSubmitting(false);}
  };

  if (!loggedIn || path !== "/lab/dashboard") return (
    <div className={`lab-login-shell ${dark ? "lab-login-dark" : ""}`}>
      <EnterpriseLoginLayout system="lab" dark={dark} onToggle={toggleTheme}><form className="lab-login-card unified-login-form" onSubmit={e => { e.preventDefault(); login(); }}>

        <h1>{PORTAL_TITLES.lab}</h1>
        <LoginCredentials accountId="lab-username" passwordId="lab-password" account={username} password={password} onAccountChange={setUsername} onPasswordChange={setPassword}/>
        {loginError && <p role="alert" className="lab-login-error">{loginError}</p>}
        <button className="lab-primary lab-login-submit" type="submit" disabled={!username.trim()}>登入系統 <span>→</span></button>

        <button className="lab-login-return" type="button" onClick={navigateHome}>← 返回系統首頁</button>
      </form></EnterpriseLoginLayout>
    </div>
  );

  return (
    <div className={`lab-shell lab-enterprise ${sidebarCollapsed?'lab-sidebar-collapsed':''} ${dark ? "lab-theme-dark" : "lab-theme-light"}`}>
      <header className="lab-global-header"><WorkspaceMenuToggle className="lab-mobile-menu" label="切換功能選單" controls="lab-navigation" expanded={sidebarMobile?menuOpen:!sidebarCollapsed} onClick={()=>sidebarMobile?setMenuOpen(v=>!v):setSidebarCollapsed(v=>!v)}/>
        <CompanyBrandLogo dark={dark}/><nav className="lab-breadcrumbs" aria-label="麵包屑"><button type="button" onClick={navigateHome}>首頁</button><span aria-hidden="true">›</span><button type="button" onClick={()=>chooseTab('requests')}>COLONG 實驗室</button><span aria-hidden="true">›</span><strong aria-current="page">{tab==='materials'?'物料管理':tab==='equipment'?'設備狀態':tab==='archive'?'資料庫':tab==='audit'?'操作歷程':'試驗委託'}</strong></nav>
        <SystemHeaderActions compactTheme dark={dark} onToggle={toggleTheme} account={sharedSnapshot.accounts.find(row=>row.id===account.id)||account} onLogout={logout} notifications={[{title:'待接收試驗',detail:'等待實驗室確認接收',count:requests.filter(row=>row.status==='待確認').length,icon:'✓',onClick:()=>chooseTab('requests')}]}/>
      </header>
      <aside id="lab-navigation" className={`lab-sidebar ${menuOpen?'lab-menu-open':''}`} onKeyDown={event=>{if(event.key==='Escape'&&menuOpen){setMenuOpen(false);document.querySelector('.lab-mobile-menu')?.focus();}}}>
        <WorkspaceSidebarBrand/>
        {canAccessLabPage(account,'requests')&&<button className={tab === "requests" ? "active" : ""} aria-current={tab === 'requests'?'page':undefined} onClick={() => chooseTab("requests")}><LmsSidebarIcon name="requests"/>試驗委託</button>}
        {canAccessLabPage(account,'equipment')&&<button className={tab==='equipment'?'active':''} onClick={()=>chooseTab('equipment')}><LmsSidebarIcon name="equipment"/>設備狀態</button>}{canAccessLabPage(account,'materials')&&<button className={tab==='materials'?'active':''} onClick={()=>chooseTab('materials')}><LmsSidebarIcon name="maintenance"/>物料管理</button>}
        {canAccessLabPage(account,'audit')&&<button className={tab === "audit" ? "active" : ""} aria-current={tab === 'audit'?'page':undefined} onClick={() => chooseTab("audit")}><LmsSidebarIcon name="history"/>操作歷程</button>}
        <>{canAccessLabPage(account,'archive')&&canOpenReportArchive(sharedSnapshot.accounts.find(row=>row.id===account?.id),'lab')&&<button className={tab === "archive" ? "active" : ""} onClick={()=>chooseTab("archive")}><LmsSidebarIcon name="archive"/>資料庫</button>}</><details className="workspace-sidebar-note"><summary>Demo 使用說明</summary><p>展示環境 · LMS 已排程委託會同步至待確認清單。實驗室接收與操作歷程儲存於此瀏覽器，取消原安排需先進入 LMS 待核准；中斷申請由 LMS 一階主管審核。</p></details>
        <button className="lab-back workspace-sidebar-home" onClick={navigateHome}><LmsSidebarIcon name="dashboard"/>回到首頁</button>
      </aside>
      <main className="lab-main">{!['materials','equipment'].includes(tab)&&<div className="lab-workspace-heading"><h1><LmsSidebarIcon name={tab==='materials'?'maintenance':tab==='equipment'?'equipment':tab==='audit'?'history':tab==='archive'?'archive':'requests'}/>{tab==='materials'?'物料管理':tab==='equipment'?'設備狀態':tab==='archive'?'資料庫':tab==='audit'?'操作歷程':'試驗委託'}</h1><p>{tab==='materials'?'庫存、借出與物料資訊管理':tab==='equipment'?'設備資訊與狀態查閱（唯讀）':tab==='archive'?'試驗文件與報告查閱':tab==='audit'?'查看試驗接收、操作與申請紀錄':'接收試驗、掌握執行進度與提交報告'}</p></div>}
        {lifecycleError&&<div className="lab-notice" role="alert">{lifecycleError}</div>}
        {(requestStorage.error || auditStorage.error) && <div role="alert" className="lab-notice">{requestStorage.error || auditStorage.error}<button onClick={() => { requestStorage.retry(); auditStorage.retry(); }}>重試儲存</button></div>}{notice && <div className="lab-notice" role="status">{notice}</div>}
        {tab==='materials'?<div className={`lab-catalog-workspace lms-enterprise ${dark?'theme-dark':'theme-light'}`}><div className="dashboard-content"><MaterialsPage currentUser={account}/></div></div>:tab==='equipment'?<div className={`lab-catalog-workspace lms-enterprise ${dark?'theme-dark':'theme-light'}`}><div className="dashboard-content"><EquipmentPage currentUser={account} readOnly/></div></div>:tab === "archive" ? <ReportArchive actor={account} system="lab" showHeading={false}/> : tab === "requests" ? <>
          <div className="lab-stats lab-stats-with-scheduled lab-dashboard-stats">{[['待確認','clock','pending'],['已排程','flow','scheduled'],['試驗中','lab','running'],['已完成','shield','completed'],['已逾期','clock','overdue']].map(([status,icon,tone])=>{const match=item=>status==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===status;return <button type="button" className="lab-stat-card" key={status} aria-pressed={requestFilter===status} aria-describedby={`lab-kpi-${tone}`} onClick={()=>setRequestFilter(current=>current===status?'all':status)}><span className={`lab-stat-icon lab-stat-${tone}`}><LoginSystemIcon kind={icon}/></span><div><span>{status}</span><strong>{requests.filter(match).length}</strong></div><span className="lab-kpi-arrow" aria-hidden="true"><WorkspaceDiagonalArrow/></span><small id={`lab-kpi-${tone}`} className="lab-kpi-hint">查看{status}的試驗委託；再次點擊顯示全部。</small></button>;})}</div>
          <section className="lab-panel lab-dashboard-overview"><div className="lab-panel-heading"><div><div className="help-title-row"><h2>試驗委託清單</h2><HelpTip>確認接收、試驗執行與主管審核申請</HelpTip></div></div><button type="button" className="lab-demo-action" title="僅加速現有已排程、已接收且等待開始的委託單，不建立新案件。" onClick={addReportExample}>Demo試驗加速器</button></div>
            <div className="lab-table-wrap"><PaginatedTable><thead><tr><th>委託編號</th><th>專案／試驗</th><th>設備</th><th>樣品編號</th><th>試驗日程</th><th>狀態</th><th>操作</th></tr></thead><tbody>{requests.filter(item=>item.status!=="已結案"&&(requestFilter==='all'||(requestFilter==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===requestFilter))).map(item => <tr key={item.id}>
              <td><button type="button" className="lab-request-link" onClick={() => setDetail(item)}>{item.id}</button></td><td>{item.project}<small>{item.test}<small className="lab-trial-hours"> · {item.hours} h</small></small></td><td>{item.equipment}</td><td>{sampleNumbers(item)}</td><td><ScheduleTimeline row={sharedSnapshot.schedules.find(row=>row.id===item.scheduleId||row.requestId===item.id)||{time:item.scheduledStart,end:item.scheduledEnd,status:item.status==='取消'?'取消':'已排程'}}/></td><td><span data-status={item.status} className={`lab-status ${item.status === "試驗中" ? "running" : ""}`}>{item.status}</span>{item.reportInfo?.stage!=='returned'&&passedDemoReview(item.reportInfo?.check)&&<small className="report-demo-review-badge">{DEMO_REVIEW_PASSED}</small>}{item.lastOperationStatus==='已退回'&&<small>申請已退回，請查看操作歷程</small>}</td>
              <td><div className="lab-actions">{item.status==='已排程'&&!item.pendingOperationId&&<span className="lab-review-indicator">已接收，等待開始</span>}{item.pendingOperationId?<span className="lab-review-indicator">待一階主管審核</span>:null}{!item.pendingOperationId&&item.status === "待確認" && <><button onClick={() => openAction(item,"confirm")}>確認接收</button><button className="lab-danger" onClick={() => openAction(item,"cancel")}>申請取消</button></>}{['試驗中','暫停中'].includes(item.status)&&<button type="button" onClick={()=>{setEquipmentRequest(item.id);setEquipmentChoice(null);}}>設備狀態</button>}{item.status === "已完成" && <button type="button" onClick={() => openAction(item,"submitReport")}>提交報告</button>}</div></td>
            </tr>)}</tbody></PaginatedTable></div>{!requests.some(item=>item.status!=='已結案'&&(requestFilter==='all'||(requestFilter==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===requestFilter)))&&<div className="lab-empty" role="status">目前篩選條件下沒有試驗委託。</div>}
          </section>
        </> : <section className="lab-panel lab-audit-panel"><div className="lab-panel-heading"><div><div className="help-title-row"><h2>本機操作歷程</h2><HelpTip>示範用追加紀錄，尚未具備正式後端不可竄改稽核機制</HelpTip></div></div></div><div className="lab-table-wrap"><PaginatedTable><thead><tr><th>時間</th><th>委託編號</th><th>操作</th><th>操作者</th><th>原因</th><th>簽名</th></tr></thead><tbody>{audit.length ? audit.map(event => <tr key={event.id}><td>{event.time}</td><td><button type="button" className="lab-request-link" onClick={()=>setDetail(requests.find(row=>row.id===event.requestId)||{id:event.requestId})}>{event.requestId}</button></td><td>{event.action}</td><td>{event.actor}</td><td>{event.reason}</td><td>{event.signature ? <details className="lab-audit-signature"><summary>查看簽名</summary><SignatureHistory records={auditSignatures([event], event.requestId)} /></details> : "舊紀錄未提供簽名"}</td></tr>) : <tr><td colSpan="6">尚無操作紀錄</td></tr>}</tbody></PaginatedTable></div></section>}
      <ClearCasesButton inline/><div className={`lab-shared-tools lms-enterprise ${dark?'theme-dark':'theme-light'}`}><IntelligentAssistant system="lab" snapshot={{...sharedSnapshot,labWorkItems:requests}} metrics={labMetrics}/></div></main>
      {equipmentRequest&&(()=>{const schedule=sharedSnapshot.schedules.find(r=>r.requestId===equipmentRequest);const machines=sharedSnapshot.equipment.filter(m=>schedule&&usesEquipment(schedule,m));return (equipmentChoice||machines.length===1)?<EquipmentInfoModal equipment={machines.find(m=>m.id===(equipmentChoice||machines[0]?.id))||{id:equipmentChoice,name:'設備已移除'}} onClose={()=>{setEquipmentChoice(null);setEquipmentRequest(null);}}/>:<TrialEquipmentDialog requestId={equipmentRequest} schedule={schedule} machines={machines} onSelect={setEquipmentChoice} onClose={()=>setEquipmentRequest(null)}/>;})()}
      {detail && <RequestInfoModal account={account} request={labRequestInformation(detail,sharedSnapshot)} onClose={()=>setDetail(null)}/>}
      {downloadJob && <div className="lab-modal-backdrop"><section className="lab-modal" role="dialog" aria-modal="true" aria-labelledby="download-title"><h2 id="download-title">取得試驗報告單</h2><p>委託編號：{downloadJob.id}</p><p>正在準備 Excel 範本</p><div style={{height:12,background:"#e5edf8",borderRadius:8,overflow:"hidden"}} role="progressbar" aria-label="下載準備進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress}><div style={{height:"100%",width:`${downloadProgress}%`,background:"#286bc4"}} /></div><p>{downloadProgress}%</p>{downloadProgress === 100 && <><p>已開始下載空白範本，請依委託資料填寫。</p><div className="lab-modal-actions"><button onClick={()=>downloadCaseTemplate(downloadJob.id).catch(error=>setNotice(error.message))}>重新下載</button><button className="lab-primary" onClick={() => setDownloadJob(null)}>關閉</button></div></>}</section></div>}
      {submitting&&selected&&action==='submitReport'&&<AiReviewProgress kind="report" progress={reportProgress} message={reportMessage} returnFocus={reportSubmitButton}/>}
      {selected && <div className="lab-modal-backdrop" role="presentation" onMouseDown={e => { if (!submitting && !preparingReport && e.target === e.currentTarget) setSelected(null); }}><section className={`lab-modal ${action==="submitReport"?"report-submit-modal":""}`} role="dialog" aria-modal="true" aria-labelledby="lab-modal-title"><h2 id="lab-modal-title">{({confirm:"確認接收",cancel:"申請取消",interrupt:"申請試驗中斷",complete:"完成試驗",submitReport:"提交試驗報告"})[action]}</h2><p>{selected.id} · {selected.project}</p>{action === "submitReport"&&<div className="report-quickfill-panel"><div className="report-actions"><button type="button" className="report-primary" disabled={submitting||preparingReport} onClick={()=>downloadCaseTemplate(selected.id,true).catch(error=>setModalError(error.message))}>DEMO 填入</button><button type="button" disabled={submitting||preparingReport} onClick={()=>downloadCaseTemplate(selected.id).catch(error=>setModalError(error.message))}>下載本案 Excel 範本</button>{reportFile&&<button type="button" disabled={submitting||preparingReport} onClick={downloadPreparedReport}>下載目前 Excel 報告</button>}</div><p>產生本案假資料 Excel、展示簽名並檢查；確認後提交送簽。</p><div className={`report-review-status ${passedDemoReview(reportCheck)?'is-passed':''}`} role="status"><strong>審查狀態：{(preparingReport||submitting)?'產生／檢查中…':passedDemoReview(reportCheck)?DEMO_REVIEW_PASSED:reportCheck?'未通過檢查':'尚未檢查'}</strong>{reportCheck&&<span>目前規則：{reportCheck.checks.filter(row=>row.ok).length}／{reportCheck.checks.length} 項通過</span>}</div><details className="report-quickfill-help"><summary>Demo 限制與出報告流程</summary><small>此為 Demo 規則模擬，未連接真正 AI；不代表正式試驗合格。圖片簽名無正式電子簽章效力。須依序完成二階、三階簽核，由委託者主管確認查閱後才產生 PDF 並封存。</small></details></div>}{!['confirm','cancel'].includes(action) && <ApprovalSignature key={selected.id} label="本次操作簽名" accountId={account.id} mode={signatureMode} onModeChange={setSignatureMode} value={labSignature} onChange={setLabSignature} onError={setModalError} />}{(action === "cancel" || action === "interrupt") && <><label htmlFor="lab-reason">原因（必填）</label><textarea id="lab-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="請填寫操作原因" rows="4" /></>}{action === "submitReport" && <>{preparingReport&&<p role="status">正在產生／檢查本案報告，請稍候…</p>}<label htmlFor="lab-report-file">上傳 Excel 報告（必填）</label><input id="lab-report-file" type="file" disabled={submitting||preparingReport} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setReportFile(e.target.files?.[0]||null);setModalError('');setReportCheck(null);}}/><p>{reportFile?.name||'尚未選擇檔案'}</p><div className="report-actions"><button type="button" disabled={!reportFile||submitting||preparingReport} onClick={previewReportCheck}>重新檢查報告</button></div><small>僅供 Demo：一般性能試驗使用已接入的雙工作表範本；其餘試驗暫用本案簡化範本（.xlsx，10 MB 以內）。請先下載本案範本，系統會帶入報告編號與品番。簽名位置由系統固定配置，無需設定。上傳時轉印執行人員簽名，三方由左至右為三階、二階、執行人員；不具正式電子簽章效力。Demo 僅依規則檢查欄位、判定勾選與公式，不代表所有測項完整或符合規格；PDF 支援標準表格及簽名，複雜圖表與巨集不適用。</small>{reportCheck&&<div className="report-checks">{reportCheck.checks.map(row=><p key={row.label}>{row.ok?'✓':'!'} {row.label}：{row.detail}</p>)}</div>}</>}{modalError && <p className="lab-warning" role="alert">{modalError}</p>}{action==="submitReport"&&!sharedSnapshot.electronic.some(r=>r.id===selected.id)&&<button type="button" className="lab-primary" disabled={submitting||preparingReport} onClick={createLinkedDemoTrial}>建立完整流程 Demo 案件</button>}{(action === "cancel" || action === "interrupt") && <p className="lab-warning">{action==='cancel'?'送出後進入 LMS 待核准，一階主管核准後才退回待排程。':'中斷申請將交由 LMS 一階主管審核。'}</p>}<div className="lab-modal-actions"><button disabled={submitting||preparingReport} onClick={() => setSelected(null)}>返回</button><button ref={reportSubmitButton} className="lab-primary" disabled={submitting||preparingReport||(action==="submitReport"&&(!reportFile||!labSignature))} onClick={action === "submitReport" ? submitReport : performAction}>{submitting ? "檢查與儲存中…" : action === "submitReport" ? "提交" : "確認送出"}</button></div></section></div>}
    </div>
  );
}
