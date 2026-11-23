// Operational UI state only. This storage never authorizes an API request.
const fallback=new Map();const key=system=>'dqa-ai-revocation-v1:'+system;
export function aiSessionState(system){try{const value=JSON.parse(globalThis.sessionStorage?.getItem(key(system))||'null');if(value&&['PENDING','UNCONFIRMED','CONFIRMED','ACTIVE'].includes(value.status))return value;}catch{}return fallback.get(system)||{status:'ACTIVE',epoch:0};}
export function setAISessionState(system,status,expectedEpoch){
 const previous=aiSessionState(system);if(expectedEpoch!==undefined&&previous.epoch!==expectedEpoch)return previous;
 const value={status,epoch:previous.epoch+1,at:Date.now()};fallback.set(system,value);try{globalThis.sessionStorage?.setItem(key(system),JSON.stringify(value));}catch{}
 if(typeof globalThis.dispatchEvent==='function')globalThis.dispatchEvent(new CustomEvent('dqa:ai-revocation-state',{detail:{system,...value}}));return value;
}
