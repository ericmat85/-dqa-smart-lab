// Preparation never dispatches the business mutation; retain diagnostic evidence
// without implying that the user should repeat an uncertain execute request.
export function preparationFailureMessage(error){
 const status=Number.isInteger(error?.status)&&error.status>0?'HTTP '+error.status:'';
 const code=typeof error?.code==='string'?error.code.slice(0,80):'';
 const trace=typeof error?.trace==='string'?error.trace.replace(/[^A-Za-z0-9_:.-]/g,'').slice(0,180):'';
 return '預備請求未能確認，本次尚未送出資料異動。'+([status,code].filter(Boolean).length?'（'+[status,code].filter(Boolean).join('；')+'）':'')+(trace?' Trace '+trace:'');
}
