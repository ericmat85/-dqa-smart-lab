import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

import AssistantIcon from './AssistantIcon.jsx';

const steps=['篩選待機設備，核對試驗類型與樣品容量','檢查可用執行人及設備／人員時段衝突','整理可用時段，準備帶入排程建議'];
export default function AiScheduleButton({onRecommend}) {
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState(0);
  const callback=useRef(onRecommend),cancelRef=useRef(null),buttonRef=useRef(null);
  useEffect(()=>{callback.current=onRecommend;},[onRecommend]);
  useEffect(()=>{
    if(!running)return;
    const started=performance.now();
    const trigger=buttonRef.current;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    cancelRef.current?.focus();
    const ticker=window.setInterval(()=>setProgress(Math.min(99,Math.floor((performance.now()-started)/30))),50);
    const finish=window.setTimeout(()=>{
      setProgress(100);setRunning(false);callback.current();
    },3000);
    return()=>{window.clearInterval(ticker);window.clearTimeout(finish);document.body.style.overflow=overflow;trigger?.focus();};
  },[running]);
  const cancel=()=>{setRunning(false);setProgress(0);};
  const active=Math.min(2,Math.floor(progress/34));
  return <><button ref={buttonRef} type="button" className="schedule-ai-button" disabled={running} onClick={()=>{setProgress(0);setRunning(true);}}><span className="schedule-ai-button-icon" aria-hidden="true"><AssistantIcon size={22}/></span><span><strong>AI 自動化排程</strong><small>推薦設備與可用時段</small></span><span className="schedule-ai-button-arrow" aria-hidden="true">↗</span></button>
    {running&&createPortal(<div className="schedule-ai-overlay" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();cancel();}if(event.key==='Tab'){event.preventDefault();cancelRef.current?.focus();}}}><section className="schedule-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-ai-title" aria-describedby="schedule-ai-description" aria-busy="true">
      <header><span className="schedule-ai-symbol" aria-hidden="true"><AssistantIcon size={22}/></span><span>SMART SCHEDULER</span><h3 id="schedule-ai-title">正在準備排程建議</h3><p id="schedule-ai-description">分析設備狀態與試驗需求，尋找設備和人員皆可用的時段。</p></header>
      <div className="schedule-ai-progress-heading"><span>排程分析</span><strong>{progress}%</strong></div><div className="schedule-ai-progress" role="progressbar" aria-label="排程分析進度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div>
      <ol className="schedule-ai-steps">{steps.map((step,index)=><li key={step} className={index<active?'complete':index===active?'active':''}><span aria-hidden="true">{index<active?'✓':index+1}</span><p>{step}</p></li>)}</ol>
      <p className="schedule-ai-step-status" role="status">{steps[active]}</p><p className="schedule-ai-explanation">此為 3 秒 Demo 分析展示，使用既有規則產生推薦。完成後會帶入表單，確認並儲存後才會套用排程。</p>
      <footer><button ref={cancelRef} type="button" onClick={cancel}>取消分析</button></footer>
    </section></div>,document.body)}
  </>;
}
