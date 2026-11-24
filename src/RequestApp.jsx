import ProjectTrialsEditor from './ProjectTrialsEditor.jsx';
import {isProjectEntry,projectErrors} from './projectRequests.mjs';
import IntelligentAssistant from './IntelligentAssistant.jsx';
import useLabView from './useLabView.js';
import {requestDemoStartStatus,requestDemoReply} from './requestDemoCommand.mjs';
import ExecutionKindBadge from './ExecutionKindBadge.jsx';
import {isVirtualRequest} from './requestExecutionKind.mjs';
import useResourceMutation from './useResourceMutation.js';
import ResourceOperationNotice from './ResourceOperationNotice.jsx';
import {canCreateFormalRequest,requestAction,submitErrors} from './requestWorkflowClient.mjs';
import {resourceCan,requestWorkflowEnabled,businessIdentity} from './originalBusiness.mjs';
import {originalBusinessEnabled,originalBusinessAccount,loginOriginalBusiness,logoutOriginalBusiness,originalBusinessError,subscribeOriginalBusiness,loadOriginalDraft,hasOriginalDraftDetails,saveOriginalDraft,saveOriginalProject} from './originalBusiness.mjs';
import {appStorage} from './originalBusiness.mjs';
import MobileSearchInput from './MobileSearchInput.jsx';
import useTrialCatalog from './useTrialCatalog.js';
import {buildSpecification,buildAcceptanceCriteria,getTestReference} from './requestTestCatalog.mjs';
import WorkspaceMenuToggle from './WorkspaceMenuToggle.jsx';
import useSidebarMobile from './useSidebarMobile.js';
import BorrowResourceFields from './BorrowResourceFields.jsx';
import './WorkspacePageHeader.css';
import WorkspaceSidebarBrand from './WorkspaceSidebarBrand.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import {RequestBreadcrumbs,RequestSummary} from './RequestEnterpriseUi.jsx';
import useUiPreferences from './useUiPreferences.js';
import './EnterpriseRequest.css';
import EnterpriseLoginLayout from './EnterpriseLoginLayout.jsx';
import HelpTip from './HelpTip.jsx';
import {startSession,endSession} from './idleSessions.mjs';
import LoginCredentials from './LoginCredentials.jsx';
import RequestListToolbar from './RequestListToolbar.jsx';
import {ReportCasePanel} from './ReportUi.jsx';
import SignatureHistory from './SignatureHistory.jsx';
import {requestStatusClass,displayTaipei,filterRequestRows,readRequestRoute,requestPath} from './requestWorkspace.mjs';
import {WorkspaceDashboard,DueLabel} from './RequestWorkspaceUi.jsx';
import RequestEditorPage from './RequestEditorPage.jsx';
import './RequestWorkspace.css';
import './LoginEntry.css';
import {PORTAL_TITLES} from './portalLabels.mjs';
import RequestFormDialog from './RequestFormDialog.jsx';
import './ScheduleViews.css';
import ReportArchive from './ReportArchive.jsx';
import {canOpenReportArchive} from './reportArchive.mjs';
import {ownsRequest,assertEditableRequest,reviewRequesterDecision} from './requestWorkflow.mjs';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import useReportSnapshot,{useReportSnapshotError,refreshReportSnapshot} from './useReportSnapshot.js';
import {refreshLabSnapshot} from './useLabSnapshot.js';
import {submitBorrowRequest} from './borrowApprovals.mjs';
import {INITIAL_ELECTRONIC_REQUESTS as initialRequests} from './demoElectronicRequests.mjs';
import {PaginatedTable,PaginatedList} from './Pagination.jsx';
import DefaultSignatureActions from './DefaultSignatureActions.jsx';
import { getRequestDate } from './requestDate.mjs';
import ApprovalSignature from './ApprovalSignature.jsx';
import { createDemoApprovalSignature } from './demoApprovalSignature.mjs';
import RequestProgress from './RequestProgress.jsx';
import RequestSignatures, { LmsReviewSignatures } from './RequestSignatures.jsx';
import { appendSignature, getSignatureHistory } from './signatureHistory.mjs';
import { readDemoAccounts } from "./demoAccounts.mjs";
import React, {useCallback, useEffect, useRef, useState } from 'react';
import './RequestApp.css';
import SignaturePad from './SignaturePad.jsx';
import {accessSystem,canApproveRequestManager} from './demoPermissions.mjs';

const STORAGE_KEY = 'dqa-request-demo-v2';

const emptyForm = {
  executionKind:'REAL',demoFilled:false,
  product: '', productCode: '', productType: '', project: '', customer: '', customerPartNo: '',
  department: '', requester: '', priority: '一般', projectName:'',projectItems:[], dueDate: '', quantity: '1',
  testItems: [], purpose: [], purposeOther: '', sampleSource: [], sampleSourceOther: '',
  productVersion: '', pcbaVersion: '', softwareVersion: '', manufactureDate: '',
  sampleDescription: '', specification: '', judgementRequired: '需作判定',
  judgementCriteria: '', notes: ''
};
function readRequests() { try { const v = JSON.parse(appStorage().getItem(STORAGE_KEY)); return Array.isArray(v) ? v : initialRequests; } catch { return initialRequests; } }
function getPath() { return (window.location.pathname.replace(/\/+$/, '') || '/')+window.location.search; }

export default function RequestApp() {
  const formalLoginPending=useRef(false),reviewContext=useRef(null);
  const workflow=useResourceMutation({endpoint:'/workflow',storagePrefix:'dqa-request-workflow-pending-v1'});
  const trialCatalog=useTrialCatalog(),testOptions=trialCatalog.rows.map(row=>row.name);
  const {pageSize}=useUiPreferences();
  const [path, setPath] = useState(getPath());
  const {dark,toggleTheme}=useSystemTheme();
  const [role, setRole] = useState(() => originalBusinessEnabled()?'requester':sessionStorage.getItem('dqa-request-role') || 'requester');
  const [user, setUser] = useState(() => originalBusinessEnabled()?originalBusinessAccount('request')?.email||'':sessionStorage.getItem('dqa-request-user') || (sessionStorage.getItem('dqa-request-role') === 'supervisor' ? 'supervisor@example.com' : 'requester@example.com'));
  const [password, setPassword] = useState(originalBusinessEnabled()?'':'demo1234');

  const [loginError, setLoginError] = useState('');
  const [accountId, setAccountId] = useState(() => originalBusinessEnabled()?originalBusinessAccount('request')?.id||'':sessionStorage.getItem('dqa-request-account-id') || '');
  const [requests, setRequests] = useState(readRequests);
  const [projectSaving,setProjectSaving]=useState(false);

  const [sharedAccounts, setSharedAccounts] = useState(readDemoAccounts);
  useEffect(()=>originalBusinessEnabled()?subscribeOriginalBusiness(()=>{setSharedAccounts(readDemoAccounts());setRequests(readRequests());}):undefined,[]);
  useEffect(() => {
    const refresh=()=>setSharedAccounts(readDemoAccounts());
    window.addEventListener('focus',refresh); window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);};
  }, []);
  const supervisors=sharedAccounts.filter(a=>(originalBusinessEnabled()?a.businessCanReviewManager||a.businessAdmin||a.businessPermissions?.includes('requests.review_manager'):a.role==='委託者主管')&&a.status==='啟用中');
  const canAccessSupervisorRequest = useCallback(r => sharedAccounts.some(a=>a.id===accountId&&(originalBusinessEnabled()?resourceCan('requests.review_manager'):a.role==='委託者主管')&&accessSystem(a,'request')&&r.supervisorId===a.id&&(r.status!=='待主管簽核'||canApproveRequestManager(a,r))),[sharedAccounts,accountId]);
  const uploadRequestSignature = event => {
    const file=event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 1024*1024) { event.target.value=''; notify('請選擇 1 MB 以內的 PNG 或 JPG 圖片。'); return; }
    const reader=new FileReader(); reader.onload=()=>setRequestSignature(String(reader.result)); reader.onerror=()=>notify('簽名圖片無法讀取，請重新選擇。'); reader.readAsDataURL(file);
  };

  const route=readRequestRoute(path);
  const canOpenReview = originalBusinessEnabled()?(businessIdentity()?.member.permissions?.includes('requests.review_manager')||businessIdentity()?.member.is_admin&&requests.some(r=>r.supervisorId===accountId&&r.ownerId!==accountId)):role === 'supervisor' && sharedAccounts.some(a=>a.id===accountId && a.role==='委託者主管' && accessSystem(a,'request'));
  const page=route.page==='review'&&!canOpenReview?'forbidden':route.page;
  const setPage=next=>go(requestPath(next));
  const [editorSaved,setEditorSaved]=useState('');const dirtyRef=useRef(false),acceptedUrl=useRef(getPath()),historyPosition=useRef(Number(window.history.state?.dqaRequestIndex)||0),historyRestore=useRef(false),pendingHistory=useRef(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);const sidebarMobile=useSidebarMobile(1000);
  const [leaveTarget,setLeaveTarget]=useState(null),[formErrors,setFormErrors]=useState({}),[menuOpen,setMenuOpen]=useState(false);
  const [dateFrom,setDateFrom]=useState(()=>route.query.get('from')||''),[dateTo,setDateTo]=useState(()=>route.query.get('to')||''),[sortBy,setSortBy]=useState(()=>route.query.get('sort')||'updated-desc'),[collection,setCollection]=useState(()=>route.query.get('collection')||'all'),[listPage,setListPage]=useState(()=>Math.max(1,Number(route.query.get('p'))||1));
  const [formOpen, setFormOpen] = useState(false);
  const [borrowOpen,setBorrowOpen]=useState(false);
  const [myTab,setMyTab]=useState(()=>route.query.get('tab')||'requests');
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [testCandidate,setTestCandidate]=useState('');
  const testReference=getTestReference(testCandidate);
  const [form, setForm] = useState(emptyForm);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const editingSnapshot=useRef(null),draftOperation=useRef(null),draftSaving=useRef(false);
  const [search, setSearch] = useState(()=>route.query.get('q')||'');
  const [reviewTab, setReviewTab] = useState(()=>route.query.get('tab')==='read'?'read':'approval');
  const [searchField, setSearchField] = useState(()=>route.query.get('field')||'all');
  const [statusFilter, setStatusFilter] = useState(()=>route.query.get('status')||'全部狀態');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const refresh = () => { const latest = readRequests(); setRequests(latest); setSelected(current => current ? latest.find(r => r.id === current.id) || current : null); };
    const storage = event => { if (event.key === STORAGE_KEY) refresh(); };
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',storage);
    window.addEventListener('dqa:review-updated',refresh);
    return () => { window.removeEventListener('focus',refresh); window.removeEventListener('storage',storage); window.removeEventListener('dqa:review-updated',refresh); };
  }, []);
  const [toast, setToast] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [requestSignature, setRequestSignature] = useState('');
  const draftEditorCurrent=useRef(null);draftEditorCurrent.current={form,signature:requestSignature};
  const [signatureMode, setSignatureMode] = useState('draw');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [approvalMode, setApprovalMode] = useState('draw');
  const [approvalInputVersion, setApprovalInputVersion] = useState(0);
  const [borrowError,setBorrowError]=useState('');
  const [borrowForm, setBorrowForm] = useState({ requester: '', department: '', resourceType:'equipment',materialId:'',material:'',equipment: '', equipmentId:'', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' });
  useReportSnapshot();
  const reportReadError=useReportSnapshotError();
  const {snapshot:borrowSnapshot,metrics:requestMetrics}=useLabView();
  const borrowRequests=borrowSnapshot.borrows;

  const applyLocation=()=>{const next=readRequestRoute(getPath());setSearch(next.query.get('q')||'');setSearchField(next.query.get('field')||'all');setStatusFilter(next.query.get('status')||'全部狀態');setDateFrom(next.query.get('from')||'');setDateTo(next.query.get('to')||'');setSortBy(next.query.get('sort')||'updated-desc');setCollection(next.query.get('collection')||'all');setListPage(Math.max(1,Number(next.query.get('p'))||1));setReviewTab(next.query.get('tab')==='read'?'read':'approval');setMyTab(next.query.get('tab')==='borrows'?'borrows':'requests');setPath(getPath());};
  useEffect(()=>{window.history.replaceState({...window.history.state,dqaRequestIndex:historyPosition.current},'',getPath());const pop=event=>{if(historyRestore.current){historyRestore.current=false;return;}const index=Number(event.state?.dqaRequestIndex)||0;
   if(dirtyRef.current){event.stopImmediatePropagation();const target=getPath(),delta=index-historyPosition.current;pendingHistory.current={target,delta};setLeaveTarget(target);if(delta){historyRestore.current=true;window.history.go(-delta);}else window.history.replaceState({...window.history.state},'',acceptedUrl.current);}
   else{historyPosition.current=index;acceptedUrl.current=getPath();applyLocation();}};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const [readError,setReadError]=useState(()=>{try{const raw=appStorage().getItem(STORAGE_KEY);if(raw&&!Array.isArray(JSON.parse(raw)))throw Error();return '';}catch{return '無法讀取本機案件資料。原始資料未清除，請確認瀏覽器儲存設定後重試。';}});
  const requestStorage={error:readError,retry:()=>{try{const raw=appStorage().getItem(STORAGE_KEY);if(raw&&!Array.isArray(JSON.parse(raw)))throw Error();setRequests(readRequests());setReadError('');}catch{setReadError('資料仍無法讀取，請勿重設；原始資料保持不變。');}}};
  const go=(next,force=false)=>{if(dirtyRef.current&&!force){setLeaveTarget(next);return false;}pendingHistory.current=null;historyPosition.current+=1;window.history.pushState({dqaRequestIndex:historyPosition.current},'',next);acceptedUrl.current=next;setPath(getPath());setMenuOpen(false);if(!['new','edit'].includes(next.split('/')[2]))setFormOpen(false);window.dispatchEvent(new Event('dqa:navigate'));window.scrollTo(0,0);return true;};
  const finishLeave=target=>{const pending=pendingHistory.current;pendingHistory.current=null;if(pending?.target===target&&pending.delta){dirtyRef.current=false;setFormOpen(false);window.history.go(pending.delta);}else{if(go(target,true)&&target==='/request/requests?collection=draft')applyLocation();}};
  useEffect(()=>{const main=document.querySelector('#rq-main');if(main){main.tabIndex=-1;main.focus({preventScroll:true});}},[path]);
  const clearFilters=()=>{setSearch('');setSearchField('all');setStatusFilter('全部狀態');setDateFrom('');setDateTo('');setSortBy('updated-desc');setCollection('all');setListPage(1);};
  const updateFilter=(setter,value)=>{setter(value);setListPage(1);};
  useEffect(()=>{if(!['requests','review','history','overview'].includes(page))return;const query=new URLSearchParams();for(const [key,value]of Object.entries({q:search,field:searchField==='all'?'':searchField,status:statusFilter==='全部狀態'?'':statusFilter,from:dateFrom,to:dateTo,sort:sortBy==='updated-desc'?'':sortBy,collection:collection==='all'?'':collection,tab:page==='review'?reviewTab:myTab==='borrows'?'borrows':'',p:listPage>1?listPage:''}))if(value)query.set(key,value);const next=window.location.pathname+(query.size?'?'+query:'');window.history.replaceState({...window.history.state},'',next);acceptedUrl.current=next;},[search,searchField,statusFilter,dateFrom,dateTo,sortBy,collection,reviewTab,myTab,listPage,page]);
  const signedAccount = sharedAccounts.find(a => a.id === accountId && accessSystem(a, 'request'));
  const myBorrows=borrowRequests.filter(r=>r.actorId===signedAccount?.id||(!r.actorId&&r.requester===signedAccount?.name&&sharedAccounts.filter(a=>a.name===r.requester).length===1));
  const visibleBorrows=myBorrows.filter(r=>(!dateFrom||r.borrowDate>=dateFrom)&&(!dateTo||r.borrowDate<=dateTo)).filter(r=>[r.id,r.equipment,r.material,r.purpose,r.requester,r.borrowDate,r.returnDate].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const openBorrow=()=>{setBorrowError('');setBorrowForm(current=>({...current,requester:current.requester||signedAccount?.name||'',department:current.department||signedAccount?.department||''}));setBorrowOpen(true);};
  useEffect(() => {
    if (!formOpen || !signedAccount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync the authenticated account into the open editor.
    setForm(current => ({ ...current, requester: signedAccount.name || '', department: signedAccount.department || '' }));
  }, [formOpen, signedAccount]);
  useEffect(()=>{if(signedAccount&&['/request/login','/request'].includes(path))go('/request/dashboard',true);},[signedAccount,path]);
  const isLoggedIn = Boolean(signedAccount) && path !== '/request/login' && path !== '/request' && path !== '/';
  const ownedRows=requests.filter(r=>originalBusinessEnabled()?ownsRequest(signedAccount,r)||canOpenReview&&canAccessSupervisorRequest(r):canOpenReview?canAccessSupervisorRequest(r):ownsRequest(signedAccount,r));
  const baseRows=ownedRows.filter(r=>(!originalBusinessEnabled()||page!=='review'||canAccessSupervisorRequest(r))&&(page==='history'?r.status==='已結案':page==='review'?r.status===(reviewTab==='read'?'待查閱':'待主管簽核'):(collection==='month'||r.status!=='已結案')&&(canOpenReview&&collection!=='month'?r.status!=='待查閱':true)));
  const visibleRequests=filterRequestRows(baseRows,{search,field:searchField,status:statusFilter,from:dateFrom,to:dateTo,sort:page==='review'&&sortBy==='updated-desc'?'work':sortBy,collection});
  const dirty=formOpen&&editorSaved!==JSON.stringify({form,signature:requestSignature});useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  useEffect(()=>{const unload=e=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[]);
  useEffect(()=>{if(!isLoggedIn)return;if(route.page==='new'){
    if(!canCreateFormalRequest(signedAccount))return;
    if(formOpen&&(route.id||null)===editingDraftId)return;
    const record=route.id?readRequests().find(r=>r.id===route.id):null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface access failure when an external URL addresses an uneditable case.
    if(originalBusinessEnabled()&&route.id&&!hasOriginalDraftDetails(route.id)){loadOriginalDraft(route.id).then(()=>setRequests(readRequests())).catch(error=>setFormErrors({access:originalBusinessError(error)}));return;}
    if(route.id){try{assertEditableRequest(signedAccount,record);}catch{setFormOpen(false);setFormErrors({access:'案件不存在、不可編輯或沒有權限。'});return;}}
    if(!record)draftOperation.current=null;
    const value={...emptyForm,...(record||{}),supervisorId:originalBusinessEnabled()?signedAccount.supervisorId||'':record?.supervisorId||'',requester:signedAccount.name,department:signedAccount.department};
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate an explicitly addressed editor from browser history.
    setForm(value);setEditingDraftId(record?.id||null);editingSnapshot.current=record?JSON.stringify(record):null;setRequestSignature(record?.draftSignature||'');setSignatureMode(record?.draftSignature?'upload':'draw');setFormErrors({});setEditorSaved(JSON.stringify({form:value,signature:record?.draftSignature||''}));setFormOpen(true);
   }else{setFormOpen(false);if(route.page==='detail'){const record=readRequests().find(r=>r.id===route.id);const allowed=record&&(originalBusinessEnabled()?ownsRequest(signedAccount,record)||canAccessSupervisorRequest(record):canOpenReview?record.supervisorId===signedAccount.id:ownsRequest(signedAccount,record));if(allowed&&reviewContext.current?.id!==record.id)reviewContext.current={id:record.id,revision:record.sourceRevision};setSelected(allowed?record:null);}}
  },[path,accountId,formOpen,isLoggedIn,signedAccount,canOpenReview,canAccessSupervisorRequest,route.page,route.id,editingDraftId,requests]);
  const beginEdit=async r=>{if(originalBusinessEnabled()){try{r=await loadOriginalDraft(r.id);}catch(error){notify(originalBusinessError(error));return;}}try{assertEditableRequest(signedAccount,r);}catch(error){notify(error.message);return;}const value={...emptyForm,...r,...(originalBusinessEnabled()?{supervisorId:signedAccount.supervisorId||''}:{})};setEditorSaved(JSON.stringify({form:value,signature:r.draftSignature||''}));setForm(value);setFormErrors({});setEditingDraftId(r.id);editingSnapshot.current=JSON.stringify(r);setRequestSignature(r.draftSignature||'');setSignatureMode(r.draftSignature?'upload':'draw');setFormOpen(true);setSelected(null);go(`/request/edit/${encodeURIComponent(r.id)}`,true);};
  const openCase=r=>{reviewContext.current={id:r.id,revision:r.sourceRevision};setSelected(r);setApprovalMode('draw');setApprovalSignature('');setApprovalNote(r.approvalNote||'');setApprovalInputVersion(v=>v+1);go(`/request/cases/${encodeURIComponent(r.id)}`);};
  useEffect(()=>{const last=Math.max(1,Math.ceil((myTab==='borrows'?visibleBorrows.length:visibleRequests.length)/20));if(listPage>last){
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clamp an externally shared page number after filtering.
    setListPage(last);}},[visibleRequests.length,visibleBorrows.length,myTab,listPage]);
  const notify = (s) => { setToast(s); };
  const login = async () => {if(originalBusinessEnabled()){if(formalLoginPending.current)return;formalLoginPending.current=true;try{await loginOriginalBusiness(user.trim(),password);const a=originalBusinessAccount('request');setSharedAccounts(readDemoAccounts());setRequests(readRequests());startSession('request',a.id);setRole('requester');setAccountId(a.id);setLoginError('');go('/request/dashboard',true);}catch(error){setLoginError(originalBusinessError(error));}finally{formalLoginPending.current=false;}return;} const normalized=user.trim().toLowerCase(); const candidates=sharedAccounts.filter(a=>accessSystem(a,'request') && (String(a.email||'').toLowerCase()===normalized || a.name===user.trim())); const a=candidates.length===1?candidates[0]:null; if (!a || password!=='demo1234' || (role==='supervisor' ? a.role!=='委託者主管' : a.role!=='委託者')) { setLoginError('帳號、角色或密碼不正確；請使用啟用中的共用帳號。'); return; } try{startSession('request',a.id);sessionStorage.setItem('dqa-request-role',role);sessionStorage.setItem('dqa-request-user',a.name);}catch{try{endSession('request');}catch{/* Storage remains unavailable. */}setLoginError('無法保存登入狀態，請確認瀏覽器儲存權限。');return;}setLoginError('');setUser(a.name);setAccountId(a.id); go(path.startsWith('/request/')&&!['/request/login','/request/dashboard'].includes(path.split('?')[0])?path:'/request/dashboard',true); };
  const completeLogout = async () => {if(originalBusinessEnabled()){try{await logoutOriginalBusiness();}catch(error){notify(originalBusinessError(error));}} setUser(originalBusinessEnabled()?'':role === 'supervisor' ? 'supervisor@example.com' : 'requester@example.com'); setPassword(originalBusinessEnabled()?'':'demo1234'); endSession('request'); setAccountId(''); sessionStorage.removeItem('dqa-request-role'); sessionStorage.removeItem('dqa-request-user'); dirtyRef.current=false;setFormOpen(false);go('/request/login',true); };
  const logout=()=>{if(dirtyRef.current){setLeaveTarget('logout');return;}completeLogout();};
  const resetEditor = () => {
    if(dirtyRef.current&&!window.confirm('重設會放棄本次尚未儲存的修改，確定重設？'))return;
    const saved=JSON.parse(editorSaved);
    setForm(saved.form);setRequestSignature(saved.signature||'');setSignatureMode(saved.signature?'upload':'draw');setFormErrors({});
  };
  const openForm = () => {
    if(dirtyRef.current){setLeaveTarget('/request/new');return;}

    const value={...emptyForm,requester:signedAccount?.name||'',department:signedAccount?.department||''};
    setEditorSaved(JSON.stringify({form:value,signature:''}));setFormErrors({});setForm(value);
    setRequestSignature('');
    setSignatureMode('draw');
    setEditingDraftId(null);
    setFormOpen(true);
    setSelected(null);
    go('/request/new',true);
  };
  const fillSampleRequest = (language='zh-TW') => {
    const current=draftEditorCurrent.current;
    const status=requestDemoStartStatus({canCreate:canCreateFormalRequest(signedAccount),isEditor:isLoggedIn&&page==='new'&&formOpen&&!borrowOpen,editingId:editingDraftId||route.id,busy:workflow.locked||draftSaving.current,form:current.form,defaults:emptyForm,signature:current.signature});
    if(status!=='READY')return requestDemoReply(status,language);
    if(trialCatalog.error)throw Error(trialCatalog.error);
    const pick = items => items[Math.floor(Math.random() * items.length)];
    const product = pick([{code:'DL8', type:'車用儀表', customer:'YMT', part:'DL8-H3500-00'}, {code:'VCU-A01', type:'車用控制器', customer:'客戶 A', part:'VCU-A01-001'}, {code:'MTR-B02', type:'LCD 儀表', customer:'客戶 B', part:'MTR-B02-001'}]);
    const item = pick(['高溫試驗', '高溫高濕', '溫度循環', '振動試驗', 'IPX6 防水']);
    const dateString = date => { const year=date.getFullYear(), month=String(date.getMonth()+1).padStart(2,'0'), day=String(date.getDate()).padStart(2,'0'); return `${year}-${month}-${day}`; };
    const today = new Date();
    const due = new Date(today); due.setDate(due.getDate()+14+Math.floor(Math.random()*14));
    const supervisor = supervisors.find(a => a.id === signedAccount?.supervisorId);
    const canvas = document.createElement('canvas'); canvas.width=600; canvas.height=120;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('無法準備測試簽名，請重新開啟頁面後再試。');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#17365e'; ctx.font='32px sans-serif'; ctx.fillText('測試簽名（僅供流程測試）',20,70);
    const signature=canvas.toDataURL('image/png');
    const nextForm={ ...emptyForm, executionKind:'VIRTUAL', demoFilled:true, product:product.code, productCode:product.code, productType:product.type, customer:product.customer, project:product.customer, customerPartNo:product.part,
      dueDate:dateString(due), quantity:String(pick([2,3,5])), department:signedAccount?.department || '', requester:signedAccount?.name || '',
      priority:pick(['一般','急件']), purpose:[pick(['新產品 New Product','設計變更 Design change','量產品 Mass product'])],
      sampleSource:['社內 In-house production'], sampleSourceOther:'測試樣品', productVersion:'V1.0', pcbaVersion:'PCB-A01', softwareVersion:'V1.0', manufactureDate:dateString(today),
      sampleDescription:'測試資料，樣品編號 SAMPLE-001。', testItems:[item], specification:buildSpecification([item]), judgementRequired:'需作判定', judgementCriteria:buildAcceptanceCriteria(item), notes:'測試資料，請依實際需求修改。', requestDate:dateString(today), supervisorId:supervisor?.id || '' };
    draftEditorCurrent.current={form:nextForm,signature};setSignatureMode('upload');setRequestSignature(signature);setForm(nextForm);setFormErrors({});
    const reply=requestDemoReply(supervisor?'FILLED':'SUPERVISOR_REQUIRED',language);notify(reply);return reply;
  };
  const hasAnyFormData = (value) => Object.entries(value).some(([key, val]) => {
    if (['priority', 'requester', 'department', 'executionKind', 'demoFilled'].includes(key)) return false;
    if (key === 'quantity') return String(val ?? '') !== '1' && String(val ?? '').trim() !== '';
    if (Array.isArray(val)) return val.length > 0;
    return String(val ?? '').trim() !== '';
  });
  const submitRequest = async (asDraft,leaveAfter='') => {
    if(originalBusinessEnabled()){
      if(workflow.locked||draftSaving.current)return false;
      if(!asDraft){const errors=isProjectEntry(form)?{...submitErrors({...form,quantity:'1',testItems:['專案分項'],specification:'專案分項',judgementCriteria:'專案分項'},requestSignature),...projectErrors(form)}:submitErrors(form,requestSignature);if(Object.keys(errors).length){setFormErrors(errors);return false;}if(!requestWorkflowEnabled()){notify('人工委託簽核尚待限定開放，草稿可繼續儲存。');return false;}}
      if(!hasAnyFormData(form)&&!requestSignature){notify('請至少填寫一項委託資訊，再儲存草稿。');return false;}
      draftSaving.current=true;setProjectSaving(isProjectEntry(form)&&!editingDraftId);
      if(!draftOperation.current)draftOperation.current=crypto.randomUUID();
      try{
        const submitted=JSON.stringify({form,signature:requestSignature});
        if(isProjectEntry(form)&&!editingDraftId){
          const errors=asDraft?(!form.projectItems.length||!form.projectName.trim()?{projectItems:'請填寫專案名稱並加入至少一項試驗'}:{}):projectErrors(form);if(Object.keys(errors).length){setFormErrors(errors);return false;}
          const result=await saveOriginalProject(form,requestSignature,!asDraft);
          setRequests(readRequests());setEditorSaved(submitted);dirtyRef.current=false;setFormOpen(false);setEditingDraftId(null);draftOperation.current=null;setSearch(result.project_code);setSearchField('all');setStatusFilter('全部狀態');setCollection('all');setDateFrom('');setDateTo('');setSortBy('updated-desc');setListPage(1);setMyTab('requests');
          if(leaveAfter)finishLeave(leaveAfter);else go('/request/requests?q='+encodeURIComponent(result.project_code),true);
          notify(`專案 ${result.project_code} 的 ${result.count} 張關聯委託單已${asDraft?'儲存為草稿':'送出主管簽核'}。${result.refresh_failed?'清單讀取暫時失敗，請重新讀取頁面；請勿再次新增同一專案。':''}`);return true;
        }
        const source=editingSnapshot.current?JSON.parse(editingSnapshot.current):null;
        const row=await saveOriginalDraft({id:draftOperation.current,form,signature:requestSignature,existingId:editingDraftId,expectedRevision:source?.sourceRevision});
        if(JSON.stringify(draftEditorCurrent.current)!==submitted){setRequests(readRequests());editingSnapshot.current=JSON.stringify(row);setEditingDraftId(row.id);setEditorSaved(submitted);go('/request/edit/'+encodeURIComponent(row.id),true);notify('前一版草稿已儲存；儲存期間的新修改仍保留在表單，請再次儲存。');return false;}
        if(!asDraft){
          setEditingDraftId(row.id);editingSnapshot.current=JSON.stringify(row);setEditorSaved(submitted);
          if(!await workflow.submit(requestAction(row,'SUBMIT',{signature:requestSignature}),'委託單已送出，等待指定直屬主管簽核。')){go('/request/edit/'+encodeURIComponent(row.id),true);return false;}
        }
        setRequests(readRequests());setEditorSaved(submitted);dirtyRef.current=false;setFormOpen(false);setEditingDraftId(null);draftOperation.current=null;setSearch('');setStatusFilter('全部狀態');setMyTab('requests');
        if(leaveAfter)finishLeave(leaveAfter);else go('/request/requests',true);
        notify(asDraft?`草稿 ${row.id} 已儲存`:`委託單 ${row.id} 已送出，等待主管簽核`);return true;
      }catch(error){notify(originalBusinessError(error));return false;}finally{draftSaving.current=false;setProjectSaving(false);}
    }

    if(readError){notify('本機資料讀取失敗，請先排除錯誤再儲存。');return false;}
    const errors={};if(!asDraft){if(!(form.productCode||form.product||'').trim())errors.productCode='請填寫產品代碼';if(!form.customer.trim())errors.customer='請填寫客戶名稱';if(!Number.isSafeInteger(Number(form.quantity))||Number(form.quantity)<1)errors.quantity='請輸入正整數';if(!form.purpose.length)errors.purpose='請選擇試驗目的';if(!form.testItems.length)errors.testItems='請選擇試驗項目';if(!form.specification.trim())errors.specification='請填寫試驗規範';if(!requestSignature)errors.signature='送簽前請完成簽名';if(!form.supervisorId)errors.supervisorId='請選擇直屬主管';if(form.purpose.some(t=>t.startsWith('其他'))&&!form.purposeOther.trim())errors.purposeOther='請補充其他試驗目的';}setFormErrors(errors);if(Object.keys(errors).length){notify('請修正標示的欄位後再送出。');requestAnimationFrame(()=>document.querySelector('[aria-invalid=true]')?.focus());return false;}
    const saveRows=next=>{try{appStorage().setItem(STORAGE_KEY,JSON.stringify(next));setRequests(next);window.dispatchEvent(new Event('dqa:request-updated'));setEditorSaved(JSON.stringify({form,signature:requestSignature}));dirtyRef.current=false;return true;}catch{notify('儲存失敗：瀏覽器空間不足或禁止儲存。內容仍保留在此頁，請重試。');return false;}};
    if(signedAccount?.role!=='委託者'){notify('僅委託者可建立或編輯委託單。');return;}
    if(editingDraftId){
      try { const latest=readRequests().find(row=>row.id===editingDraftId);assertEditableRequest(signedAccount,latest);if(editingSnapshot.current!==JSON.stringify(latest))throw Error('草稿已在其他頁面更新，請重新開啟後編輯。'); }
      catch(error){notify(error.message);return;}
    }
    if(!asDraft&&(!Number.isSafeInteger(Number(form.quantity))||Number(form.quantity)<1)){notify('測試數量須為正整數。');return;}

    if (!asDraft && (form.purpose || []).some(t => t.startsWith('其他')) && !String(form.purposeOther || '').trim()) { notify('選擇其他試驗目的時，請填寫說明。'); document.getElementById('rq-purpose-other')?.focus(); return; }
    if (!signedAccount?.name?.trim() || !signedAccount?.department?.trim()) { notify('帳號姓名或部門未設定，請至 LMS 帳號管理補齊。'); return; }
    if (asDraft && !hasAnyFormData(form) && !requestSignature) {
      notify('請至少填寫一項委託資訊，再儲存草稿。');
      return;
    }
    if (!asDraft && (!(form.productCode || form.product || '').trim() || !form.customer.trim() || !form.requester.trim() || !form.department.trim() || !form.testItems.length || !(form.purpose || []).length || !form.specification.trim())) {
      notify('請填寫產品代碼、客戶名稱、委託者、部門、試驗項目、試驗目的及試驗規範／手法。');
      return;
    }
    const assignedSupervisor = signedAccount?.role === '委託者' ? supervisors.find(a => a.id === signedAccount.supervisorId) : null;
    if (!asDraft && !assignedSupervisor) { notify('目前帳號沒有設定啟用中的直屬主管，請至 LMS 帳號管理設定。'); return; }
    if (!asDraft && form.supervisorId !== assignedSupervisor.id) { notify('請選擇帳號設定中的直屬主管。'); return; }
    if (!asDraft && !requestSignature) { notify('送出前請先完成委託者簽名。'); return; }
    const now = getRequestDate();
    setSearch('');
    setStatusFilter('全部狀態');
    if (asDraft && editingDraftId) {
      if(!saveRows(requests.map(r=>r.id===editingDraftId?{...r,...form,draftSignature:requestSignature,requester:signedAccount.name,department:signedAccount.department,updatedAt:now}:r)))return false;
      setFormOpen(false);
      if(leaveAfter)finishLeave(leaveAfter);else go('/request/requests',true);setMyTab('requests');
      setEditingDraftId(null);
      notify(`草稿 ${editingDraftId} 已更新`);
      return true;
    }
    const original = requests.find(r => r.id === editingDraftId);
    const id = original?.id || `REQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8)}`;
    const item = {
      ...original,
      ...form,
      id,
      requester: signedAccount.name,
      department: signedAccount.department,
      ownerUser: user,
      ownerId: signedAccount?.id || '',
      supervisorId: assignedSupervisor?.id || '',
      supervisorName: assignedSupervisor?.name || '',
      draftSignature:asDraft?requestSignature:'',
      requesterSignature: asDraft ? '' : requestSignature,
      requesterSignatureAt: asDraft ? '' : new Date().toISOString(),
      requestDate: asDraft ? '' : now,
      signatureRecords: asDraft ? getSignatureHistory(original || {}) : appendSignature(original || {}, { stage: '委託送出', actor: signedAccount.name, actorId: signedAccount.id, signature: requestSignature, decision: original ? '重新送出' : '送出' }),
      supervisorSignature: '', supervisorSignatureAt: '',
      lmsReview: null,
      status: asDraft ? '草稿' : '待主管簽核',
      createdAt: original?.createdAt || now,
      updatedAt: now,
      approver: '',
      approvalNote: ''
    };
    if(!saveRows(original?requests.map(r=>r.id===id?item:r):[item,...requests]))return false;
    setFormOpen(false);
    if(leaveAfter)finishLeave(leaveAfter);else go('/request/requests',true);setMyTab('requests');
    setEditingDraftId(null);
    notify(asDraft ? `已儲存草稿 ${id}，可在「我的委託/借用」中繼續編輯` : `委託單 ${id} 已送出，等待主管簽核`);return true;
  };
  const fillDemoApproval = () => {
    if(originalBusinessEnabled()&&!isVirtualRequest(selected)){notify('真實委託請由主管本人簽名；Demo 填入只適用虛擬委託。');return;}
    if ((approvalSignature || approvalNote.trim()) && !window.confirm('DEMO 填寫會覆蓋目前的主管簽名與簽核意見，確定繼續？')) return;
    setApprovalInputVersion(version => version + 1);
    setApprovalMode('upload');
    setApprovalSignature(createDemoApprovalSignature());
    setApprovalNote('DEMO 測試：已確認委託內容與試驗需求，僅供簽核流程展示。');
    notify('已填入測試簽名與簽核意見，請確認後選擇核准或退回。');
  };
  const review = async (id, status) => {
    if(originalBusinessEnabled()){
      if(workflow.locked)return;
      const target=requests.find(r=>r.id===id);if(!target)return;
      const expectedRevision=reviewContext.current?.revision;
      if(!expectedRevision){notify('請重新開啟案件後簽核。');return;}
      try{if(await workflow.submit(requestAction(target,status==='退件'?'RETURN':'MANAGER_APPROVE',{signature:approvalSignature,comment:approvalNote,expectedRevision}),'主管簽核已保存至資料庫。')){setSelected(null);setApprovalNote('');setApprovalSignature('');setPage('review');}}catch(e){notify(originalBusinessError(e));}return;
    }
    try {
      const latest=readRequests(),target=latest.find(row=>row.id===id);
      const displayed=requests.find(row=>row.id===id);
      if(JSON.stringify(target)!==JSON.stringify(displayed))throw Error('案件已更新，請重新開啟後簽核。');
      const next=reviewRequesterDecision(target,signedAccount,{status,signature:approvalSignature,comment:approvalNote});
      const updated=latest.map(row=>row.id===id?next:row);appStorage().setItem(STORAGE_KEY,JSON.stringify(updated));setRequests(updated);window.dispatchEvent(new Event('dqa:request-updated'));
      setSelected(null);setApprovalNote('');setApprovalSignature('');setPage('review');
      notify(status==='已核准'?'簽核完成，委託單已進入 LMS 待審查':'已退回委託單，委託者可依意見修正');
    }catch(error){notify(error.message);}
  };
  if (!isLoggedIn) return <div className={`rq-app rq-login-shell ${dark ? "rq-theme-dark" : "rq-theme-light"}`}><EnterpriseLoginLayout system="request" dark={dark} onToggle={toggleTheme}><form className="rq-login-card unified-login-form" onSubmit={event=>{event.preventDefault();login();}}><h1>{PORTAL_TITLES.request}</h1><div className="rq-role-choice"><button type="button" className={role === 'requester' ? 'selected' : ''} onClick={() => { setRole('requester'); setUser('requester@example.com'); setPassword('demo1234'); setLoginError(''); }}><span>＋</span><b>委託者登入</b><small>建立委託單、追蹤案件、補件</small></button><button type="button" className={role === 'supervisor' ? 'selected' : ''} onClick={() => { setRole('supervisor'); setUser('supervisor@example.com'); setPassword('demo1234'); setLoginError(''); }}><span>✓</span><b>主管登入</b><small>審查委託單、核准或退件</small></button></div><LoginCredentials key={role} rememberScope={`request-${role}`} accountId="request-username" passwordId="request-password" account={user} password={password} onAccountChange={setUser} onPasswordChange={setPassword}/>{loginError && <p role="alert" style={{color:"#b42318"}}>{loginError}</p>}<button type="submit" className="rq-btn rq-btn-primary rq-full">登入系統 <span>→</span></button><button type="button" className="rq-return-entry" onClick={() => window.location.assign('/')}>← 返回系統首頁</button></form></EnterpriseLoginLayout></div>;

  const nav = canOpenReview ? [['overview','總覽'],['review','待簽核/查閱'],['requests','全部委託單'],['history','案件歷程'],['notifications','通知中心']] : [['overview','總覽'],['new','新增委託單'],['borrow','申請借用'],['requests','我的委託/借用'],['history','案件歷程'],['notifications','通知中心']];
  if(canOpenReportArchive(signedAccount,'request'))nav.push(['archive','資料庫']);
  const titleMap = { archive:'資料庫', overview: '總覽', new: '新增委託單', borrow: '申請借用', requests: canOpenReview ? '全部委託單' : '我的委託/借用', review: '待簽核/查閱', history:'案件歷程', notifications: '通知中心' };
  const pending = requests.filter(r => r.status === '待主管簽核' && canOpenReview && canAccessSupervisorRequest(r));
  const myRequests = requests.filter(r=>r.status!=='已結案').filter(r => canOpenReview ? canAccessSupervisorRequest(r) : ownsRequest(signedAccount,r));
  const renderBorrowTable=items=><><div className="rq-table-wrap"><PaginatedTable currentPage={listPage} onPageChange={setListPage} resetKey={`${page}:${myTab}:${search}`} className="rq-table"><thead><tr><th>申請單號</th><th>借用項目／數量</th><th>借用期間</th><th>申請人</th><th>狀態</th></tr></thead><tbody>{items.length?items.map(r=><tr key={r.id}><td><b>{r.id}</b></td><td>{r.resourceType==='material'?(borrowSnapshot.materials.find(m=>m.id===r.materialId)?.name||r.material):(borrowSnapshot.equipment.find(m=>m.id===r.equipmentId)?.name||r.equipment)}<small>{r.resourceType==='material'?`${r.materialId} · ${r.quantity} ${r.unit||''}`:(r.equipmentId||'舊版未綁定設備')}</small></td><td>{r.borrowDate} 至 {r.returnDate}</td><td>{r.requester}</td><td><span className="rq-status pending">{r.status==='待確認'?'待核准':r.status==='已核准'?'借用':r.status}</span>{r.reviewComment&&<small>{r.reviewComment}</small>}</td></tr>):<tr><td colSpan="5" className="rq-empty">尚無符合條件的借用申請紀錄</td></tr>}</tbody></PaginatedTable></div></>;
  const renderTable = (items) => <><div className="rq-table-wrap"><PaginatedTable currentPage={listPage} onPageChange={setListPage} resetKey={`${page}:${role}:${reviewTab}:${searchField}:${search}:${statusFilter}`} className="rq-table"><thead><tr><th>委託單號</th><th>產品／專案</th><th>試驗項目</th><th>委託人</th><th>需求日期</th><th>狀態</th><th>操作</th></tr></thead><tbody>{items.length ? items.map(r => <tr key={r.id}><td><button className="rq-link" onClick={()=>openCase(r)}>{r.id}</button></td><td><b>{r.productCode||r.product}</b><small>{r.project || '—'}</small></td><td>{(r.testItems || []).join('、')}</td><td>{r.requester}</td><td><DueLabel request={r}/></td><td><span className={`rq-status ${requestStatusClass(r.status)}`}>{r.status === '待主管簽核' ? '待簽核' : r.status === '已核准' ? '待審查' : r.status}</span></td><td><div className="rq-table-actions">{r.status === '草稿' ? (signedAccount.role === '委託者' && ownsRequest(signedAccount,r) ? <><button className="rq-btn rq-btn-small" onClick={()=>beginEdit(r)}>編輯草稿</button></> : <span className="rq-muted">—</span>) : <>{canCreateFormalRequest(signedAccount)&&ownsRequest(signedAccount,r)&&['退件','補件中'].includes(r.status)&&<button type="button" className="rq-btn rq-btn-small" onClick={()=>beginEdit(r)}>編輯並重新送出</button>}<button className="rq-btn rq-btn-small" onClick={()=>openCase(r)}>{canOpenReview && r.status === '待主管簽核' ? '簽核' : '查看'}</button></>}</div></td></tr>) : <tr><td colSpan="7" className="rq-empty">{search||dateFrom||dateTo||statusFilter!=='全部狀態'||collection!=='all'?'沒有符合搜尋／篩選條件的案件。':page==='review'?reviewTab==='read'?'目前沒有待查閱案件。':'目前沒有待簽核案件。':ownedRows.length?'此清單目前沒有案件。':'尚未建立任何委託單。'}</td></tr>}</tbody></PaginatedTable></div></>;

  const tabbedList=page==='review'||page==='requests'&&canCreateFormalRequest(signedAccount);
  const listFilters=<RequestListToolbar key={`${page}:${myTab}:${reviewTab}`} filters={{search,searchField,statusFilter,dateFrom,dateTo,sortBy,collection}} borrows={page==='requests'&&myTab==='borrows'} onClear={clearFilters} onChange={(key,value)=>{const setters={search:setSearch,searchField:setSearchField,statusFilter:setStatusFilter,dateFrom:setDateFrom,dateTo:setDateTo,sortBy:setSortBy};updateFilter(setters[key],value);}}/>;

  return <div className={`rq-app rq-enterprise ${sidebarCollapsed?'rq-sidebar-collapsed':''} ${dark ? "rq-theme-dark" : "rq-theme-light"}`}><header className="rq-topbar"><WorkspaceMenuToggle className="rq-mobile-menu rq-btn" label="切換功能選單" controls="request-navigation" expanded={sidebarMobile?menuOpen:!sidebarCollapsed} onClick={()=>sidebarMobile?setMenuOpen(v=>!v):setSidebarCollapsed(v=>!v)}/><CompanyBrandLogo dark={dark}/><RequestBreadcrumbs title={page==='new'?(editingDraftId?'編輯委託單草稿':'新增試驗委託單'):page==='detail'?'委託單詳情':collection==='draft'&&page==='requests'?'草稿管理':titleMap[page]||'總覽'} onHome={()=>go('/')} onOverview={()=>setPage('overview')}/><SystemHeaderActions compactTheme dark={dark} onToggle={toggleTheme} account={signedAccount} onLogout={logout} notifications={[{title:'待主管簽核委託',detail:'等待主管簽核委託內容',count:pending.length,icon:'✓',onClick:()=>setPage(canOpenReview?'review':'requests')}]}/></header><div className="rq-layout"><aside id="request-navigation" className={`rq-sidebar ${menuOpen?'rq-menu-open':''}`} aria-label="電子委託功能"><WorkspaceSidebarBrand/>{nav.map(([key,label]) => <button key={key} className={`rq-nav ${page===key ? 'active' : ''}`} onClick={() => { if (key === 'new') openForm(); else if(key==='drafts'){if(go('/request/requests?collection=draft')){clearFilters();setCollection('draft');setMyTab('requests');setSelected(null);}} else { if(go(requestPath(key))){clearFilters();setSelected(null);} } }}><LmsSidebarIcon name={({overview:'dashboard',drafts:'requests'})[key]||key}/>{label}{key === 'review' && pending.length + myRequests.filter(r=>r.status==='待查閱').length > 0 && <i>{pending.length + myRequests.filter(r=>r.status==='待查閱').length}</i>}</button>)}<details className="workspace-sidebar-note"><summary>Demo 使用說明</summary><p>僅使用假資料；資料儲存在此瀏覽器，不連接正式系統。</p></details><button type="button" className="rq-nav workspace-sidebar-home" onClick={()=>go('/')}><LmsSidebarIcon name="dashboard"/>回到首頁</button></aside><main className="rq-main" id="rq-main">{!['new','detail','forbidden'].includes(page)&&<div className="rq-workspace-heading"><h1><LmsSidebarIcon name={({overview:'dashboard',drafts:'requests'})[page]||page}/>{page==='overview'?'工作總覽':page==='requests'&&collection==='draft'?'草稿管理':titleMap[page]}</h1>{page==='requests'&&canCreateFormalRequest(signedAccount)&&<button type="button" className="rq-btn rq-btn-primary rq-new-request" onClick={openForm}>＋ 新增試驗委託單</button>}</div>}{toast&&<div className={`rq-feedback ${/失敗|無法|不正確|請.*(填|完成|選擇|修正)|未設定/.test(toast)?'rq-feedback-error':''}`} role="status">{toast}<button className="rq-btn rq-btn-small" onClick={()=>setToast('')} aria-label="關閉操作訊息">×</button></div>}{reportReadError&&<div className="rq-feedback rq-feedback-error" role="alert">{reportReadError}<button className="rq-btn" onClick={refreshReportSnapshot}>重試讀取報告</button></div>}{requestStorage.error && <div role="alert">{requestStorage.error}<button onClick={requestStorage.retry}>重試儲存</button></div>}{page==='forbidden'||(page==='new'&&signedAccount.role!=='委託者')?<div role="alert" className="rq-panel rq-empty">你沒有此頁的操作權限。<button className="rq-btn" onClick={()=>setPage('overview')}>返回總覽</button></div>:null}{formErrors.access&&<p role="alert">{formErrors.access}</p>}
  <ResourceOperationNotice operation={workflow} onSaved={()=>go('/request/requests')}/>
  {originalBusinessEnabled()&&page==='new'&&!canCreateFormalRequest(signedAccount)&&<p role="alert" className="rq-stage-note">目前帳號沒有建立委託草稿的權限。</p>}
  {page==='archive'&&<ReportArchive actor={signedAccount} system="request" showHeading={false}/>}
  {page==='overview'&&<WorkspaceDashboard rows={ownedRows} supervisor={canOpenReview} onOpen={openCase} onEdit={beginEdit} onFilter={key=>{clearFilters();setCollection(key);if(key==='read'||key==='approval'&&canOpenReview){setReviewTab(key==='read'?'read':'approval');setPage('review');}else setPage('requests');}}/>}
  {page==='requests'&&myTab!=='borrows'&&<RequestSummary rows={ownedRows.filter(row=>row.status!=='已結案'&&(!canOpenReview||row.status!=='待查閱'))} collection={statusFilter==='已完成'?'completed':collection} onFilter={key=>{clearFilters();if(key==='completed')setStatusFilter('已完成');else setCollection(key);}}/>}
  {(page === 'requests' || page === 'review' || page==='history') && <section className="rq-panel">{page==='requests'&&canCreateFormalRequest(signedAccount)&&<div className="schedule-view-top rq-review-top workspace-tab-toolbar rq-list-tab-toolbar"><div className="schedule-view-tabs workspace-primary-tabs" role="tablist" aria-label="我的委託與借用">{[['requests','委託單',ownedRows.filter(r=>r.status!=='已結案').length],['borrows','借用單',myBorrows.length]].map(([key,label,count])=><button type="button" role="tab" aria-label={label} aria-selected={myTab===key} key={key} onClick={()=>{setMyTab(key);clearFilters();}}><strong>{label}</strong><span>{count}</span></button>)}</div>{listFilters}</div>}{page==='review'&&<div className="schedule-view-top rq-review-top workspace-tab-toolbar rq-list-tab-toolbar"><div className="schedule-view-tabs workspace-primary-tabs" role="tablist" aria-label="簽核與查閱">{[['approval','簽核清單',pending.length],['read','查閱清單',myRequests.filter(r=>r.status==='待查閱').length]].map(([key,label,count])=><button type="button" role="tab" aria-label={label} aria-selected={reviewTab===key} key={key} onClick={()=>{setReviewTab(key);clearFilters();}}><strong>{label}</strong><span>{count}</span></button>)}</div>{listFilters}</div>}{page!=='review'&&<div className="rq-panel-head"><div>{page!=='review'&&<h2>{page==='history'?'已結案清單':myTab==='borrows'?'借用清單':'案件清單'}</h2>}</div>{!tabbedList&&listFilters}</div>}{page==='requests'&&canCreateFormalRequest(signedAccount)&&myTab==='borrows'?renderBorrowTable(visibleBorrows):renderTable(page==='review'&&reviewTab==='approval'?visibleRequests.filter(r=>r.status==='待主管簽核'&&canOpenReview):visibleRequests)}</section>}
  {page === 'notifications' && <section className="rq-panel rq-notifications" aria-label="通知清單"><div className="rq-notice"><span className="rq-notice-dot"/><div><b>{pending.length} 張委託單等待主管簽核</b><p>請留意委託單狀態，主管簽核後將更新處理進度。</p></div></div><div className="rq-notice"><span className="rq-notice-dot"/><div><b>二階段流程說明</b><p>第一階段：委託者送單 → 主管簽核。第二階段：核准案件交由實驗室受理、安排排程並回報結果。</p></div></div></section>}
  {page==='borrow'&&canCreateFormalRequest(signedAccount)&&<button type="button" className="rq-btn rq-btn-primary" onClick={openBorrow}>＋申請借用</button>}
  {borrowOpen&&<RequestFormDialog label="申請借用" dark={dark} onClose={()=>setBorrowOpen(false)}><header className="rq-form-header"><div><p className="rq-eyebrow">EQUIPMENT & MATERIAL BORROWING REQUEST</p><div className="help-title-row"><h2><LmsSidebarIcon name="borrow"/>申請借用</h2><HelpTip>填寫設備或物料借用需求與預計歸還日期，送出後會建立借用申請紀錄。</HelpTip></div></div><button type="button" className="rq-close" aria-label="關閉借用申請" onClick={()=>setBorrowOpen(false)}>×</button></header><div className="rq-form-body rq-form-body-reference"><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">1</span><div><b>申請人資料</b><small>Applicant Information</small></div></div><div className="rq-entry-grid"><label>申請人姓名 <em>*</em><input className="rq-input" value={borrowForm.requester} onChange={e=>setBorrowForm({...borrowForm,requester:e.target.value})} placeholder="請輸入申請人姓名"/></label><label>申請部門 <em>*</em><input className="rq-input" value={borrowForm.department} onChange={e=>setBorrowForm({...borrowForm,department:e.target.value})} placeholder="例如：RD、PM、DQA"/></label></div></section><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">2</span><div><b>借用項目與用途</b><small>Borrowed Item & Purpose</small></div></div><div className="rq-entry-grid"><BorrowResourceFields form={borrowForm} onChange={value=>{setBorrowForm(value);setBorrowError('');}} snapshot={borrowSnapshot}/><label className="rq-entry-grid-one">借用用途 <em>*</em><textarea className="rq-input rq-textarea" value={borrowForm.purpose} onChange={e=>setBorrowForm({...borrowForm,purpose:e.target.value})} placeholder="請說明借用原因、用途或對應試驗案件"/></label></div></section><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">3</span><div><b>借用期間與備註</b><small>Borrowing Period & Notes</small></div></div><div className="rq-entry-grid"><label>預計借用日期 <em>*</em><input className="rq-input" type="date" value={borrowForm.borrowDate} onChange={e=>setBorrowForm({...borrowForm,borrowDate:e.target.value})}/></label><label>預計歸還日期 <em>*</em><input className="rq-input" type="date" min={borrowForm.borrowDate || undefined} value={borrowForm.returnDate} onChange={e=>setBorrowForm({...borrowForm,returnDate:e.target.value})}/></label><label className="rq-entry-grid-one">備註<textarea className="rq-input rq-textarea" value={borrowForm.notes} onChange={e=>setBorrowForm({...borrowForm,notes:e.target.value})} placeholder="配件、治具、設備狀況或其他注意事項（選填）"/></label></div></section><div className="rq-process-note"><b>申請流程</b><p>填寫借用申請 → LMS 待核准 → 一階主管核准／退回。</p></div>{borrowError&&<p role="alert" className="rq-field-error">{borrowError}</p>}</div><footer className="rq-form-footer"><button type="button" className="rq-btn rq-btn-light" onClick={()=>setBorrowForm({ requester: '', department: '', resourceType:'equipment',materialId:'',material:'',equipment: '', equipmentId:'', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' })}>清除表單</button><button type="button" className="rq-btn rq-btn-primary" onClick={()=>{ if(!borrowForm.requester.trim()||!borrowForm.department.trim()||!(borrowForm.resourceType==='material'?borrowForm.materialId:borrowForm.equipment)||!borrowForm.purpose.trim()||!borrowForm.borrowDate||!borrowForm.returnDate||Number(borrowForm.quantity)<1){setBorrowError('請完成所有必填欄位，並確認借用與歸還日期。');notify('請完成所有必填欄位，並確認借用與歸還日期。');return;} if(borrowForm.returnDate<borrowForm.borrowDate){setBorrowError('歸還日期不可早於借用日期。');notify('歸還日期不可早於借用日期。');return;} let id;try{const created=submitBorrowRequest(borrowForm,signedAccount?.id);id=created.id;refreshLabSnapshot();}catch(error){setBorrowError(error.message);notify(error.message);return;} setBorrowError('');setBorrowForm({ requester: '', department: '', resourceType:'equipment',materialId:'',material:'',equipment: '', equipmentId:'', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' }); setBorrowOpen(false);setPage('requests');setMyTab('borrows');setSearch('');notify(`借用申請 ${id} 已建立`); }}>送出借用申請 →</button></footer></RequestFormDialog>}
  {page==='detail'&&!selected&&<div role="alert" className="rq-panel rq-empty">案件不存在或你沒有存取權限。</div>}
  {page === 'detail' && selected && <section className="rq-panel rq-case-detail"><div className="rq-panel-head"><div><div className="help-title-row"><h2>{selected.id}　<span className={`rq-status ${requestStatusClass(selected.status)}`}>{selected.status === '待主管簽核' ? '待簽核' : selected.status === '已核准' ? '待審查' : selected.status}</span></h2><ExecutionKindBadge request={selected}/><HelpTip>委託內容、試驗需求及簽核紀錄</HelpTip></div></div><div className="rq-case-header-actions">{canOpenReview && selected.status==='待主管簽核'&&(!originalBusinessEnabled()||canAccessSupervisorRequest(selected)) && <button type="button" className="rq-btn rq-btn-light" onClick={fillDemoApproval}>DEMO 填寫</button>}<button className="rq-btn rq-btn-light" onClick={()=>setPage(canOpenReview?'review':'requests')}>← 返回清單</button></div></div>{selected.status==='已完成'&&<p className="rq-stage-note">試驗已完成；報告仍待處理，不代表已審核、已查閱或已結案。</p>}<ReportCasePanel request={selected} account={signedAccount}/>{selected.execution&&<section className="rq-detail-section"><h3>試驗執行資訊</h3><div className="rq-detail-grid">{[['設備',selected.execution.equipment],['執行人',selected.execution.operator],['樣品編號',selected.execution.sampleCode],['開始時間',displayTaipei(selected.execution.startedAt)],['完成時間',displayTaipei(selected.execution.completedAt)]].map(([label,value])=><div key={label}><label>{label}</label><p>{value||'—'}</p></div>)}</div></section>}<div className="rq-detail-grid">{[['建立時間',displayTaipei(selected.createdAt)],['最後更新（台灣時間）',displayTaipei(selected.updatedAt)],['產品代碼',selected.productCode||selected.product],['產品類型',selected.productType],['客戶名稱',selected.customer||selected.project],['客戶品番',selected.customerPartNo],['需求日期',displayTaipei(selected.dueDate,{dateOnly:true})],['測試數量',selected.quantity],['委託類型',selected.priority==='專案關鍵'?'專案':selected.priority],...(selected.projectCode?[['關聯專案',selected.projectCode],['專案分項',selected.projectItemIndex],['專案名稱',selected.project]]:[]),['委託者',selected.requester],['委託部門',selected.department],['試驗目的',(selected.purpose||[]).join('、')+(selected.purposeOther?`：${selected.purposeOther}`:'')],['樣品來源',(selected.sampleSource||[]).join('、')+(selected.sampleSourceOther?`：${selected.sampleSourceOther}`:'')],['製品版次',selected.productVersion],['PCBA版次',selected.pcbaVersion],['軟體版次',selected.softwareVersion],['製造日期',displayTaipei(selected.manufactureDate,{dateOnly:true})],['試驗項目',(selected.testItems||[]).join('、')],['試驗規範／試驗手法',selected.specification],['判定方式',selected.judgementRequired],['判定說明',selected.judgementCriteria],['其他說明',selected.sampleDescription],['備註',selected.notes]].map(([k,v])=><div key={k}><label>{k}</label><p>{v||'—'}</p></div>)}</div>{canOpenReview && selected.status==='待主管簽核'&&(!originalBusinessEnabled()||canAccessSupervisorRequest(selected))&&canApproveRequestManager(signedAccount,selected) && <div className="rq-approval"><h3>主管簽核（二階流程：第一階段）</h3><p className="rq-muted">核准時需簽名；退件只需填寫原因，可不簽名。</p><ApprovalSignature accountId={signedAccount?.id} key={`${selected.id}-${approvalInputVersion}`} mode={approvalMode} onModeChange={setApprovalMode} value={approvalSignature} onChange={setApprovalSignature} onError={notify} /><label className="rq-label">簽核意見（退件時請填寫原因）</label><textarea className="rq-input rq-textarea" value={approvalNote} onChange={e=>setApprovalNote(e.target.value)} placeholder="請輸入核准說明或退件補正事項…"/><div className="rq-actions"><button className="rq-btn rq-btn-danger" disabled={workflow.locked} onClick={()=>review(selected.id,'退件')}>退回補正</button><button className="rq-btn rq-btn-primary" disabled={workflow.locked} onClick={()=>review(selected.id,'已核准')}>✓ 核准委託單</button></div></div>}{canCreateFormalRequest(signedAccount) && ['退件','補件中'].includes(selected.status) && <div className="rq-review-callout"><div><b>主管意見</b><p>{selected.approvalNote || '請補充委託資訊。'}</p></div><button className="rq-btn rq-btn-primary" onClick={()=>beginEdit(selected)}>編輯並重新送出</button></div>}<RequestSignatures request={requests.find(r => r.id === selected.id) || selected} /><LmsReviewSignatures request={requests.find(r => r.id === selected.id) || selected} /><SignatureHistory request={requests.find(r=>r.id===selected.id)||selected}/><RequestProgress status={(requests.find(r => r.id === selected.id) || selected).status} /></section>}
  {formOpen && page==='new' && canCreateFormalRequest(signedAccount) && <RequestEditorPage busy={workflow.locked||projectSaving} auxiliaryActions={<div className="rq-editor-aux-actions"><button type="button" className="rq-close" onClick={()=>go('/request/requests')} aria-label="關閉">×</button></div>} onSaveDraft={()=>submitRequest(true)} onReset={resetEditor} form={form} signature={requestSignature} source={requests.find(row=>row.id===editingDraftId)} dirty={dirty} errors={formErrors} onClose={()=>go('/request/requests')}><header className="rq-form-header"><div><p className="rq-eyebrow">ELECTRONIC TEST REQUEST</p><div className="help-title-row"><h2><LmsSidebarIcon name="new"/>{editingDraftId ? '編輯委託單草稿' : '新增試驗委託單'}</h2><HelpTip>可先儲存部分資訊，之後再從「我的委託/借用」繼續編輯並送出簽核。</HelpTip></div></div></header><div className="rq-form-body rq-form-body-reference"><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">1</span><div><b>委託基本資料</b><small>Request Information</small></div></div><div className="rq-entry-grid">
<label>產品代碼（送簽必填）<input className="rq-input" data-field="productCode" aria-invalid={Boolean(formErrors.productCode)} value={form.productCode} onChange={e=>setForm({...form,productCode:e.target.value,product:form.product||e.target.value})} placeholder="例如：VCU-2026-A01"/></label>
<label>產品類型<input className="rq-input" value={form.productType} onChange={e=>setForm({...form,productType:e.target.value})} placeholder="例如：車用電子控制器"/></label>
<label>客戶名稱（送簽必填）<input className="rq-input" data-field="customer" aria-invalid={Boolean(formErrors.customer)} value={form.customer} onChange={e=>setForm({...form,customer:e.target.value,project:form.project||e.target.value})} placeholder="請輸入客戶名稱"/></label>
<label>客戶品番<input className="rq-input" value={form.customerPartNo} onChange={e=>setForm({...form,customerPartNo:e.target.value})} placeholder="客戶產品料號"/></label>
<label>需求日期<input className="rq-input" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label>
{!isProjectEntry(form)&&<label>測試數量（送簽必填）<input className="rq-input" type="number" min="1" data-field="quantity" aria-invalid={Boolean(formErrors.quantity)} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>}
<label>委託部門<input className="rq-input" value={signedAccount?.department || ''} readOnly placeholder="請至帳號管理設定部門"/><small>由登入帳號自動帶入</small></label>
<label>委託者姓名<input className="rq-input" value={signedAccount?.name || ''} readOnly/><small>由登入帳號自動帶入</small></label>
<label>委託類型<select className="rq-input" aria-label="委託類型" disabled={Boolean(form.projectGroupId)} value={form.priority==='專案關鍵'?'專案':form.priority} onChange={e=>{if(isProjectEntry(form)&&form.projectItems.length>1&&e.target.value!=='專案'&&!window.confirm('切換為單項委託後，專案分項不會送出。確定切換？'))return;setForm({...form,priority:e.target.value});}}><option>一般</option><option>急件</option>{(!editingDraftId&&originalBusinessEnabled()||form.priority==='專案'||form.priority==='專案關鍵')&&<option>專案</option>}</select>{form.projectCode&&<small>{form.projectCode} · 第{form.projectItemIndex}項</small>}</label>
</div></section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">1.2</span><div><b>試驗目的（送簽必填）</b><small>Test Intention</small></div></div>
  <div className="rq-entry-field">
    <div data-field="purpose" tabIndex={-1} aria-invalid={Boolean(formErrors.purpose)} className="rq-check-grid rq-check-grid-purpose">{['新產品 New Product','設計變更 Design change','量產品 Mass product','手工品 EV','型物品 DV','本型本工程 PV','再現試驗 Reproducibility test','定期抽測 Periodic sampling inspection','其他（請說明）Other'].map(t=><label key={t} className={(form.purpose||[]).includes(t)?'checked':''}><input type="checkbox" checked={(form.purpose||[]).includes(t)} onChange={e=>setForm(current=>({...current,purpose:e.target.checked?[...(current.purpose||[]).filter(x=>x!==t),t]:(current.purpose||[]).filter(x=>x!==t)}))}/>{t}</label>)}</div>
    {(form.purpose||[]).some(t=>t.startsWith('其他'))&&<label className="rq-label" htmlFor="rq-purpose-other">其他試驗目的說明（必填）<em>*</em><input id="rq-purpose-other" className="rq-input" required aria-required="true" value={form.purposeOther||''} onChange={e=>setForm({...form,purposeOther:e.target.value})} placeholder="請說明其他試驗目的（必填）"/></label>}
  </div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">2</span><div><b>試驗項目與試驗規範</b><small>Test Items & Specifications</small></div></div>
  {isProjectEntry(form)?<ProjectTrialsEditor form={form} onChange={setForm} catalog={testOptions} error={formErrors.projectItems}/>:<>
  <div className="rq-test-edit-wrap"><table className="rq-test-edit-table"><thead><tr><th>試驗項目</th><th>試驗規範／試驗手法</th></tr></thead><tbody><tr><td>  <div className="rq-entry-field"><label className="rq-label">試驗項目（單選／送簽必填）</label><button type="button" data-field="testItems" aria-invalid={Boolean(formErrors.testItems)} className="rq-test-picker-trigger" onClick={()=>{setTestSearch('');setTestCandidate(form.testItems[0]||'');setTestPickerOpen(true);}}><span>{form.testItems.length ? `已選擇：${form.testItems.join('、')}` : '請搜尋並選擇試驗項目'}</span><b>⌕　搜尋試驗名稱</b></button></div>
</td><td>  <div className="rq-entry-grid rq-entry-grid-one"><label htmlFor="rq-specification"><span className="rq-field-heading">試驗規範／試驗手法（送簽必填，可修改參考內容）<HelpTip>已依所選試驗項目帶入參考內容。此版本為前端示範目錄，正式使用時需串接 LMS 核准規範資料庫。</HelpTip></span><textarea id="rq-specification" className="rq-input rq-textarea" data-field="specification" aria-invalid={Boolean(formErrors.specification)} value={form.specification} onChange={e=>setForm({...form,specification:e.target.value})} placeholder="選取試驗項目後自動帶入參考規範；請依核准版本確認並可直接修改…"/></label></div></td></tr></tbody></table></div>
</>}
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">3</span><div><b>樣品來源與樣品資訊</b><small>Sample Source & Information</small></div></div>
  <div className="rq-entry-field"><label className="rq-label">樣品來源</label><div className="rq-check-grid">{['社內 In-house production','海外廠 Overseas factory','客戶 Customer','廠商 Supplier','競品 Competing products'].map(t=><label key={t} className={(form.sampleSource||[]).includes(t)?'checked':''}><input type="checkbox" checked={(form.sampleSource||[]).includes(t)} onChange={e=>setForm({...form,sampleSource:e.target.checked?[...(form.sampleSource||[]),t]:(form.sampleSource||[]).filter(x=>x!==t)})}/>{t}</label>)}</div><input className="rq-input" value={form.sampleSourceOther||''} onChange={e=>setForm({...form,sampleSourceOther:e.target.value})} placeholder="來源補充說明（廠別、供應商或其他）"/></div>
  <div className="rq-entry-grid"><label>製品版次 Product Version<input className="rq-input" value={form.productVersion} onChange={e=>setForm({...form,productVersion:e.target.value})} placeholder="例如：V1.2"/></label><label>PCBA 版次 PCBA Version<input className="rq-input" value={form.pcbaVersion} onChange={e=>setForm({...form,pcbaVersion:e.target.value})} placeholder="例如：PCB-A03"/></label><label>軟體版次 Software Version<input className="rq-input" value={form.softwareVersion} onChange={e=>setForm({...form,softwareVersion:e.target.value})} placeholder="軟體版本"/></label><label>製造日期 Date of Manufacture<input className="rq-input" type="date" value={form.manufactureDate} onChange={e=>setForm({...form,manufactureDate:e.target.value})}/></label></div>
  <div className="rq-entry-grid rq-entry-grid-one"><label>其他說明（非必填）<textarea className="rq-input rq-textarea" value={form.sampleDescription} onChange={e=>setForm({...form,sampleDescription:e.target.value})} placeholder="樣品尺寸、序號、版本差異、附件或其他注意事項"/></label></div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">4</span><div><b>判定基準與備註</b><small>Acceptance Criteria & Notes</small></div></div>
  {!isProjectEntry(form)&&<>
  <div className="rq-judgement-mode"><label className="rq-label">判定方式</label><div className="rq-radio-row"><label><input type="radio" name="judgementRequired" checked={form.judgementRequired==='需作判定'} onChange={()=>setForm({...form,judgementRequired:'需作判定'})}/> 需作判定</label><label><input type="radio" name="judgementRequired" checked={form.judgementRequired==='不作判定'} onChange={()=>setForm({...form,judgementRequired:'不作判定'})}/> 不作判定</label></div></div>
  <label htmlFor="rq-judgement"><span className="rq-field-heading">判定基準<HelpTip>已依所選試驗項目帶入參考判定基準。此版本為前端示範目錄，正式使用需串接 LMS 核准判定基準資料庫。</HelpTip></span><textarea id="rq-judgement" className="rq-input rq-textarea" value={form.judgementCriteria} onChange={e=>setForm({...form,judgementCriteria:e.target.value})} placeholder="選取試驗項目後自動帶入參考判定基準；請依核准版本確認並可修改…"/></label></>}<div className="rq-entry-grid rq-entry-grid-one"><label>備註 NOTE（非必填）<textarea className="rq-input rq-textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="其他備註"/></label></div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">5</span><div><b>委託者簽名與主管簽核</b><small>Requester Signature & Supervisor Approval</small></div></div>
  <div className="rq-signature-grid">
    <div className="rq-signature-box" data-field="signature" tabIndex={-1} aria-invalid={Boolean(formErrors.signature)}><b>委託者簽名</b><div className="rq-radio-row"><label><input type="radio" name="signatureMode" checked={signatureMode==='draw'} onChange={()=>{setSignatureMode('draw');setRequestSignature('');}} /> 手寫簽名</label><label><input type="radio" name="signatureMode" checked={signatureMode==='upload'} onChange={()=>{setSignatureMode('upload');setRequestSignature('');}} /> 上傳簽名檔</label></div>{signatureMode==='draw' ? <SignaturePad onChange={setRequestSignature} label="手寫簽名" /> : <><label>上傳電子簽名檔<input className="rq-input" type="file" accept="image/png,image/jpeg" onChange={uploadRequestSignature}/></label><DefaultSignatureActions key={signedAccount?.id} accountId={signedAccount?.id} value={requestSignature} onChange={setRequestSignature} />{requestSignature && <img src={requestSignature} alt="上傳的簽名預覽" style={{maxWidth:"100%",maxHeight:110,objectFit:"contain",background:"#fff"}} />}<small>支援 PNG、JPG，檔案不超過 1 MB。</small></>}<label>簽名日期（自動記錄）<input className="rq-input" type="text" readOnly value="尚未送出" /></label><small>送出時自動記錄當天日期（台灣時間），無須填寫。</small></div>
    <div className="rq-signature-box"><b>指定直屬主管</b><label>主管帳號（送簽必填）<select className="rq-input" data-field="supervisorId" aria-invalid={Boolean(formErrors.supervisorId)} value={form.supervisorId || ''} onChange={e=>setForm({...form,supervisorId:e.target.value})}><option value="">請選擇直屬主管</option>{supervisors.filter(a => { if(originalBusinessEnabled())return a.id===signedAccount?.supervisorId; const matches=sharedAccounts.filter(x=>x.status==='啟用中' && x.role==='委託者' && (x.name===user || String(x.email||'').toLowerCase()===user.trim().toLowerCase())); return matches.length===1 && matches[0].supervisorId===a.id; }).map(a=><option key={a.id} value={a.id}>{a.name}{a.email?`（${a.email}）`:'（電子郵件未設定）'}</option>)}</select></label><small>可選擇帳號管理中設定的直屬委託者主管，由該主管登入後簽核。</small></div>
  </div>
  <div className="rq-process-note"><b>簽核流程</b><p>委託者建立並確認 → 主管簽核 → LMS 建立試驗案件 → 排程與試驗執行 → 試驗報告。</p></div>
</section></div><footer className="rq-form-footer">{!editingDraftId&&<button type="button" className="rq-btn rq-btn-light" onClick={()=>go('/request/requests')}>取消</button>}<div>{editingDraftId && <button type="button" className="rq-btn rq-btn-light" onClick={()=>go('/request/requests')}>取消</button>}<button type="button" className="rq-btn rq-btn-primary" disabled={originalBusinessEnabled()&&workflow.locked} onClick={()=>submitRequest(false)}>送出主管簽核 →</button></div></footer></RequestEditorPage>}
  {!originalBusinessEnabled()&&<footer className="rq-footer">電子化委託 · 二階簽核與案件追蹤 · Demo UI v2.0（示範資料）</footer>}<div className={`request-shared-tools lms-enterprise ${dark?'theme-dark':'theme-light'}`}><IntelligentAssistant system="request" snapshot={borrowSnapshot} metrics={requestMetrics} onDemoStart={fillSampleRequest}/></div></main></div>


    {testPickerOpen && <RequestFormDialog label="搜尋試驗項目" dark={dark} onClose={()=>setTestPickerOpen(false)}><div className="rq-test-picker-modal">
      <header className="rq-test-picker-header"><div><p className="rq-eyebrow">TEST CATALOG</p><div className="help-title-row"><h2>選擇試驗項目</h2><HelpTip>請選擇一個試驗項目，右側會顯示參考規格；確認後帶入表單，內容仍可修改。</HelpTip></div></div><button type="button" className="rq-close" onClick={()=>setTestPickerOpen(false)} aria-label="關閉">×</button></header>
      <div className="rq-test-picker-content rq-test-picker-columns"><section className="rq-test-picker-list" aria-label="試驗項目清單">
        <div className="rq-test-search-wrap"><span>⌕</span><MobileSearchInput onClear={()=>setTestSearch('')} autoFocus className="rq-input" value={testSearch} onChange={e=>setTestSearch(e.target.value)} placeholder="搜尋試驗名稱，例如：高溫、振動、IPX6…"/><button type="button" className="rq-btn rq-btn-light mobile-search-legacy-clear" onClick={()=>setTestSearch('')}>清除</button></div>
        {trialCatalog.error&&<p role="alert" className="rq-field-error">{trialCatalog.error}</p>}<div className="rq-test-picker-meta"><span>試驗項目清單（單選）</span><b>共 {testOptions.length} 項</b></div>
        <div className="rq-test-results"><PaginatedList items={testOptions.filter(t=>t.toLowerCase().includes(testSearch.trim().toLowerCase()))} resetKey={testSearch}>{page=>page.map(t=><label key={t} className={testCandidate===t?'selected':''}><input type="radio" name="requestTestItem" aria-label={t} checked={testCandidate===t} onChange={()=>setTestCandidate(t)}/><span><b>{t}</b><small>試驗條件與設備參考</small></span><i>{testCandidate===t?'✓':''}</i></label>)}</PaginatedList>{testOptions.filter(t=>t.toLowerCase().includes(testSearch.trim().toLowerCase())).length===0 && <div className="rq-test-no-results">找不到符合的試驗名稱，請更換關鍵字。</div>}</div>
      </section><aside className="rq-test-reference" aria-label="試驗規格參考" aria-live="polite">{testReference?<>
        <p className="rq-eyebrow">TEST REFERENCE</p><h3>{testReference.name}</h3><small>規範版本：{testReference.version}</small><p className="rq-test-reference-note">合成 Demo 參考；確認選擇後可在委託單中修改。</p>
        <dl><div><dt>適用設備</dt><dd>{testReference.equipment}</dd></div><div><dt>試驗條件</dt><dd>{testReference.conditions}</dd></div><div><dt>試驗工時</dt><dd>{testReference.duration}</dd></div><div><dt>作業日規則</dt><dd>{testReference.calendar}</dd></div></dl>
        <h4>試驗規範／試驗手法</h4><pre>{buildSpecification([testCandidate])}</pre><h4>判定參考</h4><p>{testReference.acceptance}</p>
      </>:<div className="rq-test-reference-empty"><h3>試驗規格參考</h3><p>選取左側試驗項目，即可查看設備、條件、工時與試驗手法。</p></div>}</aside></div>
      <footer className="rq-test-picker-footer"><span>目前選擇：{testCandidate||'尚未選擇'}</span><div><button type="button" className="rq-btn rq-btn-light" onClick={()=>setTestPickerOpen(false)}>取消</button><button type="button" className="rq-btn rq-btn-primary" disabled={!testReference} onClick={()=>{
        if(!testReference)return;
        if(testCandidate!==form.testItems[0]){
          const manual=(form.specification&&form.specification!==buildSpecification(form.testItems))||(form.judgementCriteria&&form.judgementCriteria!==buildAcceptanceCriteria(form.testItems[0]));
          if(manual&&!window.confirm('試驗規範或判定基準已人工修改。切換項目會覆蓋為參考內容，確定取代？'))return;
          setForm({...form,testItems:[testCandidate],specification:buildSpecification([testCandidate]),judgementCriteria:buildAcceptanceCriteria(testCandidate)});
        }else setForm({...form,specification:form.specification||buildSpecification([testCandidate]),judgementCriteria:form.judgementCriteria||buildAcceptanceCriteria(testCandidate)});
        setTestPickerOpen(false);
      }}>確認選擇</button></div></footer>
    </div></RequestFormDialog>}
  {leaveTarget&&<RequestFormDialog label="尚未儲存的變更" dark={dark} onClose={()=>setLeaveTarget(null)}><header className="rq-form-header"><h2>尚未儲存的變更</h2></header><div className="rq-confirm-body"><p>離開後會失去尚未儲存的表單內容與簽名。你可以繼續編輯，或先儲存草稿。</p>{toast&&/失敗|無法|請至少|重新開啟|未設定|不正確/.test(toast)&&<p role="alert" className="rq-field-error">{toast}</p>}<button className="rq-btn" onClick={()=>setLeaveTarget(null)}>繼續編輯</button><button className="rq-btn rq-btn-danger" onClick={()=>{const target=leaveTarget;dirtyRef.current=false;setLeaveTarget(null);setFormOpen(false);if(target==='logout')completeLogout();else finishLeave(target);}}>放棄變更</button><button className="rq-btn rq-btn-primary" onClick={async()=>{if(await submitRequest(true,leaveTarget==='logout'?'/request/login':leaveTarget)){if(leaveTarget==='logout')completeLogout();setLeaveTarget(null);}}}>儲存草稿後離開</button></div></RequestFormDialog>}


  </div>;
}
