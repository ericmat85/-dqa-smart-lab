import {useRef,useState} from 'react';
import AssistantIcon from './AssistantIcon.jsx';
import BatchScheduleDialog from './BatchScheduleDialog.jsx';
import {resourceCan} from './originalBusiness.mjs';
import {batchRowReason} from './batchScheduling.mjs';

// The first review uses the same validated draft planner as the schedule list.
// A suggestion is never a signature or a physical resource reservation.
export default function NativeScheduleAutomation({editing,form,onSaved}){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),saved=useRef(null);
 const row={...editing,id:editing.id||editing.requestId,requestId:editing.requestId,
  status:editing.status==='待排程'?'未排程':editing.status,
  preapprovalWorkflow:true,sampleSpaceUnits:form.sampleSpaceUnits??editing.sampleSpaceUnits,
  equipmentCount:form.equipmentCount??editing.equipmentCount};
 const reason=resourceCan('schedules.plan')?batchRowReason(row):'目前帳號沒有自動化排程權限';
 async function close(){setOpen(false);if(saved.current){const receipt=saved.current;saved.current=null;try{await onSaved(receipt);}catch(e){setError('草稿已儲存，請重新讀取排程。'+e.message);}}}
 return <><button type="button" className="template-btn schedule-batch-button" disabled={!!reason} title={reason||'核對條件、設備與日期，確認後儲存排程草稿'} onClick={()=>{saved.current=null;setError('');setOpen(true);}}><AssistantIcon size={18}/>自動化排程</button>{error&&<p role="alert">{error}</p>}{open&&<BatchScheduleDialog rows={[row]} onSaved={result=>{saved.current=result;}} onClose={close}/>}</>;
}
