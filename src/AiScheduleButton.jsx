import useSystemTheme from './useSystemTheme.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

import AssistantIcon from './AssistantIcon.jsx';
import './AiScheduleButton.css';

const steps=['讀取試驗、設備與登入狀態','核對可用時段，整理排程建議','驗證排程結果，帶入建議表單'];
function showCompletion(signal){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||signal.aborted)return Promise.resolve();
  return new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,360);signal.addEventListener('abort',done,{once:true});
  });
}
export default function AiScheduleButton({onRecommend,disabled=false,disabledReason}) {
  const {dark}=useSystemTheme();
  const [running,setRunning]=useState(false);
  const [stage,setStage]=useState(0);
  const [completed,setCompleted]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const startedAt=useRef(0);
  const callback=useRef(onRecommend),cancelRef=useRef(null),buttonRef=useRef(null),operation=useRef(null),mounted=useRef(true);
  useEffect(()=>{callback.current=onRecommend;},[onRecommend]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.abort();};},[]);
  useEffect(()=>{
    if(!running||completed)return;
    const tick=()=>setElapsed(Math.max(0,(performance.now()-startedAt.current)/1000));
    const timer=setInterval(tick,100);return()=>clearInterval(timer);
  },[running,completed]);
  useEffect(()=>{
    if(!running)return;
    const trigger=buttonRef.current;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    cancelRef.current?.focus();
    return()=>{document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus();};
  },[running]);
  const cancel=()=>operation.current?.abort(new DOMException('Scheduling request cancelled','AbortError'));
  const start=async()=>{
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;startedAt.current=performance.now();setStage(0);setElapsed(0);setCompleted(false);setRunning(true);
    try{
      const result=await callback.current?.({signal:controller.signal,onStage:value=>{
        if(mounted.current&&!controller.signal.aborted&&Number.isInteger(value)&&value>=0&&value<=2)setStage(previous=>Math.max(previous,value));
      }});
      if(result?.status==='applied'&&!controller.signal.aborted&&mounted.current){
        setElapsed(Math.max(0,(performance.now()-startedAt.current)/1000));setStage(2);setCompleted(true);
        // Only a visual confirmation after validation and draft application;
        // no timed phase advancement or fabricated computation percentage.
        await showCompletion(controller.signal);
      }
    }
    catch{/* The owning schedule page presents the specific error and Trace. */}
    finally{if(operation.current===controller){operation.current=null;if(mounted.current)setRunning(false);}}
  };
  const active=stage;
  const progressText=completed?'建議已帶入表單':`步驟 ${active+1}／3 · 已等待 ${elapsed.toFixed(1)} 秒`;
  return <><button ref={buttonRef} type="button" className="schedule-ai-button" disabled={running||disabled} title={disabledReason} onClick={start}><span className="schedule-ai-button-icon" aria-hidden="true"><AssistantIcon size={22}/></span><span><strong>AI 自動化排程</strong><small>推薦設備與可用時段</small></span><span className="schedule-ai-button-arrow" aria-hidden="true">↗</span></button>
    {running&&createPortal(<div className={`schedule-ai-overlay lms-enterprise ${dark?'theme-dark':'theme-light'}`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();cancel();}if(event.key==='Tab'){event.preventDefault();cancelRef.current?.focus();}}}><section className="schedule-ai-dialog" data-workflow="schedule" data-phase={completed?'complete':active+1} role="dialog" aria-modal="true" aria-labelledby="schedule-ai-title" aria-describedby="schedule-ai-description" aria-busy={!completed}>
      <header><div className="schedule-ai-brand"><span className="schedule-ai-symbol" aria-hidden="true"><AssistantIcon size={22}/></span><span className="schedule-ai-brand-name">SMART SCHEDULER</span></div><h3 id="schedule-ai-title">正在準備排程建議</h3><p id="schedule-ai-description">分析設備狀態與試驗需求，尋找設備和人員皆可用的時段。</p></header>
      <div className="schedule-ai-progress-heading"><span>排程分析</span><strong>{progressText}</strong></div><div className="schedule-ai-progress" role="progressbar" aria-label="排程分析進度" aria-valuetext={completed?progressText:steps[active]} {...(completed?{'aria-valuenow':100,'aria-valuemin':0,'aria-valuemax':100}:{})}>
        <span className="schedule-ai-verified-progress" style={{width:`${completed?100:active/3*100}%`}}/>
        {!completed&&<span className="schedule-ai-working-progress" style={{left:`${active/3*100}%`,width:`${100/3}%`}}><i/></span>}
      </div>
      <ol className="schedule-ai-steps">{steps.map((step,index)=>{const done=completed||index<active,current=!completed&&index===active;return <li key={step} className={done?'complete':current?'active':''} aria-current={current?'step':undefined}><span aria-hidden="true">{done?<svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8"/></svg>:index+1}</span><p>{step}</p></li>;})}</ol>
      <p className="schedule-ai-step-status" role="status">{completed?progressText:steps[active]}</p><p className="schedule-ai-explanation">進度依實際請求階段顯示；收到並核對建議後才會帶入表單，再由「儲存排程」套用。</p>
      <footer><button ref={cancelRef} type="button" onClick={cancel}>{completed?'完成':'取消分析'}</button></footer>
    </section></div>,document.body)}
  </>;
}
