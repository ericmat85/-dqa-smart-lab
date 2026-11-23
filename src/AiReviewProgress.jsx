import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import AssistantIcon from './AssistantIcon.jsx';
import useSystemTheme from './useSystemTheme.js';
import './ScheduleArrangement.css';
import './AiReviewProgress.css';

const requestSteps=['產品代碼','產品類型','需求日期','測試數量','試驗規範／試驗手法','判定基準'];
const reportSteps=['讀取 Excel 報告','查核委託編號、試驗結果與公式','確認簽名、儲存報告並送二階主管審核'];
export default function AiReviewProgress({progress,onCancel,returnFocus,kind='request',message,live=false}){
 const {dark}=useSystemTheme(),dialog=useRef(null),cancel=useRef(null);
 const report=kind==='report',steps=report?reportSteps:requestSteps;
 const title=report?'AI 報告審查進度':'AI 審查進度';
 useEffect(()=>{const node=dialog.current,trigger=returnFocus.current,overflow=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();(cancel.current?.disabled?node:cancel.current)?.focus({preventScroll:true});return()=>{node.close();document.body.style.overflow=overflow;trigger?.focus({preventScroll:true});};},[returnFocus]);
 const active=report?(progress<45?0:progress<80?1:2):Math.min(steps.length-1,Math.floor(progress*steps.length/100));
 return createPortal(<div className={`ai-review-progress-host lms-enterprise ${dark?'theme-dark':'theme-light'}`}><dialog ref={dialog} className="schedule-ai-dialog ai-review-progress-dialog" aria-labelledby="ai-review-progress-title" aria-describedby="ai-review-progress-description" aria-busy="true" tabIndex={-1} onCancel={event=>{event.preventDefault();event.stopPropagation();onCancel?.();}}>
  <header><span className="schedule-ai-symbol" aria-hidden="true"><AssistantIcon size={22}/></span><span className="ai-progress-eyebrow">SMART REVIEW</span><h3 id="ai-review-progress-title">{title}</h3><p id="ai-review-progress-description">{report?'正在查核報告內容、簽名與檔案格式，依既有規則完成提交。':'正在查核委託資料，整理缺漏欄位與需要確認的項目。'}</p></header>
  <div className="schedule-ai-progress-heading"><span>{report?'報告資料查核':'委託資料查核'}</span><strong>{live?'分析中':progress+'%'}</strong></div><div className="schedule-ai-progress" role="progressbar" aria-label={report?'報告審查進度':'審查進度'} aria-valuenow={live?undefined:progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div>
  <ol className="schedule-ai-steps">{steps.map((step,index)=><li key={step} className={index<active?'complete':index===active?'active':''}><span aria-hidden="true">{index<active?'✓':index+1}</span><p>{step}</p></li>)}</ol>
  <p className="schedule-ai-step-status" role="status">{message||(live?'正在核對已授權資料並等候模型回應…':`正在檢查：${steps[active]}`)}</p><p className="schedule-ai-explanation">{live?'真實模型依目前已授權的資料提供審查建議；完成後仍由人員確認，不自動簽核或修改委託。':report?'報告防呆審查採 Demo 規則檢查，非 AI 判讀；進度依實際處理階段顯示。通過後提交二階主管審核，尚不代表主管核准。儲存期間請稍候。':'此為 5 秒 Demo 規則查核進度展示，未呼叫真實 AI 服務。完成後顯示審查建議，不會自動簽核或修改委託資料。'}</p>
  <footer><button ref={cancel} type="button" disabled={!onCancel} onClick={onCancel}>{onCancel?'取消審查':'正在查核與提交…'}</button></footer>
 </dialog></div>,document.body);
}
