import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import AssistantIcon from './AssistantIcon.jsx';
import useSystemTheme from './useSystemTheme.js';
import './ScheduleArrangement.css';
import './AiReviewProgress.css';

const steps=['產品代碼','產品類型','需求日期','測試數量','試驗規範／試驗手法','判定基準'];
export default function AiReviewProgress({progress,onCancel,returnFocus}){
 const {dark}=useSystemTheme(),dialog=useRef(null),cancel=useRef(null);
 useEffect(()=>{const node=dialog.current,trigger=returnFocus.current,overflow=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();cancel.current?.focus({preventScroll:true});return()=>{node.close();document.body.style.overflow=overflow;trigger?.focus({preventScroll:true});};},[returnFocus]);
 const active=Math.min(steps.length-1,Math.floor(progress*steps.length/100));
 return createPortal(<div className={`ai-review-progress-host lms-enterprise ${dark?'theme-dark':'theme-light'}`}><dialog ref={dialog} className="schedule-ai-dialog ai-review-progress-dialog" aria-labelledby="ai-review-progress-title" aria-describedby="ai-review-progress-description" aria-busy="true" onCancel={event=>{event.preventDefault();event.stopPropagation();onCancel();}}>
  <header><span className="schedule-ai-symbol" aria-hidden="true"><AssistantIcon size={22}/></span><span>SMART REVIEW</span><h3 id="ai-review-progress-title">AI 審查進度</h3><p id="ai-review-progress-description">正在查核委託資料，整理缺漏欄位與需要確認的項目。</p></header>
  <div className="schedule-ai-progress-heading"><span>委託資料查核</span><strong>{progress}%</strong></div><div className="schedule-ai-progress" role="progressbar" aria-label="審查進度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div>
  <ol className="schedule-ai-steps">{steps.map((step,index)=><li key={step} className={index<active?'complete':index===active?'active':''}><span aria-hidden="true">{index<active?'✓':index+1}</span><p>{step}</p></li>)}</ol>
  <p className="schedule-ai-step-status" role="status">正在檢查：{steps[active]}</p><p className="schedule-ai-explanation">此為 5 秒 Demo 規則查核進度展示，未呼叫真實 AI 服務。完成後顯示審查建議，不會自動簽核或修改委託資料。</p>
  <footer><button ref={cancel} type="button" onClick={onCancel}>取消審查</button></footer>
 </dialog></div>,document.body);
}
