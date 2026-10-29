export function requestApprovalRows(requests,operations,schedules=[],borrows=[],reports=[]){
 const approvals=operations.filter(row=>['interrupt','cancel'].includes(row.action)&&row.status==='待審核');
 const ids=new Set(approvals.map(row=>row.requestId));
 const reportRows=reports.filter(row=>['level2','level3'].includes(row.stage)).map(row=>{const source=requests.find(item=>item.id===row.requestId)||{};return {...source,id:row.requestId,operationId:`report:${row.requestId}`,reportId:row.requestId,title:`試驗報告審核：${source.title||row.fileName}`,applicant:row.submitter,submitted:row.submittedAt?.slice(0,10),status:'待審核'};});
 return [...reportRows,...approvals.map(operation=>{
  const request=requests.find(row=>row.id===operation.requestId),schedule=schedules.find(row=>row.requestId===operation.requestId);
  return {...request,id:operation.requestId,operationId:operation.id,title:request?.title||schedule?.title||'試驗中斷申請',productCode:request?.productCode||schedule?.productCode||'',department:request?.department||schedule?.department||'',applicant:operation.actor,priority:request?.priority||schedule?.priority||'',submitted:operation.at.slice(0,10),status:'待核准',approvalReason:operation.reason};
 }),...borrows.filter(row=>['待確認','待核准'].includes(row.status)).map(row=>({id:row.id,operationId:`borrow:${row.id}`,title:`設備借用：${row.equipment}`,department:row.department,applicant:row.actor||row.requester,submitted:String(row.createdAt).slice(0,10),status:'待核准',approvalReason:row.purpose})),...requests.filter(row=>row.status==='待審查'&&!ids.has(row.id)&&!reportRows.some(item=>item.id===row.id))];
}
