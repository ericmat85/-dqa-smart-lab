export const REQUEST_SEARCH_FIELDS = [['all','全部欄位'],['id','委託單號'],['product','產品／專案'],['testItems','試驗項目'],['requester','委託人'],['dueDate','需求日期']];
export function matchesRequestSearch(request, query, field='all') {
 const values={id:[request.id],product:[request.productCode,request.product,request.project],testItems:request.testItems||[],requester:[request.requester],dueDate:[request.dueDate]};
 return (field==='all'?[...Object.values(values).flat(),request.department]:values[field]||[]).join(' ').toLowerCase().includes(query.trim().toLowerCase());
}
