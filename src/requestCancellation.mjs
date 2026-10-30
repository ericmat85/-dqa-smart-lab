import {usesEquipment,resourceBusy} from './scheduleResources.mjs';
import {SCHEDULE_KEY,EQUIPMENT_KEY} from './scheduleEquipment.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {recoverLifecycleTransaction,commitLifecycleTransaction} from './scheduleLifecycle.mjs';

export const CANCELLATION_KEY='dqa-cancelled-requests-v1';
const REQUEST_KEY='dqa-request-demo-v2',REVIEW_KEY='dqa-lms-reviews-v1';
export function applyCancelledRequests(rows,cancellations) {
  return rows.map(row=>{
    const cancellation=cancellations[row.id];
    if(!cancellation)return row;
    const message=`${cancellation.at} ${cancellation.actor} 中止排程並取消委託：${cancellation.reason}`;
    return {...row,status:'取消',cancellation,history:(row.history||[]).includes(message)?row.history:[...(row.history||[]),message]};
  });
}
export function readCancellationOverrides(rows,storage=window.localStorage) {
  const cancellations=JSON.parse(storage.getItem(CANCELLATION_KEY)||'{}');
  return applyCancelledRequests(rows,cancellations);
}
export function stopRequestSchedules({scheduleId,requestId,actor,actorId,reason,now=Date.now()},storage=window.localStorage) {
  if(!actor||!actorId)throw Error('請重新登入後再操作。');
  recoverLifecycleTransaction(storage);
  const schedules=JSON.parse(storage.getItem(SCHEDULE_KEY)||'[]');
  const equipment=JSON.parse(storage.getItem(EQUIPMENT_KEY)||'null')||DEMO_EQUIPMENT;
  const requests=JSON.parse(storage.getItem(REQUEST_KEY)||'[]');
  const reviews=JSON.parse(storage.getItem(REVIEW_KEY)||'[]');
  const cancellations=JSON.parse(storage.getItem(CANCELLATION_KEY)||'{}');
  if(![schedules,equipment,requests,reviews].every(Array.isArray))throw Error('無法讀取資料，尚未取消委託。');
  const selected=schedules.find(row=>row.id===scheduleId&&row.requestId===requestId);
  if(!selected)throw Error('找不到對應的委託排程，請重新開啟。');
  if(cancellations[requestId]&&schedules.filter(row=>row.requestId===requestId).every(row=>row.status==='取消'))return {schedules,equipment};
  const at=new Date(now).toISOString();
  const cancellation={requestId,actor,actorId,at,reason:String(reason||'').trim()||'使用者確認中止排程並取消整張委託'};
  const affected=schedules.filter(row=>row.requestId===requestId);
  const nextSchedules=schedules.map(row=>row.requestId===requestId?{...row,status:'取消',previousStatus:row.status,cancellation}:row);
  const matches=usesEquipment;
  const nextEquipment=equipment.map(machine=>{
    if(machine.status!=='使用中'||!affected.some(row=>matches(row,machine)))return machine;
    if(machine.currentRequest&&machine.currentRequest!==requestId)return machine;
    if(nextSchedules.some(row=>row.requestId!==requestId&&matches(row,machine)&&resourceBusy(row,now)))return machine;
    return {...machine,status:'待機中',currentRequest:'',records:[{id:crypto.randomUUID(),date:at,type:'中止排程／設備釋放',actor,actorId,result:'使用中 → 待機中',detail:`${requestId} 已取消：${cancellation.reason}`},...(machine.records||[])]};
  });
  const nextCancellations={...cancellations,[requestId]:cancellation};
  const nextRequests=requests.map(row=>row.id===requestId?{
    ...row,status:'取消',cancellation,updatedAt:at,
    lmsReview:{...(row.lmsReview||{}),status:'取消',history:[...(row.lmsReview?.history||[]),`${at} ${actor} 中止排程並取消委託：${cancellation.reason}`]},
  }:row);
  const nextReviews=applyCancelledRequests(reviews,nextCancellations);
  commitLifecycleTransaction(storage,{schedules:JSON.stringify(nextSchedules),equipment:JSON.stringify(nextEquipment),...(storage.getItem(REQUEST_KEY)!==null?{requests:JSON.stringify(nextRequests)}:{}),...(storage.getItem(REVIEW_KEY)!==null?{reviews:JSON.stringify(nextReviews)}:{}),cancellations:JSON.stringify(nextCancellations)});
  return {schedules:nextSchedules,equipment:nextEquipment};
}
