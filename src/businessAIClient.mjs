import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,originalBusinessEnabled} from './originalBusiness.mjs';
export const businessAIEnabled=()=>originalBusinessEnabled()&&import.meta.env?.VITE_BUSINESS_AI==='true';
export const BUSINESS_AI_EVENT='dqa:business-ai-activity';
const pendingKey=()=>{const me=businessIdentity();return me?'dqa-business-ai-pending-v1:'+me.user.id+':'+me.member.id:null;};
export function pendingBusinessAI(){try{return JSON.parse(sessionStorage.getItem(pendingKey())||'[]');}catch{return[];}}
function remember(value){const key=pendingKey();if(!key)return;sessionStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event(BUSINESS_AI_EVENT));}
function forget(id){remember(pendingBusinessAI().filter(x=>x.id!==id));}
export function verifyBusinessAI(data,engine){
 if(!data||data.engine!==engine||data.real_ai!==true||data.execution_mode!=='LIVE_PROVIDER'||data.provider!=='openai_responses'||!/^req_[A-Za-z0-9_-]+$/.test(data.provider_request_id||'')||!/^resp_[A-Za-z0-9_-]+$/.test(data.provider_response_id||'')||!/^I-[a-f0-9]{32}$/.test(data.trace_id||'')||typeof data.result?.summary!=='string'||!Array.isArray(data.result.findings)||!Array.isArray(data.result.sections)||!Array.isArray(data.result.references)||!Number.isSafeInteger(data.usage?.input_tokens)||data.usage.input_tokens<0||!Number.isSafeInteger(data.usage?.output_tokens)||data.usage.output_tokens<0||!/^\d+(?:\.\d+)?$/.test(data.estimated_cost_usd||''))throw Object.assign(Error('模型回應缺少有效來源、用量或 Provider 證據，未採用結果。'),{code:'AI_PROVIDER_EVIDENCE_REQUIRED'});return data;
}
export async function askBusinessAI(engine,input,{system='lms',signal,operationId=crypto.randomUUID()}={}){
 if(!businessAIEnabled())throw Error('此版本尚未啟用正式帳號 AI。');
 const me=businessIdentity();if(!me)throw Error('請先登入。');
 const existing=pendingBusinessAI();if(existing.some(x=>x.engine===engine))throw Object.assign(Error('此引擎有一筆結果待確認，請先到 AI 引擎管理查詢原操作結果。'),{code:'AI_PENDING_RESULT'});
 remember([...existing,{id:operationId,engine,at:Date.now()}]);
 try{const {data}=await businessClient.request('/ai/generate',{method:'POST',body:{operation_id:operationId,engine,system,input},signal});if(businessIdentity()?.user.id!==me.user.id||businessIdentity()?.member.id!==me.member.id)throw Error('登入帳號已變更。');const checked=verifyBusinessAI(data,engine);forget(operationId);return checked;}
 catch(e){const unknown=e.outcomeUnknown||e.name==='AbortError'||['AI_OUTCOME_UNKNOWN','AI_RESPONSE_INVALID'].includes(e.code);if(!unknown)forget(operationId);const error=Object.assign(Error(unknown?'模型處理結果尚未確認，請到 AI 引擎管理查詢；不會自動重送。':aiErrorMessage(e)),{...e,code:e.code||'AI_REQUEST_FAILED',operationId,outcomeUnknown:unknown});throw error;}
}
export async function lookupBusinessAI(id){const {data}=await businessClient.request('/ai/result/'+id);if(['SUCCEEDED','FAILED','NOT_FOUND'].includes(data.state))forget(id);return data;}
export function aiErrorMessage(e){return ({BUSINESS_AI_NOT_CONFIGURED:'AI 後端連線設定尚未完成。',AI_ACCESS_DENIED:'目前帳號沒有讀取這份 AI 來源的權限。',AI_NO_VALID_CANDIDATE:'目前找不到通過既有規則的候選方案；請確認設備、執行人、已核定條件與搜尋期間。',AI_SEARCH_LIMIT_REACHED:'候選搜尋已達本次檢查上限，請縮小搜尋期間或設備數。',AI_SOURCE_TOO_LARGE:'必要來源超過本次模型輸入上限；請縮小所選資料範圍，未截斷來源。',INPUT_TOKEN_LIMIT:'問題與必要來源超過模型輸入上限；請縮短問題或指定單一項目。',AI_REPORT_SOURCE_MISMATCH:'報表來源已變更或不在目前權限內，請重新開啟報告生成。',AI_OUTPUT_REJECTED:'模型回應未通過來源與格式檢查，未採用結果。',AI_SOURCE_CHANGED:'分析期間來源已更新，請重新讀取。',AI_RATE_LIMITED:'AI 請求過於頻繁，請稍後再試。',RATE_LIMIT:'AI 共用預算每分鐘最多兩次，請稍後再試。',SERVICE_BUSY:'共用模型目前處理其他請求，請稍後再試。',TOTAL_BUDGET_LIMIT:'既有 AI 剩餘額度不足，尚未呼叫模型。',OUTCOME_RECONCILIATION_REQUIRED:'AI 帳本有一筆費用待核對，暫停後續呼叫以避免重複計費。',BUDGET_EXPIRED:'目前 AI 預算期限已到，尚未呼叫模型。',PLANNING_APPROVAL_REQUIRED:'委託須先完成既有簽核、進入待排程，才能提出 AI 候選方案。',AI_PROVIDER_EVIDENCE_REQUIRED:'模型回應證據無法核對，未採用結果。'})[e.code]||businessErrorMessage(e);}
export function renderBusinessAI(data){const r=data.result;return [r.summary,...r.findings.map(x=>'• '+x),...r.sections.map(x=>x.title+'\n'+x.text),r.references.length?'引用：'+r.references.join('、'):'',`Trace ${data.trace_id} · ${data.model} · Tokens ${data.usage.input_tokens}/${data.usage.output_tokens} · USD ${data.estimated_cost_usd}`].filter(Boolean).join('\n\n');}
export async function reviewBusinessRequest(request,{system='lms',signal}={}){
 const data=await askBusinessAI('E1',{request_id:request.databaseId||request.id,expected_revision:request.sourceRevision||request.revision,language:'zh-TW'},{system,signal});
 return {engine:'E1',real_ai:true,mode:'LIVE_PROVIDER',provider:data.provider,trace_id:data.trace_id,checkedFields:data.source?.record_count??0,createdAt:new Date(data.source?.observed_at||Date.now()).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),summary:data.result.summary,findings:data.result.findings.map((detail,i)=>({level:'warning',title:'模型審查 '+(i+1),detail,scope:'REQUEST'})),checks:data.result.findings.map((detail,i)=>({status:'UNKNOWN',title:'需確認 '+(i+1),detail})),usage:data.usage,estimated_cost_usd:data.estimated_cost_usd,model:data.model,writes:'NONE',providerResult:data};
}
