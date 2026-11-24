import {appStorage} from './originalBusiness.mjs';
export const ROLE_KEY='dqa-custom-roles-v1';
export const ROLE_PAGES=[['dashboard','儀錶板'],['requests','試驗委託與審查'],['schedule','排程管理'],['equipment','設備管理'],['maintenance','物料管理'],['finance','財務管理'],['reports','報表分析'],['archive','資料庫'],['settings','系統管理']];
export const BUILTIN_ROLES=['實驗室工程師','實驗室副工程師','委託者','委託者主管','一階主管','二階主管','三階主管','系統管理員','檢視者'];
export function readCustomRoles(storage=appStorage()){try{const rows=JSON.parse(storage?.getItem(ROLE_KEY)||'[]');return Array.isArray(rows)?rows.filter(row=>typeof row.name==='string'&&Array.isArray(row.pages)&&[0,1,2,3].includes(row.level)):[];}catch{return [];}}
export function saveCustomRole(roles,draft,storage=appStorage()){
 const name=draft.name.trim();if(!name||name.length>30)throw Error('角色名稱請填寫 1～30 個字。');
 if(BUILTIN_ROLES.includes(name)||roles.some(row=>row.name===name&&row.id!==draft.id))throw Error('角色名稱已存在。');
 if(![0,1,2,3].includes(draft.level))throw Error('請選擇有效權限等級。');
 const pages=[...new Set(draft.pages)].filter(page=>ROLE_PAGES.some(([id])=>id===page));
 if(!pages.includes('dashboard'))pages.unshift('dashboard');
 if(draft.level>0&&!pages.includes('requests'))throw Error('審查角色必須開啟「試驗委託與審查」。');
 const role={id:draft.id||globalThis.crypto.randomUUID(),name,level:draft.level,pages,manageAccounts:Boolean(draft.manageAccounts)};
 const next=roles.some(row=>row.id===role.id)?roles.map(row=>row.id===role.id?role:row):[...roles,role];
 storage.setItem(ROLE_KEY,JSON.stringify(next));return next;
}
export function customRole(account,storage=appStorage()){const custom=readCustomRoles(storage).find(role=>role.name===account?.role);if(custom)return custom;try{const saved=JSON.parse(storage?.getItem(BUILTIN_ROLE_KEY)||'[]');if(Array.isArray(saved)&&saved.some(row=>row.name===account?.role))return readBuiltinRoles(storage).find(role=>role.name===account.role);}catch{/* Ignore invalid overrides. */}return undefined;}
export function canAccessLmsPage(account,page){if(account?.status!=='啟用中')return false;if(page==='finance')return !!account.businessIdentity&&(account.businessSystems||[]).includes('lms')&&(account.businessAdmin===true||((account.businessPages||[]).includes('finance')&&(account.businessPermissions||[]).includes('finance.read')));if(account.businessIdentity)return (account.businessSystems||['lms']).includes('lms')&&(page==='accounts'?account.businessAdmin===true:(account.businessPages||ROLE_PAGES.map(([id])=>id)).includes(page));const role=customRole(account);return role?page==='accounts'?role.manageAccounts:role.pages.includes(page):true;}

export const BUILTIN_ROLE_KEY='dqa-builtin-role-overrides-v1';
const builtinSystems=name=>['實驗室工程師','實驗室副工程師'].includes(name)?['lab']:['委託者','委託者主管'].includes(name)?['request']:['一階主管','二階主管','三階主管'].includes(name)?['lms','lab']:name==='系統管理員'?['lms']:[];
export function readBuiltinRoles(storage=appStorage()){
 let saved=[];try{saved=JSON.parse(storage?.getItem(BUILTIN_ROLE_KEY)||'[]');}catch{/* Keep original defaults. */}
 return BUILTIN_ROLES.map(name=>{const original={id:`builtin:${name}`,name,builtin:true,level:({'一階主管':1,'二階主管':2,'三階主管':3})[name]||0,pages:ROLE_PAGES.map(([id])=>id),systems:builtinSystems(name),manageAccounts:['系統管理員','二階主管'].includes(name)};const override=Array.isArray(saved)&&saved.find(row=>row.name===name&&[0,1,2,3].includes(row.level)&&Array.isArray(row.pages)&&Array.isArray(row.systems));return override?{...original,...override,id:original.id,name,builtin:true}:original;});
}
export function saveBuiltinRole(draft,storage=appStorage()){
 if(!BUILTIN_ROLES.includes(draft.name)||![0,1,2,3].includes(draft.level))throw Error('請選擇有效內建角色與權限等級。');
 const pages=[...new Set(draft.pages)].filter(page=>ROLE_PAGES.some(([id])=>id===page));if(!pages.includes('dashboard'))pages.unshift('dashboard');
 if(draft.level>0&&!pages.includes('requests'))throw Error('審查角色必須開啟「試驗委託與審查」。');
 const systems=[...new Set(draft.systems||[])].filter(id=>['lms','lab','request'].includes(id));
 const role={id:`builtin:${draft.name}`,name:draft.name,builtin:true,level:draft.level,pages,systems,manageAccounts:Boolean(draft.manageAccounts)};
 const next=readBuiltinRoles(storage).map(row=>row.name===role.name?role:row);storage.setItem(BUILTIN_ROLE_KEY,JSON.stringify(next));return next;
}

export function canAccessLabPage(account,page,storage){if(account?.status!=='啟用中')return false;if(account.businessIdentity)return (account.businessPages||ROLE_PAGES.map(([id])=>id)).includes(({materials:'maintenance',audit:'requests'})[page]||page);const role=customRole(account,storage);return !role||role.pages.includes(({materials:'maintenance',audit:'requests'})[page]||page);}
