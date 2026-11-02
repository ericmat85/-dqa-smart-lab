import {submitMaterialBorrowRequest,decideMaterialBorrowRequest} from './materialBorrowing.mjs';
export {returnBorrowMaterial} from './materialBorrowing.mjs';
import {isCalendarDate} from './requestDate.mjs';
import {accessSystem,canApproveOperationalRequest} from './demoPermissions.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {usesEquipment,reservationWindow,resourceBusy} from './scheduleResources.mjs';
import {commitLifecycleTransaction,recoverLifecycleTransaction} from './scheduleLifecycle.mjs';
export const BORROW_KEY='dqa-borrow-requests-v1';
const EQUIPMENT_KEY='dqa-equipment-demo-v1';
const read=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('借用資料無法讀取。');return rows;};
function equipmentFor(form,equipment){
 const matches=form.equipmentId?equipment.filter(m=>m.id===form.equipmentId):equipment.filter(m=>m.name===form.equipment);
 if(matches.length!==1)throw Error('設備已移除或無法對應 LMS 台帳，請重新選擇設備。');return matches[0];
}
function assertAvailable(machine,form,storage,now){
 if(machine.status!=='待機中'||machine.activeBorrowId)throw Error(`設備目前為${machine.status}，僅待機設備可借用。`);
 if(Number(form.quantity)!==1)throw Error('每筆借用對應一台 LMS 實體設備，數量須為 1。');
 const start=Date.parse(`${form.borrowDate}T00:00:00+08:00`),end=Date.parse(`${form.returnDate}T00:00:00+08:00`)+86400000;
 const conflict=read(storage,'dqa-schedules-demo-v1',DEMO_SCHEDULES).find(row=>{
  if(!usesEquipment(row,machine)||!['已排程','試驗中','進行中','暫停中','待核准','已完成','已結案'].includes(row.status))return false;
  const window=reservationWindow(row,now);return resourceBusy(row,now)||(window&&window.start<end&&start<window.end);
 });
 if(conflict)throw Error(`設備與排程 ${conflict.requestId||conflict.id} 衝突，請改選設備或借用日期。`);
}
export function submitBorrowRequest(form,actorId,storage=window.localStorage){
 if(form.resourceType==='material')return submitMaterialBorrowRequest(form,actorId,storage);
 if(form.resourceType&&form.resourceType!=='equipment')throw Error('請選擇設備或物料借用。');
 recoverLifecycleTransaction(storage);
 const actor=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===actorId);if(!accessSystem(actor,'request',storage))throw Error('請以委託者帳號登入後申請。');
 if(!form.requester?.trim()||!form.department?.trim()||!form.equipment||!form.purpose?.trim()||!isCalendarDate(form.borrowDate)||!isCalendarDate(form.returnDate)||form.returnDate<form.borrowDate||!Number.isInteger(Number(form.quantity))||Number(form.quantity)<1)throw Error('請完成借用資料，並確認數量與借用期間。');
 const machine=equipmentFor(form,read(storage,EQUIPMENT_KEY,DEMO_EQUIPMENT));assertAvailable(machine,form,storage,Date.now());
 const row={...form,equipmentId:machine.id,equipment:machine.name,id:`BOR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8)}`,status:'待核准',actorId,actor:actor.name,createdAt:new Date().toISOString(),history:[]};
 storage.setItem(BORROW_KEY,JSON.stringify([row,...read(storage,BORROW_KEY)]));return row;
}
export function decideBorrowRequest({id,actorId,approve,comment='',signature=''},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const rows=read(storage,BORROW_KEY),row=rows.find(item=>item.id===id);if(row?.resourceType==='material')return decideMaterialBorrowRequest({id,actorId,approve,comment,signature},storage);if(!row||!['待核准','待確認'].includes(row.status))throw Error('借用申請已處理或已移除，請重新整理。');
 const accounts=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS),actor=accounts.find(item=>item.id===actorId);
 const applicantId=row.actorId||accounts.find(item=>item.name===row.requester)?.id;
 if(!canApproveOperationalRequest(actor,applicantId,storage))throw Error('僅未參與申請的一階主管或系統管理員可核准借用。');
 if(!approve&&!comment.trim())throw Error('退回原因必填。');
 const now=Date.now(),at=new Date(now).toISOString(),equipment=read(storage,EQUIPMENT_KEY,DEMO_EQUIPMENT);
 let machine;if(approve){if(!isCalendarDate(row.borrowDate)||!isCalendarDate(row.returnDate)||row.returnDate<row.borrowDate)throw Error('借用日期無效，請重新申請。');machine=equipmentFor(row,equipment);assertAvailable(machine,row,storage,now);}
 const next={...row,...(machine?{equipmentId:machine.id,equipment:machine.name}:{}),status:approve?'已核准':'已退回',reviewer:actor.name,reviewerId:actorId,reviewedAt:at,reviewComment:comment.trim(),reviewSignature:approve?signature:'',history:[...(row.history||[]),{at,actor:actor.name,actorId,action:approve?'核准借用':'退回借用',comment:comment.trim()}]};
 const transaction={borrows:JSON.stringify(rows.map(item=>item.id===id?next:item))};
 if(approve)transaction.equipment=JSON.stringify(equipment.map(m=>m.id===machine.id?{...m,status:'借用',currentRequest:'',estimatedEnd:'',activeBorrowId:id,borrower:row.requester,borrowReturnDate:row.returnDate,records:[{id:crypto.randomUUID(),date:at,type:'設備借用',actor:actor.name,actorId,result:'待機中 → 借用',detail:`${id}；借用人：${row.requester}；預計歸還：${row.returnDate}`},...(m.records||[])]}:m));
 commitLifecycleTransaction(storage,transaction);return next;
}
export function returnBorrowEquipment({equipmentId,actorId,comment='',expectedBorrowId},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const equipment=read(storage,EQUIPMENT_KEY,DEMO_EQUIPMENT),machine=equipment.find(m=>m.id===equipmentId),rows=read(storage,BORROW_KEY),row=rows.find(r=>r.id===machine?.activeBorrowId);
 if(expectedBorrowId&&expectedBorrowId!==machine?.activeBorrowId)throw Error('借用單已更新，請重新開啟歸還確認。');
 if(!machine||machine.status!=='借用'||!row||row.status!=='已核准'||row.equipmentId!==machine.id)throw Error('設備或借用狀態已變更，無法確認歸還。');
 const actor=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(a=>a.id===actorId);
 if(!canApproveOperationalRequest(actor,row.actorId,storage))throw Error('僅一階主管或系統管理員可在 LMS 確認歸還。');
 if(!comment.trim())throw Error('請填寫設備歸還確認結果。');
 const at=new Date().toISOString(),event={at,actor:actor.name,actorId,action:'確認歸還',comment:comment.trim()};
 const next=equipment.map(m=>m.id===machine.id?{...m,status:'待機中',activeBorrowId:null,borrower:'',borrowReturnDate:'',records:[{id:crypto.randomUUID(),date:at,type:'設備歸還',actor:actor.name,actorId,result:'借用 → 待機中',detail:`${row.id}；${comment.trim()}`},...(m.records||[])]}:m);
 commitLifecycleTransaction(storage,{equipment:JSON.stringify(next),borrows:JSON.stringify(rows.map(r=>r.id===row.id?{...r,status:'已歸還',returnedAt:at,returnedBy:actor.name,returnedById:actorId,history:[...(r.history||[]),event]}:r))});return next;
}
export function borrowApprovalOperation(row){return {...row,requestId:row.id,action:'borrow',actor:row.actor||row.requester,actorId:row.actorId,at:row.createdAt,status:['待核准','待確認'].includes(row.status)?'待審核':row.status,reason:row.purpose};}
