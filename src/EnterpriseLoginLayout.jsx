import {useState} from 'react';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import {PORTAL_TITLES} from './portalLabels.mjs';
import './EnterpriseLogin.css';
const COPYRIGHT_YEAR=new Date().getFullYear();
const details={
 lms:{name:'實驗室管理',description:'審查需求・安排資源・掌握試驗進度',features:['委託審查','設備排程','狀態監控','報告管理'],icon:'lab'},
 lab:{name:'造隆實驗室',description:'試驗執行・設備管理・排程監控\n報告處理・數據追溯',features:['試驗執行','設備排程','狀態監控','報告管理'],icon:'lab'},
 request:{name:'電子委託單',description:'委託申請・簽核流程・進度追蹤\n文件管理・試驗報告',features:['委託申請','簽核流程','進度追蹤','文件管理'],icon:'document'},
 validation:{name:'設計品質管理',description:'文件控管・品質審查・異常管理\n稽核追溯・法規管理',features:['文件管理','品質審查','異常管理','稽核追溯'],icon:'shield'},
};
export function LoginSystemIcon({kind='lab',...props}){
 const paths={lab:'M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10M10 18h.01M13 12h.01',document:'M14 3H5v18h14V8l-5-5v5h5M8 12h8M8 16h5',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4ZM8 12l3 3 5-6',chart:'M4 20h16M7 16v-5M12 16V5M17 16V8',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',folder:'M3 7h7l2 2h9v11H3V5h7l2 2',flow:'M12 3v5M5 14v-4h14v4M3 14h4v6H3zM10 14h4v6h-4zM17 14h4v6h-4zM10 3h4v4h-4z',sun:'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',moon:'M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5',help:'M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'};
 return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.document}/></svg>;
}
export default function EnterpriseLoginLayout({system,dark,onToggle,children}){
 const [help,setHelp]=useState(false);const info=details[system]||details.lms;
 return <div className={`enterprise-login ${dark?'enterprise-dark':'enterprise-light'}`}>
  <header className="enterprise-login-header"><CompanyBrandLogo dark={dark}/><nav aria-label="登入頁工具"><button type="button" className="enterprise-theme" onClick={onToggle} aria-label={dark?'切換淺色模式':'切換深色模式'} title={dark?'切換淺色模式':'切換深色模式'}><LoginSystemIcon kind={dark?'moon':'sun'}/></button><span className="enterprise-header-divider"/><button type="button" className="enterprise-help" aria-expanded={help} aria-controls="enterprise-login-help" onClick={()=>setHelp(!help)}><LoginSystemIcon kind="help"/>說明</button></nav></header>
  {help&&<aside id="enterprise-login-help" className="enterprise-help-panel"><strong>登入說明</strong><p>請使用系統管理員提供的帳號與密碼登入。忘記密碼時，請使用登入表單的密碼協助功能。</p><button type="button" onClick={()=>setHelp(false)}>關閉</button></aside>}
  <div className="enterprise-login-body"><section className="enterprise-story" aria-label="系統介紹"><div className="enterprise-product"><strong>DQA Smart Lab</strong><span>實驗室數位化管理平台</span></div><div className="enterprise-system"><div className="enterprise-system-heading"><span className="enterprise-system-icon"><LoginSystemIcon kind={info.icon}/></span><div><div className="enterprise-system-name">{info.name}</div><p>{PORTAL_TITLES[system]}</p></div></div><div className="enterprise-blue-rule"/><p className="enterprise-description">{info.description.split('\n').map(line=><span key={line}>{line}</span>)}</p></div><div className="enterprise-features">{info.features.map((label,i)=><div key={label}><LoginSystemIcon kind={[info.icon,'flow','chart','folder'][i]}/><span>{label}</span></div>)}</div><small className="enterprise-copyright">© {COPYRIGHT_YEAR} COLONG IE TECHNOLOGY CO., LTD. <span>DQA Smart Lab</span></small></section>
  <main className="enterprise-login-panel"><div className="enterprise-panel-content"><span className="enterprise-panel-icon"><LoginSystemIcon kind={info.icon}/></span>{children}</div></main></div>
 </div>;
}
