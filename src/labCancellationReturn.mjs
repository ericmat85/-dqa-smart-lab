import {usesEquipment,resourceBusy} from './scheduleResources.mjs';
export function returnLabCancellations(schedules,equipment,lab,operations,now){
 const pending=operations.filter(row=>row.action==='cancel'&&row.status==='待審核');
 if(!pending.length)return {schedules,equipment,lab,operations,audit:[],changed:false};
 const at=new Date(now).toISOString(),ids=new Set(pending.map(row=>row.requestId));
 const next=schedules.map(row=>ids.has(row.requestId)&&row.status!=='取消'?{...row,status:'未排程',time:'',end:'',approvalHold:undefined,completedAt:undefined,equipmentReleaseHandledAt:undefined,labCancellationReturn:{at,reason:pending.find(item=>item.requestId===row.requestId).reason,previousStart:row.time,previousEnd:row.end},history:[...(row.history||[]),`${at} 實驗室申請取消原安排，退回待排程。`]}:row);
 const matches=usesEquipment;
 const machines=equipment.map(machine=>{
  const affected=schedules.filter(row=>ids.has(row.requestId)&&row.status!=='取消'&&matches(row,machine));
  if(machine.status!=='使用中'||!affected.length||(machine.currentRequest&&!affected.some(row=>row.requestId===machine.currentRequest))||next.some(row=>matches(row,machine)&&resourceBusy(row,now)))return machine;
  return {...machine,status:'待機中',currentRequest:'',records:[{id:crypto.randomUUID(),date:at,type:'取消原安排／設備釋放',actor:'系統',result:'使用中 → 待機中',detail:affected.map(row=>row.requestId).join('、')+' 退回待排程。'},...(machine.records||[])]};
 });
 return {schedules:next,equipment:machines,lab:lab.filter(row=>!ids.has(row.id)),operations:operations.map(row=>ids.has(row.requestId)&&row.action==='cancel'&&row.status==='待審核'?{...row,status:'已退回排程',returnedAt:at,reviewComment:'已退回 LMS 待排程，保留原委託審查結果，無需重新審查。'}:row),audit:pending.map(row=>({id:`return-${row.id}`,requestId:row.requestId,action:'取消原安排／退回LMS待排程',actor:row.actor,actorId:row.actorId,time:at,at,signature:'',reason:row.reason})),changed:true};
}
