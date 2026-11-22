import {canApproveRequestManager,ROLE} from './demoPermissions.mjs';
import {appendSignature} from './signatureHistory.mjs';
export function ownsRequest(actor,request) {
 if(!actor?.id||actor.status!=='啟用中')return false;
 return request.ownerId?request.ownerId===actor.id:request.ownerUser===actor.name||request.requester===actor.name;
}
export function assertEditableRequest(actor,request) {
 if((actor?.businessIdentity?!(actor.businessAdmin||actor.businessPermissions?.includes('requests.draft')):actor?.role!==ROLE.REQUESTER)||!request||!ownsRequest(actor,request)||!['草稿','退件','補件中'].includes(request.status))throw Error('此委託單已更新或無編輯權限，請重新開啟。');
}
export function deleteDraft(requests,id,actor) {
 const request=requests.find(row=>row.id===id);
 assertEditableRequest(actor,request);
 if(request.status!=='草稿')throw Error('僅草稿可以刪除。');
 return requests.filter(row=>row.id!==id);
}
export function reviewRequesterDecision(request,actor,{status,signature='',comment='',now=new Date().toISOString()}) {
 if(!request||request.status!=='待主管簽核')throw Error('此委託單目前無法簽核。');
 if(!canApproveRequestManager(actor,request))throw Error('僅指定主管可審核，申請人不得自行簽核。');
 if(!['已核准','退件'].includes(status))throw Error('無效的簽核決定。');
 if(status==='已核准'&&!/^data:image\/(png|jpeg);base64,/i.test(signature))throw Error('核准前請先完成主管簽名。');
 const reason=comment.trim();
 if(status==='退件'&&!reason)throw Error('退回時請填寫原因。');
 return {...request,status,signatureRecords:appendSignature(request,{stage:'直屬主管簽核',actor:actor.name,actorId:actor.id,signature,decision:status==='退件'?'退回':'核准',comment:reason,at:now}),supervisorSignature:signature,supervisorSignatureAt:signature?now:'',approver:actor.name,approvalDate:now,updatedAt:now,approvalNote:reason||(status==='已核准'?'主管核准':'請依意見補件')};
}
