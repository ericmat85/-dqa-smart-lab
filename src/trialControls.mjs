import {canControlTrial} from './trialPermissions.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
import {usesEquipment,reservationWindow} from './scheduleResources.mjs';
import {commitLifecycleTransaction,recoverLifecycleTransaction,reconcileSchedules} from './scheduleLifecycle.mjs';
import {updateRequestExecution} from './requestExecution.mjs';
import {completeLabTrial} from './labReceipts.mjs';
const read=(s,k)=>JSON.parse(s.getItem(k)||'[]');
function actorFor(storage,id,system){
 const a=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS)).find(a=>a.id===id);
 if(!accessSystem(a,system,storage)||(system==='lms'&&customRole(a,storage)&&!customRole(a,storage).pages.includes('schedule')))throw Error('目前帳號沒有此操作權限。');
 return a;
}
export function setTrialPaused({scheduleId,actorId,paused,now=Date.now()},storage=window.localStorage){
 recoverLifecycleTransaction(storage);const actor=actorFor(storage,actorId,'lms');if(!canControlTrial(actor,storage))throw Error('僅 lv1 一階主管可暫停或恢復試驗。');
 const schedules=read(storage,'dqa-schedules-demo-v1'),row=schedules.find(r=>r.id===scheduleId),lab=read(storage,'dqa_lab_demo_requests_v1'),receipt=lab.find(r=>r.scheduleId===scheduleId);
 if(!row||!receipt?.acceptedAt||receipt.reservationId!==row.reservationId||receipt.scheduledStart!==row.time||receipt.scheduledEnd!==row.end||row.reportInfo?.stage||read(storage,'dqa-lab-operations-v1').some(r=>r.requestId===row.requestId&&r.status==='待審核'))throw Error('案件未接收、已送報告或有待核准申請，無法暫停／恢復。');
 if(paused?Boolean(row.pauseStartedAt)||scheduleProgress(row,now).phase!=='running':!row.pauseStartedAt||row.status!=='暫停中')throw Error('試驗狀態已變更，請重新開啟排程。');
 const equipment=read(storage,'dqa-equipment-demo-v1'),machines=equipment.filter(m=>usesEquipment(row,m));
 if(!machines.length||machines.some(m=>!['使用中','待機中','暫停中'].includes(m.status)))throw Error('設備已移除或維護中，無法變更試驗狀態。');
 if(paused&&schedules.some(r=>r.id!==row.id&&machines.some(m=>usesEquipment(r,m))&&['試驗中','進行中','暫停中'].includes(r.status)))throw Error('設備由其他試驗共用中，請先確認其他試驗，避免一併暫停。');
 const at=new Date(now).toISOString(),action=paused?'暫停試驗':'恢復試驗';
 const updated={...row,status:paused?'暫停中':'試驗中',pauseStartedAt:paused?at:null,pauseTotalMs:Number(row.pauseTotalMs||0)+(paused?0:Math.max(0,now-Date.parse(row.pauseStartedAt))),history:[...(row.history||[]),`${at} ${actor.name} ${action}`]};
 const resumed=reservationWindow(updated,now);
 if(!paused&&schedules.some(r=>r.id!==row.id&&['已排程','試驗中','進行中','暫停中','待核准'].includes(r.status)&&machines.some(m=>usesEquipment(r,m))&&(()=>{const w=reservationWindow(r,now);return w&&w.start<resumed.end&&resumed.start<w.end;})()))throw Error('順延後與其他設備排程衝突，請先調整其他排程再恢復。');
 const next=schedules.map(r=>r.id===row.id?updated:r),nextLab=lab.map(r=>r.scheduleId===row.id?{...r,status:updated.status}:r);
 const end=new Date(scheduleProgress(updated,now).end).toISOString();
 const nextEquipment=equipment.map(m=>machines.some(x=>x.id===m.id)?{...m,status:paused?'暫停中':'使用中',currentRequest:row.requestId,estimatedEnd:end,records:[{id:crypto.randomUUID(),date:at,type:action,actor:actor.name,detail:row.requestId,result:paused?'暫停中':'使用中'},...(m.records||[])]}:m);
 const audit=[{id:crypto.randomUUID(),requestId:row.requestId,actor:actor.name,actorId,at,time:at,action,reason:'排程管理確認操作',signature:''},...read(storage,'dqa_lab_demo_audit_v1')];
 commitLifecycleTransaction(storage,{schedules:JSON.stringify(next),equipment:JSON.stringify(nextEquipment),labRequests:JSON.stringify(nextLab),labAudit:JSON.stringify(audit),requests:JSON.stringify(updateRequestExecution(read(storage,'dqa-request-demo-v2'),next,nextLab,now))});return updated;
}
export function accelerateTrial({actorId,signature,requestId,now=Date.now()},storage=window.localStorage){
 recoverLifecycleTransaction(storage);const actor=actorFor(storage,actorId,'lab');
 const schedules=read(storage,'dqa-schedules-demo-v1'),lab=read(storage,'dqa_lab_demo_requests_v1');
 const sources=read(storage,'dqa-request-demo-v2');
 const operations=read(storage,'dqa-lab-operations-v1');
 const reviews=read(storage,'dqa-lms-reviews-v1');
 const completeSource=id=>{
  if(requestId&&id!==requestId)return false;
  const source=sources.find(r=>r.id===id);
  if(source)return Boolean(source.ownerId&&source.supervisorId)&&!source.reportInfo?.stage&&!['取消','已結案','已完成','待審核','待查閱'].includes(source.status);
  // Legacy LMS requests use their own review ledger. Its 完成 means review approved,
  // not trial completed; require both approval levels and never materialize a new case.
  const review=reviews.find(r=>r.id===id&&r.source!=='electronic-request');
  return Boolean(review&&Number(review.approval)>=2&&!review.reportInfo?.stage&&!['取消','已結案','已完成','待審核','待查閱','退回','待補件'].includes(review.status));
 };
 const matchingSchedule=receipt=>schedules.find(row=>row.id===receipt.scheduleId&&row.requestId===receipt.id&&row.reservationId&&row.reservationId===receipt.reservationId&&row.time===receipt.scheduledStart&&row.end===receipt.scheduledEnd);
 const usable=receipt=>{const row=matchingSchedule(receipt);return completeSource(receipt.id)&&Number.isFinite(Date.parse(receipt.acceptedAt))&&Date.parse(receipt.acceptedAt)<=now&&!receipt.reportInfo?.stage&&!receipt.pendingOperationId&&!operations.some(o=>o.requestId===receipt.id&&o.status==='待審核')&&row&&!row.reportInfo?.stage&&!row.pendingOperationId;};
 const running=lab.find(r=>usable(r)&&r.demoAccelerator&&r.status==='試驗中');
 if(running)return {id:running.id,stage:'completed',row:completeLabTrial({requestId:running.id,actorId,signature,now},storage)};
 if(lab.some(r=>usable(r)&&r.demoAccelerator&&r.status==='暫停中'))throw Error('加速中的試驗已暫停，請先在排程管理恢復試驗。');
 const receipt=lab.find(r=>{const row=matchingSchedule(r);return usable(r)&&r.status==='已排程'&&row.status==='已排程'&&!row.pauseStartedAt&&scheduleProgress(row,now).phase==='waiting';});
 if(!receipt)throw Error('目前沒有已排程、已接收且等待開始的現有委託單；請先完成排程並由實驗室確認接收。Demo 試驗加速器不會建立新案件。');
 const row=matchingSchedule(receipt);
 const duration=24*3600000,time=new Date(now-duration/2).toISOString(),end=new Date(now+duration/2).toISOString();
 const updated={...row,time,end,status:'試驗中',pauseTotalMs:0,pauseStartedAt:null,demoAccelerator:true};
 const equipment=read(storage,'dqa-equipment-demo-v1'),machines=equipment.filter(m=>usesEquipment(row,m));
 const window=reservationWindow(updated,now);
 if(!machines.length||machines.some(m=>!['待機中','使用中'].includes(m.status))||schedules.some(r=>r.id!==row.id&&['已排程','試驗中','進行中','暫停中','待核准'].includes(r.status)&&machines.some(m=>usesEquipment(r,m))&&(()=>{const w=reservationWindow(r,now);return w&&w.start<window.end&&window.start<w.end;})()))throw Error('加速後的日程與其他設備保留衝突，請先調整排程。');
 const nextLab=lab.map(r=>r.id===receipt.id?{...r,scheduledStart:time,scheduledEnd:end,status:'試驗中',demoAccelerator:true}:r);
 const result=reconcileSchedules(schedules.map(r=>r.id===row.id?updated:r),equipment,now),at=new Date(now).toISOString();
 commitLifecycleTransaction(storage,{schedules:JSON.stringify(result.schedules),equipment:JSON.stringify(result.equipment),labRequests:JSON.stringify(nextLab),requests:JSON.stringify(updateRequestExecution(read(storage,'dqa-request-demo-v2'),result.schedules,nextLab,now)),labAudit:JSON.stringify([{id:crypto.randomUUID(),requestId:receipt.id,actor:actor.name,actorId,at,time:at,action:'Demo試驗加速器：進度 50%',reason:'僅模擬試驗時間，不代表實際試驗結果',signature:''},...read(storage,'dqa_lab_demo_audit_v1')])});return {id:receipt.id,stage:'running'};
}
