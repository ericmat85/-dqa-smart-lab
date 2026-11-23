// Bounded, per-account browser observations. Not an authorization or money ledger.
import {profileById} from './trialProfiles.mjs';
export const E2_ACTIVITY_EVENT='dqa:e2-activity';
const owners=new Map(),AGE=30*60000,LIMIT=40;
const safe=(v,p)=>typeof v==='string'&&p.test(v)?v:null;
const id=v=>safe(v,/^[A-Za-z0-9_-]{1,100}$/),trace=v=>safe(v,/^I-[A-Za-z0-9_-]{1,80}$/),integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
const cost=v=>safe(v,/^\d{1,3}(?:\.\d{1,9})?$/);
function emit(){try{globalThis.window?.dispatchEvent(new Event(E2_ACTIVITY_EVENT));}catch{/* Never interrupt scheduling for observation. */}}
function recent(account,now){const rows=(owners.get(account)||[]).filter(r=>now-r.startedAt<AGE);if(rows.length)owners.set(account,rows);else owners.delete(account);return rows;}
export function beginE2Activity(accountId,now=Date.now()){
 if(!id(accountId))return null;
 const key=crypto.randomUUID();owners.set(accountId,[{id:key,startedAt:now,status:'PENDING',phase:'READING',failurePhase:null,durationMs:null,httpStatus:null,errorCode:null,traceId:null,operationId:null,profileId:null,trialId:null,quantity:null,equipmentCount:null,searchDays:null,preparationMinutes:null,cleanupMinutes:null,assessment:null,reasonCodes:[],candidateCount:null,draft:'NONE',execution:'UNKNOWN',model:null,providerId:null,responseId:null,inputTokens:null,outputTokens:null,costUsd:null},...recent(accountId,now)].slice(0,LIMIT));emit();return {accountId,id:key};
}
function update(ticket,fn,now){if(!ticket)return false;const rows=recent(ticket.accountId,now),index=rows.findIndex(r=>r.id===ticket.id);if(index<0)return false;const next=fn(rows[index]);if(!next)return false;rows[index]=next;owners.set(ticket.accountId,rows);emit();return true;}
export function stageE2Activity(ticket,phase,now=Date.now()){return update(ticket,r=>r.status==='PENDING'&&['READING','SESSION','UPSTREAM','VERIFYING'].includes(phase)?{...r,phase}:null,now);}
export function contextE2Activity(ticket,context,settings,now=Date.now()){
 return update(ticket,r=>r.status==='PENDING'?{...r,profileId:profileById(context?.request?.profile_id)?.id||null,trialId:safe(context?.request?.id,/^SCH-(?:026-\d{2}|REQ-2026-[a-f0-9]{8})$/),quantity:integer(context?.request?.quantity),equipmentCount:integer(context?.request?.equipment_count),searchDays:integer(settings?.searchDays),preparationMinutes:integer(context?.request?.preparation_minutes),cleanupMinutes:integer(context?.request?.cleanup_minutes)}:null,now);
}
export function finishE2Activity(ticket,{status='ERROR',httpStatus=null,data=null,errorCode=null,traceId=null}={},now=Date.now()){
 return update(ticket,r=>{
  if(r.status!=='PENDING')return null;
  const success=status==='SUCCESS',mock=success&&data?.execution_mode==='MOCK'&&data.real_ai===false&&data.provider==='MOCK_HTTP_TRANSPORT';
  const live=success&&data?.execution_mode==='LIVE_PROVIDER'&&data.real_ai===true&&data.provider==='openai_responses'&&/^req_[A-Za-z0-9_-]+$/.test(data.provider_request_id||'')&&/^resp_[A-Za-z0-9_-]+$/.test(data.provider_response_id||'');
  const rules=success&&data?.execution_mode==='RULE_BASED_ONLY'&&data.real_ai===false&&data.provider==='NONE';
  const accepted=mock||live||rules;
  return {...r,status:success&&!accepted?'ERROR':['SUCCESS','ERROR','CANCELLED'].includes(status)?status:'ERROR',phase:'FINISHED',failurePhase:status==='SUCCESS'?null:r.phase,durationMs:Math.max(0,now-r.startedAt),httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,errorCode:safe(errorCode,/^[A-Z0-9_]{1,80}$/),traceId:trace(data?.trace_id||traceId),operationId:safe(data?.request_id,/^O-[a-f0-9]{64}$/),assessment:accepted&&['PROPOSAL_AVAILABLE','UNKNOWN','INFEASIBLE_IN_WINDOW'].includes(data?.assessment?.status)?data.assessment.status:null,reasonCodes:accepted&&Array.isArray(data?.assessment?.reasons)?data.assessment.reasons.filter(x=>typeof x==='string'&&/^[A-Z0-9_]{1,80}$/.test(x)).slice(0,12):[],candidateCount:accepted&&Array.isArray(data?.assessment?.candidates)?Math.min(3,data.assessment.candidates.length):null,execution:mock?'MOCK':live?'LIVE_PROVIDER':rules?'RULE_BASED_ONLY':'UNKNOWN',model:mock||live?safe(data.model,/^(?:MOCK_ONLY|gpt-[A-Za-z0-9_.-]{1,70}|o[1-9][A-Za-z0-9_.-]{0,70})$/):null,providerId:mock||live?safe(data.provider_request_id,/^req_[A-Za-z0-9_-]{1,110}$/):null,responseId:mock||live?safe(data.provider_response_id,/^resp_[A-Za-z0-9_-]{1,110}$/):null,inputTokens:mock||live?integer(data.usage?.input_tokens):null,outputTokens:mock||live?integer(data.usage?.output_tokens):null,costUsd:mock||live?cost(data.estimated_cost_usd):null};
 },now);
}
export function draftE2Activity(ticket,state,now=Date.now()){
 return update(ticket,r=>{
  if(r.status!=='SUCCESS'||!['APPLIED','SAVED','REJECTED'].includes(state)||r.draft==='SAVED'||state==='SAVED'&&r.draft!=='APPLIED')return null;
  if(state==='APPLIED'&&(r.assessment!=='PROPOSAL_AVAILABLE'||!['MOCK','LIVE_PROVIDER'].includes(r.execution)))return null;
  return {...r,draft:state};
 },now);
}
export function readE2Activity(accountId,now=Date.now()){return id(accountId)?recent(accountId,now).map(r=>({...r,reasonCodes:[...r.reasonCodes]})):[];}
export function clearE2Activity(accountId){if(accountId===undefined)owners.clear();else owners.delete(accountId);emit();}
const nanos=v=>{if(!cost(v))return 0n;const [a,b='']=v.split('.');return BigInt(a)*1000000000n+BigInt(b.padEnd(9,'0'));};
const usd=v=>(v/1000000000n).toString()+'.'+(v%1000000000n).toString().padStart(9,'0').replace(/0+$/,'').padEnd(6,'0');
export function summarizeE2Activity(rows){
 const usage=mode=>{const group=rows.filter(r=>r.execution===mode);return {count:group.length,inputTokens:group.reduce((n,r)=>n+(r.inputTokens||0),0),outputTokens:group.reduce((n,r)=>n+(r.outputTokens||0),0),complete:group.every(r=>r.inputTokens!==null&&r.outputTokens!==null&&r.costUsd!==null),costUsd:group.some(r=>r.costUsd===null)?null:usd(group.reduce((n,r)=>n+nanos(r.costUsd),0n))};};
 const successful=rows.filter(r=>r.status==='SUCCESS');
 return {requests:rows.length,pending:rows.filter(r=>r.status==='PENDING').length,errors:rows.filter(r=>r.status==='ERROR').length,cancelled:rows.filter(r=>r.status==='CANCELLED').length,proposals:successful.filter(r=>r.assessment==='PROPOSAL_AVAILABLE').length,unknown:successful.filter(r=>r.assessment==='UNKNOWN').length,infeasible:successful.filter(r=>r.assessment==='INFEASIBLE_IN_WINDOW').length,saved:rows.filter(r=>r.draft==='SAVED').length,mock:usage('MOCK'),live:usage('LIVE_PROVIDER'),rules:successful.filter(r=>r.execution==='RULE_BASED_ONLY').length};
}
