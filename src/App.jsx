import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import './PortalHome.css';
import {CASE_RESET_KEY} from './resetCases.mjs';
import React, { useCallback, useEffect, useState } from "react";
import RequestApp from "./RequestApp.jsx";
import LmsApp, { LoginPage } from "./LmsApp.jsx";
import useSystemTheme from "./useSystemTheme.js";
import LabApp from "./LabApp.jsx";
import "./App.css";

function getPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export default function App() {
  const [path, setPath] = useState(getPath());
  useEffect(()=>{
    const refresh=event=>{if(event.key!==CASE_RESET_KEY)return;try{if(JSON.parse(event.newValue||'{}').phase==='done')window.location.reload();}catch{/* Ignore unrelated malformed reset notices. */}};
    window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);
  },[]);

  useEffect(() => {
    const onPopState = () => setPath(getPath());
    window.addEventListener("popstate", onPopState);
    window.addEventListener("dqa:navigate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); window.removeEventListener("dqa:navigate", onPopState); };
  }, []);

  const navigate = useCallback((nextPath, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
    setPath(getPath());
    window.scrollTo(0, 0);
  }, []);

  // Each system keeps its own route and login page.
  if (path.startsWith("/request/") || path === "/request") {
    return <RequestApp />;
  }

  if (path === "/lms" || path.startsWith("/lms/")) {
    return <LmsApp path={path} navigate={navigate} />;
  }

  if (path.startsWith("/lab/") || path === "/lab") {
    return <LabApp path={path} navigate={navigate} />;
  }
  if (path.startsWith("/validation/") || path === "/validation") {
    return (
      <ValidationLogin
        onBack={() => navigate("/")}
      />
    );
  }

  return <PortalHome navigate={navigate} />;
}

function ValidationLogin({ onBack }) {
  const { dark, toggleTheme } = useSystemTheme();
  return (
    <LoginPage
      system={{ id: 'validation', title: 'DQA 設計品質管理' }}
      dark={dark}
      onToggle={toggleTheme}
      onBack={onBack}
      preview
    />
  );
}

const portalSystems = [
  {path:'request',number:'01',title:'電子委託系統',role:'委託者・委託者主管',description:'從試驗需求到報告查閱，追蹤每一個關鍵進度。',action:'進入電子委託系統'},
  {path:'lms',number:'02',title:'DQA 實驗室管理系統',role:'主管・管理人員',description:'審查需求、安排資源，讓試驗與設備有序運作。',action:'進入 DQA 實驗室管理系統'},
  {path:'lab',number:'03',title:'COLONG 實驗室',role:'實驗室工程師・副工程師',description:'接收試驗、掌握設備狀態，完成報告提交。',action:'進入 COLONG 實驗室'},
  {path:'validation',number:'04',title:'設計品質管理',role:'展示入口・尚未開發',description:'產品驗證規劃的未來工作空間。',action:'查看展示入口'},
];
function PortalIcon({kind='arrow'}) {
 const paths={request:'M8 3H5v18h14V7l-4-4H8m7 0v5h4M8 12h8M8 16h5',lms:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',lab:'M9 3h6M10 3v7l-6 9a1.3 1.3 0 001 2h14a1.3 1.3 0 001-2l-6-9V3M7 15h10',validation:'M3 14h4v7H3zM10 8h4v13h-4zM17 3h4v18h-4z',arrow:'M4 12h16M13 5l7 7-7 7'};
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.arrow}/></svg>;
}
function PortalHome({ navigate }) {
 return <div className="portal-shell">
  <header className="portal-header"><a className="portal-brand" href="/" aria-label="DQA Smart Lab 首頁" onClick={e=>{e.preventDefault();navigate('/');}}><CompanyBrandLogo/></a><div className="portal-header-meta"><span>DQA SMART LAB</span><small><i/>Demo展示環境</small></div></header>
  <main className="portal-main">
   <section className="portal-intro"><img className="portal-lab-photo" src={`${import.meta.env.BASE_URL}portal/lab-environment-demo.png`} alt="" fetchPriority="high"/><div className="portal-intro-top"><span className="portal-eyebrow">QUALITY,<br/>CONNECTED.</span></div><div className="portal-intro-copy"><h1>讓每一次試驗，<br/>都有清晰的軌跡。</h1><p className="portal-intro-description">串起委託、資源與實驗室作業。<br/>選擇您的工作入口，開始今天的任務。</p></div><div className="portal-flow"><span><PortalIcon kind="request"/>委託</span><b aria-hidden="true">›</b><span><PortalIcon kind="lab"/>試驗</span><b aria-hidden="true">›</b><span><PortalIcon kind="validation"/>報告</span></div></section>
   <section className="portal-workspaces" aria-label="工作入口"><div className="portal-section-title"><h2>選擇工作入口</h2></div><div className="portal-choices" aria-label="選擇系統">{portalSystems.map(system=><button key={system.path} className={`portal-card portal-card-${system.path}`} onClick={()=>navigate(`/${system.path}/login`)}><span className="portal-card-top"><span className="portal-card-icon" aria-hidden="true"><PortalIcon kind={system.path}/></span></span><strong>{system.title}</strong><span className="portal-card-kicker">{system.role}</span><span className="portal-card-desc">{system.description}</span><span className="portal-card-bottom">{system.action}<b aria-hidden="true"><PortalIcon/></b></span></button>)}</div></section>
  </main>
  <footer className="portal-footer"><span>© 2026 COLONG IE Technology Co., Ltd. · DQA Smart Lab</span><span>僅供流程展示，請勿輸入真實公司或機密資料。</span></footer>
 </div>;
}
