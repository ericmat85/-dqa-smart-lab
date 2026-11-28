export function isPendingScheduleSource({status,reviewLevel,preapprovalWorkflow}){
 return status==='AWAITING_SCHEDULING'||preapprovalWorkflow===true&&status==='AWAITING_LMS_REVIEW'&&reviewLevel===0;
}
