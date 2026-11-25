// Fill only the active local LV1 form. This registry never saves or signs a case.
let active=null;
export function registerLV1Demo({actorId,run}){
 const entry={actorId,run};active=entry;
 return ()=>{if(active===entry)active=null;};
}
export function fillLV1Demo({system,actorId,path=globalThis.location?.pathname}={}){
 if(system!=='lms'||String(path||'').replace(/\/+$/,'')!=='/lms/requests')return {ok:false,message:'請至 LMS「試驗委託」開啟 LV1 審查，再輸入 /demo fill in LV1。'};
 if(!active)return {ok:false,message:'請先開啟要填寫的 LV1 審查視窗。'};
 if(actorId!==undefined&&active.actorId!==actorId)return {ok:false,message:'登入帳號已變更，請重新開啟 LV1 審查。'};
 return active.run();
}
export function lv1DemoManualFields(request){
 const purpose=request?.purpose||request?.intentions||[],items=Array.isArray(purpose)?purpose:[String(purpose)],permitTypes=[];
 if(items.some(v=>/新產品|new product/i.test(v)))permitTypes.push('new_product');
 if(items.some(v=>/設計變更|design change/i.test(v)))permitTypes.push('design_change');
 if(!permitTypes.length)permitTypes.push('other');
 return {permitTypes,permitOther:permitTypes.includes('other')?(items.filter(Boolean).join('、')||'Demo 合成試驗需求'):'',allowed:'yes',criteriaClear:'yes',resourcesReady:'yes',resourcesExpectedDate:'',reportDueDate:/^\d{4}-\d{2}-\d{2}$/.test(request?.dueDate||request?.requestedDate||'')?request.dueDate||request.requestedDate:''};
}
