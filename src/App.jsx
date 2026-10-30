import {PORTAL_TITLES} from './portalLabels.mjs';
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
      system={{ id: 'validation', title: PORTAL_TITLES.validation }}
      dark={dark}
      onToggle={toggleTheme}
      onBack={onBack}
      preview
    />
  );
}

const portalSystems = [
  {path:'request',number:'01',title:PORTAL_TITLES.request,role:'委託者・委託者主管',description:'從試驗需求到報告查閱，追蹤每一個關鍵進度。',action:'進入電子委託系統'},
  {path:'lms',number:'02',title:PORTAL_TITLES.lms,role:'主管・管理人員',description:'審查需求、安排資源，讓試驗與設備有序運作。',action:'進入 DQA 實驗室管理系統'},
  {path:'lab',number:'03',title:PORTAL_TITLES.lab,role:'實驗室工程師・副工程師',description:'接收試驗、掌握設備狀態，完成報告提交。',action:'進入 COLONG 實驗室'},
  {path:'validation',number:'04',title:PORTAL_TITLES.validation,role:'展示入口・尚未開發',description:'產品驗證規劃的未來工作空間。',action:'查看展示入口'},
];
function PortalIcon({kind='arrow'}) {
 const paths={request:'M8 3H5v18h14V7l-4-4H8m7 0v5h4M8 12h8M8 16h5',lms:'M4 4h16v16H4zM4 10h16M10 4v16M14 4v16M4 14h16',lab:'M9 3h6M10 3v7l-6 9a1.3 1.3 0 001 2h14a1.3 1.3 0 001-2l-6-9V3M7 15h10',validation:'M9 6h11M9 12h11M9 18h11M3 6l1 1 2-3M3 12l1 1 2-3M3 18l1 1 2-3',arrow:'M6 18 18 6M6 6h12v12'};
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.arrow}/></svg>;
}
function PortalHome({ navigate }) {
 const [hoveredCard,setHoveredCard]=useState(null);
 const [focusedCard,setFocusedCard]=useState(null);
 const highlightedCard=hoveredCard||focusedCard;
 const markerCard=highlightedCard||'request';
 return <div className="portal-shell">
  <header className="portal-header"><a className="portal-brand" href="/" aria-label="DQA Smart Lab 首頁" onClick={e=>{e.preventDefault();navigate('/');}}><CompanyBrandLogo/></a><div className="portal-header-meta"><span>DQA SMART LAB</span><small><i/>Demo展示環境</small></div></header>
  <main className="portal-main">
   <section className="portal-intro"><div className="portal-intro-top"><span className="portal-eyebrow">QUALITY, CONNECTED.</span><span className="portal-edition">2026 / DEMO</span></div><div className="portal-intro-copy"><p className="portal-overline">可靠度試驗數位平台</p><h1>讓每一次試驗，<br/>都有清晰的軌跡。</h1><p className="portal-intro-description">串起委託、資源與實驗室作業。<br/>選擇您的工作入口，開始今天的任務。</p></div><div className="portal-orbit" aria-hidden="true"><div/><div/><div/><span>Q</span></div><div className="portal-flow"><span>01 委託</span><b>→</b><span>02 試驗</span><b>→</b><span>03 報告</span></div></section>
   <section className="portal-workspaces" aria-label="工作入口"><div className="portal-section-title"><h2>選擇工作入口</h2><span>四個空間・一個流程</span></div><div className="portal-choices" aria-label="選擇系統">{portalSystems.map(system=><button key={system.path} className={`portal-card portal-card-${system.path}${markerCard===system.path?' is-marker':''}${highlightedCard===system.path?' is-highlighted':''}`} onMouseEnter={()=>setHoveredCard(system.path)} onMouseLeave={()=>setHoveredCard(null)} onFocus={()=>setFocusedCard(system.path)} onBlur={()=>setFocusedCard(null)} onClick={()=>navigate(`/${system.path}/login`)}><span className="portal-card-top"><span className="portal-card-icon" aria-hidden="true"><PortalIcon kind={system.path}/></span><span className="portal-card-number">{system.number}</span></span><span className="portal-card-kicker">{system.role}</span><strong>{system.title}</strong><span className="portal-card-desc">{system.description}</span><span className="portal-card-bottom">{system.action}<b aria-hidden="true"><PortalIcon/></b></span></button>)}</div></section>
  </main>
  <footer className="portal-footer"><span>© 2026 COLONG IE Technology Co., Ltd. · DQA Smart Lab</span><span>僅供流程展示，請勿輸入真實公司或機密資料。</span></footer>
 </div>;
}
