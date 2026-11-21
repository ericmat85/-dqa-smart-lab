import {originalBusinessEnabled,businessIdentity} from './originalBusiness.mjs';
import {customRole} from './customRoles.mjs';
// Client-side competition demonstration rules; not an authorization boundary.
export const ROLE = Object.freeze({ REQUESTER:'委託者', REQUEST_MANAGER:'委託者主管', LAB:'實驗室工程師', LAB_ASSISTANT:'實驗室副工程師', LEVEL1:'一階主管', LEVEL2:'二階主管', LEVEL3:'三階主管', ADMIN:'系統管理員', VIEWER:'檢視者' });
const LEVELS = new Map([[ROLE.LEVEL1,1],[ROLE.LEVEL2,2],[ROLE.LEVEL3,3]]);
export function accessSystem(account, system, storage) {
 if (!account?.id || account.status !== '啟用中') return false;
 if(originalBusinessEnabled()&&account.id===businessIdentity()?.member.id)return ['lms','request','lab'].includes(system);
 const custom=customRole(account,storage);
 if(custom)return custom.builtin?custom.systems.includes(system):system==='lms';
 if (system === 'request') return [ROLE.REQUESTER,ROLE.REQUEST_MANAGER].includes(account.role);
 if (system === 'lab') return [ROLE.LAB,ROLE.LAB_ASSISTANT,ROLE.LEVEL1,ROLE.LEVEL2,ROLE.LEVEL3].includes(account.role);
 if (system === 'lms') return [ROLE.LEVEL1,ROLE.LEVEL2,ROLE.LEVEL3,ROLE.ADMIN].includes(account.role);
 return false;
}
export function canManageAccounts(account,storage) {if(account?.status!=='啟用中')return false;const role=customRole(account,storage);return role?role.manageAccounts===true:[ROLE.ADMIN,ROLE.LEVEL2].includes(account.role);}
export function canApproveOperationalRequest(account,applicantId,storage){
 if(!account?.id||account.status!=='啟用中'||account.id===applicantId)return false;
 return account.role===ROLE.ADMIN||canReview(account,{status:'待審查',approval:0,participantIds:[applicantId]},storage);
}
export function canApproveRequestManager(account, request) {
 return account?.status === '啟用中' && account.role === ROLE.REQUEST_MANAGER && Boolean(account.id) && request?.supervisorId === account.id && request.ownerId !== account.id;
}
export function canReview(account, request, storage) {
 if(request?.readOnly)return false;
 const custom=customRole(account,storage);
 const level=custom?custom.level:LEVELS.get(account?.role);
 if (!accessSystem(account,'lms',storage) || !level || (custom&&!custom.pages.includes('requests')) || request?.status !== '待審查') return false;
 if (level !== (request.approval ?? 0) + 1 || reviewedAtOtherLevel(account.id,level,request)) return false;
 const id=account.id;
 if ((request.participantIds || []).includes(id)) return false;
 if ((request.approvals || []).some(a => a.actorId === id)) return false;
 return true;
}

// Repeated review at the same level in a new correction round is allowed; changing levels is not.
export function reviewedAtOtherLevel(actorId,level,request={}) {
 const records=[...(request.signatureRecords||[]).filter(row=>['核准','退回'].includes(row.decision)).map(row=>({actorId:row.actorId,level:Number(row.stage)})),...(request.approvalRecords||[]).map(row=>({...row,level:Number(row.stage)})),...(request.approvals||[]).map(row=>({...row,level:Number(row.level??row.stage)})),...(request.reportInfo?.approvals||[])];
 return records.some(row=>row.actorId===actorId&&[1,2,3].includes(Number(row.level))&&Number(row.level)!==level);
}
