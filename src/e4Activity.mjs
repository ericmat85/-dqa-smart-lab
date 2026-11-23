// Browser-tab operational observations, never an authorization or billing ledger.
export const E4_ACTIVITY_EVENT='dqa:e4-activity';
const owners=new Map(),MAX_ROWS=40,MAX_AGE=30*60*1000;
const systems=new Set(['lms','request','lab']);
const safe=(value,pattern)=>typeof value==='string'&&pattern.test(value)?value:null;
const trace=value=>safe(value,/^I-[A-Za-z0-9_-]{1,80}$/);
function owner(system,accountId){return systems.has(system)&&safe(accountId,/^[A-Za-z0-9_-]{1,80}$/)?system+':'+accountId:null;}
function publish(){try{globalThis.window?.dispatchEvent(new Event(E4_ACTIVITY_EVENT));}catch{/* Observation must never interrupt a chat request. */}}
function recent(key,now){const rows=(owners.get(key)||[]).filter(r=>now-r.startedAt<MAX_AGE);if(rows.length)owners.set(key,rows);else owners.delete(key);return rows;}
export function beginE4Activity({system,accountId,mode,control=false},now=Date.now()){
 const key=owner(system,accountId);if(!key||!['GENERAL_CHAT','DOCUMENT_QA'].includes(mode))return null;
 const id=globalThis.crypto.randomUUID();owners.set(key,[{id,system,mode,kind:control?'CONTROL':'CHAT',startedAt:now,status:'PENDING',httpStatus:null,traceId:null,providerId:null,model:null,inputTokens:null,outputTokens:null,costUsd:null,contextPairs:null,execution:'UNKNOWN',durationMs:null,errorCode:null},...recent(key,now)].slice(0,MAX_ROWS));publish();return {key,id};
}
export function finishE4Activity(ticket,{status='ERROR',httpStatus=null,packet=null,errorCode=null}={},now=Date.now()){
 if(!ticket)return false;const rows=recent(ticket.key,now),index=rows.findIndex(r=>r.id===ticket.id);if(index<0||rows[index].status!=='PENDING')return false;
 const d=packet?.data,u=d?.usage;const mock=d?.execution_mode==='MOCK'&&d.real_ai===false&&d.provider==='MOCK_HTTP_TRANSPORT';const live=d?.execution_mode==='LIVE_PROVIDER'&&d.real_ai===true&&d.provider==='openai_responses';
 const validReply=status==='SUCCESS'&&(mock||live);const integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
 const cost=validReply&&typeof d.estimated_cost_usd==='string'&&/^\d{1,3}(?:\.\d{1,9})?$/.test(d.estimated_cost_usd)?d.estimated_cost_usd:null;
 const row={...rows[index],status:['SUCCESS','ERROR','CANCELLED'].includes(status)?status:'ERROR',httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,durationMs:Math.max(0,now-rows[index].startedAt),traceId:trace(packet?.trace_id),errorCode:safe(errorCode,/^[A-Z0-9_]{1,80}$/),execution:validReply?(mock?'MOCK':'LIVE_PROVIDER'):'UNKNOWN',model:validReply?safe(d.model,/^(?:MOCK_ONLY|gpt-[A-Za-z0-9_.-]{1,70}|o[1-9][A-Za-z0-9_.-]{0,70})$/):null,providerId:validReply?safe(d.provider_request_id,/^req_[A-Za-z0-9_-]{1,110}$/):null,inputTokens:validReply?integer(u?.input_tokens):null,outputTokens:validReply?integer(u?.output_tokens):null,costUsd:cost,contextPairs:validReply&&Number.isInteger(d.history_turns_used)&&d.history_turns_used>=0&&d.history_turns_used<=4?d.history_turns_used:null};
 rows[index]=row;owners.set(ticket.key,rows);publish();return true;
}
export function readE4Activity(system,accountId,now=Date.now()){const key=owner(system,accountId);return key?recent(key,now).map(r=>({...r})):[];}
export function clearE4Activity(system,accountId){
 if(accountId!==undefined){const key=owner(system,accountId);if(key)owners.delete(key);}
 else for(const key of owners.keys())if(key.startsWith(system+':'))owners.delete(key);
 publish();
}
export function observeE4Local({system,accountId,route,status='SUCCESS',errorCode=null},now=Date.now()){
 const key=owner(system,accountId);if(!key||!['FAQ','RULE'].includes(route))return null;
 const row={id:crypto.randomUUID(),system,mode:'GENERAL_CHAT',kind:'LOCAL',route,startedAt:now,status:['SUCCESS','ERROR'].includes(status)?status:'ERROR',httpStatus:null,traceId:null,providerId:null,model:null,inputTokens:null,outputTokens:null,costUsd:null,contextPairs:null,execution:'RULE_BASED_ONLY',durationMs:0,errorCode:safe(errorCode,/^[A-Z0-9_]{1,80}$/)};
 owners.set(key,[row,...recent(key,now)].slice(0,MAX_ROWS));publish();return row.id;
}
export function e4ErrorLayer(code){
 if(!code)return '—';if(/ORIGIN/.test(code))return 'Proxy Origin';if(/SESSION/.test(code))return '應用程式 Session';if(/ROLE|FORBIDDEN/.test(code))return '授權層';if(/TOKEN|PAYLOAD|DTO|CONTEXT/.test(code))return '輸入／資料驗證';if(/PROVIDER|BUDGET|SPEND/.test(code))return 'Provider／預算閘門';if(/TIMEOUT|UPSTREAM/.test(code))return '上游請求';if(/SCOPE|DQA_NOT_AVAILABLE/.test(code))return '資料範圍';return '待核對來源';
}
function nano(value){if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,9})?$/.test(value))return 0n;const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));}
function usd(value){const whole=value/1000000000n,fraction=(value%1000000000n).toString().padStart(9,'0');return whole+'.'+fraction.replace(/0+$/,'').padEnd(6,'0');}
export function summarizeE4Activity(rows){
 const chats=rows.filter(r=>r.kind==='CHAT'),success=chats.filter(r=>r.status==='SUCCESS'),known=success.filter(r=>r.execution==='MOCK'||r.execution==='LIVE_PROVIDER');
 const usage=execution=>{const group=known.filter(r=>r.execution===execution);return {count:group.length,inputTokens:group.reduce((s,r)=>s+(r.inputTokens||0),0),outputTokens:group.reduce((s,r)=>s+(r.outputTokens||0),0),costUsd:group.some(r=>r.costUsd===null)?null:usd(group.reduce((s,r)=>s+nano(r.costUsd),0n)),usageComplete:group.every(r=>r.inputTokens!==null&&r.outputTokens!==null)};};
 return {requests:chats.length,success:success.length,errors:chats.filter(r=>r.status==='ERROR').length,pending:chats.filter(r=>r.status==='PENDING').length,cancelled:chats.filter(r=>r.status==='CANCELLED').length,faq:rows.filter(r=>r.kind==='LOCAL'&&r.route==='FAQ').length,scopeBlocked:rows.filter(r=>r.kind==='LOCAL'&&r.route==='RULE').length,mock:usage('MOCK'),live:usage('LIVE_PROVIDER'),latest:rows[0]||null};
}
