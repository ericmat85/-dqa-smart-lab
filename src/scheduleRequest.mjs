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
