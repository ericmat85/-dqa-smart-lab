import {readLabSnapshot} from './labData.mjs';
import {readTrialCatalog} from './trialCatalogStore.mjs';
import {canEditAdmin,readAdminSettings,validateAdminSection,ADMIN_KEY,ADMIN_EVENT} from './adminCenterStore.mjs';
import {NOTICE_RULES} from './adminCenterData.mjs';
export const OPERATION_MODULES=['backup','security','monitoring','notifications','quality','qualifications','organization'];
const BACKUP_SECTIONS=['backup','documents','notifications','organization'];
export const OPERATIONS_KEY='dqa-admin-operations-v1',OPERATIONS_EVENT='dqa:admin-operations';
const fail=message=>{throw Error(message);};
// oxlint-disable-next-line no-control-regex -- Reject unsafe input controls.
const text=(v,max=300)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const operationsSeed=()=>({version:1,revision:0,quality:[],qualifications:[],events:[]});
function validateRow(kind,r){
 const common=['id','updatedAt','updatedBy'];const fields=kind==='quality'?['title','referenceType','referenceId','ownerId','severity','due','status','cause','action','resolution']:['personId','equipmentId','trialId','training','issued','expires','status'];
 if(!r||Object.keys(r).length!==common.length+fields.length||Object.keys(r).some(k=>![...common,...fields].includes(k))||![...common,...fields].every(k=>text(r[k],k==='action'||k==='cause'||k==='resolution'?1000:300))||!/^ADM-[a-f0-9-]{36}$/.test(r.id)||!Number.isFinite(Date.parse(r.updatedAt)))fail('管理紀錄格式無效。');
 if(kind==='quality'&&(!r.title.trim()||!r.ownerId||!['request','equipment','trial'].includes(r.referenceType)||!r.referenceId||!['LOW','MEDIUM','HIGH'].includes(r.severity)||!['OPEN','IN_PROGRESS','RESOLVED'].includes(r.status)||!day(r.due)||r.status==='RESOLVED'&&!r.resolution.trim()))fail('請補齊追蹤項目、負責人、期限與結案說明。');
 if(kind==='qualifications'&&(!r.personId||!r.equipmentId||!r.trialId||!r.training.trim()||!day(r.issued)||!day(r.expires)||r.expires<r.issued||!['ACTIVE','SUSPENDED'].includes(r.status)))fail('請補齊人員、設備、試驗、訓練及有效起訖日。');
 return {...r};
}
export function readOperations(storage=globalThis.localStorage){
 const raw=storage.getItem(OPERATIONS_KEY);if(raw===null)return operationsSeed();
 try{const d=JSON.parse(raw);if(d.version!==1||!Number.isSafeInteger(d.revision)||d.revision<0||Object.keys(d).sort().join()!=='events,qualifications,quality,revision,version'||!Array.isArray(d.events)||d.events.length>200)throw Error();for(const k of ['quality','qualifications']){if(!Array.isArray(d[k])||d[k].length>500||new Set(d[k].map(r=>r.id)).size!==d[k].length)throw Error();d[k]=d[k].map(r=>validateRow(k,r));}if(!d.events.every(e=>e&&text(e.action)&&text(e.actorId)&&Number.isFinite(Date.parse(e.at))&&text(e.id)))throw Error();return d;}catch{fail('管理紀錄無法讀取；原始資料保留，請先匯出來源資料排查。');}
}
export function freshAdmin(actor,storage=globalThis.localStorage){let rows;try{rows=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]');}catch{fail('帳號資料無法核對。');}const fresh=Array.isArray(rows)&&rows.find(r=>r.id===actor?.id);if(!fresh||!canEditAdmin(fresh,storage))fail('目前帳號沒有管理寫入權限。');return fresh;}
const emit=(storage,event)=>{if(typeof window!=='undefined'&&storage===window.localStorage)window.dispatchEvent(new Event(event));};
export function saveOperation(kind,input,actor,{storage=globalThis.localStorage,expectedRevision,now=Date.now()}={}){
 const fresh=freshAdmin(actor,storage);if(!['quality','qualifications'].includes(kind))fail('不支援的管理紀錄。');const data=readOperations(storage);if(data.revision!==expectedRevision)fail('資料已在其他分頁更新，請重新開啟表單。');
 const row=validateRow(kind,{...input,id:input.id||'ADM-'+crypto.randomUUID(),updatedAt:new Date(now).toISOString(),updatedBy:fresh.id});
 // Resolve references against fresh business sources; no caller-provided labels grant authority.
 const parse=(key,fallback=[])=>{try{const raw=storage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{fail('關聯資料無法核對。');}};
 const accounts=parse('dqa-shared-demo-accounts-v1');if(!Array.isArray(accounts)||!accounts.some(a=>a.id===(kind==='quality'?row.ownerId:row.personId)&&a.status==='啟用中'&&a.enabled!==false))fail('關聯人員不存在或已停用。');
 const snapshot=readLabSnapshot(storage,now),trials=readTrialCatalog(storage).rows;
 const refs={request:snapshot.requests,equipment:snapshot.equipment,trial:trials};
 if(snapshot.sources.some(s=>s.error))fail('業務來源異常，暫停保存關聯紀錄。');
 if(kind==='quality'&&!refs[row.referenceType].some(r=>r.id===row.referenceId))fail('關聯來源不存在，請重新選擇。');
 if(kind==='qualifications'&&(!snapshot.equipment.some(r=>r.id===row.equipmentId)||!trials.some(r=>r.id===row.trialId)))fail('設備或試驗來源不存在。');
 if(data[kind].length>=500&&!data[kind].some(r=>r.id===row.id))fail('已達 500 筆管理紀錄上限。');
 const next={...data,revision:data.revision+1,[kind]:[row,...data[kind].filter(r=>r.id!==row.id)],events:[{id:crypto.randomUUID(),at:row.updatedAt,actorId:fresh.id,action:`${input.id?'更新':'新增'}${kind==='quality'?'品質追蹤':'資格紀錄'} · ${row.id}`},...data.events].slice(0,200)};
 storage.setItem(OPERATIONS_KEY,JSON.stringify(next));emit(storage,OPERATIONS_EVENT);return next;
}
export function qualificationStatus(row,now=Date.now()){const today=new Date(now+8*3600000).toISOString().slice(0,10);return row.status==='SUSPENDED'?'已暫停':row.issued>today?'尚未生效':row.expires<today?'已到期':Date.parse(row.expires+'T23:59:59+08:00')-now<30*86400000?'30 天內到期':'有效';}
export async function settingsBackup(storage=globalThis.localStorage){
 const current=readAdminSettings(storage).settings,settings=Object.fromEntries(BACKUP_SECTIONS.map(k=>[k,current[k]]));const payload={format:'DQA_ADMIN_SETTINGS',version:1,settings};
 const sha256=await digest(JSON.stringify(payload));return {...payload,sha256};
}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function inspectSettingsBackup(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>65536)fail('設定檔不得超過 64 KB。');let d;try{d=JSON.parse(raw);}catch{fail('請選擇有效 JSON 設定檔。');}
 if(d?.format!=='DQA_ADMIN_SETTINGS'||d.version!==1||Object.keys(d).sort().join()!=='format,settings,sha256,version'||!d.settings||Object.keys(d.settings).sort().join()!==[...BACKUP_SECTIONS].sort().join())fail('設定檔版本或範圍不符。');
 const settings=Object.fromEntries(BACKUP_SECTIONS.map(k=>[k,validateAdminSection(k,d.settings[k])]));
 if(JSON.stringify(settings)!==JSON.stringify(d.settings)||await digest(JSON.stringify({format:d.format,version:1,settings}))!==d.sha256)fail('設定檔完整性檢查失敗；未還原。');return {settings,sha256:d.sha256};
}
export function restoreSettingsBackup(checked,actor,{storage=globalThis.localStorage,expectedRaw}={}){
 const fresh=freshAdmin(actor,storage);if(storage.getItem(ADMIN_KEY)!==expectedRaw)fail('設定已更新，請重新預覽還原差異。');
 // Exactly one key is replaced atomically. No cases, accounts, signatures, engine budgets or operations are imported.
 const settings=Object.fromEntries(BACKUP_SECTIONS.map(k=>[k,validateAdminSection(k,checked.settings[k])]));const old=readAdminSettings(storage);
 const next={...old,settings:{...old.settings,...settings},events:[{id:crypto.randomUUID(),at:new Date().toISOString(),actorId:fresh.id,action:'還原管理設定（未變更業務資料）',module:'backup'},...old.events].slice(0,200)};
 storage.setItem(ADMIN_KEY,JSON.stringify(next));emit(storage,ADMIN_EVENT);return next;
}
export function deriveAdminReminders(snapshot,metrics,settings,now=Date.now(),activity=null){
 const unavailable=Boolean(snapshot.sources?.some(s=>s.error));const date=new Date(now+8*3600000).toISOString().slice(0,10);
 const requests=snapshot.requests||[],schedules=metrics?.schedules||snapshot.schedules||[],equipment=snapshot.equipment||[];
 const rules={approval:{rows:requests.filter(r=>/待簽核|待審查/.test(r.status||r.stage)),target:'requests'},overdue:{rows:requests.filter(r=>{const raw=r.dueDate||r.requiredDate||r.requestedDate;const due=typeof raw==='string'?raw.replaceAll('/','-').slice(0,10):null;return day(due)&&due<date&&!/結案|取消|已完成|完成/.test(r.status||'');}),target:'requests'},schedule:{rows:schedules.filter(r=>/待排程|未排程|已排程/.test(r.status||'')),target:'schedule'},completed:{rows:requests.filter(r=>r.status==='已完成'),target:'requests'},report:{rows:requests.filter(r=>r.status==='待審核'),target:'reports'},calibration:{rows:equipment.filter(r=>{const due=r.nextCalibration||r.calibrationDue||r.nextCalibrationDate;return typeof due==='string'&&due.slice(0,10)<=new Date(now+30*86400000).toISOString().slice(0,10);}),target:'equipment'},ai:{rows:(activity||[]).filter(r=>r.status==='ERROR'),target:'ai'}};
 return NOTICE_RULES.map(([id,label])=>({id,label,enabled:settings?.[id]===true,time:settings?.[id+'Time']||'09:00',count:unavailable||id==='ai'&&activity===null?null:rules[id].rows.length,target:rules[id].target,detail:id==='ai'?'目前帳號、本分頁最近 30 分鐘的 AI 請求錯誤；詳見引擎監控':unavailable?'來源異常，數量尚無法確認':rules[id].rows.slice(0,3).map(r=>r.id).join('、')||'目前無符合項目'}));
}
