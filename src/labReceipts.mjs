import {accessSystem} from './demoPermissions.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
import {recoverLifecycleTransaction,commitLifecycleTransaction,reconcileSchedules} from './scheduleLifecycle.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {updateRequestExecution} from './requestExecution.mjs';
const list=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('接收資料無法讀取。');return rows;};
export function confirmLabReceipt({requestId,actorId,expected,now=Date.now()},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const actor=list(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===actorId);if(!accessSystem(actor,'lab',storage))throw Error('此帳號無實驗室接收權限。');
 const rows=list(storage,'dqa_lab_demo_requests_v1'),row=rows.find(item=>item.id===requestId),schedules=list(storage,'dqa-schedules-demo-v1');
 const schedule=schedules.find(item=>item.requestId===requestId&&(!row?.scheduleId||item.id===row.scheduleId));
 const operations=list(storage,'dqa-lab-operations-v1');
 if(!row||row.status!=='待確認'||operations.some(item=>item.requestId===requestId&&item.status==='待審核'))throw Error('案件已接收、已移除或待核准，請重新整理清單。');
 if(!schedule||!['已排程','試驗中','進行中'].includes(schedule.status))throw Error('原排程已變更，請重新整理清單。');
 if(expected&&(expected.scheduleId!==schedule.id||expected.reservationId!==schedule.reservationId||expected.time!==schedule.time||expected.end!==schedule.end))throw Error('試驗日程已更新，請重新開啟確認視窗。');
 const progress=scheduleProgress({...schedule,status:'已排程'},now);if(progress.phase!=='waiting')throw Error('已到開始時間或日程無效，案件將退回 LMS 待排程。');
 const at=new Date(now).toISOString(),receipt={...row,status:'已排程',acceptedAt:at,scheduleId:schedule.id,reservationId:schedule.reservationId,scheduledStart:schedule.time,scheduledEnd:schedule.end};
 const audit=list(storage,'dqa_lab_demo_audit_v1');audit.unshift({id:crypto.randomUUID(),requestId,actorId,actor:actor.name,at,time:at,action:'確認接收',reason:'確認接收，等待排程開始',signature:''});
 commitLifecycleTransaction(storage,{labRequests:JSON.stringify(rows.map(item=>item.id===requestId?receipt:item)),labAudit:JSON.stringify(audit)});return receipt;
}
export function completeLabTrial({requestId,actorId,signature,now=Date.now()},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const actor=list(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===actorId);if(!accessSystem(actor,'lab',storage)||!signature)throw Error('請以啟用中的實驗室帳號完成簽名。');
 const lab=list(storage,'dqa_lab_demo_requests_v1'),row=lab.find(item=>item.id===requestId),schedules=list(storage,'dqa-schedules-demo-v1');
 const schedule=schedules.find(item=>item.requestId===requestId&&item.id===row?.scheduleId);
 if(!row||row.status!=='試驗中'||!schedule||schedule.reservationId!==row.reservationId||schedule.time!==row.scheduledStart||schedule.end!==row.scheduledEnd||!['試驗中','已排程','進行中'].includes(schedule.status)||scheduleProgress(schedule,now).phase!=='running'||list(storage,'dqa-lab-operations-v1').some(item=>item.requestId===requestId&&item.status==='待審核'))throw Error('案件並非進行中、已更新或待核准，請重新整理。');
 const at=new Date(now).toISOString(),completed={...row,status:'已完成',completedAt:at};
 const nextSchedules=schedules.map(item=>item.id===schedule.id?{...item,status:'已完成',completedAt:at}:item);
 const result=reconcileSchedules(nextSchedules,list(storage,'dqa-equipment-demo-v1',DEMO_EQUIPMENT),now);
 const audit=list(storage,'dqa_lab_demo_audit_v1');audit.unshift({id:crypto.randomUUID(),requestId,actor:actor.name,actorId,at,time:at,action:'完成試驗',signature,reason:'實驗室確認試驗完成'});
 const nextLab=lab.map(item=>item.id===requestId?completed:item);
 const sourceRaw=storage.getItem('dqa-request-demo-v2');
 const source=sourceRaw===null?null:list(storage,'dqa-request-demo-v2');
 commitLifecycleTransaction(storage,{schedules:JSON.stringify(result.schedules),equipment:JSON.stringify(result.equipment),labRequests:JSON.stringify(nextLab),labAudit:JSON.stringify(audit),...(source?{requests:JSON.stringify(updateRequestExecution(source,result.schedules,nextLab,now))}:{})});return completed;
}
