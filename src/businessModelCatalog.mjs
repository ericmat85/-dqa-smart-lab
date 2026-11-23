import catalog from '../render-backend/gateway/business_model_catalog.json' with {type:'json'};
import policy from '../render-backend/gateway/business_ai_policy.json' with {type:'json'};
export const BUSINESS_MODEL_CATALOG=catalog;
export function compatibleModelEvidence(data){const requested=data?.requested_model||data?.model,profile=catalog.models.find(r=>r.id===requested);return policy.models.includes(requested)&&!!profile?.compatible&&profile.response_models.includes(data?.model);}
export function modelOptions(data,form){
 const rows=data.models||data.allowed_models.map(id=>({id,compatible:true,available:true,selectable:true,reason:'沿用目前後端模型設定'}));
 return rows.map(row=>{
  const estimated=row.input_usd_per_million===undefined?null:(Number(row.max_input_tokens)*Number(row.input_usd_per_million)+Number(form.max_output_tokens)*Number(row.output_usd_per_million))/1e6;
  const over=estimated!==null&&(!Number.isFinite(estimated)||estimated>Number(form.per_call_usd)+1e-12);
  return {...row,selectable:!!row.compatible&&!!row.available&&!over,estimated,reason:over&&row.compatible&&row.available?'目前每次費用上限不足以涵蓋最大輸入與輸出':row.compatible&&row.available?(row.contract_reason||row.reason):row.reason};
 });
}
const nanos=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,9})?$/.test(value))return null;const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));};
export function verifiedModelCost(data){
 if(!compatibleModelEvidence(data)||!Number.isSafeInteger(data?.usage?.input_tokens)||!Number.isSafeInteger(data?.usage?.output_tokens)||data.usage.input_tokens<0||data.usage.output_tokens<0)return false;
 const profile=catalog.models.find(row=>row.id===(data.requested_model||data.model)),actual=nanos(data.estimated_cost_usd);if(actual===null)return false;
 const input=nanos(profile.input_usd_per_million),output=nanos(profile.output_usd_per_million);
 return actual*1000000n===BigInt(data.usage.input_tokens)*input+BigInt(data.usage.output_tokens)*output;
}
