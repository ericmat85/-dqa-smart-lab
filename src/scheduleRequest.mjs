export function resolveScheduleRequest(row, requests = []) {
  const source = requests.find(request => request.id === row.requestId);
  if (source) return source;
  const list = value => Array.isArray(value) ? value : value ? String(value).split('、') : [];
  return {
    id: row.requestId || '未關聯委託', productCode: row.productCode, productType: row.productType,
    customer: row.customer, customerPartNo: row.customerPart, dueDate: row.requestedDate,
    quantity: row.quantity, department: row.department, requester: row.requester,
    priority: row.priority, createdAt: row.submitted,
    purpose: list(row.intent), sampleSource: list(row.sampleSource), productVersion: row.productVersion,
    pcbaVersion: row.pcbaVersion, softwareVersion: row.softwareVersion, manufactureDate: row.manufactureDate,
    sampleDescription: row.sampleDescription, testItems: list(row.title), specification: row.testSpec,
    judgementRequired: row.judgment, judgementCriteria: row.judgementCriteria, notes: row.remarks,
    status: ['取消','已完成','試驗中'].includes(row.status) ? row.status : '待排程',
    cancellation:row.cancellation,
  };
}

// Materialize newly approved electronic requests once, without resetting existing reservations.
export function mergeApprovedSchedules(schedules,requests) {
  const ids=new Set(schedules.map(row=>row.requestId));
  const added=requests.filter(row=>row.status==='待排程'&&row.lmsReview?.approval>=2&&!row.reportInfo?.stage&&!ids.has(row.id)).map(row=>{
    ids.add(row.id);
    return {id:`SCH-${row.id}`,requestId:row.id,status:'未排程',title:(row.testItems||[]).join('、'),quantity:row.quantity,productCode:row.productCode||row.product,productType:row.productType,customer:row.customer,customerPart:row.customerPartNo,requestedDate:row.dueDate,department:row.department,requester:row.requester,priority:row.priority,intent:(row.purpose||[]).join('、'),sampleSource:(row.sampleSource||[]).join('、'),productVersion:row.productVersion,pcbaVersion:row.pcbaVersion,softwareVersion:row.softwareVersion,manufactureDate:row.manufactureDate,testSpec:row.specification,judgment:row.judgementCriteria,remarks:row.notes||'',eq:'',owner:'',time:'',end:''};
  });
  return [...schedules,...added];
}
