import RequestIdentifier from './RequestIdentifier.jsx';
import {preapprovalContext} from './preapprovalClient.mjs';
import LabPreflightForm from './LabPreflightForm.jsx';
import {IconAction} from './ActionIcon.jsx';
import TemplateStageForm from './TemplateStageForm.jsx';
import {stageCommandFields,stageFormKey} from './templateStageFormState.mjs';
import LabBoundTemplates from './LabBoundTemplates.jsx';
import {requestTrialTemplate} from './trialTemplateDeliveryClient.mjs';
import './LabTraditionalTypography.css';
import {canConfirmLabCompletion} from './trialCompletion.mjs';
import {isVirtualRequest} from './requestExecutionKind.mjs';
import {BusinessHumanPending,useHumanPending} from './BusinessHumanControls.jsx';
import {originalHumanSource,humanWorkflowEnabled} from './originalBusiness.mjs';
import {executeHuman,humanCommand,humanMessage,pendingHumanOperation} from './businessHumanClient.mjs';
import {originalBusinessEnabled,originalBusinessAccount,loginOriginalBusiness,logoutOriginalBusiness,originalBusinessError} from './originalBusiness.mjs';
import {appStorage} from './originalBusiness.mjs';
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
import EquipmentInfoModal from './EquipmentInfoModal.jsx';
import {usesEquipment} from './scheduleResources.mjs';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import {submitReportWorkflow} from './reportWorkflow.mjs';
import {passedDemoReview,DEMO_REVIEW_PASSED} from './demoReportPreparation.mjs';
import {readCaseTrialTemplate} from './caseTrialTemplate.mjs';
import {inspectReport} from './reportWorkbook.mjs';
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
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    const value = JSON.parse(appStorage().getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
const now = () => new Date().toLocaleString("zh-TW", { hour12: false });



export default function LabApp({ path, navigate }) {
  useLayoutEffect(()=>{
    if(!/^\/lab(?:\/|$)/.test(path))return;
    document.body.dataset.labTypography="tc";
    return()=>{delete document.body.dataset.labTypography;};
  },[path]);
  const formalLoginPending=useRef(false);
  const humanPending=useHumanPending();
  const lifecycleError=useScheduleLifecycle();
  useReportSnapshot();
  const {snapshot:sharedSnapshot,metrics:labMetrics,now:labNow}=useLabView();
  const [username, setUsername] = useState(() => { if(originalBusinessEnabled())return originalBusinessAccount('lab')?.email||''; try { const id=window.sessionStorage.getItem("dqa-lab-account-id"), a=readDemoAccounts(); const selected=a.find(x=>x.id===id&&accessSystem(x,'lab'))||a.find(x=>x.role==='實驗室工程師'&&accessSystem(x,'lab'))||a.find(x=>accessSystem(x,'lab')); return selected?.email || selected?.name || ""; } catch { return ""; } });
  const [password, setPassword] = useState(originalBusinessEnabled()?"":"demo1234");
  const [loginError, setLoginError] = useState("");

  const [account, setAccount] = useState(() => {
    if(originalBusinessEnabled())return originalBusinessAccount('lab');
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

  const login = async () => {
    if(originalBusinessEnabled()){if(formalLoginPending.current)return;formalLoginPending.current=true;try{await loginOriginalBusiness(username.trim(),password);const a=originalBusinessAccount('lab');startSession('lab',a.id);setAccount(a);setLoginError('');navigate('/lab/dashboard');}catch(error){setLoginError(originalBusinessError(error));}finally{formalLoginPending.current=false;}return;}
    try { const all=readDemoAccounts(); const key=username.trim().toLowerCase(); const matches=Array.isArray(all)?all.filter(a=>accessSystem(a,"lab") && (String(a.email||"").toLowerCase()===key || a.name===username.trim())):[]; const found=matches.length===1?matches[0]:null; if(!found || password!=="demo1234"){setLoginError("帳號沒有實驗室權限，或密碼不正確。");return;} startSession('lab',found.id);setAccount(found);setUsername(found.name);setLoginError("");navigate("/lab/dashboard"); } catch { setLoginError("無法讀取帳號資料。"); }
  };
  const logout = async () => {if(originalBusinessEnabled()){try{await logoutOriginalBusiness();}catch(error){setNotice(originalBusinessError(error));}} endSession('lab'); setAccount(null); navigate("/lab/login", true); };
  const [requests, setRequests] = useState(() => readStorage(STORAGE_KEY, DEMO_REQUESTS).filter(row=>!LEGACY_DEMO_IDS.has(row.id)));
  useEffect(()=>{
    // Synchronize persisted lab work items with the shared browser schedule source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequests(previous=>{if(originalBusinessEnabled())return sharedSnapshot.labWorkItems;const next=applyLabOperationResults(mergeLabSchedules(sharedSnapshot.labWorkItems.filter(row=>!LEGACY_DEMO_IDS.has(row.id)),sharedSnapshot.schedules),sharedSnapshot.labOperations);return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});
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
  const [downloadError,setDownloadError]=useState(''),[downloadTrial,setDownloadTrial]=useState('');

  useEffect(() => {
    if(!downloadJob)return;
    const controller=new AbortController();setDownloadProgress(10);setDownloadError('');setDownloadTrial('');
    (async()=>{if(originalBusinessEnabled()){const doc=requests.find(r=>r.id===downloadJob.id)?.documentVersionId;if(doc){const file=await requestTrialTemplate(doc,account.id);if(controller.signal.aborted)return null;if(file){setDownloadJob(null);return null;}}}return readCaseTrialTemplate({requestId:downloadJob.id,actorId:account?.id},appStorage(),{signal:controller.signal,onStage:(stage,trial)=>{if(!controller.signal.aborted){setDownloadProgress(stage==='BUILDING'?35:80);setDownloadTrial(trial.name);}}});})()
      .then(file=>{if(controller.signal.aborted||!file)return;const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);setDownloadProgress(100);})
      .catch(error=>{if(!controller.signal.aborted){setDownloadError(error.message);setDownloadProgress(0);}});
    return()=>controller.abort();
  },[downloadJob,account?.id]);

  const sampleNumbers = item => item.sampleIds || item.sampleCode || ({
    "LAB-2026-001": "SAMPLE-001、SAMPLE-002、SAMPLE-003",
    "LAB-2026-002": "SAMPLE-004、SAMPLE-005",
    "LAB-2026-003": "SAMPLE-006、SAMPLE-007、SAMPLE-008",
  }[item.id] || "尚未設定");
  const requestStorage = useDemoPersistence(STORAGE_KEY, requests);
  const auditStorage = useDemoPersistence(AUDIT_KEY, audit);

  const createLinkedDemoTrial = () => {
    try {
      const result=createCompletedDemoFlow({viewerId:account.id,signature:createDemoApprovalSignature('DEMO 模擬流程，非本人簽署'),newExample:true,halfway:true});
      refreshLabSnapshot();setSelected(null);setModalError('');setNotice(`${result.id}：已建立完整流程 Demo 案件，目前試驗中 50%。透過 AI 助理輸入 /accelerate 開啟測試操作並完成後，即可提交報告。原案件未變更。`);
    }catch(error){setModalError(humanMessage(error));}
  };
  const navigateHome = () => { window.location.assign("/"); };
  const [templateStageState,setTemplateStageState]=useState(null);
  const openAction = (item, type) => { setSelected(originalBusinessEnabled()?{...item,humanSource:originalHumanSource(item.id)}:item); setAction(type); setReason(""); setLabSignature(""); setReportFile(null); setModalError(""); setNotice(""); setReportCheck(null); setReportProgress(0); setReportMessage(""); };
  async function continuePreflight(){const source=originalHumanSource(selected.id),data=await preapprovalContext(source.request.id,account.id);setSelected({...selected,humanSource:source,preparationReady:data.preparation_ready});setTemplateStageState(null);if(data.preparation_ready){setAction('confirm');setModalError('');}else setModalError('準備表已保存，仍有未解除的異常，請修正後再進入確認簽名。');}
  const recoveredHumanAction=async()=>{try{if(selected&&action==='prepare'){await continuePreflight();return;}if(selected&&action==='confirm'){setDownloadProgress(0);setDownloadJob({id:selected.id});}setSelected(null);setModalError('');setNotice('資料庫已確認操作完成。');}catch(e){setModalError(humanMessage(e));}};
  const performAction = async () => {
    if(originalBusinessEnabled()){if(submitting||pendingHumanOperation())return;setSubmitting(true);setModalError('');try{if(action==='cancel'&&!reason.trim())throw Error('請填寫取消原因。');if(action==='complete'&&!canConfirmLabCompletion(requests.find(row=>row.id===selected.id),Date.now()))throw Error('尚未到排定結束時間，或試驗狀態已更新，請重新確認。');const command=({prepare:"PREPARE",confirm:"RECEIVE",complete:"COMPLETE",cancel:"CANCEL_REQUEST"})[action];if(!command)throw Error("此操作尚未開放共用流程。");await executeHuman(humanCommand(command,selected.id,{signature:['prepare','cancel'].includes(action)?'':labSignature,comment:reason,source:selected.humanSource,templateFields:action==='cancel'||selected.preflightWorkflow&&action==='complete'?undefined:stageCommandFields(templateStageState,stageFormKey(selected.humanSource.request.request_document_version_id,action==='prepare'?'LAB_PREPARE':action==='confirm'?'LAB_RECEIVE':'LAB_COMPLETE',selected.humanSource.schedule?.id))}));if(action==='prepare'){await continuePreflight();return;}setNotice(action==='cancel'?'取消申請已送至 LMS 排程頁，等待一階主管審核。':action==="confirm"?(isVirtualRequest(selected)?"已接收虛擬委託，可向 AI 助理輸入 /demo accelerator 推進試驗。":"確認接收已儲存，將依排程時間自動開始。"):"操作已保存至共用資料庫。");if(action==="confirm"){setDownloadProgress(0);setDownloadJob({id:selected.id});}setSelected(null);}catch(error){setModalError(humanMessage(error));}finally{setSubmitting(false);}return;}
    if (!selected) return;
    if (!["confirm","cancel"].includes(action)) { setModalError("試驗中的決策請由 lv1 主管在編輯排程處理。"); return; }
    if ((action === "cancel" || action === "interrupt") && !reason.trim()) {
      setModalError("此操作必須填寫原因。");
      return;
    }
    if ((!['confirm','cancel','start'].includes(action)||originalBusinessEnabled()&&action==='confirm') && !labSignature) { setModalError("送出此操作前請先簽名。"); return; }
    if(action==='confirm'){
      try{const receipt=confirmLabReceipt({requestId:selected.id,actorId:account.id,expected:{scheduleId:selected.scheduleId,reservationId:selected.reservationId,time:selected.scheduledStart,end:selected.scheduledEnd}});
       setRequests(previous=>previous.map(row=>row.id===receipt.id?receipt:row));setAudit(readStorage(AUDIT_KEY,[]));refreshLabSnapshot();setNotice('確認接收已儲存，等待排程開始。');setDownloadProgress(0);setDownloadJob({id:selected.id});setSelected(null);
      }catch(error){setModalError(humanMessage(error));}return;
    }
    if(action==='cancel'||action==='interrupt'){
      try{const operation=submitLabOperation({requestId:selected.id,action,reason,signature:labSignature,actorId:account.id});
        setRequests(previous=>applyLabOperationResults(previous,[operation,...sharedSnapshot.labOperations]));
      }catch(error){setModalError(humanMessage(error));return;}
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
  async function previewReportCheck(){
    if(!reportFile||!selected||preparingReport||submitting)return;
    setPreparingReport(true);setReportCheck(null);setModalError('');
    try{
      const source=sharedSnapshot.electronic.find(row=>row.id===selected.id);
      if(!source)throw Error('此舊版 Demo 案件沒有對應的電子委託資料，無法產生或提交報告。請建立完整流程 Demo 案件；原案件將保留。');
      const check=await inspectReport(new Uint8Array(await reportFile.arrayBuffer()),selected.id,reportFile.name,source);
      setReportCheck(check);if(!check.ok)setModalError('報告未通過目前規則，請修正後重新檢查。');
    }catch(error){setModalError(humanMessage(error));}finally{setPreparingReport(false);}
  }
  const submitReport = async () => {
    if(preparingReport||submitting)return;
    setSubmitting(true);setReportProgress(0);setReportMessage('準備讀取報告');setModalError('');setReportCheck(null);
    try{await submitReportWorkflow({requestId:selected.id,file:reportFile,signature:labSignature,actorId:account.id,expectedSource:selected.humanSource,onProgress:(value,message)=>{setReportProgress(value);setReportMessage(message);}});setRequests(readStorage(STORAGE_KEY,[]));await refreshReportSnapshot();refreshLabSnapshot();setNotice('報告已通過 Demo 防呆檢查，送至 LMS 二階主管審核。');setSelected(null);}catch(error){setModalError(humanMessage(error));setReportCheck(error.check||null);}finally{setSubmitting(false);}
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

  const pageNotices=<>{lifecycleError&&<div className="lab-notice" role="alert">{lifecycleError}</div>}
        {(requestStorage.error || auditStorage.error) && <div role="alert" className="lab-notice">{requestStorage.error || auditStorage.error}<button onClick={() => { requestStorage.retry(); auditStorage.retry(); }}>重試儲存</button></div>}{originalBusinessEnabled()&&<BusinessHumanPending onSaved={recoveredHumanAction}/>}{notice && <div className="lab-notice" role="status">{notice}</div>}</>;
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
        <>{canAccessLabPage(account,'archive')&&canOpenReportArchive(sharedSnapshot.accounts.find(row=>row.id===account?.id),'lab')&&<button className={tab === "archive" ? "active" : ""} onClick={()=>chooseTab("archive")}><LmsSidebarIcon name="archive"/>資料庫</button>}</>
        <button className="lab-back workspace-sidebar-home" onClick={navigateHome}><LmsSidebarIcon name="dashboard"/>回到首頁</button>
      </aside>
      <main className="lab-main">{!['materials','equipment'].includes(tab)&&<div className="lab-workspace-heading"><h1><LmsSidebarIcon name={tab==='materials'?'maintenance':tab==='equipment'?'equipment':tab==='audit'?'history':tab==='archive'?'archive':'requests'}/>{tab==='materials'?'物料管理':tab==='equipment'?'設備狀態':tab==='archive'?'資料庫':tab==='audit'?'操作歷程':'試驗委託'}</h1><p>{tab==='materials'?'庫存、借出與物料資訊管理':tab==='equipment'?'設備資訊與狀態查閱（唯讀）':tab==='archive'?'試驗文件與報告查閱':tab==='audit'?'查看試驗接收、操作與申請紀錄':'接收試驗、掌握執行進度與提交報告'}</p></div>}
        {!['materials','equipment'].includes(tab)&&pageNotices}
        {tab==='materials'?<div className={`lab-catalog-workspace lms-enterprise ${dark?'theme-dark':'theme-light'}`}><div className="dashboard-content"><MaterialsPage currentUser={account} system="lab" statusContent={pageNotices}/></div></div>:tab==='equipment'?<div className={`lab-catalog-workspace lms-enterprise ${dark?'theme-dark':'theme-light'}`}><div className="dashboard-content"><EquipmentPage currentUser={account} system="lab" readOnly statusContent={pageNotices}/></div></div>:tab === "archive" ? <ReportArchive actor={account} system="lab" showHeading={false}/> : tab === "requests" ? <>
          {originalBusinessEnabled()&&<LabBoundTemplates key={account.id} actorId={account.id} sourceKey={requests.map(r=>r.id+':'+r.status+':'+r.executorId).join('|')}/>}
          <div className="lab-stats lab-stats-with-scheduled lab-dashboard-stats">{[['待確認','clock','pending'],['已排程','flow','scheduled'],['試驗中','lab','running'],['已完成','shield','completed'],['已逾期','clock','overdue']].map(([status,icon,tone])=>{const match=item=>status==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===status;return <button type="button" className="lab-stat-card" key={status} aria-pressed={requestFilter===status} aria-describedby={`lab-kpi-${tone}`} onClick={()=>setRequestFilter(current=>current===status?'all':status)}><span className={`lab-stat-icon lab-stat-${tone}`}><LoginSystemIcon kind={icon}/></span><div><span>{status}</span><strong>{requests.filter(match).length}</strong></div><span className="lab-kpi-arrow" aria-hidden="true"><WorkspaceDiagonalArrow/></span><small id={`lab-kpi-${tone}`} className="lab-kpi-hint">查看{status}的試驗委託；再次點擊顯示全部。</small></button>;})}</div>
          <section className="lab-panel lab-dashboard-overview"><div className="lab-panel-heading"><div><div className="help-title-row"><h2>試驗委託清單</h2><HelpTip>確認接收、試驗執行與主管審核申請</HelpTip></div></div></div>
            <div className="lab-table-wrap"><PaginatedTable><thead><tr><th>委託編號</th><th>專案／試驗</th><th>設備</th><th>樣品編號</th><th>試驗日程</th><th>狀態</th><th>操作</th></tr></thead><tbody>{requests.filter(item=>item.status!=="已結案"&&(requestFilter==='all'||(requestFilter==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===requestFilter))).map(item => <tr key={item.id}>
              <td><button type="button" className="lab-request-link" onClick={() => setDetail(item)}><RequestIdentifier>{item.id}</RequestIdentifier></button></td><td>{item.project}<small>{item.test}<small className="lab-trial-hours"> · {item.hours} h</small></small></td><td>{item.equipment}</td><td>{sampleNumbers(item)}</td><td><ScheduleTimeline row={sharedSnapshot.schedules.find(row=>row.id===item.scheduleId||row.requestId===item.id)||{time:item.scheduledStart,end:item.scheduledEnd,status:item.status==='取消'?'取消':'已排程'}}/></td><td><span data-status={item.status} className={`lab-status ${item.status === "試驗中" ? "running" : ""}`}>{item.status}</span>{item.reportInfo?.stage!=='returned'&&passedDemoReview(item.reportInfo?.check)&&<small className="report-demo-review-badge">{DEMO_REVIEW_PASSED}</small>}{item.lastOperationStatus==='已退回'&&<small>申請已退回，請查看操作歷程</small>}</td>
              <td><div className="lab-actions">{originalBusinessEnabled()&&humanWorkflowEnabled()&&canConfirmLabCompletion(item,labNow)&&item.executorId===account.id&&<button onClick={()=>openAction(item,'complete')}>確認完成試驗</button>}{item.status==='已排程'&&!item.pendingOperationId&&<span className="lab-review-indicator">{isVirtualRequest(item)?"已接收，可由助理加速":"已接收，等待開始"}</span>}{item.pendingOperationId?<span className="lab-review-indicator">待一階主管審核</span>:null}{!item.pendingOperationId&&item.status === "待確認" && <><button type="button" className="icon-action icon-action-primary lab-preflight-action" aria-label={'試驗前準備與確認：'+item.id} title="試驗前準備與確認" onClick={()=>openAction(item,item.preflightWorkflow?(item.preparationReady?'confirm':'prepare'):'confirm')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button><button type="button" className="icon-action icon-action-danger lab-cancel-action" aria-label={'申請取消：'+item.id} title="申請取消" onClick={()=>openAction(item,'cancel')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></button></>}{!isVirtualRequest(item)&&['試驗中','暫停中'].includes(item.status)&&<button type="button" onClick={()=>{setEquipmentRequest(item.id);setEquipmentChoice(null);}}>設備狀態</button>}{item.status === "已完成" && <IconAction icon="report-submit" label="提交報告" className="icon-action-primary" onClick={() => openAction(item,"submitReport")}/>}</div></td>
            </tr>)}</tbody></PaginatedTable></div>{!requests.some(item=>item.status!=='已結案'&&(requestFilter==='all'||(requestFilter==='已逾期'?labRequestOverdue(item,sharedSnapshot.schedules,labNow):item.status===requestFilter)))&&<div className="lab-empty" role="status">目前篩選條件下沒有試驗委託。</div>}
          </section>
        </> : <section className="lab-panel lab-audit-panel"><div className="lab-panel-heading"><div><div className="help-title-row"><h2>本機操作歷程</h2><HelpTip>示範用追加紀錄，尚未具備正式後端不可竄改稽核機制</HelpTip></div></div></div><div className="lab-table-wrap"><PaginatedTable><thead><tr><th>時間</th><th>委託編號</th><th>操作</th><th>操作者</th><th>原因</th><th>簽名</th></tr></thead><tbody>{audit.length ? audit.map(event => <tr key={event.id}><td>{event.time}</td><td><button type="button" className="lab-request-link" onClick={()=>setDetail(requests.find(row=>row.id===event.requestId)||{id:event.requestId})}><RequestIdentifier>{event.requestId}</RequestIdentifier></button></td><td>{event.action}</td><td>{event.actor}</td><td>{event.reason}</td><td>{event.signature ? <details className="lab-audit-signature"><summary>查看簽名</summary><SignatureHistory records={auditSignatures([event], event.requestId)} /></details> : "舊紀錄未提供簽名"}</td></tr>) : <tr><td colSpan="6">尚無操作紀錄</td></tr>}</tbody></PaginatedTable></div></section>}
      <div className={`lab-shared-tools lms-enterprise ${dark?'theme-dark':'theme-light'}`}><IntelligentAssistant system="lab" acceleratorAllowed={tab==='requests'} snapshot={{...sharedSnapshot,labWorkItems:requests}} metrics={labMetrics} onDemoReportReady={result=>{const item=requests.find(q=>q.id===result.legacyId&&q.databaseId===result.request_id&&q.sourceRevision===result.request_revision&&q.scheduleRevision===result.schedule_revision);if(!item)throw Error('委託已更新，請重新產生報告。');openAction(item,'submitReport');setReportFile(result.file);setReportCheck(result.check);}}/></div></main>
      {equipmentRequest&&(()=>{const schedule=sharedSnapshot.schedules.find(r=>r.requestId===equipmentRequest);const machines=sharedSnapshot.equipment.filter(m=>schedule&&usesEquipment(schedule,m));return (equipmentChoice||machines.length===1)?<EquipmentInfoModal equipment={machines.find(m=>m.id===(equipmentChoice||machines[0]?.id))||{id:equipmentChoice,name:'設備已移除'}} onClose={()=>{setEquipmentChoice(null);setEquipmentRequest(null);}}/>:<TrialEquipmentDialog requestId={equipmentRequest} schedule={schedule} machines={machines} onSelect={setEquipmentChoice} onClose={()=>setEquipmentRequest(null)}/>;})()}
      {detail && <RequestInfoModal account={account} request={labRequestInformation(detail,sharedSnapshot)} onClose={()=>setDetail(null)}/>}
      {downloadJob && <div className="lab-modal-backdrop"><section className="lab-modal" role="dialog" aria-modal="true" aria-labelledby="download-title"><h2 id="download-title">取得試驗報告單</h2><p>委託編號：{downloadJob.id}</p>{downloadTrial&&<p>對應試驗範本：{downloadTrial}</p>}{downloadError?<p className="lab-warning" role="alert">{downloadError}</p>:<><p>{downloadProgress===100?'已開始下載本案專屬範本，量測結果、判定及簽名留白。':'正在讀取本案資料並準備對應 Excel 範本'}</p><div style={{height:12,background:"#e5edf8",borderRadius:8,overflow:"hidden"}} role="progressbar" aria-label="下載準備進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress}><div style={{height:"100%",width:`${downloadProgress}%`,background:"#286bc4",transition:'width .2s ease'}}/></div><p>{downloadProgress}%</p></>}<div className="lab-modal-actions">{(downloadProgress===100||downloadError)&&<button onClick={()=>setDownloadJob({id:downloadJob.id})}>{downloadError?'重試下載':'重新下載'}</button>}<button className="lab-primary" onClick={()=>setDownloadJob(null)}>{downloadProgress<100&&!downloadError?'取消下載':'關閉'}</button></div></section></div>}
      {submitting&&selected&&action==='submitReport'&&<AiReviewProgress kind="report" progress={reportProgress} message={reportMessage} returnFocus={reportSubmitButton}/>}
      {selected && <div className="lab-modal-backdrop" role="presentation" onMouseDown={e => { if (!submitting && !preparingReport && e.target === e.currentTarget) setSelected(null); }}><section className={`lab-modal ${action==="submitReport"?"report-submit-modal":""}`} role="dialog" aria-modal="true" aria-labelledby="lab-modal-title"><BusinessHumanPending onSaved={recoveredHumanAction}/><h2 id="lab-modal-title">{({prepare:"填寫試驗前準備",confirm:selected.preflightWorkflow?"確認準備無異常並簽名":"確認接收",cancel:"申請取消",interrupt:"申請試驗中斷",complete:"完成試驗",submitReport:"提交試驗報告"})[action]}</h2><p><RequestIdentifier>{selected.id}</RequestIdentifier> · {selected.project}</p>{action === "submitReport"&&<div className={`report-review-status ${passedDemoReview(reportCheck)?'is-passed':''}`} role="status"><strong>AI 審查：{(preparingReport||submitting)?'檢查中…':passedDemoReview(reportCheck)?'通過（Demo 規則驗證）':reportCheck?'尚未通過':'尚未檢查'}</strong>{reportCheck&&<span>{reportCheck.checks.filter(r=>!r.ok).map(r=>r.label+'：'+r.detail).join('；')||'委託、試驗與報告欄位檢查通過。'}</span>}</div>}{originalBusinessEnabled()&&selected.preflightWorkflow&&['prepare','confirm'].includes(action)&&<div className="lab-preflight-steps" aria-label="執行前流程"><span className={action==='prepare'?'active':''}>1 準備檢核</span><span className={action==='confirm'?'active':''}>2 無異常確認與簽名</span>{action==='confirm'&&<button type="button" disabled={submitting} onClick={()=>{setAction('prepare');setLabSignature('');setModalError('');}}>返回修改準備表</button>}</div>}{originalBusinessEnabled()&&selected.preflightWorkflow&&['prepare','confirm'].includes(action)&&<LabPreflightForm key={selected.id+action} source={selected.humanSource} actorId={account.id} confirm={action==='confirm'} onState={setTemplateStageState} disabled={submitting}/>}{originalBusinessEnabled()&&!selected.preflightWorkflow&&['confirm','complete'].includes(action)&&<TemplateStageForm key={stageFormKey(selected.humanSource.request.request_document_version_id,action,selected.humanSource.schedule?.id)} documentId={selected.humanSource.request.request_document_version_id} stage={action==='confirm'?'LAB_RECEIVE':'LAB_COMPLETE'} scope={selected.humanSource.schedule?.id} actorId={account.id} onState={setTemplateStageState} disabled={submitting}/>}{action!=='prepare'&&(!['confirm','cancel','start'].includes(action)||originalBusinessEnabled()&&action==='confirm') && <ApprovalSignature key={selected.id} label="本次操作簽名" accountId={account.id} mode={signatureMode} onModeChange={setSignatureMode} value={labSignature} onChange={setLabSignature} onError={setModalError} />}{(action === "cancel" || action === "interrupt" || originalBusinessEnabled()&&action === "complete") && <><label htmlFor="lab-reason">原因（必填）</label><textarea id="lab-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="請填寫操作原因" rows="4" /></>}{action === "submitReport" && <>{preparingReport&&<p role="status">正在產生／檢查本案報告，請稍候…</p>}<label htmlFor="lab-report-file">上傳 Excel 報告（必填）</label><input id="lab-report-file" type="file" disabled={submitting||preparingReport} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setReportFile(e.target.files?.[0]||null);setModalError('');setReportCheck(null);}}/><p>{reportFile?.name||'尚未選擇檔案'}</p><div className="report-actions"><button type="button" disabled={!reportFile||submitting||preparingReport} onClick={previewReportCheck}>重新檢查報告</button></div>{reportCheck&&<div className="report-checks">{reportCheck.checks.map(row=><p key={row.label}>{row.ok?'✓':'!'} {row.label}：{row.detail}</p>)}</div>}</>}{modalError && <p className="lab-warning" role="alert">{modalError}</p>}{action==="submitReport"&&!sharedSnapshot.electronic.some(r=>r.id===selected.id)&&<button type="button" className="lab-primary" disabled={submitting||preparingReport} onClick={createLinkedDemoTrial}>建立完整流程 Demo 案件</button>}{(action === "cancel" || action === "interrupt") && <p className="lab-warning">{action==='cancel'?'送出後進入 LMS 待核准，一階主管核准後才退回待排程。':'中斷申請將交由 LMS 一階主管審核。'}</p>}<div className="lab-modal-actions"><button disabled={submitting||preparingReport} onClick={() => setSelected(null)}>返回</button><button ref={reportSubmitButton} className="lab-primary" disabled={submitting||preparingReport||!!humanPending||(action==="submitReport"&&(!reportFile||!labSignature))} onClick={action === "submitReport" ? submitReport : performAction}>{submitting ? "檢查與儲存中…" : action === "submitReport" ? "提交" : action==='prepare'?'儲存並進入確認簽名':'確認送出'}</button></div></section></div>}
    </div>
  );
}
