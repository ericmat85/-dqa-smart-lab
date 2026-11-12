import {aiSessionState,setAISessionState} from './aiSessionState.mjs';
import {selectE4ChatMode,sessionFailure,renderE4Reply} from './e4ChatModes.mjs';
const enabled=import.meta.env?.VITE_PRIVATE_PREVIEW==='1';
const base=import.meta.env?.VITE_SANDBOX_API_BASE;
const sessionKey=system=>`dqa-${system}-account-id`;
function endpoint(path){
 if(!enabled)throw Error('真實 AI 未啟用（PRIVATE_PREVIEW_REQUIRED）；未呼叫模型。');
 if(base!=='/api/preview')throw Error('AI Proxy 設定未完成；未呼叫模型。');
 return base+path;
}
const pendingRevocations=new Map();
export function closePreviewAISession(system){
 if(!enabled||base!=='/api/preview')return Promise.resolve({status:'NOT_REQUIRED'});
 const operation=setAISessionState(system,'PENDING');
 globalThis.dispatchEvent?.(new CustomEvent('dqa:ai-session-ended',{detail:{system}}));
 const result=(async()=>{
  let confirmed=false;
  try{const response=await fetch(base+'/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,logout:true}),signal:AbortSignal.timeout(5000)});const packet=await response.json();confirmed=response.ok&&packet.signed_out===true;}catch{/* The visible state remains unconfirmed, never false success. */}
  const status=confirmed?'CONFIRMED':'UNCONFIRMED';setAISessionState(system,status,operation.epoch);return {status};
 })();pendingRevocations.set(system,result);result.finally(()=>{if(pendingRevocations.get(system)===result)pendingRevocations.delete(system);});return result;
}
async function establishSession(system,accountId,fetchImpl,signal){
 if(pendingRevocations.has(system))await pendingRevocations.get(system);
 const fresh=['PENDING','UNCONFIRMED','CONFIRMED'].includes(aiSessionState(system).status);
 const response=await fetchImpl(endpoint('/session'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,accountId,password:'demo1234',...(fresh?{freshConversation:true}:{})}),signal});
 if(!response.ok)throw Error(await sessionFailure(response));
 if(fresh){let packet;try{packet=await response.json();}catch{throw Error('AI_SESSION_RESPONSE_INVALID');}if(packet.authenticated!==true||packet.session_created!==true||!/^[a-f0-9]{32}$/.test(packet.conversation_id||''))throw Error('AI_SESSION_FRESH_CONTEXT_NOT_CONFIRMED');setAISessionState(system,'ACTIVE');}
 return response;
}

export async function askPreviewAssistant(question,system,{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,signal,idempotencyKey=globalThis.crypto.randomUUID()}={}){
 // E4-only Preview: this floating assistant never dispatches other engines.
 const selected=selectE4ChatMode(question);if(['/clear','清除對話'].includes(question.trim()))selected.question='/clear';
 const url=endpoint('/ui/live/E4');
 if(!['lms','request','lab'].includes(system))throw Error('AI 系統權限不符；未呼叫模型。');
 const accountId=storage?.getItem(sessionKey(system));
 if(!accountId)throw Error('請先使用 Demo 帳號登入，再使用 AI 助理。');
 // This password is the existing public synthetic Demo credential, never a backend secret.
 await establishSession(system,accountId,fetchImpl,signal);
 const response=await fetchImpl(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':system,'X-Preview-Idempotency-Key':idempotencyKey},body:JSON.stringify({synthetic:true,question:selected.question,mode:selected.mode}),signal});
 let packet;try{packet=await response.json();}catch{throw Error(`E4 HTTP ${response.status} · NON_JSON_RESPONSE；未取得模型結果。`);}
 if(!response.ok){const code=/^[A-Z0-9_]{1,80}$/.test(packet?.error?.code||'')?packet.error.code:'SERVICE_UNAVAILABLE';const trace=/^I-[A-Za-z0-9_-]{1,80}$/.test(packet?.trace_id||'')?packet.trace_id:'UNKNOWN';throw Error(`AI 請求失敗（${code}）；未取得模型結果。Trace ${trace}${/^(?:O-|I-)[A-Za-z0-9_-]{1,100}$/.test(packet?.request_id||'')?' · Request '+packet.request_id:''}；結果未知時不自動重送。`);}
 return renderE4Reply(packet,selected.mode);
}

export async function askEngineAdvice(engine,record,context={},system='lms',{fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,signal,idempotencyKey=globalThis.crypto.randomUUID()}={}){
 const {makeEngineInput}=await import('./aiSyntheticInput.mjs');const payload=makeEngineInput(engine,record,context),url=endpoint('/ui/live/'+engine);
 if(!['lms','request','lab'].includes(system))throw Error('AI_DTO_BLOCKED: INVALID_SYSTEM');
 const accountId=storage?.getItem(sessionKey(system));if(!accountId)throw Error('AI_SESSION_REQUIRED：請先使用 Demo 帳號登入。');
 await establishSession(system,accountId,fetchImpl,signal);
 const r=await fetchImpl(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Preview-System':system,'X-Preview-Idempotency-Key':idempotencyKey},body:JSON.stringify(payload),signal});let packet;
 try{packet=await r.json();}catch{throw Error(`AI ${engine} HTTP ${r.status} NON_JSON_RESPONSE；未取得模型結果。`);}
 if(!r.ok)throw Error(`AI ${engine} ${packet.error?.code||'SERVICE_UNAVAILABLE'} · Trace ${packet.trace_id||'UNKNOWN'} · REAL_AI=NOT_LIVE；未產生模型建議。`);
 const d=packet.data;const mock=d?.execution_mode==='MOCK'&&d.real_ai===false&&d.provider==='DETERMINISTIC_MOCK_REVIEW';
 const live=d?.execution_mode==='LIVE_PROVIDER'&&d.real_ai===true&&d.provider==='openai_responses'&&typeof d.provider_request_id==='string'&&/^req_[A-Za-z0-9_-]+$/.test(d.provider_request_id);
 if((!mock&&!live)||d.engine!==engine||typeof d.result?.summary!=='string'||!Array.isArray(d.result.issues)||!Array.isArray(d.result.advice))throw Error('REAL_AI_NOT_VERIFIED');
 if(mock&&(!/^[a-f0-9]{32}$/.test(d.conversation_id||'')||!/^O-[a-f0-9]{64}$/.test(d.request_id||'')||d.trace_id!==packet.trace_id||d.human_final_decision!==true||d.provenance?.writes!=='NONE'))throw Error('AI_MOCK_CONTRACT_INVALID');
 if(engine==='E2'&&/\b(?:FEASIBLE|NO_FEASIBLE_SCHEDULE)\b/i.test(JSON.stringify(d.result)))throw Error('AI_OUTPUT_BLOCKED: CAPACITY_AUTHORITY_UNKNOWN');
 if(engine==='E3'&&/\d/.test(d.result.summary)&&!mock)throw Error('AI_OUTPUT_BLOCKED: NO_VERIFIED_MEASUREMENTS');
 return {...d.result,trace:packet.trace_id,request_id:d.request_id,conversation_id:d.conversation_id,provenance:d.provenance,mode:mock?'MOCK_RULE_BASED_ONLY':'LIVE_PROVIDER_ADVISORY_ONLY',capacity_status:engine==='E2'?'UNKNOWN':undefined};
}

export function renderEngineAdvice(result,engine){
 const header=result.mode==='MOCK_RULE_BASED_ONLY'?'【MOCK／確定性處理；未呼叫真實模型】':'【LIVE_PROVIDER／僅供人工審查】';
 if(engine==='E3'&&result.mode==='MOCK_RULE_BASED_ONLY'&&(result.measurement_status!=='UNKNOWN_NO_VERIFIED_RESULTS'||result.signatures?.length!==0||!Array.isArray(result.draft_sections)||!Array.isArray(result.sources)))throw Error('AI_OUTPUT_BLOCKED: REPORT_PROVENANCE_INVALID');
 const sections=(result.draft_sections||[]).map(x=>x.heading+'：'+x.text);
 const sources=(result.sources||[]).map(x=>'資料來源：'+x.record_id+'（合成資料）');
 return [header,result.summary,...sections,...sources,...result.issues,...result.advice,'Trace '+result.trace+' · 人工最終決策 · 不自動簽核或修改資料'].join('\n');
}
