import PageLoadingIndicator from './PageLoadingIndicator.jsx';
import BusinessPasswordRecovery from './BusinessPasswordRecovery.jsx';
import {originalBusinessEnabled,businessIdentity,startOriginalBusinessSync} from './originalBusiness.mjs';
import BusinessAccountActivation from './BusinessAccountActivation.jsx';
import ProductTour from './ProductTour.jsx';
import EnterpriseBotIcon from './EnterpriseBotIcon.jsx';
import useIdleSessions from './useIdleSessions.js';
import SessionTimeoutDialog from './SessionTimeoutDialog.jsx';
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
import "./SystemThemeAccents.css";
import "./UnifiedLoginForm.css";
import "./MobileDensity.css";

function getPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export default function App() {
  const [path, setPath] = useState(getPath());
  const [businessVersion,setBusinessVersion]=useState(0);
  useEffect(()=>{if(!originalBusinessEnabled())return;const stop=startOriginalBusinessSync();const changed=()=>{if(!businessIdentity())setBusinessVersion(v=>v+1);};window.addEventListener('dqa:business-change',changed);return()=>{stop();window.removeEventListener('dqa:business-change',changed);};},[]);
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

  const idle=useIdleSessions(path,navigate);
  let content;
  if(path==='/account/forgot-password'&&originalBusinessEnabled())content=<BusinessPasswordRecovery navigate={navigate}/>;
  else if((path==='/account/activate'||path==='/account/reset-password')&&originalBusinessEnabled())content=<BusinessAccountActivation navigate={navigate}/>;
  else if(path==='/tour')content=<ProductTour navigate={navigate}/>;
  else if(path.startsWith('/request/')||path==='/request')content=<RequestApp key={`request-${idle.version}-${businessVersion}`}/>;
  else if(path==='/lms'||path.startsWith('/lms/'))content=<LmsApp key={`lms-${idle.version}-${businessVersion}`} path={path} navigate={navigate}/>;
  else if(path.startsWith('/lab/')||path==='/lab')content=<LabApp key={`lab-${idle.version}-${businessVersion}`} path={path} navigate={navigate}/>;
  else if(path.startsWith('/validation/')||path==='/validation')content=<ValidationLogin onBack={()=>navigate('/')}/>;
  else content=<PortalHome navigate={navigate}/>;
  return <><PageLoadingIndicator/>{content}{idle.notice.length>0&&<SessionTimeoutDialog systems={idle.notice} onClose={idle.dismiss}/>}</>;

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
  {path:'request',title:PORTAL_TITLES.request,role:'委託者・委託者主管',description:'從試驗需求到報告查閱，追蹤每一個關鍵進度。',action:'進入電子委託系統'},
  {path:'lms',title:PORTAL_TITLES.lms,role:'主管・管理人員',description:'審查需求、安排資源，讓試驗與設備有序運作。',action:'進入 DQA 實驗室管理系統'},
  {path:'lab',title:PORTAL_TITLES.lab,role:'實驗室工程師・副工程師',description:'接收試驗、掌握設備狀態，完成報告提交。',action:'進入 COLONG 實驗室'},
  {path:'validation',title:PORTAL_TITLES.validation,role:'展示入口・尚未開發',description:'產品驗證規劃的未來工作空間。',action:'查看展示入口'},
];
function PortalIcon({kind='arrow'}) {
 const paths={request:'M8 3H5v18h14V7l-4-4H8m7 0v5h4M8 12h8M8 16h5',lms:'M4 4h16v16H4zM4 10h16M10 4v16M14 4v16M4 14h16',lab:'M9 3h6M10 3v7l-6 9a1.3 1.3 0 001 2h14a1.3 1.3 0 001-2l-6-9V3M7 15h10',validation:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4ZM8 12l3 3 5-6',arrow:'M6 18 18 6M6 6h12v12'};
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.arrow}/></svg>;
}
const portalStories = [
 {tag:'DESIGN QUALITY',title:['讓品質從設計開始，','讓每個決策有依據。'],description:['串聯設計需求、風險與驗證，','把品質考量帶進每一次開發。'],steps:['釐清需求','辨識風險','驗證設計']},
 {tag:'TESTING & LAB',title:['讓試驗井然有序，','讓結果值得信賴。'],description:['整合設備、排程與現場紀錄，','讓每一次試驗都有清晰的軌跡。'],steps:['安排資源','執行試驗','確認結果']},
 {tag:'E-REQUEST',title:['讓需求清楚傳遞，','讓委託順暢接軌。'],description:['從線上委託到簽核與報告查閱，','讓每個角色掌握下一步。'],steps:['提出委託','協作簽核','追蹤成果']},
 {tag:'REGULATORY',title:['掌握法規的方向，','走穩合規的每一步。'],description:['釐清適用要求與驗證依據，','讓產品開發有明確的遵循方向。'],steps:['辨識要求','確認規範','規劃驗證']},
 {tag:'ANALYSIS',title:['從現象找到線索，','從解析看見答案。'],description:['串聯試驗數據與問題脈絡，','讓每一次解析成為改善的起點。'],steps:['蒐集證據','釐清原因','推進改善']}
];
function PortalHome({ navigate }) {
 const [storyIndex,setStoryIndex]=useState(0);
 const [storyPaused,setStoryPaused]=useState(false);
 useEffect(()=>{if(storyPaused)return;const timer=setInterval(()=>setStoryIndex(index=>(index+1)%portalStories.length),15000);return()=>clearInterval(timer);},[storyIndex,storyPaused]);
 const story=portalStories[storyIndex];
 const [hoveredCard,setHoveredCard]=useState(null);
 const [focusedCard,setFocusedCard]=useState(null);
 const highlightedCard=hoveredCard||focusedCard;
 const markerCard=highlightedCard||'request';
 return <div className="portal-shell">
  <header className="portal-header"><a className="portal-brand" href="/" aria-label="DQA Smart Lab 首頁" onClick={e=>{e.preventDefault();navigate('/');}}><CompanyBrandLogo/></a><div className="portal-header-meta"><span>DQA SMART LAB</span><small><i/>Demo展示環境</small></div></header>
  <main className="portal-main">
   <section className="portal-intro" aria-label="平台主題輪播" aria-roledescription="輪播"><div className="portal-intro-top"><span className="portal-eyebrow">QUALITY, CONNECTED.</span><span className="portal-edition">探索智慧實驗室</span></div><div className="portal-intro-copy portal-story" key={storyIndex}><p className="portal-overline">{story.tag}</p><h1>{story.title[0]}<br/>{story.title[1]}</h1><p className="portal-intro-description">{story.description[0]}<br/>{story.description[1]}</p></div><div className="portal-orbit" aria-hidden="true"><div/><div/><div/><span>Q</span></div><div className="portal-story-footer"><div className="portal-flow">{story.steps.map((step,index)=><React.Fragment key={step}>{index>0&&<b aria-hidden="true">→</b>}<span>{step}</span></React.Fragment>)}</div><div className="portal-story-controls"><div className="portal-story-dots" role="group" aria-label="選擇主題">{portalStories.map((item,index)=><button type="button" key={item.tag} aria-label={`第 ${index+1} 張：${item.tag}`} aria-pressed={index===storyIndex} onClick={()=>setStoryIndex(index)}/>)}</div><button type="button" className="portal-story-pause" title={storyPaused?'播放主題輪播':'暫停主題輪播'} aria-label={storyPaused?'播放主題輪播':'暫停主題輪播'} onClick={()=>setStoryPaused(value=>!value)}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{storyPaused?<path d="M8 5v14l11-7z"/>:<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>}</svg></button></div></div></section>
   <section className="portal-workspaces" aria-label="工作入口"><div className="portal-section-title"><h2>選擇工作入口</h2><button className="tour-home-entry" onClick={()=>navigate('/tour')}><EnterpriseBotIcon/>AI 機器人導覽</button></div><div className="portal-choices" aria-label="選擇系統">{portalSystems.map(system=><button key={system.path} className={`portal-card portal-card-${system.path}${markerCard===system.path?' is-marker':''}${highlightedCard===system.path?' is-highlighted':''}`} onMouseEnter={()=>setHoveredCard(system.path)} onMouseLeave={()=>setHoveredCard(null)} onFocus={()=>setFocusedCard(system.path)} onBlur={()=>setFocusedCard(null)} onClick={()=>navigate(`/${system.path}/login`)}><span className="portal-card-top"><span className="portal-card-icon" aria-hidden="true"><PortalIcon kind={system.path}/></span></span><span className="portal-card-kicker">{system.role}</span><strong>{system.title}</strong><span className="portal-card-desc">{system.description}</span><span className="portal-card-bottom">{system.action}<b aria-hidden="true"><PortalIcon/></b></span></button>)}</div></section>
  </main>
  <footer className="portal-footer"><span>© 2026 COLONG IE Technology Co., Ltd. · DQA Smart Lab</span><span>僅供流程展示，請勿輸入真實公司或機密資料。</span></footer>
 </div>;
}
