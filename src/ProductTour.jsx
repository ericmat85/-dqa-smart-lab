import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import TourChatGuide from './TourChatGuide.jsx';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import {GUIDED_STEPS,guidedStepDone} from './guidedTourSteps.mjs';
import {tourDatabaseName} from './guidedTourStorage.mjs';
import {placeTourPopover} from './tourPopover.mjs';
import './ProductTour.css';
export default function ProductTour({navigate}){
 const {dark,toggleTheme}=useSystemTheme(),frame=useRef(null),continueButton=useRef(null),tourRoot=useRef(null),popover=useRef(null),targetKey=useRef(''),cache=useRef(null),indexRef=useRef(0),themeRef=useRef('light');
 const [token,setToken]=useState(()=>`dqa-guided-tour-${crypto.randomUUID()}`),[index,setIndex]=useState(0),[state,setState]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[hint,setHint]=useState(''),[completed,setCompleted]=useState(false),[coachOpen,setCoachOpen]=useState(true),[fullscreen,setFullscreen]=useState(false),[target,setTarget]=useState(null),[position,setPosition]=useState({left:16,top:110});
 useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===tourRoot.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
 async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(tourRoot.current?.requestFullscreen){await tourRoot.current.requestFullscreen();setCoachOpen(false);}else setCoachOpen(false);}catch{setCoachOpen(false);setHint('已放大操作區；瀏覽器不支援全螢幕時，可使用 F11。');}}
 const step=GUIDED_STEPS[index],done=guidedStepDone(index,state);
 useLayoutEffect(()=>{function place(){const box=frame.current?.getBoundingClientRect(),tip=popover.current;if(!box||!tip)return;const sx=box.width/(target?.viewportWidth||box.width),sy=box.height/(target?.viewportHeight||box.height);const rect=target?.rect;const anchor=rect?{left:box.left+rect.left*sx,top:box.top+rect.top*sy,right:box.left+rect.right*sx,bottom:box.top+rect.bottom*sy}:null;setPosition(placeTourPopover({target:anchor,bounds:{left:box.left+8,top:box.top+8,right:box.right-8,bottom:box.bottom-8},width:tip.offsetWidth,height:tip.offsetHeight}));}place();const observer=new ResizeObserver(place);if(popover.current)observer.observe(popover.current);window.addEventListener('resize',place);return()=>{observer.disconnect();window.removeEventListener('resize',place);};},[target,coachOpen,done,index,fullscreen,hint,completed]);
 useEffect(()=>{themeRef.current=dark?'dark':'light';},[dark]);
 useEffect(()=>{if(done)continueButton.current?.scrollIntoView({block:'nearest'});},[done,index]);
 function command(type,extra={}){frame.current?.contentWindow?.postMessage({token,type,...extra},location.origin);}
 useEffect(()=>{
  function receive(event){
   const message=event.data;if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||message?.source!=='dqa-guided-workspace'||message.token!==token)return;
   if(message.type==='ready'){frame.current.contentWindow.postMessage({token,type:'init',data:cache.current,index:indexRef.current,theme:themeRef.current},location.origin);setError('');}
   if(message.type==='snapshot'){cache.current=message.data;if(message.state.index===indexRef.current){setState(message.state);setReady(true);}}
   if(message.type==='target'&&message.index===indexRef.current){setTarget(message.target);if(message.target?.key&&targetKey.current!==message.target.key){targetKey.current=message.target.key;setCoachOpen(true);}}
   if(message.type==='hint')setHint(message.message);
   if(message.type==='error'){setError(message.message);setReady(false);}
  }
  window.addEventListener('message',receive);
  return()=>{window.removeEventListener('message',receive);const db=tourDatabaseName(token);if(db)indexedDB.deleteDatabase(db);};
 },[token]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({token,type:'theme',theme:dark?'dark':'light'},location.origin);},[dark,ready,token]);
 function next(){if(!done||!ready||indexRef.current!==index)return;if(index===GUIDED_STEPS.length-1){setCompleted(true);return;}const nextIndex=index+1;indexRef.current=nextIndex;setHint('');setIndex(nextIndex);setTarget(null);setCoachOpen(true);setReady(false);setState(null);command('navigate',{index:nextIndex});}
 function restart(){cache.current=null;indexRef.current=0;setIndex(0);setTarget(null);targetKey.current='';setCoachOpen(true);setReady(false);setState(null);setCompleted(false);setError('');setHint('');setToken(`dqa-guided-tour-${crypto.randomUUID()}`);}
 return <div ref={tourRoot} className={`product-tour interactive-tour tour-floating-layout ${!coachOpen?'tour-workspace-expanded':''} ${dark?'tour-dark':''}`}>
  <header className="tour-header"><CompanyBrandLogo whiteText/><span>AI 機器人導覽 <small>隔離 Demo</small></span><div><button onClick={()=>setCoachOpen(value=>!value)} aria-expanded={coachOpen}>{coachOpen?'隱藏解說':'顯示解說'}</button><button onClick={toggleFullscreen}>{fullscreen?'退出全螢幕':'全螢幕'}</button><button onClick={toggleTheme} aria-label="切換深色或淺色模式">{dark?'淺色模式':'深色模式'}</button><button onClick={()=>navigate('/')}>離開導覽</button></div></header>
  <main className="interactive-tour-layout"><section className="tour-live-workspace" aria-label="實際系統操作區"><div className="tour-live-bar"><strong>{step.system==='request'?'電子委託系統':step.system==='lms'?'實驗室管理系統':'COLONG 實驗室'}</strong><span>第 {step.stage} 階 · {step.role}</span>{!coachOpen&&<><button onClick={()=>setCoachOpen(true)}>操作指引</button><button className="tour-primary" disabled={!completed&&(!ready||!done)} onClick={completed?()=>navigate('/'):next}>{completed?'返回系統入口':step.next} →</button></>}{!coachOpen&&hint&&<span className="tour-wide-hint" role="status">{hint}</span>}</div><iframe key={token} name={token} ref={frame} src="/" title="九階導覽實際系統畫面" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"/>{!ready&&!error&&<p className="tour-frame-loading" role="status">正在載入此環節的實際操作畫面…</p>}</section>
  <aside ref={popover} className="tour-coach tour-floating-coach tour-chat-coach" aria-label="AI機器人導覽" hidden={!coachOpen} style={{left:position.left,top:position.top}} data-placement={position.placement}><TourChatGuide step={step} index={index} target={target} done={done} ready={ready} hint={hint} error={error} completed={completed} onNext={next} onHome={()=>navigate('/')} onRestart={restart} onReturn={()=>command('navigate',{index})} onHide={()=>setCoachOpen(false)} continueButton={continueButton}/></aside></main>
 </div>;
}
