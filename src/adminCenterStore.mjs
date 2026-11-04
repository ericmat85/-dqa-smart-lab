import {accessSystem,canManageAccounts} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
import {ADMIN_FIELDS,ADMIN_MODULES,adminSeed} from './adminCenterData.mjs';
export const ADMIN_KEY='dqa-lms-admin-center-v1';
export const ADMIN_EVENT='dqa:admin-settings-updated';
export function canViewAdmin(account,module,storage=globalThis.localStorage){
 if(!accessSystem(account,'lms',storage))return false;
 const role=customRole(account,storage);if(role&&!role.pages.includes('settings'))return false;
 if(!module)return true;
 const item=ADMIN_MODULES.find(m=>m.id===module);if(!item)return false;
 if(item.id==='accounts')return canManageAccounts(account,storage);
 return !item.page||!role||role.pages.includes(item.page);
}
export function canEditAdmin(account,storage=globalThis.localStorage){return canViewAdmin(account,null,storage)&&canManageAccounts(account,storage);}
export function validateAdminSection(module,value){
 const fields=ADMIN_FIELDS[module];if(!fields||!value||typeof value!=='object'||Array.isArray(value))throw Error('不支援的管理設定。');
 const result={};for(const field of fields){const v=value[field.key];
  if(field.type==='checkbox'){if(typeof v!=='boolean')throw Error(`${field.label}須為布林值。`);}
  else if(field.type==='number'){if(!Number.isInteger(v)||v<field.min||v>field.max)throw Error(`${field.label}須為 ${field.min}～${field.max} 整數。`);}
  else if(field.options){if(!field.options.some(([id])=>id===v))throw Error(`${field.label}選項無效。`);}
  else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error(`${field.label}格式無效。`);}
  else if(field.type==='date'){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('請填寫有效到期日期。');}
  else if(typeof v!=='string'||!v.trim()||v.length>300)throw Error(`${field.label}請填寫 1～300 字。`);
  result[field.key]=typeof v==='string'?v.trim():v;
 }return result;
}
export function readAdminSettings(storage=globalThis.localStorage){
 const raw=storage.getItem(ADMIN_KEY);if(raw===null)return adminSeed();
 try{const data=JSON.parse(raw);if(data.version!==1||!data.settings||!Array.isArray(data.events)||!Array.isArray(data.backups)||data.events.length>200||data.backups.length>50)throw Error();
 const settings=Object.fromEntries(Object.keys(ADMIN_FIELDS).map(id=>[id,validateAdminSection(id,data.settings[id])]));
 if(!data.events.every(e=>e&&typeof e.at==='string'&&typeof e.action==='string')||!data.backups.every(e=>e?.simulated===true&&typeof e.at==='string'))throw Error();
 return {version:1,settings,events:data.events,backups:data.backups};
 }catch{throw Error('管理中心設定無法讀取；原資料未覆寫。可由有權管理者明確重設管理中心設定。');}
}
function authorize(actor,module,storage){
 const rows=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]');const fresh=Array.isArray(rows)&&rows.find(a=>a.id===actor?.id);
 if(!fresh||!canEditAdmin(fresh,storage)||!canViewAdmin(fresh,module,storage))throw Error('沒有操作此管理設定的權限。');return fresh;
}
function commit(data,storage){storage.setItem(ADMIN_KEY,JSON.stringify(data));if(typeof window!=='undefined'&&storage===window.localStorage)window.dispatchEvent(new Event(ADMIN_EVENT));return data;}
function event(actor,action,module,now){return {id:globalThis.crypto.randomUUID(),at:new Date(now).toISOString(),actorId:actor.id,action,module,scope:'前端 Demo 管理設定'};}
export function saveAdminSection(module,values,actor,storage=globalThis.localStorage,now=Date.now()){
 const fresh=authorize(actor,module,storage),next=validateAdminSection(module,values),data=readAdminSettings(storage);
 return commit({...data,settings:{...data.settings,[module]:next},events:[event(fresh,'儲存 Demo 設定',module,now),...data.events].slice(0,200)},storage);
}
export function simulateBackup(actor,storage=globalThis.localStorage,now=Date.now()){
 const fresh=authorize(actor,'backup',storage),data=readAdminSettings(storage),record={id:globalThis.crypto.randomUUID(),at:new Date(now).toISOString(),simulated:true,status:'模擬完成（未備份資料）'};
 return commit({...data,backups:[record,...data.backups].slice(0,50),events:[event(fresh,'模擬備份（未備份資料）','backup',now),...data.events].slice(0,200)},storage);
}
export function resetAdminSettings(actor,storage=globalThis.localStorage,now=Date.now()){
 const fresh=authorize(actor,null,storage);return commit({...adminSeed(),events:[event(fresh,'重設管理中心 Demo 設定（未變更案件）','settings',now)]},storage);
}
export function simulatedBackupTime(settings,now=Date.now()){
 if(!settings.enabled||settings.frequency==='manual')return null;
 const local=new Date(now+8*3600000),[hour,minute]=settings.time.split(':').map(Number);
 let target=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),hour,minute)-8*3600000;
 if(settings.frequency==='weekly'){target+=((1-local.getUTCDay()+7)%7)*86400000;if(target<=now)target+=7*86400000;}
 else if(target<=now)target+=86400000;
 return new Date(target).toISOString();
}
