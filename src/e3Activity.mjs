export const E3_ACTIVITY_EVENT='dqa:e3-activity';
const owners=new Map(),AGE=30*60000,MAX=40;
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
function recent(owner,now){const rows=(owners.get(owner)||[]).filter(r=>now-r.startedAt<AGE);if(rows.length)owners.set(owner,rows);else owners.delete(owner);return rows;}
function publish(){try{globalThis.window?.dispatchEvent(new Event(E3_ACTIVITY_EVENT));}catch{/* Observation cannot interrupt export. */}}
export function beginE3Activity(accountId,{preset='weekly',rowCount=0}={},now=Date.now()){
 if(!validId(accountId))return null;const id=crypto.randomUUID();const row={id,startedAt:now,status:'PENDING',preset:['weekly','equipment','case','special'].includes(preset)?preset:null,rowCount:Number.isSafeInteger(rowCount)&&rowCount>=0&&rowCount<=5000?rowCount:null,trace:null,errorCode:null,durationMs:null,xlsx:0,pdf:0,execution:'RULE_BASED_DRAFT'};
 owners.set(accountId,[row,...recent(accountId,now)].slice(0,MAX));publish();return {accountId,id};
}
export function finishE3Activity(ticket,{status='ERROR',trace=null,errorCode=null}={},now=Date.now()){
 if(!ticket)return;const rows=recent(ticket.accountId,now),row=rows.find(r=>r.id===ticket.id);if(!row||row.status!=='PENDING')return;row.status=['SUCCESS','ERROR','CANCELLED'].includes(status)?status:'ERROR';row.trace=/^I-[A-Za-z0-9_-]{1,80}$/.test(trace||'')?trace:null;row.errorCode=/^[A-Z0-9_]{1,80}$/.test(errorCode||'')?errorCode:null;row.durationMs=Math.max(0,now-row.startedAt);publish();
}
export function exportedE3Activity(ticket,type){if(!ticket||!['xlsx','pdf'].includes(type))return;const row=recent(ticket.accountId,Date.now()).find(r=>r.id===ticket.id);if(row?.status==='SUCCESS'){row[type]++;publish();}}
export function readE3Activity(accountId,now=Date.now()){return validId(accountId)?recent(accountId,now).map(r=>({...r})):[];}
export function clearE3Activity(accountId){if(accountId===undefined)owners.clear();else owners.delete(accountId);publish();}
