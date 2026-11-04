import {useEffect,useRef,useState} from 'react';
import EnterpriseBotIcon from './EnterpriseBotIcon.jsx';
import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import useSystemTheme from './useSystemTheme.js';
import {GUIDED_STEPS,guidedStepDone} from './guidedTourSteps.mjs';
import {tourDatabaseName} from './guidedTourStorage.mjs';
import './ProductTour.css';
export default function ProductTour({navigate}){
 const {dark,toggleTheme}=useSystemTheme(),frame=useRef(null),continueButton=useRef(null),tourRoot=useRef(null),cache=useRef(null),indexRef=useRef(0),themeRef=useRef('light');
 const [token,setToken]=useState(()=>`dqa-guided-tour-${crypto.randomUUID()}`),[index,setIndex]=useState(0),[state,setState]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[hint,setHint]=useState(''),[completed,setCompleted]=useState(false),[coachOpen,setCoachOpen]=useState(true),[fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===tourRoot.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
 async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(tourRoot.current?.requestFullscreen){await tourRoot.current.requestFullscreen();setCoachOpen(false);}else setCoachOpen(false);}catch{setCoachOpen(false);setHint('已放大操作區；瀏覽器不支援全螢幕時，可使用 F11。');}}
 const step=GUIDED_STEPS[index],done=guidedStepDone(index,state);
 useEffect(()=>{themeRef.current=dark?'dark':'light';},[dark]);
 useEffect(()=>{if(done)continueButton.current?.scrollIntoView({block:'nearest'});},[done,index]);
 function command(type,extra={}){frame.current?.contentWindow?.postMessage({token,type,...extra},location.origin);}
 useEffect(()=>{
  function receive(event){
   const message=event.data;if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||message?.source!=='dqa-guided-workspace'||message.token!==token)return;
   if(message.type==='ready'){frame.current.contentWindow.postMessage({token,type:'init',data:cache.current,index:indexRef.current,theme:themeRef.current},location.origin);setError('');}
   if(message.type==='snapshot'){cache.current=message.data;if(message.state.index===indexRef.current){setState(message.state);setReady(true);}}
   if(message.type==='hint')setHint(message.message);
   if(message.type==='error'){setError(message.message);setReady(false);}
  }
  window.addEventListener('message',receive);
  return()=>{window.removeEventListener('message',receive);const db=tourDatabaseName(token);if(db)indexedDB.deleteDatabase(db);};
 },[token]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({token,type:'theme',theme:dark?'dark':'light'},location.origin);},[dark,ready,token]);
 function next(){if(!done||!ready||indexRef.current!==index)return;if(index===GUIDED_STEPS.length-1){setCompleted(true);return;}const nextIndex=index+1;indexRef.current=nextIndex;setHint('');setIndex(nextIndex);setReady(false);setState(null);command('navigate',{index:nextIndex});}
 function restart(){cache.current=null;indexRef.current=0;setIndex(0);setReady(false);setState(null);setCompleted(false);setError('');setHint('');setToken(`dqa-guided-tour-${crypto.randomUUID()}`);}
 return <div ref={tourRoot} className={`product-tour interactive-tour ${!coachOpen?'tour-workspace-expanded':''} ${dark?'tour-dark':''}`}>
  <header className="tour-header"><CompanyBrandLogo whiteText/><span>機器人實機導覽 <small>隔離 Demo</small></span><div><button onClick={()=>setCoachOpen(value=>!value)} aria-expanded={coachOpen}>{coachOpen?'放大操作畫面':'展開解說'}</button><button onClick={toggleFullscreen}>{fullscreen?'退出全螢幕':'全螢幕'}</button><button onClick={toggleTheme} aria-label="切換深色或淺色模式">{dark?'淺色模式':'深色模式'}</button><button onClick={()=>navigate('/')}>離開導覽</button></div></header>
  <main className="interactive-tour-layout"><section className="tour-live-workspace" aria-label="實際系統操作區"><div className="tour-live-bar"><strong>{step.system==='request'?'電子委託系統':step.system==='lms'?'實驗室管理系統':'COLONG 實驗室'}</strong><span>第 {step.stage} 階 · {step.role}</span>{!coachOpen&&<><button onClick={()=>setCoachOpen(true)}>操作指引</button><button className="tour-primary" disabled={!completed&&(!ready||!done)} onClick={completed?()=>navigate('/'):next}>{completed?'返回系統入口':step.next} →</button></>}{!coachOpen&&hint&&<span className="tour-wide-hint" role="status">{hint}</span>}</div><iframe key={token} name={token} ref={frame} src="/" title="九階導覽實際系統畫面" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"/>{!ready&&!error&&<p className="tour-frame-loading" role="status">正在載入此環節的實際操作畫面…</p>}</section>
  <aside className="tour-coach" aria-label="AI機器人導覽" hidden={!coachOpen}><div className="tour-coach-title"><span><EnterpriseBotIcon/></span><div><strong>AI 智能助理</strong><small>你來操作，我來引導</small></div></div><div className="tour-nine-progress" role="progressbar" aria-label="九階導覽進度" aria-valuemin={1} aria-valuemax={9} aria-valuenow={step.stage}>{Array.from({length:9},(_,i)=><span key={i} className={i+1<=step.stage?'is-reached':''}>{i+1}</span>)}</div><h1>{completed?'九階操作已完成！':`第 ${step.stage} 階：${step.title}`}</h1><p className="tour-live-role">本環節角色：{step.role}</p>{completed?<p>你已親自完成簽核、排程、接收、試驗加速、報告審核及結案文件檢視。</p>:<ol className="tour-instructions">{step.instructions.map(text=><li key={text}>{text}</li>)}</ol>}<p className="tour-operation-note">請操作系統畫面；微亮的藍色外框會指出目前可操作的位置。可按「放大操作畫面」或「全螢幕」增加空間。</p>{hint&&<p className="tour-callout" role="status">{hint}</p>}{error&&<p role="alert" className="tour-error">工作區載入失敗：{error}。請按「重新開始」重試。</p>}<p className={`tour-step-check ${done?'is-done':''}`} role="status">{done?'✓ 本環節已完成，請按下方按鈕繼續':ready?'等待你完成此環節操作':'載入中'}</p>{!completed?<button ref={continueButton} className="tour-primary tour-continue" disabled={!ready||!done} onClick={next}>{step.next} →</button>:<button className="tour-primary tour-continue" onClick={()=>navigate('/')}>返回系統入口</button>}<div className="tour-secondary-actions"><button disabled={!ready} onClick={()=>command('navigate',{index})}>返回此環節畫面</button><button onClick={restart}>重新開始</button></div><small>只操作獨立假資料，沿用真實表單與權限檢查；不變更你的登入身分或原有案件。重新整理從第一階開始。</small></aside></main>
 </div>;
}
