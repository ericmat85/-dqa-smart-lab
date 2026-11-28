import {validateTrialDetails} from './trialDefinitionDetails.mjs';
import {validateCalendarPolicy} from './schedulingCalendar.mjs';
import {TRIAL_TYPES,trialType} from './trialTypes.mjs';
import {originalBusinessEnabled,appStorage} from './originalBusiness.mjs';
import {matchTrialDefinition} from './trialTemplateMatching.mjs';
import {explicitHours,sourceConditions} from './trialSourceFacts.mjs';
import data from '../render-backend/gateway/trial_profiles.json' with {type:'json'};
import {testOptions as defaults,getTestReference as reference} from './trialCatalogData.mjs';
import {canEditAdmin} from './adminCenterStore.mjs';
export const TRIAL_CATALOG_KEY='dqa-trial-catalog-v1';
export const TRIAL_CATALOG_EVENT='dqa:trial-catalog-updated';
const error=(code,message)=>{throw Object.assign(Error(message),{code});};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function defaultTrialCatalog(){return defaults.map((name,index)=>{const ref=reference(name),p=data.profiles.find(p=>p.id===ref.profileId);return {id:'TRIAL-'+String(index+1).padStart(3,'0'),name,aliases:[],profileId:ref.profileId,trialType:trialType({profileId:ref.profileId}),specification:ref.specification,acceptance:ref.acceptance,equipment:ref.equipment,version:'DEMO-1',durationHours:p.hours,builtin:true,synthetic:true};});}
function validate(row){
 if(row&&typeof row==='object'){row={...row,trialType:trialType(row)};if(row.definitionDetails!==undefined)validateTrialDetails(row.definitionDetails,{trialType:row.trialType});if(row.calendarPolicy!==undefined)validateCalendarPolicy(row.calendarPolicy);if(!TRIAL_TYPES.some(t=>t.id===row.trialType))error('TRIAL_CATALOG_INVALID','請選擇有效的試驗類型。');}
 const fields=['id','name','aliases','profileId','trialType','calendarPolicy','definitionDetails','specification','acceptance','equipment','version','durationHours','builtin','synthetic'];
 if(!row||typeof row!=='object'||Object.keys(row).some(k=>!fields.includes(k))||!/^TRIAL-(?:\d{3}|[a-f0-9]{32})$/.test(row.id)||!text(row.name,80)||row.name==='其他'||/[、,，;]/.test(row.name)||!Array.isArray(row.aliases)||row.aliases.length>20||row.aliases.some(x=>!text(x,80))||!text(row.specification,6000)||!text(row.acceptance,2000)||!text(row.equipment,300)||!text(row.version,80)||(!originalBusinessEnabled()&&row.synthetic!==true)||typeof row.builtin!=='boolean')error('TRIAL_CATALOG_INVALID','試驗目錄欄位不完整或格式無效。');
 if(row.profileId==='COMPOUND_ENVIRONMENT'){if(!originalBusinessEnabled()||row.builtin||row.durationHours!==0)error('TRIAL_CATALOG_INVALID','複合試驗須由專案階段提供工時。');return Object.fromEntries(fields.map(k=>[k,Array.isArray(row[k])?[...row[k]]:row[k]]));}
 const profile=data.profiles.find(p=>p.id===row.profileId);
 if((!profile&&row.profileId!=='UNVERIFIED')||!Number.isFinite(row.durationHours)||row.durationHours<=0||row.durationHours>24000||profile?.fixed_duration&&row.durationHours!==profile.hours)error('TRIAL_CATALOG_INVALID','試驗類型或工時無效；固定試驗工時不得變更。');
 const hours=explicitHours({specification:row.specification});sourceConditions({specification:row.specification});if(hours===null||hours!==row.durationHours)error('TRIAL_CATALOG_INVALID','規範時長與試驗工時須一致。');
 return Object.fromEntries(fields.map(k=>[k,Array.isArray(row[k])?[...row[k]]:row[k]]));
}
const cachedDefaults={version:1,revision:0,rows:defaultTrialCatalog().map(row=>Object.freeze({...row,aliases:Object.freeze([])}))};Object.freeze(cachedDefaults.rows);
const caches=new WeakMap();
export function readTrialCatalog(storage=appStorage()){
 try{
  const raw=storage?.getItem(TRIAL_CATALOG_KEY);if(raw===null||raw===undefined)return {...cachedDefaults};
  if(storage&&caches.get(storage)?.raw===raw)return caches.get(storage).data;
  const stored=JSON.parse(raw);if(stored.version!==1||!Number.isSafeInteger(stored.revision)||stored.revision<0||!Array.isArray(stored.rows)||(!originalBusinessEnabled()&&stored.rows.length<20&&!Array.isArray(stored.deletedIds))||stored.rows.length>1000)throw Error();
  const rows=stored.rows.map(validate),ids=new Set(),names=new Map();
  for(const row of rows){if(ids.has(row.id))throw Error();ids.add(row.id);for(const name of [row.name,...row.aliases]){if(names.has(name)&&names.get(name)!==row.id)throw Error();names.set(name,row.id);}}
  if(!originalBusinessEnabled())for(const original of defaultTrialCatalog()){const row=rows.find(r=>r.id===original.id);if(!row&&stored.deletedIds?.includes(original.id))continue;if(!row||!row.builtin||row.profileId!==original.profileId||row.name!==original.name&&!row.aliases.includes(original.name))throw Error();}
  const result=Object.freeze({version:1,revision:stored.revision,deletedIds:stored.deletedIds||[],rows:Object.freeze(rows.map(row=>Object.freeze({...row,aliases:Object.freeze(row.aliases)})))});if(storage)caches.set(storage,{raw,data:result});return result;
 }catch{error('TRIAL_CATALOG_UNAVAILABLE','試驗目錄無法讀取；原資料未覆寫，請檢查試驗與設備參數。');}
}
export function findTrialDefinition(name,storage=appStorage()){return matchTrialDefinition(name,readTrialCatalog(storage).rows);}
export function saveTrialDefinition(value,actor,{storage=appStorage(),expectedRevision}={}){
 let accounts;try{accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]');}catch{error('TRIAL_CATALOG_FORBIDDEN','帳號資料無法核對。');}
 const fresh=Array.isArray(accounts)&&accounts.find(a=>a.id===actor?.id);if(!fresh||!canEditAdmin(fresh,storage))error('TRIAL_CATALOG_FORBIDDEN','目前帳號沒有新增或編輯試驗目錄的權限。');
 const current=readTrialCatalog(storage);if(current.revision!==expectedRevision)error('TRIAL_CATALOG_CONFLICT','試驗目錄已更新，請重新開啟編輯。');
 const old=current.rows.find(r=>r.id===value.id);if(!old&&current.rows.length>=100)error('TRIAL_CATALOG_LIMIT','本機試驗目錄最多 100 項。');
 if(old&&value.profileId!==old.profileId)error('TRIAL_CATALOG_PROFILE_LOCKED','既有項目的排程類型須保持一致；請另建新項目。');
 const aliases=old?[...new Set([...old.aliases,...(old.name!==value.name?[old.name]:[])])]:[];
 const row=validate({...value,id:old?.id||'TRIAL-'+crypto.randomUUID().replaceAll('-',''),aliases,builtin:!!old?.builtin,synthetic:true});
 if(current.rows.some(r=>r.id!==row.id&&[r.name,...r.aliases].some(name=>[row.name,...row.aliases].includes(name))))error('TRIAL_CATALOG_DUPLICATE','試驗名稱已存在，請使用獨立名稱。');
 const next={version:1,revision:current.revision+1,deletedIds:current.deletedIds||[],rows:old?current.rows.map(r=>r.id===old.id?row:r):[...current.rows,row]};
 storage.setItem(TRIAL_CATALOG_KEY,JSON.stringify(next));if(typeof window!=='undefined'&&storage===appStorage())window.dispatchEvent(new Event(TRIAL_CATALOG_EVENT));return row;
}

export function deleteTrialDefinition(id,actor,{storage=appStorage(),expectedRevision}={}){const accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]'),fresh=accounts.find(a=>a.id===actor?.id);if(!fresh||!canEditAdmin(fresh,storage))error('TRIAL_CATALOG_FORBIDDEN','目前帳號沒有刪除試驗項目的權限。');const current=readTrialCatalog(storage);if(current.revision!==expectedRevision||!current.rows.some(r=>r.id===id))error('TRIAL_CATALOG_CONFLICT','試驗目錄已更新，請重新開啟。');storage.setItem(TRIAL_CATALOG_KEY,JSON.stringify({version:1,revision:current.revision+1,deletedIds:[...new Set([...(current.deletedIds||[]),id])],rows:current.rows.filter(r=>r.id!==id)}));if(typeof window!=='undefined'&&storage===appStorage())window.dispatchEvent(new Event(TRIAL_CATALOG_EVENT));}
