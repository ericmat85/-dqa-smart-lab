import {isCalendarDate} from './requestDate.mjs';
import {accessSystem,canApproveOperationalRequest} from './demoPermissions.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
export const BORROW_KEY='dqa-borrow-requests-v1';
const read=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('借用資料無法讀取。');return rows;};
export function submitBorrowRequest(form,actorId,storage=window.localStorage){
 const actor=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===actorId);if(!accessSystem(actor,'request',storage))throw Error('請以委託者帳號登入後申請。');
 if(!form.requester?.trim()||!form.department?.trim()||!form.equipment||!form.purpose?.trim()||!isCalendarDate(form.borrowDate)||!isCalendarDate(form.returnDate)||form.returnDate<form.borrowDate||!Number.isInteger(Number(form.quantity))||Number(form.quantity)<1)throw Error('請完成借用資料，並確認數量與借用期間。');
 const row={...form,id:`BOR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8)}`,status:'待核准',actorId,actor:actor.name,createdAt:new Date().toISOString(),history:[]};
 storage.setItem(BORROW_KEY,JSON.stringify([row,...read(storage,BORROW_KEY)]));return row;
}
export function decideBorrowRequest({id,actorId,approve,comment='',signature=''},storage=window.localStorage){
 const rows=read(storage,BORROW_KEY),row=rows.find(item=>item.id===id);if(!row||!['待核准','待確認'].includes(row.status))throw Error('借用申請已處理或已移除，請重新整理。');
 const accounts=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS),actor=accounts.find(item=>item.id===actorId);
 const applicantId=row.actorId||accounts.find(item=>item.name===row.requester)?.id;
 if(!canApproveOperationalRequest(actor,applicantId,storage))throw Error('僅未參與申請的一階主管或系統管理員可核准借用。');
 if(!approve&&!comment.trim())throw Error('退回原因必填。');
 const at=new Date().toISOString(),next={...row,status:approve?'已核准':'已退回',reviewer:actor.name,reviewerId:actorId,reviewedAt:at,reviewComment:comment.trim(),reviewSignature:approve?signature:'',history:[...(row.history||[]),{at,actor:actor.name,actorId,action:approve?'核准借用':'退回借用',comment:comment.trim()}]};
 storage.setItem(BORROW_KEY,JSON.stringify(rows.map(item=>item.id===id?next:item)));return next;
}
export function borrowApprovalOperation(row){return {...row,requestId:row.id,action:'borrow',actor:row.actor||row.requester,actorId:row.actorId,at:row.createdAt,status:['待核准','待確認'].includes(row.status)?'待審核':row.status,reason:row.purpose};}
