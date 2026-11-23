// Only a dedicated field determines purpose. Never infer it from product names or notes.
export const isVirtualRequest=request=>(request?.executionKind??request?.execution_kind)==='VIRTUAL';
export const executionKindLabel=request=>isVirtualRequest(request)?'虛擬委託':'真實委託';
