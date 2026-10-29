import {scheduleProgress} from './scheduleProgress.mjs';
export function updateRequestExecution(requests,schedules,lab,now){
 return requests.map(request=>{
  if(request.status==='取消'||request.reportInfo?.stage)return request;
  const receipt=lab.find(row=>row.id===request.id&&['已排程','試驗中','已完成'].includes(row.status));
  if(!receipt)return request;
  const schedule=schedules.find(row=>row.requestId===request.id&&row.id===receipt.scheduleId&&row.reservationId===receipt.reservationId&&row.time===receipt.scheduledStart&&row.end===receipt.scheduledEnd);
  if(!schedule||!['已排程','試驗中','進行中','已完成'].includes(schedule.status))return request;
  const status=schedule.status==='已完成'?'已完成':['試驗中','進行中'].includes(schedule.status)?'執行中':'已排程';
  const bounds=scheduleProgress({...schedule,status:'已排程'},now);
  const execution={scheduleId:schedule.id,reservationId:schedule.reservationId,status,equipment:schedule.eq,operator:schedule.owner,sampleCode:schedule.sampleCode||receipt.sampleIds||'',plannedStart:schedule.time,plannedEnd:schedule.end,acceptedAt:receipt.acceptedAt,startedAt:status!=='已排程'&&bounds.start!==undefined?new Date(bounds.start).toISOString():'',completedAt:status==='已完成'?schedule.completedAt||new Date(bounds.end).toISOString():'',reportSubmitted:Boolean(receipt.reportSubmitted)};
  const history=request.executionHistory||[];
  const changed=request.execution?.status!==status||request.execution?.reservationId!==schedule.reservationId;
  const event={id:crypto.randomUUID(),status,at:status==='已完成'?execution.completedAt:status==='執行中'?execution.startedAt:execution.acceptedAt||new Date(now).toISOString(),detail:status==='已完成'?'實驗室試驗已完成，可供委託者主管查閱。':status==='執行中'?'已確認接收並開始試驗。':'實驗室已接收，等待試驗開始。'};
  const next={...request,status,execution,executionHistory:changed?[...history,event]:history};
  return JSON.stringify(next)===JSON.stringify(request)?request:next;
 });
}
