import {establishSession} from './previewAssistant.mjs';
import {verifyE2Result} from './e2Scheduling.mjs';

export async function askE2Scheduling(context,{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,signal,onStage=()=>{},idempotencyKey=crypto.randomUUID()}={}){
 const account=storage?.getItem('dqa-lms-account-id');
 if(!account)throw Object.assign(Error('E2 SESSION_REQUIRED'),{code:'SESSION_REQUIRED',httpStatus:401});
 onStage(0);await establishSession('lms',account,fetchImpl,signal);
 if(signal?.aborted)throw signal.reason;
 const body={synthetic:true,question:'CHECK_SYNTHETIC_SCHEDULE',schedule_context:context};
 if(new TextEncoder().encode(JSON.stringify(body)).length>8192)throw Error('E2_DTO_BLOCKED: PAYLOAD_TOO_LARGE_NO_TRUNCATION');
 onStage(1);
 const response=await fetchImpl('/api/preview/ui/live/E2',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':'lms','X-Preview-Idempotency-Key':idempotencyKey},body:JSON.stringify(body),signal});
 let packet;try{packet=await response.json();}catch{throw Object.assign(Error(`E2 HTTP ${response.status} NON_JSON_RESPONSE；結果未確認，不自動重送。`),{code:'NON_JSON_RESPONSE',httpStatus:response.status});}
 if(!response.ok){const code=/^[A-Z0-9_]{1,80}$/.test(packet?.error?.code||'')?packet.error.code:'SERVICE_UNAVAILABLE',trace=/^I-[A-Za-z0-9_-]{1,80}$/.test(packet?.trace_id||'')?packet.trace_id:'UNKNOWN';throw Object.assign(Error(`E2 HTTP ${response.status} ${code} · Trace ${trace}；結果未確認，不自動重送。`),{code,httpStatus:response.status,trace});}
 onStage(2);return await verifyE2Result(packet,context);
}
