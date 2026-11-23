import {requestDemoStartIntent,requestDemoReply} from './requestDemoCommand.mjs';
import FlowTestDialog from './FlowTestDialog.jsx';
import {flowTestIntent} from './flowTestTiming.mjs';
import {businessAIEnabled} from './businessAIClient.mjs';
import {answerBusinessFAQ} from './businessFAQ.mjs';
import {appStorage,originalBusinessEnabled} from './originalBusiness.mjs';
import useUiPreferences from './useUiPreferences.js';
import {faqQuestion,scopeReply} from './assistantLanguage.mjs';
import {e4LabScope} from './e4LabScope.mjs';
import {askPreviewAssistant} from './previewAssistant.mjs';
import {readE4CurrentData} from './e4ReadonlyContext.mjs';
import EnterpriseBotIcon from './EnterpriseBotIcon.jsx';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ASSISTANT_DEMOS,findCommonQuestion,commonQuestionReply} from './assistantDemo.mjs';
import './IntelligentAssistant.css';
import AssistantIcon from './AssistantIcon.jsx';
import {ENGINE_PREFERENCES_EVENT,enginePreferenceKey,readEnginePreferences,requireEngineEnabled} from './enginePreferences.mjs';
import {observeE4Local} from './e4Activity.mjs';
import {stageReportDraftHandoff} from './reportDraftHandoff.mjs';

function viewport(){const view=window.visualViewport;return {width:view?.width||window.innerWidth,height:view?.height||window.innerHeight,top:view?.offsetTop||0,right:Math.max(0,window.innerWidth-((view?.offsetLeft||0)+(view?.width||window.innerWidth)))};}
export default function IntelligentAssistant({snapshot,metrics,system='lms',onDemoStart}){
 const {language}=useUiPreferences();
 const [flowTestOpen,setFlowTestOpen]=useState(false);
 const [,setPreferencesTick]=useState(0);
 let preferences;try{preferences=readEnginePreferences('E4').settings;}catch{preferences={enabled:false,speed:35,punctuation:true,showFaq:true};}
 useEffect(()=>{const update=()=>setPreferencesTick(v=>v+1),storage=e=>{if(!e.key||e.key===enginePreferenceKey('E4'))update();};window.addEventListener(ENGINE_PREFERENCES_EVENT,update);window.addEventListener('storage',storage);return()=>{window.removeEventListener(ENGINE_PREFERENCES_EVENT,update);window.removeEventListener('storage',storage);};},[]);
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[turns,setTurns]=useState([]),[files,setFiles]=useState([]);const input=useRef(null),fileInput=useRef(null),body=useRef(null),examples=useRef(null),focusNewTurn=useRef(false);
 const [view,setView]=useState(viewport);const inFlight=useRef(null),epoch=useRef(0),[busy,setBusy]=useState(false);
 const [launcherTop,setLauncherTop]=useState(()=>{const area=viewport();return area.top+Math.max(8,area.height-64);});
 const [dragging,setDragging]=useState(false);
 const drag=useRef(null),suppressClick=useRef(false),launcher=useRef(null);
 const clampTop=top=>Math.max(view.top+8,Math.min(top,view.top+view.height-48));
 useEffect(()=>{const resize=()=>{const area=viewport();setView(area);setLauncherTop(top=>Math.max(area.top+8,Math.min(top,area.top+area.height-48)));};window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};},[]);
 function dragStart(event){
  if(!event.isPrimary||event.button!==0)return;
  suppressClick.current=false;
  drag.current={id:event.pointerId,startX:event.clientX,startY:event.clientY,top:launcherTop,moved:false};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function dragMove(event){
  const active=drag.current;if(!active||active.id!==event.pointerId)return;
  if(!active.moved&&Math.hypot(event.clientX-active.startX,event.clientY-active.startY)<5)return;
  active.moved=true;suppressClick.current=true;setDragging(true);
  setLauncherTop(clampTop(active.top+event.clientY-active.startY));
 }
 function dragEnd(event){
  if(drag.current?.id!==event.pointerId)return;
  drag.current=null;setDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function toggle(){if(suppressClick.current){suppressClick.current=false;return;}if(open)close();else setOpen(true);}
 function cancelActive(){const active=inFlight.current;if(!active)return;epoch.current++;active.controller.abort();inFlight.current=null;setBusy(false);setTurns(rows=>rows.map(row=>row.id===active.id?{...row,reply:active.reply??'請求已取消；Provider 結果可能未知，不會自動重送。',typing:false}:row));}
 function close(){cancelActive();setOpen(false);launcher.current?.focus({preventScroll:true});}
 useEffect(()=>{epoch.current++;setTurns([]);setQuestion('');setFiles([]);const ended=event=>{if(event.detail?.system===system){epoch.current++;inFlight.current?.controller.abort();inFlight.current=null;setBusy(false);setTurns([]);setQuestion('');setFiles([]);}};const navigate=()=>cancelActive();window.addEventListener('dqa:ai-session-ended',ended);window.addEventListener('dqa:navigate',navigate);window.addEventListener('popstate',navigate);return()=>{epoch.current++;window.removeEventListener('dqa:ai-session-ended',ended);window.removeEventListener('dqa:navigate',navigate);window.removeEventListener('popstate',navigate);inFlight.current?.controller.abort();inFlight.current=null;};},[system]);
 // The complete response is validated before this local presentation animation.
 function animateReply(reply,id,ownerEpoch,signal){
  return new Promise(resolve=>{
   let timer=null,position=0,settled=false;
   const active=()=>epoch.current===ownerEpoch&&inFlight.current?.id===id&&!signal.aborted;
   const finish=()=>{if(settled)return;settled=true;if(timer!==null)window.clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
   if(!active()){finish();return;}
   // Keep the Mock status visible while revealing the actual answer one grapheme at a time.
   const split=(reply.startsWith('【MOCK測試：')||reply.startsWith('[MOCK test:'))?reply.indexOf('\n')+1:0,prefix=split>0?reply.slice(0,split):'',bodyText=reply.slice(prefix.length);
   const characters=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(language,{granularity:'grapheme'}).segment(bodyText),part=>part.segment):Array.from(bodyText);
   signal.addEventListener('abort',finish,{once:true});
   setTurns(rows=>rows.map(row=>row.id===id?{...row,reply:prefix,typing:true}:row));
   function typeNext(){
    if(!active()){finish();return;}
    position++;const typing=position<characters.length;
    setTurns(rows=>rows.map(row=>row.id===id?{...row,reply:prefix+characters.slice(0,position).join(''),typing}:row));
    if(!typing){finish();return;}
    const character=characters[position-1];const delay=preferences.punctuation&&/[。！？.!?]/u.test(character)?240:preferences.punctuation&&/[，、；：,;:]/u.test(character)?120:character==='\n'?160:preferences.speed;
    timer=window.setTimeout(typeNext,delay);
   }
   timer=window.setTimeout(typeNext,400);
  });
 }
 // Keep focus and scrolling within the panel during loading and character reveal.
 useLayoutEffect(()=>{
  if(!open||!body.current)return;
  if(focusNewTurn.current){
   body.current.querySelector('article:last-child')?.focus({preventScroll:true});
   focusNewTurn.current=false;
  }
  body.current.scrollTop=body.current.scrollHeight;
 },[turns,open]);
 async function ask(text=question,{focusTurn=false}={}){
  const trimmed=text.trim(),clear=['/clear','清除對話'].includes(trimmed);
  if(trimmed==='/cancel'){cancelActive();return;}
  if(inFlight.current&&!clear||!trimmed&&!files.length)return;
  if(clear){cancelActive();epoch.current++;setTurns([]);}
  const ownerEpoch=epoch.current,controller=new AbortController(),id=crypto.randomUUID();inFlight.current={controller,id,reply:null};setBusy(true);
  focusNewTurn.current=focusTurn;
  if(focusTurn&&examples.current)examples.current.open=false;
  setTurns(rows=>[...rows,{id,question:trimmed||'附加檔案',reply:null,typing:true,files:files.map(file=>file.name)}]);
  setQuestion('');setFiles([]);if(fileInput.current)fileInput.current.value='';
  let reply,failed=false,reportDraft=null;
  try{
   const demoStart=requestDemoStartIntent(trimmed);
   if(demoStart){reply=system==='request'&&onDemoStart?onDemoStart(language):requestDemoReply('WRONG_SYSTEM',language);}
   else {
   if(!clear&&!findCommonQuestion(trimmed))requireEngineEnabled('E4');
   const acceleration=flowTestIntent(trimmed);
   if(acceleration){setFlowTestOpen(true);reply=language==='en'?'Opened virtual-request controls. Confirm a checkpoint to advance the virtual trial.':'已開啟虛擬委託加速器。確認推進後會更新虛擬試驗狀態，真實委託依正常時間執行。';}
   else {
   const matchedFaq=findCommonQuestion(trimmed);
   const scope=e4LabScope(matchedFaq?.question||trimmed,{document:/^(?:文件問答|Document Q&A)\s*[:：]/i.test(trimmed)});
   const faq=scope.allowed&&matchedFaq;
   const dynamic=faq&&['overview','pending','running','standby','stock'].includes(faq.id);
   let current={snapshot,metrics};
   if(!businessAIEnabled()&&scope.allowed&&(!faq||dynamic)){
    let storage;try{storage=appStorage();}catch{storage={getItem(){throw Error('Storage unavailable');}};}
    current=readE4CurrentData(snapshot,metrics,system,storage);
    if(!faq&&system==='lms'){try{const {allReports}=await import('./reportStore.mjs');current.snapshot={...current.snapshot,reports:await allReports()};}catch{current.snapshot={...current.snapshot,reports:undefined};}}
   }
   reply=!scope.allowed?scopeReply(scope,language):faq?originalBusinessEnabled()?await answerBusinessFAQ(trimmed,{system,language,signal:controller.signal}):commonQuestionReply(trimmed,current.snapshot,current.metrics,system,language):trimmed?await askPreviewAssistant(trimmed,system,{...current,language,signal:controller.signal,contextHint:turns.slice(-4).map(turn=>turn.question),onReportDraft:value=>{reportDraft=value;}}):'附件僅展示檔名，尚未送至模型。';
   if(!scope.allowed||faq){let accountId;try{accountId=sessionStorage.getItem('dqa-'+system+'-account-id');}catch{}observeE4Local({system,accountId,route:scope.allowed?'FAQ':'RULE',status:scope.allowed?'SUCCESS':'ERROR',errorCode:scope.code});}
   if(reportDraft)setTurns(rows=>rows.map(row=>row.id===id?{...row,reportDraft}:row));
   }
   }
  }
  catch(error){failed=true;reply=error.name==='AbortError'?'請求已取消；Provider 結果可能未知，不會自動重送。':error.message;}
  if(epoch.current===ownerEpoch&&inFlight.current?.id===id&&!controller.signal.aborted){
   inFlight.current.reply=reply;
   if(failed||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)setTurns(rows=>rows.map(row=>row.id===id?{...row,reply,typing:false,failed}:row));
   else await animateReply(reply,id,ownerEpoch,controller.signal);
  }
  if(inFlight.current?.id===id){inFlight.current=null;setBusy(false);}
  if(!focusTurn&&epoch.current===ownerEpoch)input.current?.focus({preventScroll:true});
 }


 // Keep the panel's original desktop/mobile layout independent of launcher content.
 const mobile=view.width<=600;
 const panelHeight=Math.min(560,Math.max(80,view.height-(mobile?72:16)));
 const panelTop=mobile?view.top+56:Math.max(view.top+8,Math.min(launcherTop,view.top+view.height-panelHeight-8));
 const placement={top:launcherTop,right:view.right+16,'--launcher-top':`${launcherTop}px`,'--assistant-panel-right':`${view.right+(mobile?12:80)}px`,'--assistant-panel-width':`${Math.max(80,Math.min(mobile?view.width:390,view.width-(mobile?24:96)))}px`,'--assistant-panel-top':`${panelTop}px`,'--assistant-panel-height':`${panelHeight}px`};
 return <>{flowTestOpen&&<FlowTestDialog snapshot={snapshot} system={system} onClose={()=>setFlowTestOpen(false)}/>}<div className={`intelligent-assistant ${open?"is-expanded":"is-collapsed"}${dragging?" is-dragging":""}`} style={placement}><button type="button" ref={launcher} className="intelligent-launcher" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onLostPointerCapture={dragEnd} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setLauncherTop(top=>clampTop(top+(event.key==='ArrowUp'?-24:24)));}}} aria-label={open?"收合AI智能助理":"展開AI智能助理"} title="AI智能助理：可上下拖動，或使用方向鍵移動" aria-expanded={open} aria-controls="intelligent-panel" onClick={toggle}><span aria-hidden="true" className="intelligent-launcher-symbol"><EnterpriseBotIcon/></span><span aria-hidden="true" className="intelligent-launcher-label">AI</span></button>{open&&<aside id="intelligent-panel" className="intelligent-panel" aria-label="AI智能助理"><header><div><strong className="intelligent-panel-title"><AssistantIcon/>AI智能助理</strong><small>{system==='lms'?'查詢資料 · 製作報告草稿':system==='request'?'電子委託 · 虛擬測試填入':'實驗室問答'}</small></div><button type="button" aria-label="收合AI智能助理" onClick={close}>−</button></header><div className="intelligent-body" ref={body}><p className="intelligent-welcome">{system==='lms'?'您好！可以詢問委託單、試驗進度、設備與排程，或指定委託編號製作報告草稿。':system==='request'?'您好！可以詢問委託流程；在空白新增委託單頁面輸入 /demo start，填入虛擬測試資料。':'您好！可以在這裡詢問實驗室相關問題。'}</p><a className="tour-assistant-entry" href="/tour" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();window.history.pushState({},'','/tour');window.dispatchEvent(new Event('dqa:navigate'));window.scrollTo(0,0);}}>AI 機器人導覽 →</a><details className="intelligent-examples" ref={examples} hidden={!preferences.showFaq}><summary>常見問題 <span>20 題</span></summary><div>{ASSISTANT_DEMOS.map(item=><button type="button" key={item.id} onClick={()=>ask(faqQuestion(item,language),{focusTurn:true})}><small>{item.category}</small>{faqQuestion(item,language)}</button>)}</div></details><div className="intelligent-conversation" aria-live="polite" aria-relevant="additions text">{turns.map(turn=><article key={turn.id} tabIndex={-1} aria-label={`對話：${turn.question}`}><p className="intelligent-question">{turn.question}</p>{turn.files.length>0&&<small>附件：{turn.files.join('、')}（僅展示檔名）</small>}<p className="intelligent-reply" aria-busy={turn.typing}>{turn.reply===null?<span className="intelligent-loading" role="status">讀取中<span aria-hidden="true">···</span></span>:<>{turn.reply}{turn.typing&&<span className="intelligent-typing-cursor" aria-hidden="true">▍</span>}</>}</p>{turn.reportDraft&&!turn.typing&&!turn.failed&&system==='lms'&&<button type="button" className="intelligent-report-handoff" onClick={()=>{try{stageReportDraftHandoff(turn.reportDraft.requestId);window.history.pushState({},'','/lms/reports');window.dispatchEvent(new Event('dqa:navigate'));close();}catch(e){setTurns(rows=>rows.map(r=>r.id===turn.id?{...r,reportDraft:null,reply:r.reply+'\n'+e.message}:r));}}}>在報表分析編輯草稿</button>}</article>)}</div></div><form onSubmit={event=>{event.preventDefault();ask();}}><input ref={fileInput} type="file" multiple hidden onChange={event=>setFiles(Array.from(event.target.files||[]))}/>{files.length>0&&<div className="intelligent-files">{files.map((file,index)=><span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`移除 ${file.name}`} onClick={()=>setFiles(rows=>rows.filter((_,i)=>i!==index))}>×</button></span>)}</div>}<div className="intelligent-composer"><button type="button" aria-label="附加檔案" onClick={()=>fileInput.current?.click()}>＋</button><input ref={input} aria-label="輸入問題" placeholder={system==='request'?'輸入問題或 /demo start…':'輸入實驗室相關問題…'} value={question} onChange={event=>setQuestion(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();ask();}}}/><button type="button" onClick={()=>ask()} aria-label="送出問題" disabled={busy&&!['/clear','清除對話','/cancel'].includes(question.trim())||!question.trim()&&!files.length}>➤</button></div><small>{system==='request'?'Enter 送出 · /demo start 填入虛擬委託 · /clear 清除對話':'Enter 送出 · /clear 清除對話'}</small></form></aside>}</div></>;
}
