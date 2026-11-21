import {resolveScheduleRequest} from './scheduleRequest.mjs';
import {requestInformation} from './labData.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
import {plannedOperatingHours} from './trialProfiles.mjs';
export function acceptedLabStatus(schedule,now=Date.now()){
 if(schedule.pauseStartedAt)return '暫停中';
 const phase=scheduleProgress({...schedule,status:'已排程'},now).phase;
 return phase==='waiting'?'已排程':phase==='elapsed'?'已完成':'試驗中';
}
export function mergeLabSchedules(existing,schedules,now=Date.now()){
 const next=existing.filter(row=>row.status!=='已退回LMS');
 for(const schedule of schedules){
  if(schedule.readOnly)continue;
  if((schedule.receiptReturn||schedule.labCancellationReturn)&&schedule.status==='未排程'){
    const index=next.findIndex(row=>row.id===schedule.requestId);
    if(index>=0)next.splice(index,1);
    continue;
  }
  const id=schedule.requestId;if(!id||!schedule.time||!schedule.end||!['已排程','試驗中','進行中','暫停中','已完成','取消'].includes(schedule.status))continue;
  const index=next.findIndex(row=>row.id===id);
  if(schedule.status==='取消'&&index<0)continue;
  const start=Date.parse(schedule.time.length===10?`${schedule.time}T00:00:00+08:00`:`${schedule.time}${/(?:Z|[+-]\d{2}:?\d{2})$/i.test(schedule.time)?'':'+08:00'}`);
  const end=Date.parse(schedule.end.length===10?`${schedule.end}T00:00:00+08:00`:`${schedule.end}${/(?:Z|[+-]\d{2}:?\d{2})$/i.test(schedule.end)?'':'+08:00'}`)+(schedule.end.length===10?86400000:0);
  const fields={scheduleId:schedule.id,reservationId:schedule.reservationId,project:schedule.productCode||schedule.title,test:schedule.title,equipment:schedule.eq,hours:plannedOperatingHours(schedule)??(Number.isFinite(end-start)?Math.max(0,Math.round((end-start)/3600000)):0),sampleIds:schedule.sampleCode||schedule.sampleNo||schedule.sampleNumber||'',sample:schedule.sampleCode||schedule.sampleNo||schedule.sampleNumber||'',scheduledStart:schedule.time,scheduledEnd:schedule.end};
  if(index<0)next.push({id,...fields,status:'待確認'});
  else if(next[index].scheduleId){
   const previous=next[index];
   const changed=previous.scheduledStart!==schedule.time||previous.scheduledEnd!==schedule.end||previous.reservationId!==schedule.reservationId;
   const status=changed||['已中斷','已退回LMS'].includes(previous.status)?'待確認':['已排程','試驗中','暫停中'].includes(previous.status)?acceptedLabStatus(schedule,now):previous.status;
   next[index]={...previous,...fields,status:schedule.status==='取消'?'取消':status,...(changed?{acceptedAt:undefined}:{})};
  }
 }
 return JSON.stringify(next)===JSON.stringify(existing)?existing:next;
}
export function labRequestInformation(row,snapshot){
 const request=snapshot.requests.find(item=>item.id===row.id);if(request)return requestInformation(request,snapshot);
 const schedule=snapshot.schedules.find(item=>item.id===row.scheduleId||item.requestId===row.id);
 if(schedule)return resolveScheduleRequest(schedule,snapshot.electronic);
 return {id:row.id,project:row.project,product:row.project,testItems:row.test?[row.test]:[],specification:row.test,status:row.status,notes:row.sample?`樣品：${row.sample}`:''};
}
