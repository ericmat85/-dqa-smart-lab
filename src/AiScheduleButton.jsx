import useSystemTheme from './useSystemTheme.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

import AssistantIcon from './AssistantIcon.jsx';

const steps=['篩選待機設備，核對試驗類型與樣品容量','檢查可用執行人及設備／人員時段衝突','整理可用時段，準備帶入排程建議'];
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
      <p className="schedule-ai-step-status" role="status">{steps[active]}</p><p className="schedule-ai-explanation">使用既有試驗資料分析可用時段。完成後會帶入表單，確認並儲存後才會套用排程。</p>
      <footer><button ref={cancelRef} type="button" onClick={cancel}>取消分析</button></footer>
    </section></div>,document.body)}
  </>;
}
