const canonical={id:'request_legacy_id',productCode:'product_code',customer:'customer_name',requester:'owner_label',supervisor:'supervisor_label',quantity:'quantity',dueDate:'requested_date',specification:'specification',judgementCriteria:'acceptance'};
export function defaultMappingSimulation(){return {flow_version:'PREAPPROVAL_V2',preflight_required:true,payload:{request_legacy_id:'REQ-EXAMPLE',product_code:'A08',customer_name:'範例客戶',owner_label:'範例委託者',supervisor_label:'範例主管',quantity:5,requested_date:'2026-12-01',specification:'範例試驗條件',acceptance:'範例判定基準',form_details:{productType:'電子模組',testItems:['範例試驗'],judgementRequired:'需作判定',sampleSource:['社內 In-house production'],sourceInHouseContent:'生產一課',sourceOverseasContent:'海外工廠',sourceCustomerContent:'範例客戶公司',sourceSupplierContent:'範例供應商',sourceCompetitorContent:'參考品牌',purpose:['新產品 New Product'],purposeOther:'其他用途說明',notes:'僅供模擬，不建立委託或儲存資料'}},department:'範例部門',execution_kind:'REAL'};}
export function updateSimulationValue(context,key,value){
 if(key==='department')return {...context,department:value};
 if(canonical[key])return {...context,payload:{...context.payload,[canonical[key]]:key==='quantity'&&value!==''?Number(value):value}};
 return {...context,payload:{...context.payload,form_details:{...context.payload.form_details,[key]:key==='testItems'?value.split('、').filter(Boolean):value}}};
}
