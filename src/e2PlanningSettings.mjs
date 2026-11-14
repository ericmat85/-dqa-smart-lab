import {canEditAdmin} from './adminCenterStore.mjs';
import {e2InputIssues} from './e2Scheduling.mjs';
export const E2_SETTINGS_KEY='dqa-e2-planning-settings-v1';
export const E2_SETTINGS_EVENT='dqa:e2-planning-settings';
export const E2_DEFAULTS=Object.freeze({enabled:true,searchDays:14,preparationMinutes:0,cleanupMinutes:0});
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export function validateE2Settings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||Object.keys(value).some(key=>!Object.hasOwn(E2_DEFAULTS,key)))fail('E2_SETTINGS_INVALID','排程設定格式無效；原設定未覆寫。');
 if(typeof value.enabled!=='boolean')fail('E2_SETTINGS_INVALID','請求啟用狀態無效。');
 for(const [key,min,max] of [['searchDays',1,14],['preparationMinutes',0,120],['cleanupMinutes',0,120]])if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)fail('E2_SETTINGS_INVALID',`${key==='searchDays'?'搜尋天數':'準備／清理保留時間'}須為 ${min}～${max} 的整數。`);
 return {...value};
}
export function readE2Settings(storage=globalThis.localStorage){
 try{
  const raw=storage?.getItem(E2_SETTINGS_KEY);if(raw===null||raw===undefined)return {version:1,revision:0,settings:{...E2_DEFAULTS},events:[]};
  const data=JSON.parse(raw);
  if(data.version!==1||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.events)||data.events.length>20||data.events.some(e=>!/^\d{4}-\d\d-\d\dT/.test(e.at)||!Number.isFinite(Date.parse(e.at))||!/^[A-Za-z0-9_-]{1,80}$/.test(e.actorId)||!['SAVE','RESET'].includes(e.action)))throw Error();
  return {version:1,revision:data.revision,settings:validateE2Settings(data.settings),events:data.events.map(({at,actorId,action})=>({at,actorId,action}))};
 }catch{fail('E2_SETTINGS_UNAVAILABLE','排程設定無法讀取，已停止新排程請求；原設定未覆寫。');}
}
function authorize(account,storage){
 let rows;try{rows=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]');}catch{fail('E2_SETTINGS_FORBIDDEN','帳號資料無法核對。');}
 const fresh=Array.isArray(rows)&&rows.find(a=>a.id===account?.id);
 if(!fresh||!canEditAdmin(fresh,storage))fail('E2_SETTINGS_FORBIDDEN','目前帳號沒有修改排程設定的權限。');return fresh;
}
function commit(previous,settings,actor,action,storage,now){
 const next={version:1,revision:previous.revision+1,settings,events:[{at:new Date(now).toISOString(),actorId:actor.id,action},...previous.events].slice(0,20)};
 storage.setItem(E2_SETTINGS_KEY,JSON.stringify(next));
 if(typeof window!=='undefined'&&storage===window.localStorage)window.dispatchEvent(new Event(E2_SETTINGS_EVENT));
 return next;
}
export function saveE2Settings(value,account,{storage=globalThis.localStorage,expectedRevision,now=Date.now()}={}){
 const actor=authorize(account,storage),settings=validateE2Settings(value),previous=readE2Settings(storage);
 if(previous.revision!==expectedRevision)fail('E2_SETTINGS_CONFLICT','設定已在其他頁面更新；請重新開啟設定後再修改。');
 return commit(previous,settings,actor,'SAVE',storage,now);
}
export function resetE2Settings(account,{storage=globalThis.localStorage,now=Date.now()}={}){
 const actor=authorize(account,storage);let previous;try{previous=readE2Settings(storage);}catch{previous={revision:0,events:[]};}
 return commit(previous,{...E2_DEFAULTS},actor,'RESET',storage,now);
}
export function requireE2Enabled(storage=globalThis.localStorage){
 const current=readE2Settings(storage);if(!current.settings.enabled)fail('E2_CLIENT_PAUSED','自動化排程的新請求已由管理設定暫停；既有排程未變更。');return current;
}
// Client planning preferences never change server authorization, budgets or trial requirements.
export function applyE2Settings({editing,form,settings,now=Date.now()}){
 const value=validateE2Settings(settings);if(!value.enabled)fail('E2_CLIENT_PAUSED','自動化排程的新請求已暫停。');
 const start=Date.parse(String(form.searchStart)+'T00:00:00Z');
 if(!Number.isFinite(start))fail('TRIAL_DATA_INCOMPLETE','排程搜尋開始日期無效。');
 const cap=new Date(start+(value.searchDays-1)*86400000).toISOString().slice(0,10);
 const next={...form,searchUntil:form.searchUntil&&form.searchUntil<cap?form.searchUntil:cap,preparationMinutes:Math.max(Number(form.preparationMinutes||0),value.preparationMinutes),cleanupMinutes:Math.max(Number(form.cleanupMinutes||0),value.cleanupMinutes)};
 const issues=e2InputIssues({editing,form:next,now});if(issues.length)fail('E2_PLANNING_INPUT_BLOCKED','管理設定套用後無法規劃：'+issues.map(i=>i.message).join(' '));
 return next;
}
