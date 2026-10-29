import {returnLabCancellations} from './labCancellationReturn.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {accessSystem,canApproveOperationalRequest} from './demoPermissions.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {effectiveScheduleStatus} from './scheduleProgress.mjs';
import {commitLifecycleTransaction,recoverLifecycleTransaction} from './scheduleLifecycle.mjs';
export const LAB_OPERATIONS_KEY='dqa-lab-operations-v1';
const LAB_KEY='dqa_lab_demo_requests_v1',AUDIT_KEY='dqa_lab_demo_audit_v1',SCHEDULE_KEY='dqa-schedules-demo-v1',EQUIPMENT_KEY='dqa-equipment-demo-v1';
const list=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('無法讀取申請資料，請重新整理後重試。');return rows;};
function actorFor(storage,id){return list(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===id);}
export function submitLabOperation({requestId,action,reason,signature='',actorId},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const actor=actorFor(storage,actorId);if(!accessSystem(actor,'lab',storage))throw Error('此帳號無實驗室操作權限。');
 if(!['cancel','interrupt'].includes(action)||!reason?.trim())throw Error('請填寫申請原因。');
 if(action==='interrupt'&&!signature)throw Error('提出中斷申請前請先簽名。');
 const operations=list(storage,LAB_OPERATIONS_KEY),lab=list(storage,LAB_KEY);const row=lab.find(item=>item.id===requestId);
 if(!row||row.status!==(action==='cancel'?'待確認':'試驗中'))throw Error('試驗狀態已變更，請重新開啟申請。');
 if(operations.some(item=>item.requestId===requestId&&item.status==='待審核'))throw Error('此委託已有待審核申請。');
 const schedules=list(storage,SCHEDULE_KEY,DEMO_SCHEDULES);if(!schedules.some(item=>item.requestId===requestId&&item.status!=='取消'))throw Error('找不到可審核的 LMS 排程。');
 const source=schedules.find(item=>item.id===row.scheduleId||item.requestId===requestId);
 const operation={id:crypto.randomUUID(),requestId,scheduleId:source.id,reservationId:source.reservationId,scheduledStart:source.time,scheduledEnd:source.end,action,reason:reason.trim(),signature:action==='interrupt'?signature:'',actorId,actor:actor.name,at:new Date().toISOString(),status:'待審核',previousLabStatus:row.status};
 {
  const held=schedules.map(item=>item.requestId===requestId?{...item,status:'待核准',approvalHold:{operationId:operation.id,previousStatus:item.status}}:item);
  commitLifecycleTransaction(storage,{schedules:JSON.stringify(held),equipment:JSON.stringify(list(storage,EQUIPMENT_KEY,DEMO_EQUIPMENT)),labOperations:JSON.stringify([operation,...operations])});
 }
 return operation;
}
export function applyLabOperationResults(rows,operations){
 return rows.map(row=>{const latest=operations.find(item=>item.requestId===row.id);if(!latest)return row;
 if(latest.reservationId&&latest.reservationId!==row.reservationId)return row;
 if(latest.scheduledStart!==undefined&&(latest.scheduledStart!==row.scheduledStart||latest.scheduledEnd!==row.scheduledEnd))return row;
 if(latest.status!=='待審核'&&!latest.reservationId&&latest.scheduledStart===undefined&&row.pendingOperationId!==latest.id&&row.lastOperationId!==latest.id)return row;
 const pendingOperationId=latest.status==='待審核'?latest.id:'';
 const status=latest.status==='已核准'?(latest.action==='cancel'?'取消':'已中斷'):row.status;
 if(row.pendingOperationId===pendingOperationId&&row.lastOperationId===latest.id&&row.lastOperationStatus===latest.status)return row;
 return {...row,status,pendingOperationId,lastOperationId:latest.id,lastOperationStatus:latest.status};});
}
export function decideLabOperation({id,actorId,approve,comment='',signature=''},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const operations=list(storage,LAB_OPERATIONS_KEY),operation=operations.find(row=>row.id===id);if(!operation||operation.status!=='待審核')throw Error('此申請已處理，請重新整理清單。');
 const actor=actorFor(storage,actorId);if(!canApproveOperationalRequest(actor,operation.actorId,storage))throw Error('僅未參與申請的一階主管或系統管理員可核准。');
 if(!approve&&!comment.trim())throw Error('退回時請填寫原因。');
 const keys=[SCHEDULE_KEY,EQUIPMENT_KEY,'dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-cancelled-requests-v1',LAB_KEY,AUDIT_KEY,LAB_OPERATIONS_KEY];
 const data=new Map(keys.map(key=>[key,storage.getItem(key)]));if(data.get(SCHEDULE_KEY)===null)data.set(SCHEDULE_KEY,JSON.stringify(DEMO_SCHEDULES));const memory={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const schedules=list(memory,SCHEDULE_KEY,DEMO_SCHEDULES),lab=list(memory,LAB_KEY),row=lab.find(item=>item.id===operation.requestId);
 if(!row||row.status!==operation.previousLabStatus)throw Error('試驗狀態已變更，請先確認再審核。');
 const affected=schedules.filter(item=>item.requestId===operation.requestId);if(!affected.length||affected.every(item=>item.status==='取消'))throw Error('相關委託已取消或排程已移除。');
 if(operation.reservationId&&affected.some(item=>item.reservationId!==operation.reservationId))throw Error('此申請對應的日程已變更，請重新提出申請。');
 const now=Date.now(),at=new Date(now).toISOString();
 if(operation.action==='cancel'){
  if(approve){const result=returnLabCancellations(schedules,list(memory,EQUIPMENT_KEY,DEMO_EQUIPMENT),lab,[operation],now);memory.setItem(SCHEDULE_KEY,JSON.stringify(result.schedules));memory.setItem(EQUIPMENT_KEY,JSON.stringify(result.equipment));}
 }
 if(!approve)memory.setItem(SCHEDULE_KEY,JSON.stringify(schedules.map(item=>item.approvalHold?.operationId===id?{...item,status:item.approvalHold.previousStatus,approvalHold:undefined}:item)));
 if(approve&&operation.action==='interrupt'){
  const next=schedules.map(item=>item.requestId===operation.requestId?{...item,status:'未排程',time:'',end:'',approvalHold:undefined,interruption:{at,actor:actor.name,actorId,reason:operation.reason,previousStart:item.time,previousEnd:item.end}}:item);
  const equipment=list(memory,EQUIPMENT_KEY,DEMO_EQUIPMENT).map(machine=>{
   const matches=item=>item.equipmentId?item.equipmentId===machine.id:item.eq===machine.name;
   if(machine.status!=='使用中'||!affected.some(matches)||(machine.currentRequest&&machine.currentRequest!==operation.requestId)||next.some(item=>matches(item)&&effectiveScheduleStatus(item,now)==='試驗中'))return machine;
   return {...machine,status:'待機中',currentRequest:'',records:[{id:crypto.randomUUID(),date:at,type:'中斷核准／設備釋放',actor:actor.name,actorId,result:'使用中 → 待機中',detail:`${operation.requestId}：${operation.reason}`},...(machine.records||[])]};
  });memory.setItem(SCHEDULE_KEY,JSON.stringify(next));memory.setItem(EQUIPMENT_KEY,JSON.stringify(equipment));
 }
 const decision={...operation,status:approve?'已核准':'已退回',reviewerId:actorId,reviewer:actor.name,reviewedAt:at,reviewComment:comment.trim(),reviewSignature:approve?signature:''};
 const nextOperations=operations.map(item=>item.id===id?decision:item);const nextLab=approve&&operation.action==='cancel'?lab.filter(item=>item.id!==operation.requestId):lab.map(item=>item.id===operation.requestId?{...item,status:approve?'已中斷':item.status,pendingOperationId:'',lastOperationId:id,lastOperationStatus:decision.status}:item);
 const audit=list(memory,AUDIT_KEY);audit.unshift({id:`review-${id}`,requestId:operation.requestId,action:`一階主管${approve?'核准':'退回'}${operation.action==='cancel'?'取消':'中斷'}申請`,actor:actor.name,actorId,at,time:at,signature:decision.reviewSignature,reason:comment.trim()||operation.reason});
 const transaction={schedules:memory.getItem(SCHEDULE_KEY),equipment:memory.getItem(EQUIPMENT_KEY)||JSON.stringify(DEMO_EQUIPMENT),labOperations:JSON.stringify(nextOperations),labRequests:JSON.stringify(nextLab),labAudit:JSON.stringify(audit)};
 for(const [field,key]of [['requests','dqa-request-demo-v2'],['reviews','dqa-lms-reviews-v1'],['cancellations','dqa-cancelled-requests-v1']])if(memory.getItem(key)!==null)transaction[field]=memory.getItem(key);
 commitLifecycleTransaction(storage,transaction);return decision;
}
