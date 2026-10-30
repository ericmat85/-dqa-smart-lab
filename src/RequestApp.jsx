import {matchesRequestSearch,REQUEST_SEARCH_FIELDS} from './requestListFilters.mjs';
import ReportArchive from './ReportArchive.jsx';
import {canOpenReportArchive} from './reportArchive.mjs';
import {ownsRequest,assertEditableRequest,deleteDraft,reviewRequesterDecision} from './requestWorkflow.mjs';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import useReportSnapshot from './useReportSnapshot.js';
import {createCompletedDemoFlow} from './completedDemoFlow.mjs';
import ClearCasesButton from './ClearCasesButton.jsx';
import useLabSnapshot,{refreshLabSnapshot} from './useLabSnapshot.js';
import {submitBorrowRequest} from './borrowApprovals.mjs';
import {INITIAL_ELECTRONIC_REQUESTS as initialRequests} from './demoElectronicRequests.mjs';
import {PaginatedTable,PaginatedList} from './Pagination.jsx';
import RequestInfoModal from './RequestInfoModal.jsx';
import DefaultSignatureActions from './DefaultSignatureActions.jsx';
import { getRequestDate } from './requestDate.mjs';
import ApprovalSignature from './ApprovalSignature.jsx';
import { createDemoApprovalSignature } from './demoApprovalSignature.mjs';
import RequestProgress from './RequestProgress.jsx';
import RequestSignatures, { LmsReviewSignatures } from './RequestSignatures.jsx';
import { appendSignature, getSignatureHistory } from './signatureHistory.mjs';
import useDemoPersistence from './useDemoPersistence.js';
import { readDemoAccounts } from "./demoAccounts.mjs";
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './RequestApp.css';
import SignaturePad from './SignaturePad.jsx';
import {accessSystem} from './demoPermissions.mjs';

const STORAGE_KEY = 'dqa-request-demo-v2';
const testOptions = ['高溫試驗', '低溫試驗', '高溫高濕', '溫度循環', '熱衝擊', '振動試驗', '機械衝擊', 'IPX6 防水', '鹽霧試驗', 'ESD 靜電', 'EMC 電磁相容', '日照試驗', '其他'];
// 示範試驗規範目錄：正式環境應改由 LMS/資料庫 API 取得最新核准版本。
const testSpecificationCatalog = {
  '高溫試驗': '參考規範：依產品驗證計畫／客戶規範；請確認試驗溫度、持續時間、通電狀態與判定條件。',
  '低溫試驗': '參考規範：依產品驗證計畫／客戶規範；請確認試驗溫度、持續時間、通電狀態與判定條件。',
  '高溫高濕': '參考規範：依產品驗證計畫／客戶規範；請確認溫度、相對濕度、試驗時間及試後檢查要求。',
  '溫度循環': '參考規範：依產品驗證計畫／客戶規範；請確認高低溫點、轉換時間、停留時間與循環次數。',
  '熱衝擊': '參考規範：依產品驗證計畫／客戶規範；請確認高低溫條件、轉移時間、停留時間及循環次數。',
  '振動試驗': '參考規範：依產品驗證計畫／客戶規範；請確認頻率範圍、加速度／振幅、軸向、時間與固定方式。',
  '機械衝擊': '參考規範：依產品驗證計畫／客戶規範；請確認衝擊波形、峰值加速度、脈衝時間、方向與次數。',
  'IPX6 防水': '參考規範：依產品驗證計畫／客戶規範；請確認噴嘴、流量、距離、試驗時間及試後判定要求。',
  '鹽霧試驗': '參考規範：依產品驗證計畫／客戶規範；請確認試驗液、溫度、時間、pH 與試後評價方式。',
  'ESD 靜電': '參考規範：依產品驗證計畫／客戶規範；請確認接觸／空氣放電、測試點、電壓等級、次數與運作狀態。',
  'EMC 電磁相容': '參考規範：依產品驗證計畫／客戶規範；請確認適用標準、頻率範圍、等級、佈置及性能判定準則。',
  '日照試驗': '參考規範：依產品驗證計畫／客戶規範；請確認光源、輻照度、溫濕度、照射時間與試後檢查。',
  '其他': '請填入核准的試驗規範編號、版本、試驗條件、時間、方法與判定要求。'
};
function buildSpecification(items) { return (items || []).map(name => `${name}：${testSpecificationCatalog[name] || '請依核准試驗規範填寫條件與判定要求。'}`).join('\n\n'); }
// 示範判定基準目錄：正式環境應由 LMS 核准的試驗項目資料庫/API 取得。
const testAcceptanceCriteriaCatalog = {
  '高溫試驗': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫，無異常損壞。',
  '低溫試驗': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫，無異常損壞。',
  '高溫高濕': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫；無凝露造成的異常、腐蝕或功能失效。',
  '溫度循環': '參考判定基準：完成規定循環後，產品外觀、功能及電氣特性符合核准規格，無裂痕、鬆脫或功能異常。',
  '熱衝擊': '參考判定基準：完成規定熱衝擊循環後，產品無可見損傷，功能及電氣特性符合核准規格。',
  '振動試驗': '參考判定基準：試驗後產品結構無破損或鬆脫，連接器及固定件正常，功能與電氣特性符合核准規格。',
  '機械衝擊': '參考判定基準：試驗後產品無破裂、脫落或結構損傷，功能與電氣特性符合核准規格。',
  'IPX6 防水': '參考判定基準：試驗後產品內部無不允許之進水，功能與電氣特性符合核准規格及客戶要求。',
  '鹽霧試驗': '參考判定基準：試驗後腐蝕程度及外觀符合核准規格，產品功能與電氣特性符合要求。',
  'ESD 靜電': '參考判定基準：依核准性能判定準則，試驗中及試驗後產品功能符合指定性能等級，無不可恢復故障或資料遺失。',
  'EMC 電磁相容': '參考判定基準：依核准 EMC 規範，發射與抗擾度結果符合限值及性能判定準則。',
  '日照試驗': '參考判定基準：試驗後產品外觀、顏色、材料及功能變化符合核准規格，無不可接受之劣化。',
  '其他': '請依核准試驗計畫或客戶規範輸入明確的允收條件、量測項目及判定方法。'
};
function buildAcceptanceCriteria(item) { return testAcceptanceCriteriaCatalog[item] || ''; }

const emptyForm = {
  product: '', productCode: '', productType: '', project: '', customer: '', customerPartNo: '',
  department: '', requester: '', priority: '一般', dueDate: '', quantity: '1',
  testItems: [], purpose: [], purposeOther: '', sampleSource: [], sampleSourceOther: '',
  productVersion: '', pcbaVersion: '', softwareVersion: '', manufactureDate: '',
  sampleDescription: '', specification: '', judgementRequired: '需作判定',
  judgementCriteria: '', notes: ''
};
function readRequests() { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(v) ? v : initialRequests; } catch { return initialRequests; } }
function getPath() { return window.location.pathname.replace(/\/+$/, '') || '/'; }

export default function RequestApp() {
  const [path, setPath] = useState(getPath());
  const [signingDate, setSigningDate] = useState(getRequestDate);
  const {dark,toggleTheme}=useSystemTheme();
  const toggleTestItem = (item, checked) => {
    setForm(current => {
      const nextItems = checked ? [item] : [];
      return { ...current, testItems: nextItems, specification: checked ? buildSpecification([item]) : '', judgementCriteria: checked ? buildAcceptanceCriteria(item) : '' };
    });
  };
  const [role, setRole] = useState(() => sessionStorage.getItem('dqa-request-role') || 'requester');
  const [user, setUser] = useState(() => sessionStorage.getItem('dqa-request-user') || (sessionStorage.getItem('dqa-request-role') === 'supervisor' ? 'supervisor@example.com' : 'requester@example.com'));
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [accountId, setAccountId] = useState(() => sessionStorage.getItem('dqa-request-account-id') || '');
  const [requests, setRequests] = useState(readRequests);

  const [sharedAccounts, setSharedAccounts] = useState(readDemoAccounts);
  useEffect(() => {
    const refresh=()=>setSharedAccounts(readDemoAccounts());
    window.addEventListener('focus',refresh); window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);};
  }, []);
  const supervisors=sharedAccounts.filter(a=>a.role==='委託者主管' && a.status==='啟用中');
  const canAccessSupervisorRequest = r => sharedAccounts.some(a=>a.id===accountId&&a.role==='委託者主管'&&accessSystem(a,'request')&&r.supervisorId===a.id);
  const uploadRequestSignature = event => {
    const file=event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 1024*1024) { event.target.value=''; notify('請選擇 1 MB 以內的 PNG 或 JPG 圖片。'); return; }
    const reader=new FileReader(); reader.onload=()=>setRequestSignature(String(reader.result)); reader.onerror=()=>notify('簽名圖片無法讀取，請重新選擇。'); reader.readAsDataURL(file);
  };

  const demoFlowAttempt=useRef('');
  const [page, setPage] = useState('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const editingSnapshot=useRef(null);
  const [search, setSearch] = useState('');
  const [reviewTab, setReviewTab] = useState('approval');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('全部狀態');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const refresh = () => { const latest = readRequests(); setRequests(latest); setSelected(current => current ? latest.find(r => r.id === current.id) || current : null); };
    const storage = event => { if (event.key === STORAGE_KEY) refresh(); };
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',storage);
    window.addEventListener('dqa:review-updated',refresh);
    return () => { window.removeEventListener('focus',refresh); window.removeEventListener('storage',storage); window.removeEventListener('dqa:review-updated',refresh); };
  }, []);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [requestSignature, setRequestSignature] = useState('');
  const [signatureMode, setSignatureMode] = useState('draw');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [approvalMode, setApprovalMode] = useState('draw');
  const [approvalInputVersion, setApprovalInputVersion] = useState(0);
  const [borrowForm, setBorrowForm] = useState({ requester: '', department: '', equipment: '', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' });
  useReportSnapshot();
  const borrowSnapshot=useLabSnapshot();
  const borrowRequests=borrowSnapshot.borrows;

  useEffect(() => {
    const fn = () => setPath(getPath());
    window.addEventListener('popstate', fn);
    return () => { window.removeEventListener('popstate', fn); };
  }, []);
  const requestStorage = useDemoPersistence(STORAGE_KEY, requests);
  const go = (next) => {
    window.history.pushState({}, '', next);
    setPath(getPath());
    window.dispatchEvent(new Event('dqa:navigate'));
  };
  const signedAccount = sharedAccounts.find(a => a.id === accountId && accessSystem(a, 'request'));
  useEffect(() => {
    if (!formOpen || !signedAccount) return;
    setForm(current => ({ ...current, requester: signedAccount.name || '', department: signedAccount.department || '' }));
  }, [formOpen, signedAccount]);
  const isLoggedIn = Boolean(signedAccount) && path !== '/request/login' && path !== '/request' && path !== '/';
  useEffect(()=>{
    if(!isLoggedIn||!signedAccount||demoFlowAttempt.current===signedAccount.id)return;
    demoFlowAttempt.current=signedAccount.id;
    try{
      const result=createCompletedDemoFlow({viewerId:signedAccount.id,signature:createDemoApprovalSignature('DEMO 流程測試（非本人簽署）')});
      if(result.created){
        refreshLabSnapshot();window.dispatchEvent(new Event('dqa:review-updated'));
        const completed=readRequests().find(row=>row.id===result.id);
        // Present the explicitly requested one-time workflow fixture from persisted browser data.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelected(completed);setViewModalOpen(true);setPage('requests');setSearch('DEMO-E2E-001');
      }
    }catch(error){setToast(error.message||'完整流程範例建立失敗，請確認角色與設備狀態。');}
  },[isLoggedIn,signedAccount]);
  const visibleRequests = requests.filter(r => ((role === 'supervisor' && canAccessSupervisorRequest(r)) || (role !== 'supervisor' && ownsRequest(signedAccount,r))) && (page==='history'?r.status==='已結案':page==='review'&&reviewTab==='read'?r.status==='待查閱':!['已結案','待查閱'].includes(r.status)) && (statusFilter === '全部狀態' || r.status === statusFilter) && matchesRequestSearch(r, search, page==='history'?searchField:'all'));
  const notify = (s) => { setToast(s); window.setTimeout(() => setToast(''), 2600); };
  const login = () => { const normalized=user.trim().toLowerCase(); const candidates=sharedAccounts.filter(a=>accessSystem(a,'request') && (String(a.email||'').toLowerCase()===normalized || a.name===user.trim())); const a=candidates.length===1?candidates[0]:null; if (!a || password!=='demo1234' || (role==='supervisor' ? a.role!=='委託者主管' : a.role!=='委託者')) { setLoginError('帳號、角色或密碼不正確；請使用啟用中的共用帳號。'); return; } setLoginError(''); setUser(a.name); setAccountId(a.id); sessionStorage.setItem('dqa-request-account-id',a.id); sessionStorage.setItem('dqa-request-role',role); sessionStorage.setItem('dqa-request-user',a.name); go('/request/dashboard'); setPage('overview'); };
  const logout = () => { setUser(role === 'supervisor' ? 'supervisor@example.com' : 'requester@example.com'); setPassword('demo1234'); sessionStorage.removeItem('dqa-request-account-id'); setAccountId(''); sessionStorage.removeItem('dqa-request-role'); sessionStorage.removeItem('dqa-request-user'); go('/request/login'); };
  const openForm = () => {
    setSigningDate(getRequestDate());
    setForm({ ...emptyForm, requester: signedAccount?.name || '', department: signedAccount?.department || '' });
    setRequestSignature('');
    setSignatureMode('draw');
    setEditingDraftId(null);
    setFormOpen(true);
    setSelected(null);
    setPage('new');
  };
  const fillSampleRequest = () => {
    if (!window.confirm('隨機填入會覆蓋目前表單內容與簽名，確定繼續？')) return;
    const pick = items => items[Math.floor(Math.random() * items.length)];
    const product = pick([{code:'DL8', type:'車用儀表', customer:'YMT', part:'DL8-H3500-00'}, {code:'VCU-A01', type:'車用控制器', customer:'客戶 A', part:'VCU-A01-001'}, {code:'MTR-B02', type:'LCD 儀表', customer:'客戶 B', part:'MTR-B02-001'}]);
    const item = pick(['高溫試驗', '高溫高濕', '溫度循環', '振動試驗', 'IPX6 防水']);
    const dateString = date => { const year=date.getFullYear(), month=String(date.getMonth()+1).padStart(2,'0'), day=String(date.getDate()).padStart(2,'0'); return `${year}-${month}-${day}`; };
    const today = new Date();
    const due = new Date(today); due.setDate(due.getDate()+14+Math.floor(Math.random()*14));
    const supervisor = supervisors.find(a => a.id === signedAccount?.supervisorId);
    const canvas = document.createElement('canvas'); canvas.width=600; canvas.height=120;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#17365e'; ctx.font='32px sans-serif'; ctx.fillText('測試簽名（僅供流程測試）',20,70);
    setSignatureMode('upload');
    setRequestSignature(canvas.toDataURL('image/png'));
    setForm({ ...emptyForm, product:product.code, productCode:product.code, productType:product.type, customer:product.customer, project:product.customer, customerPartNo:product.part,
      dueDate:dateString(due), quantity:String(pick([2,3,5])), department:signedAccount?.department || '', requester:signedAccount?.name || '',
      priority:pick(['一般','急件','專案關鍵']), purpose:[pick(['新產品 New Product','設計變更 Design change','量產品 Mass product'])],
      sampleSource:['社內 In-house production'], sampleSourceOther:'測試樣品', productVersion:'V1.0', pcbaVersion:'PCB-A01', softwareVersion:'V1.0', manufactureDate:dateString(today),
      sampleDescription:'測試資料，樣品編號 SAMPLE-001。', testItems:[item], specification:buildSpecification([item]), judgementRequired:'需作判定', judgementCriteria:buildAcceptanceCriteria(item), notes:'測試資料，請依實際需求修改。', requestDate:dateString(today), supervisorId:supervisor?.id || '' });
    notify(supervisor ? '已填入測試資料及測試簽名，請確認後送出。' : '已填入測試資料；請先在帳號管理設定啟用中的直屬主管。');
  };
  const hasAnyFormData = (value) => Object.entries(value).some(([key, val]) => {
    if (['priority', 'requester', 'department'].includes(key)) return false;
    if (key === 'quantity') return String(val ?? '') !== '1' && String(val ?? '').trim() !== '';
    if (Array.isArray(val)) return val.length > 0;
    return String(val ?? '').trim() !== '';
  });
  const submitRequest = (asDraft) => {
    if(signedAccount?.role!=='委託者'){notify('僅委託者可建立或編輯委託單。');return;}
    if(editingDraftId){
      try { const latest=readRequests().find(row=>row.id===editingDraftId);assertEditableRequest(signedAccount,latest);if(editingSnapshot.current!==JSON.stringify(latest))throw Error('草稿已在其他頁面更新，請重新開啟後編輯。'); }
      catch(error){notify(error.message);return;}
    }
    if(!asDraft&&(!Number.isSafeInteger(Number(form.quantity))||Number(form.quantity)<1)){notify('測試數量須為正整數。');return;}

    if (!asDraft && (form.purpose || []).some(t => t.startsWith('其他')) && !String(form.purposeOther || '').trim()) { notify('選擇其他試驗目的時，請填寫說明。'); document.getElementById('rq-purpose-other')?.focus(); return; }
    if (!signedAccount?.name?.trim() || !signedAccount?.department?.trim()) { notify('帳號姓名或部門未設定，請至 LMS 帳號管理補齊。'); return; }
    if (asDraft && !hasAnyFormData(form)) {
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
      setRequests(prev => prev.map(r => r.id === editingDraftId
        ? { ...r, ...form, requester: signedAccount.name, department: signedAccount.department, status: '草稿', lmsReview: null, updatedAt: now, ownerUser: r.ownerUser || user }
        : r));
      setFormOpen(false);
      setPage('requests');
      setEditingDraftId(null);
      notify(`草稿 ${editingDraftId} 已更新`);
      return;
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
    setRequests(prev => original ? prev.map(r => r.id === id ? item : r) : [item, ...prev]);
    setFormOpen(false);
    setPage('requests');
    setEditingDraftId(null);
    notify(asDraft ? `已儲存草稿 ${id}，可在「我的委託單」中繼續編輯` : `委託單 ${id} 已送出，等待主管簽核`);
  };
  const askDeleteDraft = (draft) => {
    if (!draft || draft.status !== '草稿') return;
    setDeleteTarget({ id: draft.id, source: 'list' });
  };
  const confirmDeleteDraft = () => {
    if (!deleteTarget?.id) return;
    const id = deleteTarget.id;
    try { const updated=deleteDraft(readRequests(),id,signedAccount);setRequests(updated); }
    catch(error){notify(error.message);return;}
    if (editingDraftId === id) {
      setFormOpen(false);
      setEditingDraftId(null);
      setForm(emptyForm);
    }
    if (selected?.id === id) {
      setSelected(null);
      setViewModalOpen(false);
    }
    setDeleteTarget(null);
    setPage('requests');
    notify(`草稿 ${id} 已刪除`);
  };
  const fillDemoApproval = () => {
    if ((approvalSignature || approvalNote.trim()) && !window.confirm('DEMO 填寫會覆蓋目前的主管簽名與簽核意見，確定繼續？')) return;
    setApprovalInputVersion(version => version + 1);
    setApprovalMode('upload');
    setApprovalSignature(createDemoApprovalSignature());
    setApprovalNote('DEMO 測試：已確認委託內容與試驗需求，僅供簽核流程展示。');
    notify('已填入測試簽名與簽核意見，請確認後選擇核准或退回。');
  };
  const review = (id, status) => {
    try {
      const latest=readRequests(),target=latest.find(row=>row.id===id);
      const displayed=requests.find(row=>row.id===id);
      if(JSON.stringify(target)!==JSON.stringify(displayed))throw Error('案件已更新，請重新開啟後簽核。');
      const next=reviewRequesterDecision(target,signedAccount,{status,signature:approvalSignature,comment:approvalNote});
      setRequests(latest.map(row=>row.id===id?next:row));
      setSelected(null);setApprovalNote('');setApprovalSignature('');setPage('review');
      notify(status==='已核准'?'簽核完成，委託單已進入 LMS 待審查':'已退回委託單，委託者可依意見修正');
    }catch(error){notify(error.message);}
  };
  if (!isLoggedIn) return <div className={`rq-app rq-login-shell ${dark ? "rq-theme-dark" : "rq-theme-light"}`}><header className="rq-login-header"><CompanyBrandLogo dark={dark}/><button type="button" className="rq-login-mode" onClick={toggleTheme}><span>{dark ? "☾" : "☼"}</span> {dark ? "深色模式" : "淺色模式"} <span className={`rq-toggle-dot ${dark ? "is-dark" : ""}`}></span></button></header><main className="rq-login-wrap"><section className="rq-login-card"><div className="rq-login-icon">CL</div><p className="rq-eyebrow">DQA LAB SYSTEM</p><h1>電子委託單系統</h1><p className="rq-muted">電子化委託流程，提升效率，加速試驗進度</p><div className="rq-role-choice"><button type="button" className={role === 'requester' ? 'selected' : ''} onClick={() => { setRole('requester'); setUser('requester@example.com'); setPassword('demo1234'); setLoginError(''); }}><span>＋</span><b>委託者登入</b><small>建立委託單、追蹤案件、補件</small></button><button type="button" className={role === 'supervisor' ? 'selected' : ''} onClick={() => { setRole('supervisor'); setUser('supervisor@example.com'); setPassword('demo1234'); setLoginError(''); }}><span>✓</span><b>主管登入</b><small>審查委託單、核准或退件</small></button></div><label className="rq-label">登入名稱</label><input className="rq-input" value={user} onChange={e => setUser(e.target.value)} placeholder="請輸入您的帳號"/><label className="rq-label">密碼</label><div style={{position:"relative"}}><input className="rq-input" type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="請輸入您的密碼" style={{paddingRight:68}}/><button type="button" aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",border:0,background:"transparent",color:"#526e90",padding:"6px 8px",cursor:"pointer"}}>{showPassword ? "隱藏" : "顯示"}</button></div>{loginError && <p role="alert" style={{color:"#b42318"}}>{loginError}</p>}<button type="button" className="rq-btn rq-btn-primary rq-full" onClick={login}>登入系統 <span>→</span></button><button type="button" className="rq-return-entry" onClick={() => window.location.assign('/')}>←　返回系統入口</button><div className="rq-demo-hint">Demo 原型：此處僅用於角色流程展示，尚未連接正式帳號驗證。</div></section></main></div>;

  const nav = role === 'supervisor' ? [['overview','總覽'],['review','待簽核/查閱'],['requests','全部委託單'],['history','案件歷程'],['notifications','通知中心']] : [['overview','總覽'],['review','待簽核/查閱'],['new','新增委託單'],['borrow','申請借用'],['requests','我的委託單'],['history','案件歷程'],['notifications','通知中心']];
  if(canOpenReportArchive(signedAccount,'request'))nav.push(['archive','報告資料庫']);
  const titleMap = { archive:'報告資料庫', overview: '總覽', new: '新增委託單', borrow: '申請借用', requests: role === 'supervisor' ? '全部委託單' : '我的委託單', review: '待簽核/查閱', history:'案件歷程', notifications: '通知中心' };
  const pending = requests.filter(r => r.status === '待主管簽核' && role === 'supervisor' && canAccessSupervisorRequest(r));
  const myRequests = requests.filter(r=>r.status!=='已結案').filter(r => role === 'supervisor' ? canAccessSupervisorRequest(r) : ownsRequest(signedAccount,r));
  const renderTable = (items) => <div className="rq-table-wrap"><PaginatedTable resetKey={`${page}:${role}:${reviewTab}:${searchField}:${search}:${statusFilter}`} className="rq-table"><thead><tr><th>委託單號</th><th>產品／專案</th><th>試驗項目</th><th>委託人</th><th>需求日期</th><th>狀態</th><th>操作</th></tr></thead><tbody>{items.length ? items.map(r => <tr key={r.id}><td><button className="rq-link" onClick={() => { setSelected(r); setApprovalMode('draw'); setApprovalInputVersion(version => version + 1); setApprovalSignature(''); setApprovalNote(r.approvalNote || ''); setViewModalOpen(true); }}>{r.id}</button></td><td><b>{r.productCode||r.product}</b><small>{r.project || '—'}</small></td><td>{(r.testItems || []).join('、')}</td><td>{r.requester}</td><td>{r.dueDate || '未指定'}</td><td><span className={`rq-status ${r.status === '已核准' || r.status === '執行中' ? 'good' : r.status === '待主管簽核' ? 'pending' : r.status === '退件' || r.status === '補件中' ? 'warning' : ''}`}>{r.status === '待主管簽核' ? '待簽核' : r.status === '已核准' ? '待審查' : r.status}</span></td><td><div className="rq-table-actions">{r.status === '草稿' ? (role === 'requester' && ownsRequest(signedAccount,r) ? <><button className="rq-btn rq-btn-small" onClick={() => { setForm({ ...emptyForm, ...r }); setEditingDraftId(r.id);editingSnapshot.current=JSON.stringify(r); setSigningDate(getRequestDate()); setFormOpen(true); setPage('new'); setSelected(null); }}>編輯草稿</button><button type="button" className="rq-btn rq-btn-small rq-btn-danger" onClick={() => askDeleteDraft(r)}>刪除</button></> : <span className="rq-muted">—</span>) : <>{role==='requester'&&ownsRequest(signedAccount,r)&&['退件','補件中'].includes(r.status)&&<button type="button" className="rq-btn rq-btn-small" onClick={()=>{setForm({...emptyForm,...r});setEditingDraftId(r.id);editingSnapshot.current=JSON.stringify(r);setSigningDate(getRequestDate());setRequestSignature('');setSignatureMode('draw');setFormOpen(true);}}>編輯並重新送出</button>}<button className="rq-btn rq-btn-small" onClick={() => { setSelected(r); setApprovalMode('draw'); setApprovalInputVersion(version => version + 1); setApprovalSignature(''); setApprovalNote(r.approvalNote || ''); if (role === 'supervisor' && r.status === '待主管簽核') { setViewModalOpen(false); setPage('detail'); } else { setViewModalOpen(true); } }}>{role === 'supervisor' && r.status === '待主管簽核' ? '簽核' : '查看'}</button></>}</div></td></tr>) : <tr><td colSpan="7" className="rq-empty">目前沒有符合條件的委託單</td></tr>}</tbody></PaginatedTable></div>;

  return <div className={`rq-app ${dark ? "rq-theme-dark" : "rq-theme-light"}`}><header className="rq-topbar"><CompanyBrandLogo dark={dark}/><SystemHeaderActions dark={dark} onToggle={toggleTheme} account={signedAccount} onLogout={logout} notifications={[{title:'待主管簽核委託',detail:'等待主管簽核委託內容',count:pending.length,icon:'✓',onClick:()=>setPage(role==='supervisor'?'review':'requests')}]}/></header><div className="rq-layout"><aside className="rq-sidebar"><div className="rq-side-caption">WORKSPACE</div>{nav.map(([key,label]) => <button key={key} className={`rq-nav ${page === key ? 'active' : ''}`} onClick={() => { if (key === 'new') openForm(); else { setPage(key);setSearch('');setStatusFilter('全部狀態'); setSelected(null); } }}><span aria-hidden="true">{({archive:'▣',overview:'▦',new:'＋',borrow:'⇄',requests:'▤',history:'▤',review:'◷',notifications:'✓'})[key]}</span>{label}{key === 'review' && pending.length + myRequests.filter(r=>r.status==='待查閱').length > 0 && <i>{pending.length + myRequests.filter(r=>r.status==='待查閱').length}</i>}</button>)}<div className="rq-side-note">目前為前端示範版本。資料儲存在此瀏覽器，尚未連接正式帳號與資料庫。</div></aside><main className="rq-main">{requestStorage.error && <div role="alert">{requestStorage.error}<button onClick={requestStorage.retry}>重試儲存</button></div>}{role === 'supervisor' && page === 'detail' && selected?.status === '待主管簽核' && <button type="button" className="rq-btn rq-btn-primary" onClick={fillDemoApproval}>DEMO 填寫</button>}{role === 'requester' && page === 'new' && <button className="rq-btn rq-btn-primary" onClick={openForm}>＋ 新增委託單</button>}
  {page==='archive'&&<ReportArchive actor={signedAccount} system="request"/>}
  {page === 'overview' && <><div className="rq-kpis"><div><span>{role === 'supervisor' ? '待簽核' : '草稿／待送出'}</span><strong>{role === 'supervisor' ? pending.length : myRequests.filter(r=>r.status==='草稿').length}</strong><small>需要處理</small></div><div><span>{role === 'supervisor' ? '本月已核准' : '待主管簽核'}</span><strong>{role === 'supervisor' ? requests.filter(r=>r.status==='已核准').length : myRequests.filter(r=>r.status==='待主管簽核').length}</strong><small>流程第一階段</small></div><div><span>執行中案件</span><strong>{myRequests.filter(r=>r.status==='執行中').length}</strong><small>已受理委託</small></div><div><span>待查閱</span><strong>{myRequests.filter(r=>r.status==='待查閱').length}</strong><small><button type="button" className="rq-link" onClick={()=>{setPage('review');setReviewTab('read');setSearch('');setStatusFilter('全部狀態');}}>前往查閱清單</button></small></div><div><span>委託單總數</span><strong>{myRequests.length}</strong><small>全部案件</small></div></div><section className="rq-panel"><div className="rq-panel-head"><div><h2>{role === 'supervisor' ? '近期委託與待簽核案件' : '近期案件與工作清單'}</h2><p>可搜尋委託單號、產品、試驗項目或委託人</p></div><input className="rq-input rq-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋委託單、產品或狀態…"/></div>{renderTable((role === 'supervisor' ? requests.filter(r=>r.status!=="已結案").filter(canAccessSupervisorRequest) : myRequests).filter(r=>[r.id,r.productCode,r.product,r.project,r.requester,...(r.testItems||[])].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6))}</section></>}
  {(page === 'requests' || page === 'review' || page==='history') && <section className="rq-panel"><div className="rq-panel-head"><div><h2>{page === 'review' ? (reviewTab==='read'?'查閱清單':'簽核清單') : titleMap[page]}</h2>{page==='review'&&<div className="rq-review-tabs" role="tablist" aria-label="簽核與查閱">{[['approval','簽核清單'],['read','查閱清單']].map(([key,label])=><button type="button" role="tab" aria-selected={reviewTab===key} key={key} className="rq-btn rq-btn-small" onClick={()=>{setReviewTab(key);setSearch('');setStatusFilter('全部狀態');}}>{label}</button>)}</div>}<p>{page === 'review' && reviewTab==='read' ? '查看已完成審核的報告；僅指定委託者主管可確認查閱並封存。' : page === 'review' ? '核准後進入第二階段：實驗室受理與排程；退件則通知委託者補正。' : '查看案件內容與目前流程狀態。'}</p></div><div className="rq-filter-row"><input className="rq-input rq-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={page==='history'?'輸入欄位關鍵字或日期…':'搜尋委託單…'}/>{page==='history'?<select className="rq-input" aria-label="篩選欄位" value={searchField} onChange={e=>setSearchField(e.target.value)}>{REQUEST_SEARCH_FIELDS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:<select className="rq-input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>全部狀態</option>{(page==='review'?(reviewTab==='read'?['待查閱']:['待主管簽核']):['草稿','待主管簽核','已核准','退件','補件中','待排程','已排程','執行中','已完成','待審核','取消']).map(s=><option key={s}>{s}</option>)}</select>}</div></div>{renderTable(page==='review'&&reviewTab==='approval'?visibleRequests.filter(r=>r.status==='待主管簽核'&&role==='supervisor'):visibleRequests)}</section>}
  {page === 'notifications' && <section className="rq-panel"><h2>通知中心</h2><div className="rq-notice"><span className="rq-notice-dot"/><div><b>{pending.length} 張委託單等待主管簽核</b><p>請留意委託單狀態，主管簽核後將更新處理進度。</p></div></div><div className="rq-notice"><span className="rq-notice-dot"/><div><b>二階段流程說明</b><p>第一階段：委託者送單 → 主管簽核。第二階段：核准案件交由實驗室受理、安排排程並回報結果。</p></div></div></section>}
  {page === 'borrow' && <div className="rq-borrow-page"><section className="rq-form-modal rq-form-modal-reference rq-borrow-card"><header className="rq-form-header"><div><p className="rq-eyebrow">EQUIPMENT BORROWING REQUEST</p><h2>申請借用</h2><p>填寫設備借用需求與預計歸還日期，送出後會建立借用申請紀錄。</p></div></header><div className="rq-form-body rq-form-body-reference"><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">1</span><div><b>申請人資料</b><small>Applicant Information</small></div></div><div className="rq-entry-grid"><label>申請人姓名 <em>*</em><input className="rq-input" value={borrowForm.requester} onChange={e=>setBorrowForm({...borrowForm,requester:e.target.value})} placeholder="請輸入申請人姓名"/></label><label>申請部門 <em>*</em><input className="rq-input" value={borrowForm.department} onChange={e=>setBorrowForm({...borrowForm,department:e.target.value})} placeholder="例如：RD、PM、DQA"/></label></div></section><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">2</span><div><b>借用設備與用途</b><small>Equipment & Purpose</small></div></div><div className="rq-entry-grid"><label>設備名稱 <em>*</em><select className="rq-input" value={borrowForm.equipment} onChange={e=>setBorrowForm({...borrowForm,equipment:e.target.value})}><option value="">請選擇設備</option>{['高低溫試驗箱','恆溫恆濕試驗箱','振動試驗機','鹽霧試驗機','日照試驗機','ESD 靜電放電設備','IPX6 防水試驗設備','顯微鏡','其他設備'].map(x=><option key={x} value={x}>{x}</option>)}</select><small className="rq-spec-hint">目前為示範設備清單，尚未與 LMS 設備資料庫同步。</small></label><label>借用數量 <em>*</em><input className="rq-input" type="number" min="1" value={borrowForm.quantity} onChange={e=>setBorrowForm({...borrowForm,quantity:e.target.value})}/></label><label className="rq-entry-grid-one">借用用途 <em>*</em><textarea className="rq-input rq-textarea" value={borrowForm.purpose} onChange={e=>setBorrowForm({...borrowForm,purpose:e.target.value})} placeholder="請說明借用原因、用途或對應試驗案件"/></label></div></section><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">3</span><div><b>借用期間與備註</b><small>Borrowing Period & Notes</small></div></div><div className="rq-entry-grid"><label>預計借用日期 <em>*</em><input className="rq-input" type="date" value={borrowForm.borrowDate} onChange={e=>setBorrowForm({...borrowForm,borrowDate:e.target.value})}/></label><label>預計歸還日期 <em>*</em><input className="rq-input" type="date" min={borrowForm.borrowDate || undefined} value={borrowForm.returnDate} onChange={e=>setBorrowForm({...borrowForm,returnDate:e.target.value})}/></label><label className="rq-entry-grid-one">備註<textarea className="rq-input rq-textarea" value={borrowForm.notes} onChange={e=>setBorrowForm({...borrowForm,notes:e.target.value})} placeholder="配件、治具、設備狀況或其他注意事項（選填）"/></label></div></section><div className="rq-process-note"><b>申請流程</b><p>填寫借用申請 → LMS 待核准 → 一階主管核准／退回。</p></div></div><footer className="rq-form-footer"><button type="button" className="rq-btn rq-btn-light" onClick={()=>setBorrowForm({ requester: '', department: '', equipment: '', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' })}>清除表單</button><button type="button" className="rq-btn rq-btn-primary" onClick={()=>{ if(!borrowForm.requester.trim()||!borrowForm.department.trim()||!borrowForm.equipment||!borrowForm.purpose.trim()||!borrowForm.borrowDate||!borrowForm.returnDate||Number(borrowForm.quantity)<1){notify('請完成所有必填欄位，並確認借用與歸還日期。');return;} if(borrowForm.returnDate<borrowForm.borrowDate){notify('歸還日期不可早於借用日期。');return;} let id;try{const created=submitBorrowRequest(borrowForm,signedAccount?.id);id=created.id;refreshLabSnapshot();}catch(error){notify(error.message);return;} setBorrowForm({ requester: '', department: '', equipment: '', purpose: '', borrowDate: '', returnDate: '', quantity: '1', notes: '' }); notify(`借用申請 ${id} 已建立`); }}>送出借用申請 →</button></footer></section><section className="rq-panel rq-borrow-list"><div className="rq-panel-head"><div><h2>近期借用申請</h2><p>本頁的借用紀錄獨立保存，不會修改委託單資料。</p></div></div><div className="rq-table-wrap"><PaginatedTable className="rq-table"><thead><tr><th>申請單號</th><th>設備名稱</th><th>借用期間</th><th>申請人</th><th>狀態</th></tr></thead><tbody>{borrowRequests.length ? borrowRequests.map(r=><tr key={r.id}><td><b>{r.id}</b></td><td>{r.equipment}</td><td>{r.borrowDate} 至 {r.returnDate}</td><td>{r.requester}</td><td><span className="rq-status pending">{r.status==='待確認'?'待核准':r.status}</span>{r.reviewComment&&<small>{r.reviewComment}</small>}</td></tr>):<tr><td colSpan="5" className="rq-empty">尚無借用申請紀錄</td></tr>}</tbody></PaginatedTable></div></section></div>}
  {page === 'detail' && selected && <section className="rq-panel"><div className="rq-panel-head"><div><h2>{selected.id}　<span className={`rq-status ${selected.status==='待主管簽核'?'pending':''}`}>{selected.status === '待主管簽核' ? '待簽核' : selected.status === '已核准' ? '待審查' : selected.status}</span></h2><p>委託內容、試驗需求及簽核紀錄</p></div><button className="rq-btn rq-btn-light" onClick={()=>setPage(role==='supervisor'?'review':'requests')}>← 返回清單</button></div><div className="rq-detail-grid">{[['產品代碼',selected.productCode||selected.product],['產品類型',selected.productType],['客戶名稱',selected.customer||selected.project],['客戶品番',selected.customerPartNo],['需求日期',selected.dueDate],['測試數量',selected.quantity],['委託者',selected.requester],['委託部門',selected.department],['試驗目的',(selected.purpose||[]).join('、')+(selected.purposeOther?`：${selected.purposeOther}`:'')],['樣品來源',(selected.sampleSource||[]).join('、')+(selected.sampleSourceOther?`：${selected.sampleSourceOther}`:'')],['製品版次',selected.productVersion],['PCBA版次',selected.pcbaVersion],['軟體版次',selected.softwareVersion],['製造日期',selected.manufactureDate],['試驗項目',(selected.testItems||[]).join('、')],['試驗規範／試驗手法',selected.specification],['判定方式',selected.judgementRequired],['判定說明',selected.judgementCriteria],['其他說明',selected.sampleDescription],['備註',selected.notes]].map(([k,v])=><div key={k}><label>{k}</label><p>{v||'—'}</p></div>)}</div>{role==='supervisor' && selected.status==='待主管簽核' && <div className="rq-approval"><h3>主管簽核（二階流程：第一階段）</h3><p className="rq-muted">核准時需簽名；退件只需填寫原因，可不簽名。</p><ApprovalSignature accountId={signedAccount?.id} key={`${selected.id}-${approvalInputVersion}`} mode={approvalMode} onModeChange={setApprovalMode} value={approvalSignature} onChange={setApprovalSignature} onError={notify} /><label className="rq-label">簽核意見（退件時請填寫原因）</label><textarea className="rq-input rq-textarea" value={approvalNote} onChange={e=>setApprovalNote(e.target.value)} placeholder="請輸入核准說明或退件補正事項…"/><div className="rq-actions"><button className="rq-btn rq-btn-danger" onClick={()=>review(selected.id,'退件')}>退回補正</button><button className="rq-btn rq-btn-primary" onClick={()=>review(selected.id,'已核准')}>✓ 核准委託單</button></div></div>}{role==='requester' && ['退件','補件中'].includes(selected.status) && <div className="rq-review-callout"><div><b>主管意見</b><p>{selected.approvalNote || '請補充委託資訊。'}</p></div><button className="rq-btn rq-btn-primary" onClick={()=>{setForm({...emptyForm,...selected});setEditingDraftId(selected.id);editingSnapshot.current=JSON.stringify(selected);setSigningDate(getRequestDate());setRequestSignature('');setSignatureMode('draw');setFormOpen(true);}}>編輯並重新送出</button></div>}<RequestSignatures request={requests.find(r => r.id === selected.id) || selected} /><LmsReviewSignatures request={requests.find(r => r.id === selected.id) || selected} /><RequestProgress status={(requests.find(r => r.id === selected.id) || selected).status} /></section>}
  <footer className="rq-footer">電子化委託 · 二階簽核與案件追蹤 · Demo UI v2.0（示範資料）</footer></main></div>
  {viewModalOpen && selected && <RequestInfoModal account={signedAccount} request={requests.find(r => r.id === selected.id) || selected} onClose={() => setViewModalOpen(false)} onEdit={role === 'requester' ? () => { setForm({...emptyForm,...selected}); setEditingDraftId(selected.id);editingSnapshot.current=JSON.stringify(selected); setSigningDate(getRequestDate()); setRequestSignature(''); setSignatureMode('draw'); setViewModalOpen(false); setFormOpen(true); } : undefined} />}

  {formOpen && <div className="rq-request-page-shell"><section className="rq-form-modal rq-form-modal-reference rq-request-page" role="dialog" aria-modal="true" aria-label="新增委託單"><header className="rq-form-header"><div><p className="rq-eyebrow">ELECTRONIC TEST REQUEST</p><h2>{editingDraftId ? '編輯委託單草稿' : '新增委託單'}</h2><p>可先儲存部分資訊，之後再從「我的委託單」繼續編輯並送出簽核。</p></div><div style={{display:"flex",alignItems:"center",gap:8}}><button type="button" className="rq-btn rq-btn-small" onClick={fillSampleRequest}>Demo填入</button><button type="button" className="rq-close" onClick={()=>setFormOpen(false)} aria-label="關閉">×</button></div></header><div className="rq-form-body rq-form-body-reference"><section className="rq-entry-card"><div className="rq-entry-card-title"><span className="rq-entry-number">1</span><div><b>委託基本資料</b><small>Request Information</small></div></div><div className="rq-entry-grid">
<label>產品代碼<input className="rq-input" value={form.productCode} onChange={e=>setForm({...form,productCode:e.target.value,product:form.product||e.target.value})} placeholder="例如：VCU-2026-A01"/></label>
<label>產品類型<input className="rq-input" value={form.productType} onChange={e=>setForm({...form,productType:e.target.value})} placeholder="例如：車用電子控制器"/></label>
<label>客戶名稱<input className="rq-input" value={form.customer} onChange={e=>setForm({...form,customer:e.target.value,project:form.project||e.target.value})} placeholder="請輸入客戶名稱"/></label>
<label>客戶品番<input className="rq-input" value={form.customerPartNo} onChange={e=>setForm({...form,customerPartNo:e.target.value})} placeholder="客戶產品料號"/></label>
<label>需求日期<input className="rq-input" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label>
<label>測試數量<input className="rq-input" type="number" min="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
<label>委託部門<input className="rq-input" value={signedAccount?.department || ''} readOnly placeholder="請至帳號管理設定部門"/><small>由登入帳號自動帶入</small></label>
<label>委託者姓名<input className="rq-input" value={signedAccount?.name || ''} readOnly/><small>由登入帳號自動帶入</small></label>
<label>優先程度<select className="rq-input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>一般</option><option>急件</option><option>專案關鍵</option></select></label>
</div></section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">2</span><div><b>試驗目的</b><small>Test Intention</small></div></div>
  <div className="rq-entry-field">
    <div className="rq-check-grid rq-check-grid-purpose">{['新產品 New Product','設計變更 Design change','量產品 Mass product','手工品 EV','型物品 DV','本型本工程 PV','再現試驗 Reproducibility test','定期抽測 Periodic sampling inspection','其他（請說明）Other'].map(t=><label key={t} className={(form.purpose||[]).includes(t)?'checked':''}><input type="checkbox" checked={(form.purpose||[]).includes(t)} onChange={e=>setForm(current=>({...current,purpose:e.target.checked?[...(current.purpose||[]).filter(x=>x!==t),t]:(current.purpose||[]).filter(x=>x!==t)}))}/>{t}</label>)}</div>
    {(form.purpose||[]).some(t=>t.startsWith('其他'))&&<label className="rq-label" htmlFor="rq-purpose-other">其他試驗目的說明（必填）<em>*</em><input id="rq-purpose-other" className="rq-input" required aria-required="true" value={form.purposeOther||''} onChange={e=>setForm({...form,purposeOther:e.target.value})} placeholder="請說明其他試驗目的（必填）"/></label>}
  </div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">3</span><div><b>樣品來源與樣品資訊</b><small>Sample Source & Information</small></div></div>
  <div className="rq-entry-field"><label className="rq-label">樣品來源</label><div className="rq-check-grid">{['社內 In-house production','海外廠 Overseas factory','客戶 Customer','廠商 Supplier','競品 Competing products'].map(t=><label key={t} className={(form.sampleSource||[]).includes(t)?'checked':''}><input type="checkbox" checked={(form.sampleSource||[]).includes(t)} onChange={e=>setForm({...form,sampleSource:e.target.checked?[...(form.sampleSource||[]),t]:(form.sampleSource||[]).filter(x=>x!==t)})}/>{t}</label>)}</div><input className="rq-input" value={form.sampleSourceOther||''} onChange={e=>setForm({...form,sampleSourceOther:e.target.value})} placeholder="來源補充說明（廠別、供應商或其他）"/></div>
  <div className="rq-entry-grid"><label>製品版次 Product Version<input className="rq-input" value={form.productVersion} onChange={e=>setForm({...form,productVersion:e.target.value})} placeholder="例如：V1.2"/></label><label>PCBA 版次 PCBA Version<input className="rq-input" value={form.pcbaVersion} onChange={e=>setForm({...form,pcbaVersion:e.target.value})} placeholder="例如：PCB-A03"/></label><label>軟體版次 Software Version<input className="rq-input" value={form.softwareVersion} onChange={e=>setForm({...form,softwareVersion:e.target.value})} placeholder="軟體版本"/></label><label>製造日期 Date of Manufacture<input className="rq-input" type="date" value={form.manufactureDate} onChange={e=>setForm({...form,manufactureDate:e.target.value})}/></label></div>
  <div className="rq-entry-grid rq-entry-grid-one"><label>其他說明（非必填）<textarea className="rq-input rq-textarea" value={form.sampleDescription} onChange={e=>setForm({...form,sampleDescription:e.target.value})} placeholder="樣品尺寸、序號、版本差異、附件或其他注意事項"/></label></div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">4</span><div><b>試驗項目與試驗規範</b><small>Test Items & Specifications</small></div></div>
  <div className="rq-entry-field"><label className="rq-label">試驗項目（單選）</label><button type="button" className="rq-test-picker-trigger" onClick={()=>{setTestSearch('');setTestPickerOpen(true);}}><span>{form.testItems.length ? `已選擇：${form.testItems.join('、')}` : '請搜尋並選擇試驗項目'}</span><b>⌕　搜尋試驗名稱</b></button></div>
  <div className="rq-entry-grid rq-entry-grid-one"><label>試驗規範／試驗手法 Test Specification / Test Method<textarea className="rq-input rq-textarea" value={form.specification} onChange={e=>setForm({...form,specification:e.target.value})} placeholder="選取試驗項目後自動帶入參考規範；請依核准版本確認並可直接修改…"/><small className="rq-spec-hint">已依所選試驗項目帶入參考內容。此版本為前端示範目錄，正式使用時需串接 LMS 核准規範資料庫。</small></label></div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">5</span><div><b>判定基準與備註</b><small>Acceptance Criteria & Notes</small></div></div>
  <div className="rq-judgement-mode"><label className="rq-label">判定方式</label><div className="rq-radio-row"><label><input type="radio" name="judgementRequired" checked={form.judgementRequired==='需作判定'} onChange={()=>setForm({...form,judgementRequired:'需作判定'})}/> 需作判定</label><label><input type="radio" name="judgementRequired" checked={form.judgementRequired==='不作判定'} onChange={()=>setForm({...form,judgementRequired:'不作判定'})}/> 不作判定</label></div></div>
  <div className="rq-entry-grid rq-entry-grid-one"><label>判定基準<textarea className="rq-input rq-textarea" value={form.judgementCriteria} onChange={e=>setForm({...form,judgementCriteria:e.target.value})} placeholder="選取試驗項目後自動帶入參考判定基準；請依核准版本確認並可修改…"/><small className="rq-spec-hint">已依所選試驗項目帶入參考判定基準。此版本為前端示範目錄，正式使用需串接 LMS 核准判定基準資料庫。</small></label><label>備註 NOTE（非必填）<textarea className="rq-input rq-textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="其他備註"/></label></div>
</section>
<section className="rq-entry-card">
  <div className="rq-entry-card-title"><span className="rq-entry-number">6</span><div><b>委託者簽名與主管簽核</b><small>Requester Signature & Supervisor Approval</small></div></div>
  <div className="rq-signature-grid">
    <div className="rq-signature-box"><b>委託者簽名</b><div className="rq-radio-row"><label><input type="radio" name="signatureMode" checked={signatureMode==='draw'} onChange={()=>{setSignatureMode('draw');setRequestSignature('');}} /> 手寫簽名</label><label><input type="radio" name="signatureMode" checked={signatureMode==='upload'} onChange={()=>{setSignatureMode('upload');setRequestSignature('');}} /> 上傳簽名檔</label></div>{signatureMode==='draw' ? <SignaturePad onChange={setRequestSignature} label="手寫簽名" /> : <><label>上傳電子簽名檔<input className="rq-input" type="file" accept="image/png,image/jpeg" onChange={uploadRequestSignature}/></label><DefaultSignatureActions key={signedAccount?.id} accountId={signedAccount?.id} value={requestSignature} onChange={setRequestSignature} />{requestSignature && <img src={requestSignature} alt="上傳的簽名預覽" style={{maxWidth:"100%",maxHeight:110,objectFit:"contain",background:"#fff"}} />}<small>支援 PNG、JPG，檔案不超過 1 MB。</small></>}<label>簽名日期（自動記錄）<input className="rq-input" type="text" readOnly value={signingDate} /></label><small>送出時自動記錄當天日期（台灣時間），無須填寫。</small></div>
    <div className="rq-signature-box"><b>指定直屬主管</b><label>主管帳號<select className="rq-input" value={form.supervisorId || ''} onChange={e=>setForm({...form,supervisorId:e.target.value})}><option value="">請選擇直屬主管</option>{supervisors.filter(a => { const matches=sharedAccounts.filter(x=>x.status==='啟用中' && x.role==='委託者' && (x.name===user || String(x.email||'').toLowerCase()===user.trim().toLowerCase())); return matches.length===1 && matches[0].supervisorId===a.id; }).map(a=><option key={a.id} value={a.id}>{a.name}（{a.email}）</option>)}</select></label><small>可選擇帳號管理中設定的直屬委託者主管，由該主管登入後簽核。</small></div>
  </div>
  <div className="rq-process-note"><b>簽核流程</b><p>委託者建立並確認 → 主管簽核 → LMS 建立試驗案件 → 排程與試驗執行 → 試驗報告。</p></div>
</section></div><footer className="rq-form-footer">{editingDraftId ? <button type="button" className="rq-btn rq-btn-danger" onClick={() => setDeleteTarget({ id: editingDraftId, source: 'editor' })}>刪除此草稿</button> : <button type="button" className="rq-btn rq-btn-light" onClick={()=>setFormOpen(false)}>取消</button>}<div>{editingDraftId && <button type="button" className="rq-btn rq-btn-light" onClick={()=>setFormOpen(false)}>取消</button>}<button type="button" className="rq-btn rq-btn-light" onClick={()=>submitRequest(true)}>儲存草稿</button><button type="button" className="rq-btn rq-btn-primary" onClick={()=>submitRequest(false)}>送出主管簽核 →</button></div></footer></section></div>}
    {testPickerOpen && createPortal(<div className="rq-modal-backdrop rq-test-picker-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setTestPickerOpen(false);}}><section className="rq-test-picker-modal" role="dialog" aria-modal="true" aria-label="搜尋試驗項目"><header className="rq-test-picker-header"><div><p className="rq-eyebrow">TEST CATALOG</p><h2>選擇試驗項目</h2><p>請選擇一個試驗項目；確認後會帶入對應參考規範，內容仍可自行修改。</p></div><button type="button" className="rq-close" onClick={()=>setTestPickerOpen(false)} aria-label="關閉">×</button></header><div className="rq-test-picker-content"><div className="rq-test-search-wrap"><span>⌕</span><input autoFocus className="rq-input" value={testSearch} onChange={e=>setTestSearch(e.target.value)} placeholder="搜尋試驗名稱，例如：高溫、振動、IPX6…"/><button type="button" className="rq-btn rq-btn-light" onClick={()=>setTestSearch('')}>清除</button></div><div className="rq-test-picker-meta"><span>試驗項目清單（單選）</span><b>已選 {form.testItems.length ? 1 : 0} 項</b></div><div className="rq-test-results"><PaginatedList items={testOptions.filter(t=>t.toLowerCase().includes(testSearch.trim().toLowerCase()))} resetKey={testSearch}>{page=>page.map(t=><label key={t} className={form.testItems.includes(t)?'selected':''}><input type="radio" name="requestTestItem" checked={form.testItems.includes(t)} onChange={e=>toggleTestItem(t,e.target.checked)}/><span><b>{t}</b><small>{t==='其他'?'其他／自訂試驗項目':'可靠度與環境試驗項目'}</small></span><i>{form.testItems.includes(t)?'✓':''}</i></label>)}</PaginatedList>{testOptions.filter(t=>t.toLowerCase().includes(testSearch.trim().toLowerCase())).length===0 && <div className="rq-test-no-results">找不到符合的試驗名稱，請更換關鍵字。</div>}</div></div><footer className="rq-test-picker-footer"><span>目前選擇：{form.testItems.length ? form.testItems[0] : '尚未選擇'}</span><div><button type="button" className="rq-btn rq-btn-light" onClick={()=>setTestPickerOpen(false)}>取消</button><button type="button" className="rq-btn rq-btn-primary" onClick={()=>setTestPickerOpen(false)}>確認選擇</button></div></footer></section></div>, document.body)}
  {deleteTarget && createPortal(
    <div className="rq-modal-backdrop rq-delete-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
      <section className="rq-delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="rq-delete-confirm-title" aria-describedby="rq-delete-confirm-description">
        <div className="rq-delete-confirm-icon" aria-hidden="true">!</div>
        <h2 id="rq-delete-confirm-title">確認刪除草稿？</h2>
        <p id="rq-delete-confirm-description">即將永久刪除委託單 <b>{deleteTarget.id}</b>。刪除後無法復原，確定要繼續嗎？</p>
        <footer>
          <button type="button" className="rq-btn rq-btn-light" onClick={() => setDeleteTarget(null)}>取消</button>
          <button type="button" className="rq-btn rq-btn-danger" onClick={confirmDeleteDraft}>確認刪除</button>
        </footer>
      </section>
    </div>,
    document.body
  )}
  <ClearCasesButton/>
  {toast && <div className="rq-toast">{toast}</div>}
  </div>;
}
