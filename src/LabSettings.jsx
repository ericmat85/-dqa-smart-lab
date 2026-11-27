import {originalBusinessEnabled} from './originalBusiness.mjs';
import {businessClient} from './businessClient.mjs';
import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import {deriveAdminReminders} from './adminOperations.mjs';
import useAdminSettings from './useAdminSettings.js';
import AdminCenterCards,{AdminModuleNav} from './AdminCenterCards.jsx';
import './SettingsCompact.css';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import HelpTip from './HelpTip.jsx';
import './ManagementPages.css';
import {useEffect,useState} from 'react';
import useLabView from './useLabView.js';
import {refreshLabSnapshot} from './useLabSnapshot.js';
export default function LabSettings({onNavigate,focusSection,account,onOpenModule}){
 const {snapshot,metrics,now}=useLabView();
 const {data:adminData}=useAdminSettings();
 const connected=originalBusinessEnabled();
 const [sharedProfile,setSharedProfile]=useState(null);
 useEffect(()=>{if(!connected)return;let active=true;businessClient.request('/access?section=profile').then(packet=>{if(active)setSharedProfile({accountId:account?.id,configuration:packet.data?.configuration});}).catch(()=>{if(active)setSharedProfile({accountId:account?.id,configuration:null});});return()=>{active=false;};},[connected,account?.id]);
 const profile=sharedProfile?.accountId===account?.id?sharedProfile?.configuration:null;
 const workspace=connected?(profile?.workspaceName||'工作區資料待確認'):adminData?.settings.organization.company&&!adminData.settings.organization.company.startsWith('Demo ')?adminData.settings.organization.company:'DQA Smart Lab';
 useEffect(()=>{if(focusSection==='activity')onOpenModule('parameters?section=activity');},[focusSection,onOpenModule]);
 const [checked,setChecked]=useState('');
 const reminders=deriveAdminReminders(snapshot,metrics,adminData?.settings.notifications,now).filter(r=>r.enabled&&(r.count>0||r.count===null));
 const backup=adminData?.settings.backup,localNow=new Date(now+8*3600000);
 const backupDue=backup?.enabled&&backup.frequency!=='manual'&&localNow.toISOString().slice(11,16)>=backup.time&&(backup.frequency!=='weekly'||localNow.getUTCDay()===1);
 const heading=(<div className="template-heading management-heading admin-home-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="settings"/>系統管理</h2><HelpTip>調整介面外觀、確認資料健康狀態，集中查看需要處理的提醒。</HelpTip></div></div><button type="button" className="management-primary" onClick={()=>{refreshLabSnapshot();setChecked(new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));}}><LmsHeaderActionLabel icon="refresh"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M18 17a7 7 0 0 1-12 1l-2-3"/></svg>重新檢查</LmsHeaderActionLabel></button></div>);
 const checkedNotice=(checked&&<p className="management-notice" role="status">已於 {checked}（台灣時間）重新讀取本機資料。</p>);
 const hero=(<section className="admin-workspace-hero"><div><span className="admin-eyebrow">LABORATORY CONTROL CENTER</span><h3>{workspace}</h3><div className="admin-actions"><span className="admin-hero-pill">{connected?'目前登入工作區':'目前瀏覽器工作區'}</span><span className="admin-hero-pill">{connected?(profile?.timeZone||'顯示時區待確認'):'Asia / Taipei'}</span></div></div><div className="admin-hero-decoration" aria-hidden="true"><LmsSidebarIcon name="settings"/></div></section>);
 const content=(<>{backupDue&&<div className="admin-feature-callout"><div><span className="admin-eyebrow">BACKUP REMINDER</span><h3>已到管理設定備份提醒時間</h3><p>前往下載設定檔並保存在安全位置；此提醒不代表已執行自動備份。</p></div><button className="template-btn" onClick={()=>onOpenModule('backup?section=backup')}>前往設定備份</button></div>}
  {reminders.length>0&&<section className="admin-home-reminders" aria-label="已啟用的站內提醒"><h3>需要留意的工作</h3><div className="admin-actions">{reminders.map(r=><button className="template-btn" type="button" key={r.id} onClick={()=>r.target==='ai'?onOpenModule('ai'):onNavigate(r.target)}>{r.label} · {r.count===null?'請查核':r.count+' 項'}</button>)}</div></section>}
  <AdminCenterCards account={account} onOpen={onOpenModule}/></>);
 return <section className="panel generic-page management-page settings-management"><div className="template-page"><AdminModuleNav account={account} active="overview" onOpen={onOpenModule}/><div id="admin-module-panel" className="admin-overview-panel" role="tabpanel" aria-labelledby="admin-module-tab-overview"><div className="admin-overview-intro">{heading}{checkedNotice}{hero}</div><div className="admin-home-content">{content}</div></div></div></section>;
}
