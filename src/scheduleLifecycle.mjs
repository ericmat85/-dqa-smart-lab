import {mergeApprovedSchedules} from './scheduleRequest.mjs';
import {scheduleProgress,effectiveScheduleStatus} from './scheduleProgress.mjs';
import {SCHEDULE_KEY,EQUIPMENT_KEY} from './scheduleEquipment.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {returnUnreceivedSchedules} from './scheduleReceipt.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {storageDelta,applyStorageDelta} from './storageDelta.mjs';
import {updateRequestExecution} from './requestExecution.mjs';

export function reconcileSchedules(schedules,equipment,now) {
  const at=new Date(now).toISOString();
  let nextEquipment=equipment.map(row=>({...row}));
  const machineFor=row=>nextEquipment.find(item=>row.equipmentId?item.id===row.equipmentId:item.name===row.eq);
  const next=schedules.map(original=>{
    const row={...original};
    if(['已排程','試驗中','進行中'].includes(row.status)){
      const phase=scheduleProgress(row,now);
      row.status=effectiveScheduleStatus(row,now);
      if(row.status==='已完成')row.completedAt=new Date(phase.end).toISOString();
    }
    return row;
  });
  const matches=(row,machine)=>row.equipmentId?row.equipmentId===machine.id:row.eq===machine.name;
  for(const row of next.filter(item=>item.status==='試驗中')){
    const machine=machineFor(row);
    if(!machine)continue;
    if(['維護中','校驗中'].includes(machine.status)){
      row.status='有衝突';row.scheduleIssue=`設備目前為${machine.status}，無法開始試驗。`;
      continue;
    }
    if(machine.status==='待機中'){
      machine.status='使用中';machine.currentRequest=row.requestId;
      machine.records=[{id:crypto.randomUUID(),date:at,type:'試驗開始',actor:'系統',result:'待機中 → 使用中',detail:`${row.requestId} 到達排程開始時間。`},...(machine.records||[])];
    }
  }
  for(const row of next.filter(item=>item.status==='已完成'&&!item.equipmentReleaseHandledAt)){
    const machine=machineFor(row);
    if(machine&&next.some(item=>item.status==='試驗中'&&matches(item,machine)))continue;
    // Maintenance and calibration remain in force, even when a scheduled period has ended.
    if(machine?.status==='使用中'&&(!machine.currentRequest||machine.currentRequest===row.requestId||next.some(item=>item.status==='已完成'&&item.requestId===machine.currentRequest&&matches(item,machine)))){
      machine.status='待機中';machine.currentRequest='';
      machine.records=[{id:crypto.randomUUID(),date:at,type:'試驗完成／設備釋放',actor:'系統',result:'使用中 → 待機中',detail:`${row.requestId} 試驗日程已結束，設備恢復待機。`},...(machine.records||[])];
    }
    row.equipmentReleaseHandledAt=at;
  }
  return {schedules:next,equipment:nextEquipment};
}

const JOURNAL='dqa-schedule-lifecycle-pending-v1';
const TRANSACTION_KEYS=[['equipment',EQUIPMENT_KEY],['schedules',SCHEDULE_KEY],['requests','dqa-request-demo-v2'],['reviews','dqa-lms-reviews-v1'],['cancellations','dqa-cancelled-requests-v1'],['labOperations','dqa-lab-operations-v1'],['labRequests','dqa_lab_demo_requests_v1'],['labAudit','dqa_lab_demo_audit_v1'],['borrows','dqa-borrow-requests-v1'],['demoFlowMarker','dqa-completed-flow-provisioned-v1']];
export function recoverLifecycleTransaction(storage) {
  const pending=storage.getItem(JOURNAL);
  if(!pending)return false;
  const transaction=JSON.parse(pending);
  if(transaction.version===2){
    for(const {key,patch}of transaction.changes){
      const current=JSON.parse(storage.getItem(key)||'null');
      storage.setItem(key,JSON.stringify(applyStorageDelta(current,patch)));
    }
    storage.removeItem(JOURNAL);
    return true;
  }
  storage.setItem(EQUIPMENT_KEY,transaction.equipment);
  storage.setItem(SCHEDULE_KEY,transaction.schedules);
  for(const [field,key] of [['requests','dqa-request-demo-v2'],['reviews','dqa-lms-reviews-v1'],['cancellations','dqa-cancelled-requests-v1'],['labOperations','dqa-lab-operations-v1'],['labRequests','dqa_lab_demo_requests_v1'],['labAudit','dqa_lab_demo_audit_v1'],['borrows','dqa-borrow-requests-v1']]){
    if(transaction[field]!==undefined)storage.setItem(key,transaction[field]);
  }
  storage.removeItem(JOURNAL);
  return true;
}
export function commitLifecycleTransaction(storage,transaction) {
  // Save only changed fields/rows; signatures already stored are not duplicated in the journal.
  recoverLifecycleTransaction(storage);
  const changes=[];
  for(const [field,key]of TRANSACTION_KEYS){
    if(transaction[field]===undefined)continue;
    const before=JSON.parse(storage.getItem(key)||'null'),after=JSON.parse(transaction[field]);
    const patch=storageDelta(before,after);if(patch)changes.push({key,patch});
  }
  if(!changes.length)return;
  try{
    storage.setItem(JOURNAL,JSON.stringify({version:2,changes}));
    recoverLifecycleTransaction(storage);
  }catch(error){
    if(error.name==='QuotaExceededError'||/quota/i.test(error.message))throw Error('瀏覽器儲存空間不足，核准或排程更新尚未完成。原有資料未清除，請勿清除網站資料。');
    throw error;
  }
}
export function syncScheduleLifecycle(storage,now) {
  // Recover an interrupted two-key update before calculating another transition.
  const pending=recoverLifecycleTransaction(storage);
  const saved=storage.getItem(SCHEDULE_KEY);
  const raw=saved===null?JSON.stringify(DEMO_SCHEDULES):saved;
  const schedules=JSON.parse(raw),equipmentRaw=storage.getItem(EQUIPMENT_KEY);
  const equipment=equipmentRaw?JSON.parse(equipmentRaw):DEMO_EQUIPMENT;
  if(!Array.isArray(schedules)||!Array.isArray(equipment))throw Error('排程或設備資料無法讀取。');
  const lab=JSON.parse(storage.getItem('dqa_lab_demo_requests_v1')||'[]');
  if(!Array.isArray(lab))throw Error('無法讀取實驗室接收資料。');
  const operations=JSON.parse(storage.getItem('dqa-lab-operations-v1')||'[]');
  if(!Array.isArray(operations))throw Error('無法讀取實驗室申請。');
  const pendingCancel=new Map(operations.filter(row=>['cancel','interrupt'].includes(row.action)&&row.status==='待審核').map(row=>[row.requestId,row]));
  const sourceRaw=storage.getItem('dqa-request-demo-v2');
  const source=sourceRaw===null?[]:JSON.parse(sourceRaw);if(!Array.isArray(source))throw Error('無法讀取電子委託資料。');
  const heldSchedules=mergeApprovedSchedules(schedules,source).map(row=>pendingCancel.has(row.requestId)&&!['取消','待核准'].includes(row.status)?{...row,status:'待核准',approvalHold:{operationId:pendingCancel.get(row.requestId).id,previousStatus:row.status}}:row);
  const receipt=returnUnreceivedSchedules(heldSchedules,equipment,lab,now);
  const result=reconcileSchedules(receipt.schedules,receipt.equipment,now);
  const nextSchedules=JSON.stringify(result.schedules),nextEquipment=JSON.stringify(result.equipment);
  const nextSource=sourceRaw===null?null:JSON.stringify(updateRequestExecution(source,result.schedules,lab,now));
  if(saved!==null&&nextSchedules===raw&&nextEquipment===JSON.stringify(equipment)&&nextSource===sourceRaw)return Boolean(pending);
  const transaction={schedules:nextSchedules,equipment:nextEquipment};
  if(nextSource!==null&&nextSource!==sourceRaw)transaction.requests=nextSource;
  if(receipt.returned.length){
    const ids=new Set(receipt.returned.map(row=>row.requestId));
    const audit=JSON.parse(transaction.labAudit||storage.getItem('dqa_lab_demo_audit_v1')||'[]');
    const operations=JSON.parse(storage.getItem('dqa-lab-operations-v1')||'[]');
    if(!Array.isArray(audit))throw Error('無法讀取實驗室歷程。');
    transaction.labRequests=JSON.stringify(lab.filter(row=>!ids.has(row.id)&&row.status!=='已退回LMS'));
    transaction.labAudit=JSON.stringify([...receipt.returned.map(row=>({id:crypto.randomUUID(),requestId:row.requestId,action:'未接收自動退回LMS',actor:'系統',actorId:'SYSTEM',at:row.at,time:row.at,reason:row.reason,signature:''})),...audit]);
    transaction.labOperations=JSON.stringify(operations.map(row=>ids.has(row.requestId)&&row.status==='待審核'?{...row,status:'已退回',reviewer:'系統',reviewerId:'SYSTEM',reviewedAt:new Date(now).toISOString(),reviewComment:'未確認接收，原排程已自動退回待排程，請重新安排。'}:row));
  }
  commitLifecycleTransaction(storage,transaction);
  return true;
}
