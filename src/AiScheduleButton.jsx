import useSystemTheme from './useSystemTheme.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

import AssistantIcon from './AssistantIcon.jsx';

const steps=['讀取目前條件並建立安全 Session','等待伺服器核對設備、容量與時段','檢查回應與證據，準備待確認建議'];
export default function AiScheduleButton({onRecommend}) {
  const {dark}=useSystemTheme();
  const [running,setRunning]=useState(false);
  const [stage,setStage]=useState(0);
  const callback=useRef(onRecommend),cancelRef=useRef(null),buttonRef=useRef(null),operation=useRef(null),mounted=useRef(true);
  useEffect(()=>{callback.current=onRecommend;},[onRecommend]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.abort();};},[]);
  useEffect(()=>{
    if(!running)return;
    const trigger=buttonRef.current;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    cancelRef.current?.focus();
    return()=>{document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus();};
  },[running]);
  const cancel=()=>operation.current?.abort(new DOMException('E2 request cancelled','AbortError'));
  const start=async()=>{
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;setStage(0);setRunning(true);
    try{await callback.current?.({signal:controller.signal,onStage:value=>{if(mounted.current&&!controller.signal.aborted)setStage(Math.min(2,Math.max(0,value)));}});}
    catch{/* The owning schedule page presents the specific error and Trace. */}
    finally{if(operation.current===controller){operation.current=null;if(mounted.current)setRunning(false);}}
  };
  const active=stage;
  return <><button ref={buttonRef} type="button" className="schedule-ai-button" disabled={running} onClick={start}><span className="schedule-ai-button-icon" aria-hidden="true"><AssistantIcon size={22}/></span><span><strong>AI 自動化排程</strong><small>推薦設備與可用時段</small></span><span className="schedule-ai-button-arrow" aria-hidden="true">↗</span></button>
    {running&&createPortal(<div className={`schedule-ai-overlay lms-enterprise ${dark?'theme-dark':'theme-light'}`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();cancel();}if(event.key==='Tab'){event.preventDefault();cancelRef.current?.focus();}}}><section className="schedule-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-ai-title" aria-describedby="schedule-ai-description" aria-busy="true">
      <header><span className="schedule-ai-symbol" aria-hidden="true"><AssistantIcon size={22}/></span><span>SMART SCHEDULER</span><h3 id="schedule-ai-title">正在準備排程建議</h3><p id="schedule-ai-description">分析設備狀態與試驗需求，尋找設備和人員皆可用的時段。</p></header>
      <div className="schedule-ai-progress-heading"><span>排程分析</span><strong>處理中</strong></div><div className="schedule-ai-progress" role="progressbar" aria-label="排程分析進度" aria-valuetext={steps[active]}><span style={{width:'100%'}}/></div>
      <ol className="schedule-ai-steps">{steps.map((step,index)=><li key={step} className={index<active?'complete':index===active?'active':''}><span aria-hidden="true">{index<active?'✓':index+1}</span><p>{step}</p></li>)}</ol>
      <p className="schedule-ai-step-status" role="status">{steps[active]}</p><p className="schedule-ai-explanation">依實際請求狀態更新；證據不足會保留 UNKNOWN。建議需先確認帶入表單，再按儲存排程。</p>
      <footer><button ref={cancelRef} type="button" onClick={cancel}>取消分析</button></footer>
    </section></div>,document.body)}
  </>;
}
