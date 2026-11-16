import {deriveAdminReminders} from './adminOperations.mjs';
import useAdminSettings from './useAdminSettings.js';
import AdminCenterCards from './AdminCenterCards.jsx';
import './SettingsCompact.css';
import {LoginSystemIcon} from './EnterpriseLoginLayout.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import HelpTip from './HelpTip.jsx';
import './ManagementPages.css';
import {useEffect,useState} from 'react';
import useLabView from './useLabView.js';
import {refreshLabSnapshot} from './useLabSnapshot.js';
import {LabRecordTable,SourceNotes} from './LabPanels.jsx';
const targets={labWorkItems:'requests',labAudit:'requests',borrows:'requests',labOperations:'requests',schedules:'schedule',equipment:'equipment',materials:'maintenance',reviews:'requests',electronic:'requests',accounts:'accounts'};
function SettingsSectionHeading({icon,title,detail}){
 return <><span className="settings-section-icon" aria-hidden="true"><LmsSidebarIcon name={icon}/></span><span className="settings-section-label">{title}</span><span className="settings-section-description">{detail}</span><svg className="settings-section-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></>;
}
export default function LabSettings({onNavigate,focusSection,account,onOpenModule}){
 const {snapshot,metrics,now}=useLabView();
 const {data:adminData}=useAdminSettings();
 const workspace=adminData?.settings.organization.company&&!adminData.settings.organization.company.startsWith('Demo ')?adminData.settings.organization.company:'DQA Smart Lab';
 useEffect(()=>{if(focusSection==='activity')onOpenModule('parameters?section=activity');},[focusSection,onOpenModule]);
 const [checked,setChecked]=useState('');
 const sources=snapshot.sources.map(row=>({...row,size:`${(row.bytes/1024).toFixed(1)} KB`,status:row.error||row.origin}));
 const failures=sources.filter(row=>row.error).length;
 const reminders=deriveAdminReminders(snapshot,metrics,adminData?.settings.notifications,now).filter(r=>r.enabled&&(r.count>0||r.count===null));
 const backup=adminData?.settings.backup,localNow=new Date(now+8*3600000);
 const backupDue=backup?.enabled&&backup.frequency!=='manual'&&localNow.toISOString().slice(11,16)>=backup.time&&(backup.frequency!=='weekly'||localNow.getUTCDay()===1);
 return <section className="panel generic-page management-page settings-management"><div className="template-page">
  <div className="template-heading management-heading admin-home-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="settings"/>系統管理</h2><HelpTip>調整介面外觀、確認資料健康狀態，集中查看需要處理的提醒。</HelpTip></div><p className="settings-page-description">管理設定、資料來源與運行狀態，一處掌握。</p></div><button type="button" className="management-primary" onClick={()=>{refreshLabSnapshot();setChecked(new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M18 17a7 7 0 0 1-12 1l-2-3"/></svg>重新檢查</button></div>
  {checked&&<p className="management-notice" role="status">已於 {checked}（台灣時間）重新讀取本機資料。</p>}
  <section className="admin-workspace-hero"><div><span className="admin-eyebrow">LABORATORY CONTROL CENTER</span><h3>{workspace}</h3><p>從日常管理到服務監控，讓每一項設定都有資料依據。</p><div className="admin-actions"><span className="admin-hero-pill">目前瀏覽器工作區</span><span className="admin-hero-pill">Asia / Taipei</span></div></div><div className="admin-hero-decoration" aria-hidden="true"><LmsSidebarIcon name="settings"/></div></section>
  <section className="settings-overview" aria-labelledby="settings-overview-title"><h3 id="settings-overview-title">資料概況</h3><dl className="settings-health-list"><div><dt><LmsSidebarIcon name="archive"/>資料來源</dt><dd>{sources.length} <small>項</small></dd></div><div><dt><LoginSystemIcon kind="shield"/>來源讀取異常</dt><dd className={failures?'settings-health-warning':''}>{failures} <small>項</small></dd></div><div><dt><LmsSidebarIcon name="notifications"/>工作提醒</dt><dd>{metrics.issues.length} <small>項</small></dd></div><div><dt><LmsSidebarIcon name="reports"/>來源資料大小</dt><dd>{(sources.reduce((sum,row)=>sum+row.bytes,0)/1024).toFixed(1)} <small>KB</small></dd></div></dl></section>
  {backupDue&&<div className="admin-feature-callout"><div><span className="admin-eyebrow">BACKUP REMINDER</span><h3>已到管理設定備份提醒時間</h3><p>前往下載設定檔並保存在安全位置；此提醒不代表已執行自動備份。</p></div><button className="template-btn" onClick={()=>onOpenModule('backup')}>前往設定備份</button></div>}
  {reminders.length>0&&<section className="admin-home-reminders" aria-label="已啟用的站內提醒"><h3>需要留意的工作</h3><div className="admin-actions">{reminders.map(r=><button className="template-btn" type="button" key={r.id} onClick={()=>r.target==='ai'?onOpenModule('ai'):onNavigate(r.target)}>{r.label} · {r.count===null?'請查核':r.count+' 項'}</button>)}</div></section>}
  <AdminCenterCards account={account} onOpen={onOpenModule}/>
  <details className="management-fold"><summary><SettingsSectionHeading icon="archive" title="資料來源健檢" detail={`${sources.length} 個來源 · ${failures} 項異常`}/></summary><div className="settings-fold-body"><p>顯示目前瀏覽器的來源快照；點選來源名稱前往對應管理頁。大小僅計算列出的來源，不代表完整瀏覽器儲存用量。</p><LabRecordTable columns={[{key:'label',label:'資料來源'},{key:'count',label:'筆數'},{key:'status',label:'讀取狀態'},{key:'size',label:'資料大小'}]} rows={sources} onSelect={row=>onNavigate(targets[row.id]||'dashboard')}/></div></details>
  <details className="management-fold"><summary><SettingsSectionHeading icon="notifications" title="待處理工作提醒" detail={`${metrics.issues.length} 項`}/></summary><div className="settings-fold-body"><p>集中檢視排程衝突、校驗與庫存提醒，點選項目即可前往處理。</p><LabRecordTable columns={[{key:'type',label:'提醒類型'},{key:'detail',label:'內容'}]} rows={metrics.issues} onSelect={row=>onNavigate(targets[row.target]||'schedule')}/></div></details>
  <details className="management-fold"><summary><SettingsSectionHeading icon="review" title="系統規則與資料說明" detail="儲存 · 日期 · 分頁"/></summary><div className="settings-fold-body"><dl className="settings-rules-list"><div><dt>資料儲存</dt><dd><strong>目前瀏覽器</strong><p>同一網站來源共用 localStorage 與 IndexedDB，清除網站資料會影響 Demo 內容。</p></dd></div><div><dt>日期與排程</dt><dd><strong>Asia / Taipei</strong><p>依已儲存日程推進狀態；排程時間與匯出摘要使用台灣時間。</p></dd></div></dl><SourceNotes snapshot={snapshot}/></div></details>

 </div></section>;
}
