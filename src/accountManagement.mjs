import {canManageAccounts} from './demoPermissions.mjs';
export function deleteDemoAccount(accounts,id,actorId,storage){
 const actor=accounts.find(row=>row.id===actorId),target=accounts.find(row=>row.id===id);
 if(!canManageAccounts(actor,storage))throw Error('此帳號沒有帳號管理權限。');
 if(!target)throw Error('帳號已不存在，請重新整理。');
 if(id===actorId)throw Error('無法刪除目前登入的帳號。');
 if(accounts.some(row=>row.id!==id&&row.supervisorId===id))throw Error('請先重新指派此帳號所屬的委託者主管關係。');
 return accounts.filter(row=>row.id!==id);
}
