import {usesEquipment,resourceBusy} from './scheduleResources.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
export function returnUnreceivedSchedules(schedules,equipment,lab,now){
 const at=new Date(now).toISOString(),returned=[];
 const next=schedules.map(row=>{
  if(!['已排程','試驗中','進行中','已完成'].includes(row.status))return row;
  const progress=scheduleProgress(row,now);if(progress.start===undefined||now<progress.start)return row;
  const receipt=lab.find(item=>item.id===row.requestId&&(!item.scheduleId||item.scheduleId===row.id));
  const datesMatch=receipt&&receipt.scheduledStart===row.time&&receipt.scheduledEnd===row.end&&receipt.reservationId===row.reservationId;
  const accepted=receipt&&['已排程','試驗中','暫停中','已完成','待審核','待查閱','已結案'].includes(receipt.status)&&datesMatch;
  if(accepted)return row;
  const receiptReturn={at,reason:'已到試驗開始時間，實驗室尚未確認接收，系統自動退回待排程。',previousStart:row.time,previousEnd:row.end};
  returned.push({requestId:row.requestId,scheduleId:row.id,...receiptReturn});
  return {...row,status:'未排程',time:'',end:'',completedAt:undefined,equipmentReleaseHandledAt:undefined,receiptReturn,history:[...(row.history||[]),`${at} ${receiptReturn.reason}`]};
 });
 const matches=usesEquipment;
 const machines=equipment.map(machine=>{
  const affected=schedules.filter(row=>returned.some(item=>item.scheduleId===row.id)&&matches(row,machine));
  if(machine.status!=='使用中'||!affected.length||(machine.currentRequest&&!affected.some(row=>row.requestId===machine.currentRequest))||next.some(row=>matches(row,machine)&&resourceBusy(row,now)))return machine;
  return {...machine,status:'待機中',currentRequest:'',records:[{id:crypto.randomUUID(),date:at,type:'未接收退回／設備釋放',actor:'系統',result:'使用中 → 待機中',detail:affected.map(row=>row.requestId).join('、')+' 未確認接收，退回待排程。'},...(machine.records||[])]};
 });
 return {schedules:next,equipment:machines,returned};
}
