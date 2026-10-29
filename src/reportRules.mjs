import {ROLE} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
export const REPORT_STATUS={level2:'待審核',level3:'待審核',view:'待查閱',archived:'已結案'};
export const DEFAULT_SIGNATURE_CELLS={level2:'A21',level3:'D21'};
export function canReviewReport(actor,report,request,storage){
 if(!actor?.id||actor.status!=='啟用中'||!request||['取消','已結案'].includes(request.status)||!['level2','level3'].includes(report?.stage))return false;
 const level=report.stage==='level2'?2:3;
 if(actor.role!==ROLE[`LEVEL${level}`]&&customRole(actor,storage)?.level!==level)return false;
 return ![report.submitterId,request?.ownerId,request?.supervisorId,...(report.approvals||[]).map(row=>row.actorId)].includes(actor.id);
}
export function canReadReport(actor,report,request,storage){
 if(!actor?.id||actor.status!=='啟用中')return false;
 return actor.role===ROLE.ADMIN||[report?.submitterId,...(report?.approvals||[]).map(row=>row.actorId)].includes(actor.id)||(['view','archived'].includes(report?.stage)&&[request?.ownerId,request?.supervisorId].includes(actor.id))||canReviewReport(actor,report,request,storage);
}
export function canConfirmReport(actor,report,request){return actor?.status==='啟用中'&&actor.id===request?.supervisorId&&!['取消','已結案'].includes(request?.status)&&report?.stage==='view';}
export function reportMetadata(report){
 if(!report?.stage)return null;
 return {requestId:report.requestId,revision:report.revision,stage:report.stage,status:REPORT_STATUS[report.stage],fileName:report.fileName,submittedAt:report.submittedAt,submitterId:report.submitterId,submitter:report.submitter,sheetName:report.sheetName,cells:report.cells,check:report.check,approvals:(report.approvals||[]).map(({signature:_signature,...rest})=>rest),confirmedAt:report.confirmedAt,confirmedBy:report.confirmedBy,archivedAt:report.archivedAt,pdfName:report.pdfName,history:report.history||[]};
}
