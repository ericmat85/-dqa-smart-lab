import {establishSession} from './previewAssistant.mjs';
import {verifyE2Result} from './e2Scheduling.mjs';
import {requireE2Enabled} from './e2PlanningSettings.mjs';
import {beginE2Activity,stageE2Activity,contextE2Activity,finishE2Activity} from './e2Activity.mjs';

export async function askE2Scheduling(context,{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,preferenceStorage=globalThis.localStorage,signal,onStage=()=>{},idempotencyKey=crypto.randomUUID(),activityTicket=null}={}){
 const account=storage?.getItem('dqa-lms-account-id'),ticket=activityTicket||beginE2Activity(account);
 let response,packet;
 try{
  if(activityTicket&&activityTicket.accountId!==account)throw Object.assign(Error('AI Session 帳號已變更，請重新登入後再分析。'),{code:'SESSION_CONTEXT_CHANGED',httpStatus:401});
  if(!account)throw Object.assign(Error('E2 SESSION_REQUIRED'),{code:'SESSION_REQUIRED',httpStatus:401});
  const preferences=requireE2Enabled(preferenceStorage);contextE2Activity(ticket,context,preferences.settings);
  stageE2Activity(ticket,'SESSION');onStage(0);await establishSession('lms',account,fetchImpl,signal);
  if(signal?.aborted)throw signal.reason;
  const body={synthetic:true,question:'CHECK_SYNTHETIC_SCHEDULE',schedule_context:context};
  if(new TextEncoder().encode(JSON.stringify(body)).length>8192)throw Object.assign(Error('E2_DTO_BLOCKED: PAYLOAD_TOO_LARGE_NO_TRUNCATION'),{code:'PAYLOAD_TOO_LARGE_NO_TRUNCATION'});
  stageE2Activity(ticket,'UPSTREAM');onStage(1);
  response=await fetchImpl('/api/preview/ui/live/E2',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':'lms','X-Preview-Idempotency-Key':idempotencyKey},body:JSON.stringify(body),signal});
  try{packet=await response.json();}catch{throw Object.assign(Error(`E2 HTTP ${response.status} NON_JSON_RESPONSE；結果未確認，不自動重送。`),{code:'NON_JSON_RESPONSE',httpStatus:response.status});}
  if(!response.ok){const code=/^[A-Z0-9_]{1,80}$/.test(packet?.error?.code||'')?packet.error.code:'SERVICE_UNAVAILABLE',trace=/^I-[A-Za-z0-9_-]{1,80}$/.test(packet?.trace_id||'')?packet.trace_id:'UNKNOWN';throw Object.assign(Error(`E2 HTTP ${response.status} ${code} · Trace ${trace}；結果未確認，不自動重送。`),{code,httpStatus:response.status,trace});}
  stageE2Activity(ticket,'VERIFYING');onStage(2);const data=await verifyE2Result(packet,context);
  finishE2Activity(ticket,{status:'SUCCESS',httpStatus:response.status,data});return data;
 }catch(error){
  const cancelled=signal?.aborted||error?.name==='AbortError';
  finishE2Activity(ticket,{status:cancelled?'CANCELLED':'ERROR',httpStatus:response?.status??error?.httpStatus??error?.aiHttpStatus,traceId:packet?.trace_id||error?.trace||error?.message?.match(/Trace (I-[A-Za-z0-9_-]{1,80})(?:\s|$)/)?.[1],errorCode:cancelled?'REQUEST_CANCELLED':error?.code||error?.aiErrorCode||(response?'RESPONSE_REJECTED':'NETWORK_OR_SESSION_ERROR')});
  throw error;
 }
}

export function e2ProviderUnavailableMessage(code){
 const reason=({BUDGET_EXPIRED:'AI 排程的模型預算期限已到期，需更新既有帳本期限。',E2_SPEND_APPROVAL_REQUIRED:'AI 排程尚未取得有效的獨立模型預算授權。',PROVIDER_CREDENTIAL_REQUIRED:'AI 排程的伺服器模型憑證尚未就緒。',MODEL_METADATA_ACCESS_NOT_VERIFIED:'AI 排程尚未確認模型存取權。',E2_SESSION_STORE_UNAVAILABLE:'AI 排程的安全對話儲存尚未就緒。',E2_LEDGER_RECOVERY_REQUIRED:'AI 排程的持久帳本需先完成復原核對。'})[code]||'AI 排程模型尚未就緒。';
 return reason+' 確定性規則檢查已完成，但未呼叫模型、未帶入新的排程日期。';
}
