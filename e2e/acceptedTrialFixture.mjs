// Test-only explicit setup of an existing, accepted future reservation.
export async function seedAcceptedTrial(page){
 const id=await page.evaluate(async()=>{
  const {createCompletedDemoFlow}=await import('/src/completedDemoFlow.mjs');
  const {createDemoApprovalSignature}=await import('/src/demoApprovalSignature.mjs');
  const {updateRequestExecution}=await import('/src/requestExecution.mjs');
  const now=Date.now(),result=createCompletedDemoFlow({viewerId:sessionStorage.getItem('dqa-lab-account-id')||'U003',signature:createDemoApprovalSignature('DEMO fixture'),now,newExample:true,halfway:true});
  const read=key=>JSON.parse(localStorage.getItem(key)||'[]'),time=new Date(now+86400000).toISOString(),end=new Date(now+172800000).toISOString();
  const schedules=read('dqa-schedules-demo-v1').map(row=>row.requestId===result.id?{...row,time,end,status:'已排程',demoAccelerator:false}:row);
  const lab=read('dqa_lab_demo_requests_v1').map(row=>row.id===result.id?{...row,status:'已排程',scheduledStart:time,scheduledEnd:end,acceptedAt:new Date(now).toISOString(),demoAccelerator:false}:row);
  const machineId=schedules.find(row=>row.requestId===result.id).equipmentId;
  localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify(schedules));localStorage.setItem('dqa_lab_demo_requests_v1',JSON.stringify(lab));localStorage.setItem('dqa-request-demo-v2',JSON.stringify(updateRequestExecution(read('dqa-request-demo-v2'),schedules,lab,now)));
  localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(read('dqa-equipment-demo-v1').map(row=>row.id===machineId?{...row,status:'待機中',currentRequest:'',estimatedEnd:''}:row)));
  return result.id;
 });
 await page.reload();return id;
}
