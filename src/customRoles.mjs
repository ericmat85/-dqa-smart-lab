export const ROLE_KEY='dqa-custom-roles-v1';
export const ROLE_PAGES=[['dashboard','儀錶板'],['requests','試驗委託與審查'],['schedule','排程管理'],['equipment','設備管理'],['maintenance','物料管理'],['reports','報表分析'],['archive','報告資料庫'],['settings','系統設定']];
export const BUILTIN_ROLES=['實驗室工程師','實驗室副工程師','委託者','委託者主管','一階主管','二階主管','三階主管','系統管理員','檢視者'];
export function readCustomRoles(storage=globalThis.window?.localStorage){try{const rows=JSON.parse(storage?.getItem(ROLE_KEY)||'[]');return Array.isArray(rows)?rows.filter(row=>typeof row.name==='string'&&Array.isArray(row.pages)&&[0,1,2,3].includes(row.level)):[];}catch{return [];}}
export function saveCustomRole(roles,draft,storage=globalThis.window?.localStorage){
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
export function customRole(account,storage){return readCustomRoles(storage).find(role=>role.name===account?.role);}
export function canAccessLmsPage(account,page){if(account?.status!=='啟用中')return false;const role=customRole(account);return role?page==='accounts'?role.manageAccounts:role.pages.includes(page):true;}
