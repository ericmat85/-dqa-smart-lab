import {isWorkspaceReviewer} from './adminReviewRights.mjs';
import {reviewedAtOtherLevel,ROLE} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
export const REPORT_STATUS={level2:'待審核',level3:'待審核',view:'待查閱',archived:'已結案',returned:'已完成'};
export const DEFAULT_SIGNATURE_CELLS={level3:'A21',level2:'D21',executor:'G21'};
export function canReviewReport(actor,report,request,storage){
 if(report?.businessDatabase&&isWorkspaceReviewer(actor))return !!request&&!request.readOnly&&!['取消','已結案'].includes(request.status)&&['level2','level3'].includes(report.stage);
 if(report?.businessDatabase){const level=report.stage==='level2'?2:report.stage==='level3'?3:0;return !!(actor?.businessIdentity&&actor.status==='啟用中'&&level&&actor.businessReviewLevel===level&&(actor.businessAdmin||actor.businessPermissions?.includes('reports.review'))&&![report.submitterId,request?.ownerId,request?.supervisorId,...(report.approvals||[]).map(a=>a.actorId)].includes(actor.id)&&!reviewedAtOtherLevel(actor.id,level,request)&&!reviewedAtOtherLevel(actor.id,level,{approvals:[...(report.approvals||[]),...(report.priorApprovals||[])]}));}
 if(!actor?.id||actor.status!=='啟用中'||!request||['取消','已結案'].includes(request.status)||!['level2','level3'].includes(report?.stage))return false;
 const level=report.stage==='level2'?2:3;
 if(actor.role!==ROLE[`LEVEL${level}`]&&customRole(actor,storage)?.level!==level)return false;
 if(reviewedAtOtherLevel(actor.id,level,request)||reviewedAtOtherLevel(actor.id,level,{approvals:[...(report.approvals||[]),...(report.priorApprovals||[])]}))return false;
 return ![report.submitterId,request?.ownerId,request?.supervisorId,...(report.approvals||[]).map(row=>row.actorId)].includes(actor.id);
}
export function canReadReport(actor,report,request,storage){
 if(report?.businessDatabase)return !!(actor?.businessIdentity&&actor.status==='啟用中'&&(actor.businessAdmin||report.submitterId===actor.id||report.approvals?.some(a=>a.actorId===actor.id)||canReviewReport(actor,report,request,storage)||['view','archived'].includes(report.stage)&&[request?.ownerId,request?.supervisorId].includes(actor.id)));
 if(!actor?.id||actor.status!=='啟用中')return false;
 return actor.role===ROLE.ADMIN||[report?.submitterId,...(report?.approvals||[]).map(row=>row.actorId)].includes(actor.id)||(['view','archived'].includes(report?.stage)&&[request?.ownerId,request?.supervisorId].includes(actor.id))||canReviewReport(actor,report,request,storage);
}
export function canConfirmReport(actor,report,request){return actor?.status==='啟用中'&&(actor.businessIdentity?(actor.businessAdmin||actor.businessPermissions?.includes('reports.confirm')):actor.role===ROLE.REQUEST_MANAGER)&&(isWorkspaceReviewer(actor)||actor.id===request?.supervisorId)&&!['取消','已結案'].includes(request?.status)&&report?.stage==='view';}
export function reportMetadata(report){
 if(!report?.stage)return null;if(report.businessDatabase)return report;
 return {requestId:report.requestId,revision:report.revision,stage:report.stage,status:REPORT_STATUS[report.stage],fileName:report.fileName,submittedAt:report.submittedAt,submitterId:report.submitterId,submitter:report.submitter,sheetName:report.sheetName,cells:report.cells,pdfSections:report.pdfSections,documentKind:report.documentKind,revisionNumber:report.revisionNumber||1,returnReason:report.returnReason,priorApprovals:(report.priorApprovals||[]).map(({signature:_signature,...rest})=>rest),check:report.check,approvals:(report.approvals||[]).map(({signature:_signature,...rest})=>rest),confirmedAt:report.confirmedAt,confirmedBy:report.confirmedBy,confirmedById:report.confirmedById,archivedAt:report.archivedAt,pdfName:report.pdfName,history:report.history||[]};
}
