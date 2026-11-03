import CompactDialog from './CompactDialog.jsx';
import {deleteDemoAccount} from './accountManagement.mjs';
import './WorkspaceExpansion.css';
import ScheduleSummaryIcon from './ScheduleSummaryIcon.jsx';
import WorkspaceMenuToggle from './WorkspaceMenuToggle.jsx';
import useSidebarMobile from './useSidebarMobile.js';
import WorkspaceSidebarBrand from './WorkspaceSidebarBrand.jsx';
import './WorkspacePageHeader.css';
import EnterpriseLoginLayout from './EnterpriseLoginLayout.jsx';
import HelpTip from './HelpTip.jsx';
import AssistantIcon from './AssistantIcon.jsx';
import {startSession,endSession} from './idleSessions.mjs';
import ScheduleEditStatus from './ScheduleEditStatus.jsx';
import useManagementPreferences from './useManagementPreferences.js';
import {equipmentActivity} from './equipmentActivity.mjs';
import LoginCredentials from './LoginCredentials.jsx';
import './EnterpriseLms.css';
import './LmsCompactWorkspace.css';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import {PORTAL_TITLES} from './portalLabels.mjs';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import {canControlTrial,isActiveTrial,trialPauseAvailability} from './trialPermissions.mjs';
import {setTrialPaused} from './trialControls.mjs';
import ReportArchive from './ReportArchive.jsx';
import {canOpenReportArchive} from './reportArchive.mjs';
import {usesEquipment} from './scheduleResources.mjs';
import useSystemTheme from './useSystemTheme.js';
import SystemHeaderActions from './SystemHeaderActions.jsx';
import useReportSnapshot from './useReportSnapshot.js';
import './CompanyLogo.css';
import {ReportCasePanel} from './ReportUi.jsx';
import {getRequestDate} from './requestDate.mjs';
import {caseResetVersion} from './resetCases.mjs';
import LabOperationApproval from './LabOperationReviews.jsx';
import {requestApprovalRows} from './requestApprovalRows.mjs';
import useLabSnapshot from './useLabSnapshot.js';
import {requestInformation} from './labData.mjs';
import IntelligentAssistant from './IntelligentAssistant.jsx';
import RoleSettings from './RoleSettings.jsx';
import {BUILTIN_ROLES,readCustomRoles,canAccessLmsPage} from './customRoles.mjs';
import './ManagementPages.css';
import LiveDashboard from './LiveDashboard.jsx';
import {labNotificationCounts} from './labNotifications.mjs';
import LabReports from './LabReports.jsx';
import LabSettings from './LabSettings.jsx';
import useLabView from './useLabView.js';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {ALL_DEMO_REQUESTS} from './demoLmsRequests.mjs';
import {PaginatedTable,PaginatedList} from './Pagination.jsx';
import StopScheduleDialog from './StopScheduleDialog.jsx';
import {stopRequestSchedules,readCancellationOverrides} from './requestCancellation.mjs';
import useScheduleLifecycle from './useScheduleLifecycle.js';
import {effectiveScheduleStatus} from './scheduleProgress.mjs';
import {subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot} from './scheduleClock.mjs';
import ScheduleTimeline from './ScheduleTimeline.jsx';
import ScheduleViews from './ScheduleViews.jsx';
import ScheduleArrangement from './ScheduleArrangement.jsx';
import {readScheduleEquipment,validateSchedule,recommendSchedule,dateOnly,SCHEDULE_KEY,EQUIPMENT_KEY} from './scheduleEquipment.mjs';
import MaterialsPage from './MaterialsPage.jsx';
import EquipmentPage from './EquipmentPage.jsx';
import RequestInfoModal from './RequestInfoModal.jsx';
import { resolveScheduleRequest } from './scheduleRequest.mjs';
import { reviewElectronicRequest, readElectronicRequestsForLms as readApprovedRequestsForLms } from './electronicReview.mjs';
import SignatureHistory from './SignatureHistory.jsx';
import { getSignatureHistory } from './signatureHistory.mjs';


import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import "./LmsApp.css";
import './LoginEntry.css';
import {accessSystem,canManageAccounts,canReview} from "./demoPermissions.mjs";
import ApprovalSignature from "./ApprovalSignature.jsx";
import { createDemoApprovalSignature } from "./demoApprovalSignature.mjs";
import { readDemoAccounts } from "./demoAccounts.mjs";
import { readStoredRequests, writeStoredRequests, mergeImportedRequests } from "./requestStorage.mjs";



const INITIAL_FORM = {

  name: "",

  email: "",

  role: "實驗室工程師",

  department: "DQA 實驗室",

  supervisorId: "",

  password: "",

  confirmPassword: "",

};



const NAV_ITEMS = [

  { id: "dashboard", label: "儀錶板" },

  { id: "requests", label: "試驗委託" },

  { id: "schedule", label: "排程管理" },

  { id: "equipment", label: "設備管理" },

  { id: "maintenance", label: "物料管理" },

  { id: "archive", label: "資料庫" },

  { id: "reports", label: "報表分析" },

  { id: "accounts", label: "帳號管理" },

  { id: "settings", label: "系統設定" },

];



const DEMO_PASSWORD = "demo1234";







function CompanyBrand({dark=false}) { return <CompanyBrandLogo dark={dark}/>; }

function ThemeToggle({ dark, onToggle }) {

  return (

    <button

      type="button"

      className="theme-toggle"

      onClick={onToggle}

      aria-label="切換深色或淺色模式"

    >

      <span data-theme-symbol={dark?"moon":"sun"}>{dark ? "☾" : "☀"}</span>

      <span>{dark ? "深色模式" : "淺色模式"}</span>

      <span className={`toggle-track ${dark ? "is-dark" : ""}`}>

        <span className="toggle-thumb" />

      </span>

    </button>

  );

}



function Footer() {

  return (

    <footer className="footer">

      <span>DQA SMART LAB AI</span>

      <span>競賽展示版 · 使用虛構資料</span>

    </footer>

  );

}



function HomePage({ dark, onToggle, onEnter }) {

  const systems = [

    {

      id: "lms",

      number: "01",

      icon: "▥",

      title: "DQA LMS",

      subtitle: "實驗室管理系統",

      description: "設備管理、試驗排程、設備保養、物料管理與報表分析。",

      color: "blue",

    },

    {

      id: "request",

      number: "02",

      icon: "▤",

      title: "電子委託單系統",

      subtitle: "Electronic Test Request",

      description: "電子信賴性評價委託、設備借出與歸還、提交委託需求。",

      color: "green",

    },

    {

      id: "lab",

      number: "03",

      icon: "⚙",

      title: "造隆實驗室系統",

      subtitle: "給實驗室人員使用",

      description: "日常作業、試驗執行、數據記錄與內部管理功能。",

      color: "orange",

    },

    {

      id: "validation",

      number: "04",

      icon: "☑",

      title: "驗證計畫",

      subtitle: "Validation Planning",

      description: "建立產品驗證計畫、設定試驗項目、追蹤進度與管理驗證結果。",

      color: "purple",

    },

  ];



  return (

    <div className={`app home-page ${dark ? "theme-dark" : "theme-light"}`}>

      <header className="home-header">

        <CompanyBrand dark={dark}/>

        <ThemeToggle dark={dark} onToggle={onToggle} />

      </header>



      <section className="hero">

        <p className="eyebrow">DQA LAB SYSTEM</p>

        <h1>造隆實驗室整合系統</h1>

        <p className="hero-subtitle">

          整合資源 · 提升效率 · 支援產品可靠度驗證

        </p>

      </section>



      <main className="systems">

        <div className="system-grid">

          {systems.map((system) => (

            <article

              key={system.id}

              className={`system-card card-${system.color}`}

            >

              <button

                type="button"

                className="card-main"

                onClick={() => onEnter(system)}

              >

                <div className="card-heading">

                  <div className="system-icon">{system.icon}</div>

                  <div className="card-title-group">

                    <h2>{system.title}</h2>

                    <p className="system-subtitle">{system.subtitle}</p>

                  </div>

                </div>



                <p className="system-description">{system.description}</p>



                <div className="card-footer">

                  <span>進入系統</span>

                  <span className="arrow-circle">→</span>

                </div>

              </button>

            </article>

          ))}

        </div>

      </main>



      <Footer />

    </div>

  );

}



export function LoginPage({

  system,

  dark,

  onToggle,

  onLogin,

  onBack,

  preview = false,

}) {

  const [email, setEmail] = useState(() => system.id === "lms" ? "level1@example.com" : "");

  const [password, setPassword] = useState(() => system.id === "lms" ? DEMO_PASSWORD : "");

  const [error, setError] = useState("");





  function handleSubmit(event) {

    event.preventDefault();

    if (preview) return;

    setError("");





    if (!email.trim() || !password) {

      setError("請輸入電子郵件及密碼。");

      return;

    }



    onLogin(email.trim().toLowerCase(), password, setError);

  }



  return (

    <div data-system={system.id} className={`app login-page entry-login ${dark ? "theme-dark" : "theme-light"}`}>
      <EnterpriseLoginLayout system={system.id} dark={dark} onToggle={onToggle}>
      <div className="login-card unified-login-form">




        <h1>{PORTAL_TITLES[system.id]||system.title}</h1>
        {preview&&<p className="enterprise-preview-note" role="status">設計品質管理目前為展示入口，尚未開放登入。</p>}



        <form onSubmit={handleSubmit}>

          <LoginCredentials accountId="login-email" passwordId="login-password" account={email} password={password} onAccountChange={setEmail} onPasswordChange={setPassword} disabled={preview}/>

          {error && (

            <p className="form-error" role="alert">

              {error}

            </p>

          )}



          <button type="submit" className="login-submit" disabled={preview}>

            {preview ? "暫未開放" : "登入系統"} <span>→</span>

          </button>

        </form>





        <button type="button" className="back-button" onClick={onBack}>

          ← 返回系統首頁

        </button>

      </div>



      </EnterpriseLoginLayout>


    </div>

  );

}



function Sidebar({ active, onNavigate, onHome, open, currentUser }) {

  return (

    <>

      {open && (

        <button

          type="button"

          className="sidebar-overlay"

          aria-label="關閉選單"

          onClick={() => onNavigate(active)}

        />

      )}



      <aside id="lms-navigation" className={`sidebar ${open ? "sidebar-open" : ""}`}>

        <WorkspaceSidebarBrand className="sidebar-brand live-sidebar-brand colong-sidebar-brand"/>



        <nav className="sidebar-nav">

          {NAV_ITEMS.filter(item=>canAccessLmsPage(currentUser,item.id)&&(item.id!=='archive'||canOpenReportArchive(currentUser,'lms'))&&(item.id!=='accounts'||canManageAccounts(currentUser))).map((item, index) => (

            <div

              key={item.id}

              className={index === 6 ? "nav-group-separated" : ""}

            >

              <button

                type="button"

                className={`nav-item ${

                  active === item.id ? "active" : ""

                }`}

                onClick={() => onNavigate(item.id)}

              >

                <span aria-hidden="true" className="nav-icon"><LmsSidebarIcon name={item.id}/></span>

                <span>{item.label}</span>

              </button>

            </div>

          ))}

        </nav>



        <button

          type="button"

          className="logout-button"
          aria-label="回到首頁"

          onClick={onHome}

        >

          <span className="nav-icon"><LmsSidebarIcon name="dashboard"/></span> 回到首頁

        </button>

      </aside>

    </>

  );

}



function DashboardTopbar({dark,onToggle,onMenu,onLogout,onNavigate,currentUser,notificationCounts={pendingReview:0,unscheduled:0,conflicts:0},sidebarExpanded,children}){
 return <header className="dashboard-topbar"><WorkspaceMenuToggle className="menu-button" label="切換側邊欄" controls="lms-navigation" expanded={sidebarExpanded} onClick={onMenu}/>{children}<SystemHeaderActions compactTheme dark={dark} onToggle={onToggle} account={currentUser} onLogout={onLogout} notifications={[
 {title:'待審查試驗委託',detail:'等待主管審核委託內容與報告',count:notificationCounts.pendingReview,icon:'✓',onClick:()=>onNavigate?.('requests','待審查')},
 {title:'待排程試驗',detail:'等待安排設備與試驗時間',count:notificationCounts.unscheduled,icon:'◷',onClick:()=>onNavigate?.('schedule','未排程')},
 {title:'排程衝突',detail:'設備或時段重疊，需要確認',count:notificationCounts.conflicts,icon:'!',onClick:()=>onNavigate?.('schedule','有衝突')}
 ]}/></header>;
}

function AccountManagement({ accounts, setAccounts,currentUser }) {
  const [roles,setRoles]=useState(()=>readCustomRoles());
  const [roleSettingsOpen,setRoleSettingsOpen]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState(null),[deleteError,setDeleteError]=useState('');

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState(INITIAL_FORM);

  const [formError, setFormError] = useState("");

  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState("全部");
  const [roleFilter,setRoleFilter]=useState('');



  const enabledCount = accounts.filter(

    (account) => account.status === "啟用中"

  ).length;



  const disabledCount = accounts.length - enabledCount;



  const filteredAccounts = accounts.filter((account) => {

    const keyword = search.trim().toLowerCase();



    const matchesSearch =

      !keyword ||

      account.name.toLowerCase().includes(keyword) ||

      account.email.toLowerCase().includes(keyword) ||

      account.department.toLowerCase().includes(keyword);



    const matchesFilter =

      filter === "全部" || account.status === filter;



    return matchesSearch && matchesFilter && (!roleFilter||account.role===roleFilter);

  });



  function updateField(event) {

    const { name, value } = event.target;



    setFormData((previous) => ({

      ...previous,

      [name]: value,

    }));



    setFormError("");

    setNotice("");

  }



  function resetForm() {

    setFormData(INITIAL_FORM);

    setEditingId(null);

    setFormError("");

    setShowForm(false);

  }



  function openNewAccountForm() {

    setFormData(INITIAL_FORM);

    setEditingId(null);

    setFormError("");

    setNotice("");

    setShowForm(true);

  }



  function openEditForm(account) {

    setFormData({

      name: account.name,

      email: account.email,

      role: account.role,

      department: account.department,

      supervisorId: account.supervisorId || "",

      password: "",

      confirmPassword: "",

    });



    setEditingId(account.id);

    setFormError("");

    setNotice("");

    setShowForm(true);

  }



  function handleSubmit(event) {

    event.preventDefault();

    setFormError("");

    setNotice("");



    const name = formData.name.trim();

    const email = formData.email.trim().toLowerCase();

    const department = formData.department.trim();



    if (!name || !email || !department) {

      setFormError("請完整填寫姓名、電子郵件及所屬部門。");

      return;

    }



    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



    if (!emailPattern.test(email)) {

      setFormError("請輸入有效的電子郵件地址。");

      return;

    }



    const duplicated = accounts.some(

      (account) =>

        account.email.toLowerCase() === email &&

        account.id !== editingId

    );



    if (duplicated) {

      setFormError("此電子郵件已經建立帳號，請使用其他電子郵件。");

      return;

    }



    if (!editingId && formData.password.length < 12) {

      setFormError("密碼至少需要 12 個字元。");

      return;

    }



    if (

      formData.password &&

      formData.password.length < 12

    ) {

      setFormError("新密碼至少需要 12 個字元。");

      return;

    }



    if (

      formData.password !== formData.confirmPassword

    ) {

      setFormError("兩次輸入的密碼不一致，請重新確認。");

      return;

    }



    if (editingId) {

      setAccounts((previous) =>

        previous.map((account) =>

          account.id === editingId

            ? {

                ...account,

                name,

                email,

                role: formData.role,

                supervisorId: formData.supervisorId || "",

                department,

              }

            : account

        )

      );



      setNotice(

        "帳號資料已在本次 Demo 畫面更新。"

      );

    } else {

      const newAccount = {

        id: `U${Date.now()}`,

        name,

        email,

        role: formData.role,

        supervisorId: formData.supervisorId || "",

        department,

        status: "啟用中",

        lastLogin: "尚未登入",

      };



      setAccounts((previous) => [

        ...previous,

        newAccount,

      ]);



      setNotice(

        "帳號已加入清單。展示登入統一使用測試密碼 demo1234，表單密碼不會儲存。"

      );

    }



    resetForm();

  }



  function toggleAccountStatus(account) {

    const nextStatus =

      account.status === "啟用中" ? "已停用" : "啟用中";



    setAccounts((previous) =>

      previous.map((item) =>

        item.id === account.id

          ? { ...item, status: nextStatus }

          : item

      )

    );



    setNotice(

      `${account.name} 的展示狀態已改為「${nextStatus}」。`

    );

  }



  return (

    <section className="panel account-management">

      <div className="account-page-heading">

        <div>

          <div className="help-title-row"><h2><LmsSidebarIcon name="accounts"/>帳號與權限管理</h2><p className="account-inline-help">集中管理使用者、角色與功能權限，從帳號指派到簽核層級一次完成。</p></div>

        </div>



        <div className="account-heading-actions"><button

          type="button"

          className="primary-button"

          onClick={()=>{setRoleSettingsOpen(false);openNewAccountForm();}}

        >

          ＋ 新增帳號

        </button></div>

      </div>




<div className="account-summary">

        <div className="account-summary-card"><i className="workspace-summary-icon" aria-hidden="true"><LmsSidebarIcon name="accounts"/></i>

          <span>帳號總數</span>

          <strong>{accounts.length}</strong>

        </div>

        <div className="account-summary-card"><i className="workspace-summary-icon" aria-hidden="true"><LmsSidebarIcon name="accounts"/></i>

          <span>啟用中</span>

          <strong>{enabledCount}</strong>

        </div>

        <div className="account-summary-card"><i className="workspace-summary-icon" aria-hidden="true"><LmsSidebarIcon name="accounts"/></i>

          <span>停用帳號</span>

          <strong>{disabledCount}</strong>

        </div>

      </div>



      <div className="schedule-view-tabs account-access-tabs" role="tablist" aria-label="帳號與權限管理">
        {[[false,'帳號清單',accounts.length],[true,'角色與權限',BUILTIN_ROLES.length+roles.length]].map(([key,label,count])=><button type="button" key={label} role="tab" id={key?'access-tab-roles':'access-tab-accounts'} aria-selected={roleSettingsOpen===key} aria-controls={key?'access-panel-roles':'access-panel-accounts'} tabIndex={roleSettingsOpen===key?0:-1} onClick={()=>setRoleSettingsOpen(key)} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?false:event.key==='End'?true:!roleSettingsOpen;setRoleSettingsOpen(next);document.getElementById(next?'access-tab-roles':'access-tab-accounts')?.focus();}}}><strong>{label}</strong><span>{count}</span></button>)}
      </div>
      <div id="access-panel-roles" role="tabpanel" aria-labelledby="access-tab-roles" hidden={!roleSettingsOpen}>{roleSettingsOpen&&<RoleSettings embedded roles={roles} accounts={accounts} onClose={()=>setRoleSettingsOpen(false)} onSave={setRoles}/>}</div>
      <div id="access-panel-accounts" role="tabpanel" aria-labelledby="access-tab-accounts" hidden={roleSettingsOpen}>
      {notice && (

        <div className="account-notice" role="status">

          <span>{notice}</span>

          <button

            type="button"

            onClick={() => setNotice("")}

            aria-label="關閉訊息"

          >

            ×

          </button>

        </div>

      )}



      {showForm && (

        <CompactDialog title={editingId?"編輯帳號":"新增帳號"} onClose={resetForm}><form className="account-form" onSubmit={handleSubmit}>





          <div className="account-form-grid">

            <label>

              姓名

              <input

                type="text"

                name="name"

                value={formData.name}

                onChange={updateField}

                placeholder="請輸入姓名"

                autoComplete="name"

                required

              />

            </label>



            <label>

              登入帳號（電子郵件）

              <input

                type="email"

                name="email"

                value={formData.email}

                onChange={updateField}

                placeholder="例如：level0@example.com"

                autoComplete="username"

                required

              />

            </label>



            <label>

              角色

              <select

                name="role"
                aria-label="角色"

                value={formData.role}

                onChange={updateField}

                required

              >

                <option value="實驗室工程師">實驗室工程師</option>
                <option value="實驗室副工程師">實驗室副工程師</option>
                <option value="委託者">委託者</option>
                <option value="委託者主管">委託者主管</option>
                <option value="一階主管">一階主管</option>
                <option value="二階主管">二階主管</option>
                <option value="三階主管">三階主管</option>
                <option value="系統管理員">系統管理員</option>
                <option value="檢視者">檢視者</option>{roles.map(role=><option key={role.id} value={role.name}>{role.name}</option>)}

              </select>

            </label>



            {formData.role === "委託者" && <label>直屬委託者主管<select name="supervisorId" value={formData.supervisorId || ""} onChange={updateField}><option value="">尚未設定</option>{accounts.filter(a => a.id !== editingId && a.role === "委託者主管" && a.status === "啟用中").map(a => <option key={a.id} value={a.id}>{a.name}（{a.email}）</option>)}</select><small>委託送出時自動交由此主管簽核。</small></label>}

            <label>

              所屬部門

              <input

                type="text"

                name="department"

                value={formData.department}

                onChange={updateField}

                placeholder="例如：DQA 實驗室"

                required

              />

            </label>



            <label>

              {editingId ? "變更密碼（選填）" : "設定密碼"}

              <input

                type="password"

                name="password"

                value={formData.password}

                onChange={updateField}

                placeholder={

                  editingId

                    ? "不修改請留空"

                    : "至少 12 個字元"

                }

                autoComplete="new-password"

                minLength={12}

                required={!editingId}

              />

            </label>



            <label>

              確認密碼

              <input

                type="password"

                name="confirmPassword"

                value={formData.confirmPassword}

                onChange={updateField}

                placeholder="請再次輸入密碼"

                autoComplete="new-password"

                minLength={12}

                required={!editingId || !!formData.password}

              />

            </label>

          </div>



          <p className="account-inline-help">

            登入帳號以電子郵件為準。密碼欄位目前僅供表單驗證展示；

            正式環境必須由後端安全處理，不可儲存明文密碼。

          </p>



          {formError && (

            <p className="form-error" role="alert">

              {formError}

            </p>

          )}



          <div className="account-form-actions">

            <button type="submit" className="primary-button">

              {editingId ? "儲存修改" : "建立帳號"}

            </button>



            <button

              type="button"

              className="account-cancel-button"

              onClick={resetForm}

            >

              取消

            </button>

          </div>

        </form></CompactDialog>

      )}



      <div className="account-toolbar"><select aria-label="依角色篩選" value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="">全部角色</option>{[...BUILTIN_ROLES,...roles.map(role=>role.name)].map(name=><option key={name}>{name}</option>)}</select>

        <input

          className="account-search"

          type="search"

          placeholder="搜尋姓名、電子郵件或部門..."

          value={search}

          onChange={(event) => setSearch(event.target.value)}

          aria-label="搜尋帳號"

        />



        <select

          className="account-role-filter"

          value={filter}

          onChange={(event) => setFilter(event.target.value)}

          aria-label="依狀態篩選"

        >

          <option value="全部">全部帳號</option>

          <option value="啟用中">啟用中</option>

          <option value="已停用">已停用</option>

        </select>

      </div>



      <div className="table-scroll">

        <PaginatedTable resetKey={`${search}:${filter}:${roleFilter}`} className="account-table">

          <thead>

            <tr>

              <th>使用者</th>

              <th>登入帳號（電子郵件）</th>

              <th>角色</th>

              <th>所屬部門</th>

              <th>狀態</th>

              <th>最後登入</th>

              <th>操作</th>

            </tr>

          </thead>



          <tbody>

            {filteredAccounts.map((account) => (

              <tr key={account.id}>

                <td>

                  <div className="account-user-cell">

                    <span className="account-avatar">

                      {account.name.slice(0, 1)}

                    </span>

                    <div>

                      <strong>{account.name}</strong>

                      <small>{account.id}</small>

                    </div>

                  </div>

                </td>



                <td>{account.email}</td>



                <td>

                  <span className="account-role-pill">

                    {account.role}

                  </span><small className="account-role-scope">{roles.find(role=>role.name===account.role)?`${roles.find(role=>role.name===account.role).pages.length} 個功能頁面 · ${roles.find(role=>role.name===account.role).level?'第 '+roles.find(role=>role.name===account.role).level+' 階審查':'一般角色'}`:'系統內建角色'}</small>

                </td>



                <td>{account.department}</td>



                <td>

                  <span

                    className={`account-status ${

                      account.status === "啟用中"

                        ? "enabled"

                        : "disabled"

                    }`}

                  >

                    <i />

                    {account.status}

                  </span>

                </td>



                <td>{account.lastLogin}</td>



                <td>

                  <div className="account-row-actions">

                    <button

                      type="button"

                      onClick={() => openEditForm(account)}

                    >

                      編輯

                    </button>



                    <button

                      type="button"

                      onClick={() => toggleAccountStatus(account)}

                    >

                      {account.status === "啟用中"

                        ? "停用"

                        : "啟用"}

                    </button><button type="button" disabled={account.id===currentUser?.id} onClick={()=>{setDeleteTarget(account);setDeleteError('');}}>刪除</button>

                  </div>

                </td>

              </tr>

            ))}



            {filteredAccounts.length === 0 && (

              <tr>

                <td colSpan={7} className="account-empty">

                  找不到符合條件的帳號。

                </td>

              </tr>

            )}

          </tbody>

        </PaginatedTable>

      </div>



      <p className="account-inline-help">

        Demo 帳號、角色與權限供流程展示，保存於目前瀏覽器；

        正式帳號驗證與權限控管需由後端服務執行。

      </p>

      </div>
    {deleteTarget&&<CompactDialog title="刪除帳號" onClose={()=>setDeleteTarget(null)}><div className="account-delete-confirm"><p>確認刪除 {deleteTarget.name}（{deleteTarget.email}）？此帳號將無法登入，既有操作歷史仍保留。</p>{deleteError&&<p role="alert">{deleteError}</p>}<div className="account-form-actions"><button type="button" className="account-cancel-button" onClick={()=>setDeleteTarget(null)}>取消</button><button type="button" className="primary-button" onClick={()=>{try{const next=deleteDemoAccount(readDemoAccounts(),deleteTarget.id,currentUser?.id);setAccounts(next);setNotice(`帳號 ${deleteTarget.name} 已刪除。`);setDeleteTarget(null);}catch(error){setDeleteError(error.message);}}}>確認刪除</button></div></div></CompactDialog>}</section>

  );

}



function RequestsPage({ onPendingReviewCountChange = () => {}, currentUser,subPage=null }) {
 const requestResetEpoch=useRef(caseResetVersion());
 const reportRows=useReportSnapshot();
 const approvalSnapshot=useLabSnapshot();
 const [requestStatusFilter,setRequestStatusFilter]=useState('all');
 const [approvalOperationId,setApprovalOperationId]=useState(null);
 const [approvalInfo,setApprovalInfo]=useState(null);

 const [requests,setRequests] = useState(() => {
   return mergeImportedRequests(readStoredRequests(ALL_DEMO_REQUESTS), readApprovedRequestsForLms());
 });
 useEffect(() => {
   const refresh = () => setRequests(old => {
     return mergeImportedRequests(readCancellationOverrides(old), readApprovedRequestsForLms());
   });
   window.addEventListener("focus", refresh);
   window.addEventListener("storage", refresh);
   window.addEventListener("dqa:request-updated", refresh);
   return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("dqa:request-updated", refresh); };
 }, []);
 const [storageError, setStorageError] = useState("");
 useEffect(() => {
   if(requestResetEpoch.current!==caseResetVersion())return;
   // Report the result of synchronizing with browser storage.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setStorageError(writeStoredRequests(requests) ? "" : "簽核資料尚未儲存：瀏覽器空間不足或禁止儲存，請勿關閉此頁並先釋出空間。");
 }, [requests]);
 const [selected,setSelected] = useState(null);
 const [selectedFromHistory,setSelectedFromHistory] = useState(false);
 const [modalMode,setModalMode] = useState("view");
 const [search,setSearch] = useState("");
 const [comment,setComment] = useState("");
 const [reviewSignature,setReviewSignature] = useState("");
 const [reviewMode,setReviewMode] = useState("draw");
 const [reviewInputVersion,setReviewInputVersion] = useState(0);
 const [notice,setNotice] = useState("");
 const [aiReview,setAiReview] = useState(null);
 const [aiReviewing,setAiReviewing] = useState(false);
 const [aiProgress,setAiProgress] = useState(0);
 const [pendingReviewResult,setPendingReviewResult] = useState(null);
 useEffect(() => {
   if (!pendingReviewResult) return;
   const started = Date.now();
   const timer = window.setInterval(() => {
     const progress = Math.min(100, Math.floor((Date.now()-started)/50));
     setAiProgress(progress);
     if(progress >= 100) { window.clearInterval(timer); setAiReview(pendingReviewResult); setAiReviewing(false); setPendingReviewResult(null); }
   }, 100);
   return () => window.clearInterval(timer);
 }, [pendingReviewResult]);
 const [showHistory,setShowHistory] = useState(subPage==='history');
 const [historyFilter,setHistoryFilter] = useState("完成");
 const approvalRows=requestApprovalRows(requests,approvalSnapshot.labOperations,approvalSnapshot.schedules,approvalSnapshot.borrows,reportRows);
 const pendingCount=approvalRows.filter(row=>row.status==='待審查').length;
 const reviewTabs=[['all','全部委託',approvalRows.length],...['待審查','待核准','待審核'].map(status=>[status,status,approvalRows.filter(row=>row.status===status).length])];
 const activeReviewTab=Math.max(0,reviewTabs.findIndex(([key])=>key===requestStatusFilter));
 function reviewTabKeyDown(event,index){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?reviewTabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+reviewTabs.length)%reviewTabs.length;
  setRequestStatusFilter(reviewTabs[next][0]);document.getElementById(`request-review-tab-${next}`)?.focus();
 }
 useEffect(() => {
   onPendingReviewCountChange(pendingCount);
 }, [pendingCount, onPendingReviewCountChange]);
 const current = requests.find(r=>r.id===selected);
 useEffect(() => {
   if (!selected || !selectedFromHistory) return;
   const preventEscapeClose = (event) => {
     if (event.key === "Escape") {
       event.preventDefault();
       event.stopPropagation();
       event.stopImmediatePropagation();
     }
   };
   document.addEventListener("keydown", preventEscapeClose, true);
   return () => document.removeEventListener("keydown", preventEscapeClose, true);
 }, [selected, selectedFromHistory]);
 const update = (id,fn)=>setRequests(old=>old.map(r=>r.id===id?fn(r):r));
 const stamp=()=>new Date().toLocaleString("zh-TW",{hour12:false});
 function runAIReview(request){
   if(!request) return;
   setAiReviewing(true);
   setAiProgress(0);
   setAiReview(null);
   // Demo 階段採用可解釋的規則檢查；尚未呼叫真正的 AI API。
   const findings=[];
   const requiredFields=[
     ["產品代碼",request.productCode],
     ["產品類型",request.productType],
     ["需求日期",request.requestedDate],
     ["測試數量",request.quantity],
     ["試驗規範／試驗手法",request.specification],
     ["判定基準",request.judgment]
   ];
   requiredFields.forEach(([label,value])=>{
     if(value===undefined || value===null || String(value).trim()===""){
       findings.push({level:"error",title:`缺少${label}`,detail:`「${label}」尚未填寫，建議補齊後再送主管審查。`});
     }
   });
   if(request.quantity && (!Number.isFinite(Number(request.quantity)) || Number(request.quantity)<=0)){
     findings.push({level:"error",title:"測試數量需確認",detail:"測試數量不是正數，請確認樣品數量及填寫格式。"});
   }
   if(request.requestedDate){
     const normalized=String(request.requestedDate).replaceAll("/","-");
     const parsed=new Date(normalized);
     if(!Number.isNaN(parsed.getTime()) && parsed.getTime()<new Date("2026-01-01").getTime()){
       findings.push({level:"warning",title:"需求日期可能過期",detail:"需求日期早於本 Demo 使用的資料年度，請確認日期是否正確。"});
     }
   }
   const spec=String(request.specification||"").trim();
   const judgment=String(request.judgment||"").trim();
   if(spec && /依.*規範|依客戶規格|相關.*規範/.test(spec) && !/規範編號|標準編號|JIS|ISO|IEC|SAE|客戶規格/.test(spec)){
     findings.push({level:"warning",title:"試驗規範引用較籠統",detail:"目前描述未明確列出規範編號或版本；建議補上適用規範、版本及試驗條件。"});
   }
   if(judgment && /依.*規格判定|需作判定|依核准/.test(judgment)){
     findings.push({level:"warning",title:"判定基準可能不夠具體",detail:"目前判定基準偏向一般性描述，建議列出可量測的允收條件或引用明確條文。"});
   }
   if(!request.productVersion || !request.pcbaVersion || !request.softwareVersion){
     findings.push({level:"warning",title:"版本資訊待確認",detail:"產品、PCBA 或軟體版本資訊有缺漏，請確認本次試驗樣品的版本識別是否完整。"});
   }
   const result={
     id:request.id,
     createdAt:new Date().toLocaleString("zh-TW",{hour12:false}),
     findings,
     summary:findings.some(x=>x.level==="error")?"有必要資料缺漏，建議補齊後再送審。":findings.length?"發現需要人工確認的項目，請主管與委託人核對。":"依目前可檢查欄位，未發現明顯缺漏；仍須由主管確認規格適用性。",
     checkedFields:requiredFields.length,
     mode:"Demo 規則檢查"
   };
   setPendingReviewResult(result);
 }
 function fillDemoReview() {
   if ((reviewSignature || comment.trim()) && !window.confirm('DEMO 填寫會覆蓋目前的簽名與審查意見，確定繼續？')) return;
   setReviewInputVersion(version => version + 1);
   setReviewMode('upload');
   setReviewSignature(createDemoApprovalSignature());
   setComment('DEMO 測試：已確認委託內容與試驗需求，僅供審查流程展示。');
   setNotice('已填入測試簽名與審查意見，請確認後再提交。');
 }
 function decide(returnIt){ if(!current)return;
   if (current.source === 'electronic-request') {
     try {
       const result = reviewElectronicRequest({id:current.id, accountId:currentUser?.id, expectedRevision:current.sourceRevision, returnIt, signature:reviewSignature, comment});
       setRequests(old => mergeImportedRequests(old, readApprovedRequestsForLms()));
       window.dispatchEvent(new Event('dqa:review-updated'));
       setNotice(returnIt ? '已退回電子委託，委託者可補件重送。' : result.lmsReview.approval >= 2 ? '雙階審查完成，電子委託已更新為待排程。' : '第一階已核准並同步，等待第二階主管審查。');
       setComment(''); setReviewSignature(''); setReviewMode('draw');
       setReviewInputVersion(version => version + 1);
       if (returnIt || result.lmsReview.approval >= 2) setSelected(null);
     } catch (error) { setNotice(error.message || '無法儲存審查結果，請檢查瀏覽器空間後重試。'); }
     return;
   }
 if(!canReview(currentUser,{...current,participantIds:current.applicant===currentUser?.name?[currentUser.id]:[],approvals:current.approvalRecords||[]})){setNotice("此帳號無權審核本案件，或已參與本案件的審查。");return;} if(!returnIt&&!reviewSignature){setNotice("請先完成電子簽名。");return;} if(returnIt&&!comment.trim()){setNotice("退回原因必填。");return;}  const level=current.approval+1; const action=returnIt?`第${level}階主管退回：${comment||"請補充資料"}`:`第${level}階主管核准`; update(current.id,r=>({...r,status:returnIt?"退回":level>=2?"完成":"待審查",approval:returnIt?0:level,approvalRecords:[...(r.approvalRecords||[]),{stage:level,actorId:currentUser.id,action:returnIt?"退回":"核准",at:new Date().toISOString()}],signatureRecords:[...getSignatureHistory(r),{stage:level,actor:currentUser.name,comment:comment.trim(),actorId:currentUser.id,signature:reviewSignature,at:new Date().toISOString(),decision:returnIt?"退回":"核准"}],history:[...r.history,`${stamp()} ${action}`]})); setNotice(returnIt?"已退回申請人補件；重新送出後將由第一階主管重新審查。":level>=2?"兩階主管皆已核准，委託狀態更新為完成。":"第一階主管已核准，等待第二階主管審查。"); setComment(""); setReviewSignature("");setReviewMode("draw"); if(returnIt||level>=2)setSelected(null); else setSelected(current.id); }
 const visible=approvalRows.filter(r=>(requestStatusFilter==='all'||r.status===requestStatusFilter)&&`${r.id} ${r.productCode||''} ${r.title} ${r.department} ${r.applicant}`.toLowerCase().includes(search.toLowerCase()));
 const historical=requests.filter(r=>["完成","取消","退回","已結案"].includes(r.status)&&r.status===historyFilter&&`${r.id} ${r.productCode||""} ${r.title} ${r.department} ${r.applicant}`.toLowerCase().includes(search.toLowerCase()));
 return <section className="panel generic-page lms-compact-requests"><div className={subPage?"template-page has-request-subpage":"template-page"}><div className="template-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="requests"/>試驗委託管理</h2><HelpTip>本頁顯示待審查、待核准與報告待審核委託；已完成、取消及退回案件請至歷史委託查詢。</HelpTip></div></div><a className="template-btn secondary request-history-button" href="/lms/requests/history" target="_blank" rel="opener">歷史委託</a></div>
 <div className="schedule-view-tabs request-review-tabs" role="tablist" aria-label="委託審查分類">{reviewTabs.map(([key,label,count],index)=><button type="button" role="tab" key={key} id={`request-review-tab-${index}`} aria-selected={requestStatusFilter===key} aria-controls="request-review-panel" tabIndex={requestStatusFilter===key?0:-1} onClick={()=>setRequestStatusFilter(key)} onKeyDown={event=>reviewTabKeyDown(event,index)}><strong>{label}</strong><span>{count}</span></button>)}</div>
 {approvalOperationId&&<LabOperationApproval operationId={approvalOperationId} currentUser={currentUser} onClose={()=>setApprovalOperationId(null)}/>}
 {approvalInfo&&<RequestInfoModal account={currentUser} request={approvalInfo} onClose={()=>setApprovalInfo(null)}/>}
 {storageError && <div className="template-notice" role="alert">{storageError}<button type="button" onClick={() => setStorageError(writeStoredRequests(requests) ? "" : storageError)}>重試儲存</button></div>}
 {notice&&<div className="template-notice">{notice}<button className="notice-close" onClick={()=>setNotice("")}>×</button></div>}
 <section id="request-review-panel" role="tabpanel" aria-labelledby={`request-review-tab-${activeReviewTab}`} tabIndex={0}>
 <div className="template-toolbar"><input className="template-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋委託編號、產品代碼、試驗項目、部門…"/></div>
 <div className="template-table-wrap"><PaginatedTable resetKey={`${search}:${historyFilter}:${requestStatusFilter}`} className="template-table"><thead><tr>{["委託編號","產品代碼","試驗項目","委託部門","申請人","優先順序","提交日期","狀態","操作"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.operationId||r.id}><td><button type="button" className="request-id-link" onClick={()=>{if(r.reportId){setApprovalInfo(requestInformation(r,approvalSnapshot));return;}if(r.operationId?.startsWith('borrow:')){setApprovalOperationId(r.operationId);return;}if(r.operationId){setApprovalInfo({...requestInformation(r,approvalSnapshot),status:'待核准'});return;}setSelected(r.id);setReviewSignature("");setReviewMode("draw");setSelectedFromHistory(false);setModalMode("view");setComment("");setAiReview(null)}} title={`查看 ${r.id} 委託單細節`}>{r.id}</button></td><td>{r.productCode||"—"}</td><td>{r.title}</td><td>{r.department}</td><td>{r.applicant}</td><td>{r.priority}</td><td>{r.submitted}</td><td><span className={`template-status status-${r.status}`}>{r.status}</span></td><td><button className="template-btn secondary" style={{padding:"7px 10px"}} onClick={()=>{if(r.operationId){setApprovalOperationId(r.operationId);return;}setSelected(r.id);setReviewSignature("");setReviewMode("draw");setSelectedFromHistory(false);setModalMode(r.status==="待審查"?"review":"view");setComment("");setAiReview(null);}}>{r.reportId?'審核':r.operationId?'核准':r.status==="待審查"?"審查":r.status==="退回"?"補件":"查看"}</button></td></tr>)}</tbody></PaginatedTable>{!visible.length&&<div className="template-empty">沒有符合條件的委託</div>}</div></section>
 <div className="template-info">顯示委託審查、申請核准與二／三階報告審核；已結案報告可在案件歷程查閱。</div>
 {showHistory&&<div className="workspace-subpage"><section className="workspace-subpage-panel history-modal" role="region" aria-labelledby="history-modal-title"><div className="request-modal-header"><div><div className="help-title-row"><h3 id="history-modal-title">歷史委託</h3><HelpTip>查詢已完成、取消及退回的委託單；此處僅供檢視。</HelpTip></div></div><button className="request-modal-close" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:1,padding:0}} aria-label="關閉歷史委託" onClick={()=>setShowHistory(false)}>×</button></div><div className="request-modal-body"><div className="template-toolbar history-toolbar"><input className="template-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋委託編號、產品代碼、試驗項目、部門…"/><select className="template-select" value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}>{["完成","取消","退回"].map(x=><option key={x} value={x}>{x}</option>)}</select><span className="request-count">共 {historical.length} 筆</span></div><div className="template-table-wrap history-table-wrap"><PaginatedTable resetKey={`${search}:${historyFilter}`} className="template-table"><thead><tr>{["委託編號","產品代碼","試驗項目","委託部門","申請人","提交日期","狀態","操作"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{historical.map(r=><tr key={r.id}><td><button type="button" className="request-id-link" onClick={()=>{setSelected(r.id);setSelectedFromHistory(true);setModalMode("view");setComment("");setAiReview(null);if(!subPage)setShowHistory(false)}}>{r.id}</button></td><td>{r.productCode||"—"}</td><td>{r.title}</td><td>{r.department}</td><td>{r.applicant}</td><td>{r.submitted}</td><td><span className={`template-status status-${r.status}`}>{r.status}</span></td><td><button className="template-btn secondary" style={{padding:"7px 10px"}} onClick={()=>{setSelected(r.id);setSelectedFromHistory(true);setModalMode("view");setComment("");setAiReview(null);if(!subPage)setShowHistory(false)}}>查看</button></td></tr>)}</tbody></PaginatedTable>{!historical.length&&<div className="template-empty">此分類目前沒有歷史委託</div>}</div></div></section></div>}
 {current&&<div className="request-modal-backdrop" role="presentation" onMouseDown={e=>{if(!selectedFromHistory&&e.target===e.currentTarget)setSelected(null)}}><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title"><div className="request-modal-header"><div><div className="help-title-row"><h3 id="request-modal-title">{current.id}｜{current.title}</h3><HelpTip>委託詳細資料與簽核歷程</HelpTip></div></div><div className="request-modal-header-actions">{current.status === "待審查" && <button type="button" className="template-btn secondary" onClick={fillDemoReview}>DEMO 填寫</button>}{modalMode==="review"&&<button type="button" className="template-btn ai-review-button" disabled={aiReviewing} onClick={()=>runAIReview(current)}><AssistantIcon/><span>{aiReviewing?"檢查中…":"AI 審查"}</span></button>}{selectedFromHistory?<button type="button" className="template-btn secondary" onClick={()=>{setSelected(null);setSelectedFromHistory(false);setAiReview(null);setShowHistory(true);}}>回上一頁</button>:<button type="button" className="request-modal-close" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:1,padding:0}} aria-label="關閉視窗" onClick={()=>{setSelected(null);setAiReview(null);}}>×</button>}</div></div><div className="request-modal-body"><ReportCasePanel request={approvalSnapshot.electronic.find(row=>row.id===current.id)||current} account={currentUser}/>{notice && <div className="template-info" role="status">{notice}</div>}{modalMode === "review" && aiReviewing && <section className="ai-review-results" aria-live="polite"><h4>檢查委託資料</h4><p>正在依現有規則檢查欄位，請稍候。</p><div role="progressbar" aria-label="審查進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={aiProgress} style={{height:10,background:"#e6ecf5",borderRadius:10,overflow:"hidden"}}><div style={{height:"100%",width:`${aiProgress}%`,background:"#4857d5",transition:"width 100ms linear"}} /></div><p>{aiProgress}%</p>{["產品代碼", "產品類型", "需求日期", "測試數量", "試驗規範／試驗手法", "判定基準"].map((label,index)=><p key={label} style={{margin:"6px 0",color:aiProgress >= Math.ceil((index+1)*100/6) ? "#25835d" : "#8794aa"}}>{aiProgress >= Math.ceil((index+1)*100/6) ? "✓ 已檢查" : "○ 等待檢查"}　{label}</p>)}</section>}{modalMode==="review"&&aiReview&&aiReview.id===current.id&&<section className="ai-review-results" aria-live="polite"><div className="ai-review-results-heading"><div><span className="ai-review-eyebrow">DQA SMART REVIEW · {aiReview.mode}</span><h4>AI 審查結果</h4><p>{aiReview.summary}</p></div><button type="button" className="ai-review-dismiss" onClick={()=>setAiReview(null)} aria-label="關閉 AI 審查結果">×</button></div><div className="ai-review-metrics"><span>檢查欄位 <strong>{aiReview.checkedFields}</strong></span><span>待確認項目 <strong>{aiReview.findings.length}</strong></span><span>檢查時間 <strong>{aiReview.createdAt}</strong></span></div>{aiReview.findings.length===0?<div className="ai-review-empty"><strong>未發現明顯缺漏</strong><HelpTip>這只代表目前規則檢查未發現明顯問題，不代表試驗規格已獲正式認可。</HelpTip></div>:<div className="ai-review-finding-list">{aiReview.findings.map((finding,index)=><article className={`ai-review-finding ${finding.level}`} key={`${finding.title}-${index}`}><span className="ai-review-finding-icon">{finding.level==="error"?"!":"△"}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div><span className="ai-review-level">{finding.level==="error"?"需補正":"待確認"}</span></article>)}</div>}<p className="ai-review-disclaimer">提示：目前為前端 Demo 規則檢查，尚未連接真正的 AI API 或讀取外部規格文件。結果僅供參考，不會自動核准或退回委託。</p></section>}<div className="request-form-preview"><h4><span>1</span> 產品資訊 <small>Product Information</small></h4><div className="request-preview-grid"><div><label>產品代碼</label><strong>{current.productCode||"—"}</strong></div><div><label>產品類型</label><strong>{current.productType||"—"}</strong></div><div><label>客戶名稱</label><strong>{current.customerName||"—"}</strong></div><div><label>客戶品番</label><strong>{current.customerPartNo||"—"}</strong></div><div><label>需求日期</label><strong>{current.requestedDate||"—"}</strong></div><div><label>測試數量</label><strong>{current.quantity||"—"} pcs</strong></div></div><h4><span>2</span> 試驗目的 <small>Test Intention</small></h4><p className="request-preview-tags">{(current.intentions||[]).map(x=><span key={x}>{x}</span>)}</p><h4><span>3</span> 樣品來源 <small>Sample Source</small></h4><p className="request-preview-tags">{(current.sampleSource||[]).map(x=><span key={x}>{x}</span>)}</p><h4><span>4</span> 樣品資訊 <small>Sample Information</small></h4><div className="request-preview-grid"><div><label>產品版本</label><strong>{current.productVersion||"—"}</strong></div><div><label>PCBA 版本</label><strong>{current.pcbaVersion||"—"}</strong></div><div><label>軟體版本</label><strong>{current.softwareVersion||"—"}</strong></div><div><label>製造日期</label><strong>{current.manufactureDate||"—"}</strong></div></div><h4><span>5</span> 試驗規範／試驗手法 <small>Test Specification / Test Method</small></h4><div className="request-preview-text">{current.specification||current.title}</div><h4><span>6</span> 判定基準 <small>Judgment Criteria</small></h4><div className="request-preview-text">{current.judgment||"依核准之試驗規格判定。"}</div><h4><span>7</span> 備註／簽核 <small>Note / Approval</small></h4><div className="request-preview-text">{current.remarks||"—"}</div></div>{current.source === "electronic-request" && <div className="template-info">此電子委託的簽名與審查結果會同步回委託系統；雙階核准後進入待排程。</div>}<div className="detail-grid"><div><span>委託部門</span><strong>{current.department}</strong></div><div><span>申請人</span><strong>{current.applicant}</strong></div><div><span>目前狀態</span><strong><span className={`template-status status-${current.status}`}>{current.status}</span></strong></div><div><span>審查進度</span><strong>{current.approval}/2 階核准</strong></div></div><h4>雙階主管審查</h4><div className="approval-steps"><div className={current.approval>=1?"approved":""}><b>1</b><span>第一階主管</span><small>{current.approval>=1?"已核准":current.status==="退回"?"已退回":"待審查"}</small></div><div className={current.approval>=2?"approved":""}><b>2</b><span>第二階主管</span><small>{current.approval>=2?"已核准":"待第一階完成"}</small></div></div><SignatureHistory request={current} /><h4>完整操作歷程</h4><PaginatedList items={current.history} resetKey={current.id}>{page=><ul className="history-list">{page.map((h,i)=><li key={i}>{h}</li>)}</ul>}</PaginatedList>{current.status === "待審查" && <section className="request-form-preview"><h4>電子簽名與審核</h4><ApprovalSignature key={`${current.id}-${current.approval}-${reviewInputVersion}`} accountId={currentUser?.id} mode={reviewMode} onModeChange={setReviewMode} value={reviewSignature} onChange={setReviewSignature} onError={setNotice} /><label className="comment-label">審查意見（退回時請填寫）<textarea className="template-input" value={comment} onChange={e=>setComment(e.target.value)} placeholder="例如：請補充測試條件、樣品數量或規格依據" rows={3}/></label><div className="template-form-actions"><button type="button" className="template-btn" disabled={!canReview(currentUser,{...current, approvals:current.approvalRecords || []})} onClick={()=>decide(false)}>核准第 {current.approval+1} 階</button><button type="button" className="template-btn danger" disabled={!canReview(currentUser,{...current, approvals:current.approvalRecords || []})} onClick={()=>decide(true)}>退回委託</button></div></section>}</div></section></div>}
 </div></section>;
}

function readSavedSchedules(fallback){
 try{const data=JSON.parse(window.localStorage.getItem(SCHEDULE_KEY)||'null');return Array.isArray(data)&&data.every(row=>row?.id&&row?.requestId)?data:fallback;}catch{return fallback;}
}
function SchedulePage({ currentUser, accounts = [], initialFilter = null, onScheduleCountsChange = () => {},subPage=null }){
 const [scheduleFilter,setScheduleFilter]=useState(initialFilter || "未排程");
 const [scheduleSearch,setScheduleSearch]=useState("");
 const [notice,setNotice]=useState("");
 const [requestInfo, setRequestInfo] = useState(null);
 const openRequestInfo = row => {
   try {
     const stored = JSON.parse(window.localStorage.getItem('dqa-request-demo-v2') || '[]');
     setRequestInfo(resolveScheduleRequest(row, Array.isArray(stored) ? stored : []));
   } catch { setRequestInfo(resolveScheduleRequest(row)); }
 };
 const [scheduleMessage,setScheduleMessage]=useState('');
 const [equipmentCatalog,setEquipmentCatalog]=useState(()=>{try{return readScheduleEquipment();}catch{return [];}});
 const refreshEquipment=()=>{try{setEquipmentCatalog(readScheduleEquipment());setScheduleMessage('已重新讀取設備狀態。');}catch(error){setEquipmentCatalog([]);setScheduleMessage(error.message);}};
 useEffect(()=>{
   const refresh=()=>{try{setEquipmentCatalog(readScheduleEquipment());}catch(error){setEquipmentCatalog([]);setScheduleMessage(error.message);}};
   const storage=event=>{if(event.key===EQUIPMENT_KEY || event.key===null)refresh();};
   window.addEventListener('focus',refresh);window.addEventListener('storage',storage);window.addEventListener('dqa:equipment-updated',refresh);
   return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',storage);window.removeEventListener('dqa:equipment-updated',refresh);};
 },[]);
 const [showScheduleHistory,setShowScheduleHistory]=useState(subPage==='history');
 const [showGantt,setShowGantt]=useState(subPage==='chart');
 const [ganttTab,setGanttTab]=useState("equipment");
 const [ganttStartDate,setGanttStartDate]=useState("2026-10-25");
 const [ganttDays,setGanttDays]=useState(14);
 const [historyScheduleFilter,setHistoryScheduleFilter]=useState("全部");
 const [editing,setEditing]=useState(null);
 const [showStopDialog,setShowStopDialog]=useState(false);
 const [stopError,setStopError]=useState('');
 function confirmStopSchedule(reason){
   if(!editing)return false;
   try{
     const result=stopRequestSchedules({scheduleId:editing.id,requestId:editing.requestId,actor:currentUser?.name,actorId:currentUser?.id,reason});
     setScheduleRows(result.schedules);setEquipmentCatalog(result.equipment);
     for(const name of ['dqa:schedules-updated','dqa:equipment-updated','dqa:request-updated','dqa:review-updated'])window.dispatchEvent(new Event(name));
     setNotice(editing.requestId+' 已取消，相關排程已中止。');
     setShowStopDialog(false);setEditing(null);setEditForm(null);
     return true;
   }catch(error){setStopError(error.message||'取消委託失敗，請確認瀏覽器空間後重試。');return false;}
 }

 const [scheduleRows,setScheduleRows]=useState(()=>readSavedSchedules(DEMO_SCHEDULES));
 const scheduleNow=useSyncExternalStore(subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot);
 const displayScheduleRows=scheduleRows.map(row=>({...row,status:effectiveScheduleStatus(row,scheduleNow)}));
 const activeScheduleRows=displayScheduleRows.filter(row=>!['已完成','已結案'].includes(row.status));
 useEffect(()=>{
   const refresh=()=>{try{const raw=window.localStorage.getItem(SCHEDULE_KEY);if(raw){const rows=JSON.parse(raw);if(Array.isArray(rows))setScheduleRows(old=>JSON.stringify(old)===raw?old:rows);}}catch{setScheduleMessage('無法讀取最新排程資料。');}};
   try{if(window.localStorage.getItem(SCHEDULE_KEY)===null)window.localStorage.setItem(SCHEDULE_KEY,JSON.stringify(scheduleRows));}catch{setScheduleMessage('排程初始化儲存失敗，請確認瀏覽器權限與空間。');}
   const storage=event=>{if(event.key===SCHEDULE_KEY||event.key===null)refresh();};
   window.addEventListener('dqa:schedules-updated',refresh);window.addEventListener('storage',storage);
   return()=>{window.removeEventListener('dqa:schedules-updated',refresh);window.removeEventListener('storage',storage);};
 // Initial seed and storage listeners are installed once for this mounted page.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 useEffect(() => {
  const counts = {
    unscheduled: displayScheduleRows.filter(row => row.status === "未排程").length,
    conflicts: displayScheduleRows.filter(row => row.status === "有衝突").length,
    scheduled: displayScheduleRows.filter(row => row.status === "已排程").length,
  };
  onScheduleCountsChange(counts);
 }, [displayScheduleRows, onScheduleCountsChange]);
 const [editForm,setEditForm]=useState(null);
 const historyScheduleRows=displayScheduleRows.map(r=>({
  ...r, id:r.id, productCode:r.productCode, sampleCode:r.sampleCode||`SMP-${String(r.requestId||r.id).replace(/[^A-Za-z0-9-]/g,"")}`, title:r.title, eq:r.eq, owner:r.owner,
  time:r.time, end:r.end, status:r.status
 }));
 function latestSchedules(){
   const raw=window.localStorage.getItem(SCHEDULE_KEY);
   const rows=raw?JSON.parse(raw):scheduleRows;
   if(!Array.isArray(rows))throw Error('排程資料無法讀取，請重新載入。');
   return rows;
 }
 function openEditor(row){
   const latest=scheduleRows.find(item=>item.id===row.id)||row;
   if(["已完成","已結案"].includes(effectiveScheduleStatus(latest,Date.now()))){setNotice("試驗已結束，不可編輯排程。");return;}
   if(row.status==='取消'){setNotice('此委託已取消，無法重新安排排程。');return;}
   row=scheduleRows.find(item=>item.id===row.id)||row;
   let catalog=[];
   try{catalog=readScheduleEquipment();setEquipmentCatalog(catalog);}catch(error){setScheduleMessage(error.message);}
   const machine=catalog.find(item=>row.equipmentId?item.id===row.equipmentId:item.name===row.eq);
   const executor=accounts.find(item=>row.ownerId?item.id===row.ownerId:item.name===row.owner);
   setEditing(row);setScheduleMessage(catalog.length?'':'設備台帳無法讀取或尚無設備，請先確認設備管理。');
   setEditForm({equipmentId:machine?.id||'',eq:machine?.name||'',ownerId:executor?.id||'',owner:executor?.name||'',sampleCode:row.sampleCode||('SMP-'+String(row.requestId||row.id).replace(/[^A-Za-z0-9-]/g,'')),time:dateOnly(row.time),end:dateOnly(row.end||row.time),note:row.remarks||'',conditions:row.conditions||{},equipmentIds:row.equipmentIds||[],equipmentCount:row.equipmentCount||1,sampleVolumeLitres:row.sampleVolumeLitres??'',preparationMinutes:row.preparationMinutes||0,cleanupMinutes:row.cleanupMinutes||0});
 }
 function autoScheduleCurrent(){
   if(!editing||!editForm)return;
   try{
     const equipment=readScheduleEquipment();setEquipmentCatalog(equipment);
     const liveAccounts=JSON.parse(window.localStorage.getItem('dqa-shared-demo-accounts-v1')||'null')||accounts;
     const result=recommendSchedule({editing,form:editForm,equipment,accounts:liveAccounts,rows:latestSchedules()});
     setEditForm(previous=>({...previous,...result}));
     setScheduleMessage('已推薦 '+result.eq+'／'+result.owner+'，'+result.time+' 至 '+result.end+'（'+result.duration+' 天）。每件樣品使用空間 '+result.sampleVolumeLitres+' L'+(result.sampleVolumeEstimated?'（Demo 預設，請依實際樣品確認）':'')+'。請確認後儲存。');
   }catch(error){setScheduleMessage(error.message||'無法產生建議，請確認設備與人員。');}
 }
 function saveSchedule(){
   if(!editing||!editForm)return;
   try{
     const equipment=readScheduleEquipment();setEquipmentCatalog(equipment);
     const rows=latestSchedules(),current=rows.find(row=>row.id===editing.id);
     if(current&&['已完成','已結案'].includes(effectiveScheduleStatus(current,Date.now())))throw Error('試驗已結束，不可儲存排程。');
     if(!current||JSON.stringify(current)!==JSON.stringify(editing))throw Error('此案件排程已更新，請重新開啟編輯。');
     const liveAccounts=JSON.parse(window.localStorage.getItem('dqa-shared-demo-accounts-v1')||'null')||accounts;
     if(isActiveTrial({...current,status:effectiveScheduleStatus(current,Date.now())})&&!canControlTrial(liveAccounts.find(a=>a.id===currentUser?.id)))throw Error('僅 lv1 一階主管可儲存進行中試驗的排程。');
     const proposal=validateSchedule({editing,form:editForm,equipment,accounts:liveAccounts,rows,today:getRequestDate()});
     const updated=rows.map(row=>row.id===editing.id?proposal:row);
     try{window.localStorage.setItem(SCHEDULE_KEY,JSON.stringify(updated));}catch{throw Error('排程儲存失敗，請確認瀏覽器空間與權限後重試。');}
     setScheduleRows(updated);setNotice(editing.requestId+' 的排程已儲存在本機，列表與甘特圖已同步。');
     setEditing(null);setEditForm(null);
   }catch(error){setScheduleMessage(error.message||'無法儲存排程，請重試。');}
 }


 const unscheduled=displayScheduleRows.filter(r=>r.status==="未排程").length;
 const testing=displayScheduleRows.filter(row=>row.status==="試驗中").length;
 const conflicts=displayScheduleRows.filter(r=>r.status==="有衝突").length;
 const scheduled=displayScheduleRows.filter(r=>r.status==="已排程").length;
 const activityPreferences=useManagementPreferences();
 const activity=equipmentActivity(displayScheduleRows,equipmentCatalog,activityPreferences,scheduleNow);

 return <section className="panel generic-page"><div className="template-page"><div className="template-heading schedule-page-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="schedule"/>試驗排程管理</h2><HelpTip>按「編輯排程」查看委託內容並安排設備；日程結束後自動完成並釋放設備。</HelpTip></div></div><div className="schedule-heading-actions"><a className="template-btn schedule-chart-button" href="/lms/schedule/chart" target="_blank" rel="opener"><svg className="schedule-chart-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4.5v15h16"/><path d="M7 15h3v2H7zM11 10h3v7h-3zM15 6h3v11h-3z"/><path d="M7 15v2M11 10v7M15 6v11"/></svg><span>排程管理圖表</span></a><a className="template-btn secondary schedule-history-button" href="/lms/schedule/history" target="_blank" rel="opener">歷史排程</a></div></div><div className="schedule-kpis schedule-kpis-timed summary-tiles"><button type="button" className={`template-kpi schedule-kpi-button summary-tile ${scheduleFilter==="未排程"?"selected":""}`} onClick={()=>setScheduleFilter(scheduleFilter==="未排程"?"全部":"未排程")} aria-pressed={scheduleFilter==="未排程"}><ScheduleSummaryIcon kind="pending"/><span>待排程</span><strong>{unscheduled}</strong></button><button type="button" className={`template-kpi schedule-kpi-button summary-tile ${scheduleFilter==="有衝突"?"selected":""}`} onClick={()=>setScheduleFilter(scheduleFilter==="有衝突"?"全部":"有衝突")} aria-pressed={scheduleFilter==="有衝突"}><ScheduleSummaryIcon kind="conflict"/><span>排程衝突</span><strong>{conflicts}</strong></button><button type="button" className={`template-kpi schedule-kpi-button summary-tile ${scheduleFilter==="已排程"?"selected":""}`} onClick={()=>setScheduleFilter(scheduleFilter==="已排程"?"全部":"已排程")} aria-pressed={scheduleFilter==="已排程"}><ScheduleSummaryIcon kind="scheduled"/><span>已排程</span><strong>{scheduled}</strong></button><button type="button" className={`template-kpi schedule-kpi-button summary-tile ${scheduleFilter==="試驗中"?"selected":""}`} onClick={()=>setScheduleFilter(scheduleFilter==="試驗中"?"全部":"試驗中")} aria-pressed={scheduleFilter==="試驗中"}><ScheduleSummaryIcon kind="running"/><span>試驗中</span><strong>{testing}</strong></button><div className="template-kpi equipment-activity-kpi" tabIndex={0} aria-describedby="schedule-activity-period" title={`台灣時間 ${activity.from} 至 ${activity.to}；依排程時數估算，重疊時段去除重複。`}><ScheduleSummaryIcon kind="activity"/><span>設備稼動率</span><strong>{activity.rate}%</strong><small className="schedule-activity-period" id="schedule-activity-period">統計 {activity.days} 天 · {activity.from} — {activity.to}</small></div></div>{notice&&<div className="template-notice">{notice}<button className="notice-close" onClick={()=>setNotice("")}>×</button></div>}<ScheduleViews rows={activeScheduleRows} accounts={accounts} equipment={equipmentCatalog} now={scheduleNow} status={scheduleFilter} search={scheduleSearch} onSearch={setScheduleSearch} onClear={()=>{setScheduleSearch('');setScheduleFilter('全部');}} onRequest={openRequestInfo} onEdit={openEditor} /><div className="template-info">點選任一筆「編輯排程」，即可查看對應的試驗委託單內容，並填寫樣品編號、選擇設備、開始日期、預計完成日期及負責工程師。目前為前端 Demo；設備稼動率依區間內試驗排程時數／設備日曆總時數估算，並非實測開機時數；規則僅供流程驗證，尚未接正式資料庫。</div></div>
 {showGantt&&<div className="workspace-subpage"><section className="workspace-subpage-panel gantt-modal" role="region" aria-labelledby="schedule-gantt-title"><header className="request-modal-header"><div><div className="help-title-row"><h3 id="schedule-gantt-title">排程管理圖表</h3><HelpTip>分頁檢視設備或人力排程；可瀏覽過去與未來日期</HelpTip></div></div><button type="button" className="request-modal-close" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:1,padding:0}} aria-label="關閉排程管理圖表" onClick={()=>setShowGantt(false)}>×</button></header><div className="request-modal-body"><div className="gantt-tabs" role="tablist" aria-label="甘特圖類型"><button type="button" role="tab" aria-selected={ganttTab==="equipment"} className={ganttTab==="equipment"?"active":""} onClick={()=>setGanttTab("equipment")}>設備排程甘特圖</button><button type="button" role="tab" aria-selected={ganttTab==="people"} className={ganttTab==="people"?"active":""} onClick={()=>setGanttTab("people")}>人力排程甘特圖</button></div><div className="gantt-controls"><button type="button" className="template-btn secondary" onClick={()=>{const d=new Date(ganttStartDate+"T00:00:00");d.setDate(d.getDate()-ganttDays);setGanttStartDate(d.toISOString().slice(0,10))}}>← 前一段</button><label>起始日期 <input type="date" value={ganttStartDate} onChange={e=>e.target.value&&setGanttStartDate(e.target.value)}/></label><label>顯示天數 <select value={ganttDays} onChange={e=>setGanttDays(Number(e.target.value))}><option value={7}>7 天</option><option value={14}>14 天</option><option value={30}>30 天</option><option value={60}>60 天</option><option value={90}>90 天</option></select></label><button type="button" className="template-btn secondary" onClick={()=>{const d=new Date(ganttStartDate+"T00:00:00");d.setDate(d.getDate()+ganttDays);setGanttStartDate(d.toISOString().slice(0,10))}}>下一段 →</button><button type="button" className="template-btn secondary" onClick={()=>setGanttStartDate(new Date().toISOString().slice(0,10))}>回到今天</button></div><div className="gantt-summary"><span><i className={`gantt-legend ${ganttTab}`}/>{ganttTab==="equipment"?"設備占用時段":"工程師工作時段"}</span><span><i className="gantt-legend conflict"/>衝突／待確認</span><small>{ganttStartDate} 至 {(()=>{const d=new Date(ganttStartDate+"T00:00:00");d.setDate(d.getDate()+ganttDays-1);return d.toISOString().slice(0,10)})()}（Demo）</small></div><div className="gantt-scroll"><div className="gantt-board"><div className="gantt-axis" style={{gridTemplateColumns:`190px repeat(${ganttDays}, minmax(${ganttDays>30?36:58}px,1fr))`}}><div className="gantt-lane-label">{ganttTab==="equipment"?"設備":"工程師"}</div>{Array.from({length:ganttDays},(_,i)=>{const d=new Date(ganttStartDate+"T00:00:00");d.setDate(d.getDate()+i);return <div className="gantt-day" key={i}>{`${d.getMonth()+1}/${d.getDate()}`}<small>{["日","一","二","三","四","五","六"][d.getDay()]}</small></div>})}</div>{(()=>{const kind=ganttTab;const lanes=kind==="equipment"?equipmentCatalog.filter(machine=>activeScheduleRows.some(row=>usesEquipment(row,machine))).map(machine=>machine.name):[...new Set(activeScheduleRows.map(row=>row.owner).filter(Boolean))];const base=new Date(ganttStartDate+"T00:00:00");const range=ganttDays*24*60*60*1000;return <div className="gantt-group">{lanes.length===0?<div className="gantt-empty">目前沒有可顯示的{kind==="equipment"?"設備":"人力"}排程。</div>:lanes.map(lane=>{const tasks=activeScheduleRows.filter(r=>(kind==="equipment"?usesEquipment(r,equipmentCatalog.find(machine=>machine.name===lane)):r.owner===lane)&&r.time&&r.end);return <div className="gantt-row" key={lane} style={{gridTemplateColumns:`190px minmax(0,1fr)`}}><div className="gantt-lane-label" title={lane}>{lane}</div><div className="gantt-track" style={{backgroundSize:`${100/ganttDays}% 100%`,backgroundImage:`repeating-linear-gradient(to right,transparent 0,transparent calc(${100/ganttDays}% - 1px),#e8edf4 calc(${100/ganttDays}% - 1px),#e8edf4 ${100/ganttDays}%)`}}>{tasks.map(r=>{const start=new Date(r.time),end=new Date(r.end);const left=Math.max(0,Math.min(100,((start-base)/range)*100));const right=Math.max(left+Math.min(1,100/ganttDays),Math.min(100,((end-base)/range)*100));if(end<base||start>=new Date(base.getTime()+range))return null;return <button type="button" key={r.id} className={`gantt-task ${kind} ${r.status==="有衝突"?"is-conflict":""}`} style={{left:`${left}%`,width:`${Math.max(0.5,right-left)}%`}} title={`${r.id}｜${r.title}｜${r.time}–${r.end}`} onClick={()=>{setShowGantt(false);openEditor(r)}}>{r.title}</button>})}</div></div>})}</div>})()}</div></div><div className="gantt-footnote"><strong>排程判讀提醒</strong><HelpTip>可透過起始日期與日期跨度瀏覽任意過去或未來區間；左右切換不受目前 Demo 日期限制。甘特圖依現有排程資料繪製，點擊任務可開啟既有排程編輯。尚未接上正式資料庫的排程衝突計算與最佳化引擎。</HelpTip></div></div></section></div>}
 {showScheduleHistory&&<div className="workspace-subpage"><section className="workspace-subpage-panel history-modal schedule-history-modal" role="region" aria-labelledby="schedule-history-title"><div className="request-modal-header"><div><div className="help-title-row"><h3 id="schedule-history-title">歷史排程</h3><HelpTip>依排程管理狀態查詢排程紀錄；此處僅供檢視。</HelpTip></div></div><button className="request-modal-close" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:1,padding:0}} aria-label="關閉歷史排程" onClick={()=>setShowScheduleHistory(false)}>×</button></div><div className="request-modal-body"><div className="template-toolbar history-toolbar"><input className="template-input" value={scheduleSearch} onChange={e=>setScheduleSearch(e.target.value)} placeholder="搜尋委託編號、產品代碼、試驗項目或設備…"/><select className="template-select" value={historyScheduleFilter} onChange={e=>setHistoryScheduleFilter(e.target.value)}>{[{value:"全部",label:"全部"},{value:"已排程",label:"已排程"},{value:"試驗中",label:"試驗中"},{value:"已完成",label:"已完成"},{value:"取消",label:"已取消"},{value:"未排程",label:"待排程"},{value:"有衝突",label:"排程衝突"}].map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></div><div className="template-table-wrap history-table-wrap"><PaginatedTable resetKey={`${scheduleSearch}:${historyScheduleFilter}`} className="template-table"><thead><tr>{["委託編號","產品代碼","樣品編號","試驗項目","設備","執行人","試驗日程","狀態"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{historyScheduleRows.filter(r=>(historyScheduleFilter==="全部"||r.status===historyScheduleFilter)&&[r.requestId,r.id,r.productCode,r.title,r.eq,r.owner,r.status].some(value=>String(value||"").toLowerCase().includes(scheduleSearch.trim().toLowerCase()))).map(r=><tr key={r.id}><td><button type="button" className="request-id-link" onClick={() => openRequestInfo(r)}>{r.requestId || "未關聯委託"}</button></td><td>{r.productCode||"—"}</td><td>{r.sampleCode||"—"}</td><td>{r.title}</td><td>{r.eq}</td><td>{r.owner}</td><td><ScheduleTimeline row={r}/></td><td><span className={`template-status status-${r.status}`}>{r.status==="未排程"?"待排程":r.status==="有衝突"?"排程衝突":r.status}</span></td></tr>)}</tbody></PaginatedTable>{!historyScheduleRows.filter(r=>(historyScheduleFilter==="全部"||r.status===historyScheduleFilter)&&[r.requestId,r.id,r.productCode,r.title,r.eq,r.owner,r.status].some(value=>String(value||"").toLowerCase().includes(scheduleSearch.trim().toLowerCase()))).length&&<div className="template-empty">此分類目前沒有歷史排程</div>}</div></div></section></div>}
 {editing&&editForm&&<div className="request-modal-backdrop schedule-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setEditing(null);setEditForm(null);}}}><section className="request-modal schedule-edit-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-edit-title"><header className="request-modal-header"><div><h3 id="schedule-edit-title">編輯試驗排程｜{editing.requestId}</h3><ScheduleEditStatus row={editing} now={scheduleNow}/></div><button className="request-modal-close" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:1,padding:0}} aria-label="關閉" onClick={()=>{setEditing(null);setEditForm(null);}}>×</button></header><div className="request-modal-body schedule-edit-body"><details className="schedule-request-details"><summary>試驗資訊<small>{editing.requestId} · 點擊展開／收合</small></summary><div className="request-form-preview schedule-request-preview"><h4><span>1</span> 產品資訊 <small>Product Information</small></h4><div className="request-preview-grid"><div><label>產品代碼</label><strong>{editing.productCode||"—"}</strong></div><div><label>產品類型</label><strong>{editing.productType||"—"}</strong></div><div><label>客戶名稱</label><strong>{editing.customer||"—"}</strong></div><div><label>客戶品番</label><strong>{editing.customerPart||"—"}</strong></div><div><label>需求日期</label><strong>{editing.requestedDate||"—"}</strong></div><div><label>測試數量</label><strong>{editing.quantity||"—"} pcs</strong></div></div><h4><span>2</span> 試驗目的 <small>Test Intention</small></h4><p className="request-preview-tags">{String(editing.intent||"—").split(/[,，、]/).map((x,i)=><span key={i}>{x.trim()}</span>)}</p><h4><span>3</span> 樣品來源 <small>Sample Source</small></h4><p className="request-preview-tags">{String(editing.sampleSource||"—").split(/[,，、]/).map((x,i)=><span key={i}>{x.trim()}</span>)}</p><h4><span>4</span> 樣品資訊 <small>Sample Information</small></h4><div className="request-preview-grid"><div><label>產品版本</label><strong>{editing.productVersion||"—"}</strong></div><div><label>PCBA 版本</label><strong>{editing.pcbaVersion||"—"}</strong></div><div><label>軟體版本</label><strong>{editing.softwareVersion||"—"}</strong></div><div><label>製造日期</label><strong>{editing.manufactureDate||"—"}</strong></div></div><h4><span>5</span> 試驗規範／試驗手法 <small>Test Specification / Test Method</small></h4><div className="request-preview-text">{editing.testSpec||editing.title||"—"}</div><h4><span>6</span> 判定基準 <small>Judgment Criteria</small></h4><div className="request-preview-text">{editing.judgment||"—"}</div><h4><span>7</span> 備註／簽核 <small>Note / Approval</small></h4><div className="request-preview-text">{editing.remarks||"—"}</div></div></details><ScheduleArrangement editing={editing} form={editForm} onChange={setEditForm} equipment={equipmentCatalog} accounts={accounts} onRecommend={autoScheduleCurrent} message={scheduleMessage} onRefresh={refreshEquipment} /><div className="template-form-actions schedule-edit-actions">{<button type="button" className="template-btn secondary" disabled={!trialPauseAvailability(currentUser,editing,scheduleNow).enabled} onClick={()=>{const paused=!editing.pauseStartedAt;if(!window.confirm(paused?'確定暫停試驗？設備將暫停占用，預估結束時間隨暫停時間往後順延。':'確定恢復試驗？暫停期間會計入預估結束時間。'))return;try{setTrialPaused({scheduleId:editing.id,actorId:currentUser?.id,paused});for(const name of ['dqa:schedules-updated','dqa:equipment-updated','dqa:review-updated'])window.dispatchEvent(new Event(name));setEditing(null);setEditForm(null);setNotice(paused?'試驗與設備已暫停。':'試驗與設備已恢復，預估結束時間已順延。');}catch(error){setScheduleMessage(error.message);}}}>{editing.pauseStartedAt?'恢復試驗':'暫停試驗'}</button>}<button type="button" className="template-btn danger" disabled={isActiveTrial({...editing,status:effectiveScheduleStatus(editing,scheduleNow)})&&!canControlTrial(currentUser)} onClick={()=>{setStopError('');setShowStopDialog(true);}}>中止排程</button><button className="template-btn schedule-save-button" disabled={isActiveTrial({...editing,status:effectiveScheduleStatus(editing,scheduleNow)})&&!canControlTrial(currentUser)} onClick={saveSchedule}>儲存排程</button></div></div></section></div>}
 {showStopDialog && editing && <StopScheduleDialog requestId={editing.requestId} onClose={()=>setShowStopDialog(false)} onConfirm={confirmStopSchedule} error={stopError} />}
 {requestInfo && <RequestInfoModal account={currentUser} request={requestInfo} onClose={() => setRequestInfo(null)} />}</section>;
}

function DashboardPage({
  path,appNavigate,

  dark,

  onToggle,

  onLogout,
  onHome,

  accounts,

  setAccounts,

  currentUser,

}) {

  const lifecycleError=useScheduleLifecycle();
  const routePage=path.split('/')[2]||'dashboard';
  const subPage=path.endsWith('/history')?'history':path.endsWith('/chart')?'chart':null;
  const subLabel=subPage==='chart'?'排程管理圖表':routePage==='requests'?'歷史委託':'歷史排程';
  const [active, setActive] = useState(routePage);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarMobile=useSidebarMobile(900);
  const [notificationFilter, setNotificationFilter] = useState(()=>new URLSearchParams(window.location.search).get('filter'));

  // 全 Dashboard 共用 AI 排程助理，切換側邊頁面時仍保持可用。
  function navigate(id, filter = null) {
    if(!canAccessLmsPage(currentUser,id))return;
    setActive(id);
    setNotificationFilter(filter);
    setSidebarOpen(false);
    appNavigate(`/lms/${id}${filter?'?filter='+encodeURIComponent(filter):''}`);
  }

  const {snapshot: liveSnapshot, metrics: liveMetrics}=useLabView();
  const updatePendingReviewNotificationCount=useCallback(()=>{},[]);
  const updateScheduleNotificationCounts=useCallback(()=>{},[]);
  const reportNotifications=useReportSnapshot();
  const baseNotificationCounts=labNotificationCounts(liveSnapshot.requests,liveMetrics.counts);
  const notificationCounts={...baseNotificationCounts,pendingReview:baseNotificationCounts.pendingReview+liveSnapshot.labOperations.filter(row=>row.status==='待審核').length+liveSnapshot.borrows.filter(row=>['待確認','待核准'].includes(row.status)).length+reportNotifications.filter(row=>['level2','level3'].includes(row.stage)).length};

  return (

    <div className={`dashboard-shell lms-enterprise ${dark ? "theme-dark" : "theme-light"} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${active === "schedule" ? "is-schedule-page" : ""} ${subPage?"lms-child-page":""}`}>

      <Sidebar

        currentUser={currentUser}
        active={active}

        onNavigate={navigate}

        onHome={onHome}

        open={sidebarOpen}

      />



      <main className="dashboard-main">

        <DashboardTopbar

          dark={dark}

          onToggle={onToggle}

          sidebarExpanded={sidebarMobile?sidebarOpen:!sidebarCollapsed}
          onMenu={() => { if (sidebarMobile) setSidebarOpen(value=>!value); else setSidebarCollapsed(value => !value); }}

          onLogout={onLogout}
          onNavigate={navigate}
          currentUser={currentUser}
          notificationCounts={notificationCounts}
        ><nav className="lms-breadcrumbs" aria-label="麵包屑"><button type="button" onClick={onHome}>首頁</button><span aria-hidden="true">›</span><button type="button" onClick={()=>navigate('dashboard')}>實驗室管理系統</button><span aria-hidden="true">›</span>{subPage?<><button type="button" onClick={()=>navigate(active)}>{NAV_ITEMS.find(item=>item.id===active)?.label}</button><span aria-hidden="true">›</span><strong aria-current="page">{subLabel}</strong></>:<strong aria-current="page">{NAV_ITEMS.find(item=>item.id===active)?.label||'儀表板'}</strong>}</nav></DashboardTopbar>



        <div className="dashboard-content">{active==='dashboard'&&<div className="lms-dashboard-heading"><h1><LmsSidebarIcon name="dashboard"/>儀表板</h1><p>試驗進度與設備使用概況</p></div>}{lifecycleError && <div className="template-notice" role="alert">{lifecycleError}</div>}

          {!canAccessLmsPage(currentUser,active)? <div className="template-info">此角色無權使用此功能。</div> : active === "archive" ? <ReportArchive actor={currentUser} system="lms"/> : active === "requests" ? (
            <RequestsPage subPage={subPage} initialFilter={notificationFilter} onPendingReviewCountChange={updatePendingReviewNotificationCount} currentUser={currentUser} />
          ) : active === "schedule" ? (
            <SchedulePage subPage={subPage} currentUser={currentUser} accounts={accounts} initialFilter={notificationFilter} onScheduleCountsChange={updateScheduleNotificationCounts} />
          ) : active === "equipment" ? (
            <EquipmentPage currentUser={currentUser} />
          ) : active === "maintenance" ? (
            <MaterialsPage currentUser={currentUser} />
          ) : active === "accounts" ? (

            canManageAccounts(currentUser) ? <AccountManagement currentUser={currentUser}

              accounts={accounts}

              setAccounts={setAccounts}

            /> : <div className="template-info">帳號管理僅供系統管理員、二階主管或授權角色使用。</div>

          ) : active === "dashboard" ? (

            <LiveDashboard currentUser={currentUser} onNavigate={navigate} />

          ) : (

            active === 'reports' ? <LabReports /> : active === 'settings' ? <LabSettings focusSection={notificationFilter} onNavigate={navigate} onHome={onHome} /> : <LiveDashboard currentUser={currentUser} onNavigate={navigate} />

          )}

        </div>

        <IntelligentAssistant snapshot={liveSnapshot} metrics={liveMetrics}/>

      </main>

    </div>

  );

}



export default function App({ path, navigate }) {

  const {dark,toggleTheme}=useSystemTheme();


  const [accounts, setAccounts] = useState(() => {
    const saved = readDemoAccounts();
    const stored = !window.localStorage.getItem("dqa-report-level3-migration-v1")&&!saved.some(row=>row.role==="三階主管")?[...saved,{id:"DEMO-LEVEL3",name:"示範三階主管",email:"level3@example.com",role:"三階主管",department:"DQA 實驗室",status:"啟用中",lastLogin:"尚未登入"}]:saved;
    return window.localStorage.getItem("dqa-admin-huang-migration-v1") ? stored : stored.map(a => a.id === "U001" && a.email === "huangxm@example.com" && a.name === "黃小明" ? { ...a, role: "系統管理員" } : a);
  });
  useEffect(() => { window.localStorage.setItem("dqa-shared-demo-accounts-v1", JSON.stringify(accounts)); window.localStorage.setItem("dqa-admin-huang-migration-v1", "1"); window.localStorage.setItem("dqa-report-level3-migration-v1","1"); }, [accounts]);

  const [,refreshRoles]=useState(0);useEffect(()=>{const refresh=event=>{if(event.type==='storage'&&event.key==='dqa-shared-demo-accounts-v1')setAccounts(readDemoAccounts());refreshRoles(value=>value+1);};window.addEventListener('dqa:roles-updated',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('dqa:roles-updated',refresh);window.removeEventListener('storage',refresh);};},[]);
  const [currentUserId, setCurrentUserId] = useState(() => {
    try { return window.sessionStorage.getItem('dqa-lms-account-id') || ''; } catch { return ''; }
  });
  const currentUser = accounts.find(account => account.id === currentUserId && accessSystem(account, 'lms')) || null;
  useEffect(() => {
    const valid=[...NAV_ITEMS.map(item=>'/lms/'+item.id),'/lms/requests/history','/lms/schedule/history','/lms/schedule/chart'];
    if (path !== '/lms/login' && !valid.includes(path)) navigate('/lms/login', true);
    else if (valid.includes(path) && !currentUser) navigate('/lms/login', true);
    else if(path==='/lms/login'&&currentUser)navigate('/lms/dashboard',true);
  }, [path, currentUser, navigate]);

  const [selectedSystem, setSelectedSystem] = useState(null);





  // 通用表格排序：所有頁面中的表格欄位皆可點擊排序，文字採自然排序，數字與日期依數值排序。
  useEffect(() => {
    const handleTableHeaderClick = (event) => {
      const th = event.target.closest("th");
      if (!th) return;
      const table = th.closest("table");
      const row = th.closest("tr");
      if (!table || !row || !table.tBodies.length) return;
      const columnIndex = Array.from(row.children).indexOf(th);
      if (columnIndex < 0 || ["操作","Actions"].includes(th.textContent.trim())) return;

      const tbody = table.tBodies[0];
      const rows = Array.from(tbody.rows);
      const direction = th.dataset.sortDirection === "asc" ? "desc" : "asc";
      row.querySelectorAll("th").forEach((header) => {
        if (header !== th) {
          delete header.dataset.sortDirection;
          header.removeAttribute("aria-sort");
        }
      });
      th.dataset.sortDirection = direction;
      th.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      if (rows.length < 2) return;

      const parseValue = (value) => {
        const text = value.trim().replace(/,/g, "");
        if (!text) return { type: "text", value: "" };
        const date = Date.parse(text.replace(/年|月/g, "-").replace(/日/g, ""));
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text) && !Number.isNaN(date)) return { type: "number", value: date };
        const numeric = text.match(/^-?\d+(?:\.\d+)?%?$/);
        if (numeric) return { type: "number", value: Number(text.replace("%", "")) };
        return { type: "text", value: text.toLocaleLowerCase("zh-TW") };
      };

      rows.sort((a, b) => {
        const av = parseValue(a.cells[columnIndex]?.innerText || "");
        const bv = parseValue(b.cells[columnIndex]?.innerText || "");
        let result;
        if (av.type === "number" && bv.type === "number") result = av.value - bv.value;
        else result = String(av.value).localeCompare(String(bv.value), "zh-TW", { numeric: true, sensitivity: "base" });
        return direction === "asc" ? result : -result;
      });
      rows.forEach((item) => tbody.appendChild(item));
    };

    document.addEventListener("click", handleTableHeaderClick);
    return () => document.removeEventListener("click", handleTableHeaderClick);
  }, []);

  function enterSystem(system) {
    // 四個入口由最外層 App.jsx 統一分流；只 pushState 不會觸發外層 React 更新，
    // 因此改用明確路由並重新載入，避免點擊後仍停留在錯誤的登入頁。
    const routeBySystem = {
      lms: "/lms/login",
      request: "/request/login",
      lab: "/lab/login",
      validation: "/validation/login",
    };
    const targetPath = routeBySystem[system?.id];
    if (!targetPath) return;
    window.location.assign(targetPath);
  }



  function returnHome() {
    // 返回入口首頁需要讓最外層 App.jsx 接手路由，不能只修改 history。
    navigate("/");
  }



  function handleLogin(email, password, setError) {

    const account = accounts.find(

      (item) =>

        item.email.toLowerCase() === email.toLowerCase() &&

        item.status === "啟用中"

    );



    if (!account) {

      setError(

        "找不到此啟用中的 Demo 帳號。請使用示範帳號登入。"

      );

      return;

    }



    // 本機 Demo 驗證。正式版不得使用此方式驗證密碼。

    const validDemoAccount =

      accessSystem(account, "lms") && password === DEMO_PASSWORD;



    if (!validDemoAccount) {

      setError(

        "帳號沒有 LMS 權限，或密碼不正確。"

      );

      return;

    }



    try { startSession('lms',account.id); }
    catch { setError('瀏覽器禁止保存登入狀態，請允許本機儲存後再試。'); return; }
    setCurrentUserId(account.id);
    navigate('/lms/dashboard');

  }



  function logout() {

    try { endSession('lms'); } catch { /* State still clears in this tab. */ }
    setCurrentUserId('');

    setSelectedSystem(null);

    navigate("/lms/login", true);

  }







  if (currentUser && path.startsWith("/lms/") && path!=="/lms/login") {

    return (

      <DashboardPage key={path} path={path} appNavigate={navigate}

        dark={dark}

        onToggle={toggleTheme}

        onLogout={logout}
        onHome={returnHome}

        accounts={accounts}

        setAccounts={setAccounts}

        currentUser={currentUser}

      />

    );

  }



  if (path.endsWith("/login")) {

    const systemId = path.split("/")[1];



    const systems = {

      lms: {

        id: "lms",

        title: "DQA LMS",

      },

      request: {

        id: "request",

        title: "電子委託單系統",

      },

      lab: {

        id: "lab",

        title: "造隆實驗室系統",

      },

      validation: {

        id: "validation",

        title: "驗證計畫",

      },

    };



    const system =

      selectedSystem || systems[systemId] || systems.lms;



    return (

      <LoginPage

        system={system}

        dark={dark}

        onToggle={toggleTheme}

        onLogin={handleLogin}

        onBack={returnHome}

      />

    );

  }



  return (

    <HomePage

      dark={dark}

      onToggle={toggleTheme}

      onEnter={enterSystem}

    />

  );

}
