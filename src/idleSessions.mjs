export const IDLE_TIMEOUT_MS=30*60*1000;
export const SESSION_KEYS={lms:'dqa-lms-account-id',request:'dqa-request-account-id',lab:'dqa-lab-account-id'};
const activityKey=system=>`dqa-session-activity-v1:${system}`;
const noticeKey=system=>`dqa-session-expired-v1:${system}`;
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('dqa:session-change'));};
export function startSession(system,accountId,storage=globalThis.sessionStorage,now=Date.now()){
 if(!SESSION_KEYS[system])throw Error('不支援的登入系統');
 const keys=[SESSION_KEYS[system],activityKey(system),noticeKey(system)],previous=keys.map(key=>[key,storage.getItem(key)]);
 try{storage.setItem(activityKey(system),JSON.stringify({accountId,lastActivity:now}));storage.setItem(SESSION_KEYS[system],accountId);storage.removeItem(noticeKey(system));}
 catch(error){for(const [key,value] of previous){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{/* The caller reports the storage failure. */}}throw error;}
 notify();
}
function removeSession(system,storage){
 storage.removeItem(SESSION_KEYS[system]);storage.removeItem(activityKey(system));
 if(system==='request'){storage.removeItem('dqa-request-role');storage.removeItem('dqa-request-user');}
}
export function endSession(system,storage=globalThis.sessionStorage){removeSession(system,storage);storage.removeItem(noticeKey(system));notify();}
export function expireIdleSessions(storage=globalThis.sessionStorage,now=Date.now()){
 const expired=[];
 for(const [system,key]of Object.entries(SESSION_KEYS)){
  const accountId=storage.getItem(key);if(!accountId){storage.removeItem(activityKey(system));continue;}
  const raw=storage.getItem(activityKey(system));let activity;
  try{activity=raw?JSON.parse(raw):null;}catch{activity={};}
  // Existing sessions created before this feature receive their first activity timestamp once.
  if(!raw||activity?.accountId&&activity.accountId!==accountId){storage.setItem(activityKey(system),JSON.stringify({accountId,lastActivity:now}));continue;}
  if(!Number.isFinite(activity?.lastActivity)||now-activity.lastActivity>=IDLE_TIMEOUT_MS){removeSession(system,storage);storage.setItem(noticeKey(system),'1');expired.push(system);}
 }
 return expired;
}
export function recordSessionActivity(systems,storage=globalThis.sessionStorage,now=Date.now()){
 for(const system of systems){const accountId=storage.getItem(SESSION_KEYS[system]);if(accountId)storage.setItem(activityKey(system),JSON.stringify({accountId,lastActivity:now}));}
}
export function pendingSessionNotices(storage=globalThis.sessionStorage){return Object.keys(SESSION_KEYS).filter(system=>storage.getItem(noticeKey(system)));}
export function dismissSessionNotices(systems,storage=globalThis.sessionStorage){for(const system of systems)storage.removeItem(noticeKey(system));}
