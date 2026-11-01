export const INITIAL_ACCOUNTS = [

  {

    id: "U001",

    name: "黃小明",

    email: "level0@example.com",

    role: "系統管理員",

    department: "DQA 實驗室",

    status: "啟用中",

    lastLogin: "2026-10-24 08:00",

  },

  {

    id: "U002",

    name: "林阿達",

    email: "linada@example.com",

    role: "系統管理員",

    department: "DQA 實驗室",

    status: "啟用中",

    lastLogin: "2026-10-23 16:30",

  },

  {

    id: "U003",

    name: "陳工程師",

    email: "chen@example.com",

    role: "實驗室工程師",

    department: "DQA 實驗室",

    status: "啟用中",

    lastLogin: "2026-10-23 14:20",

  },

  {

    id: "U004",

    name: "王測試",

    email: "wang@example.com",

    role: "檢視者",

    department: "品保部",

    status: "已停用",

    lastLogin: "尚未登入",

  },

  { id: 'DEMO-REQUESTER', name: '示範委託者', email: 'requester@example.com', role: '委託者', supervisorId: 'DEMO-SUPERVISOR', department: '研發部', status: '啟用中', lastLogin: '尚未登入' },
  { id: 'DEMO-SUPERVISOR', name: '示範委託者主管', email: 'supervisor@example.com', role: '委託者主管', department: '研發部', status: '啟用中', lastLogin: '尚未登入' },
  { id: 'DEMO-LEVEL1', name: '示範一階主管', email: 'level1@example.com', role: '一階主管', department: 'DQA 實驗室', status: '啟用中', lastLogin: '尚未登入' },
  { id: 'DEMO-LEVEL2', name: '示範二階主管', email: 'level2@example.com', role: '二階主管', department: 'DQA 實驗室', status: '啟用中', lastLogin: '尚未登入' },
  {id:'DEMO-LEVEL3',name:'示範三階主管',email:'level3@example.com',role:'三階主管',department:'DQA 實驗室',status:'啟用中',lastLogin:'尚未登入'},
];

const KEY = 'dqa-shared-demo-accounts-v1';
export function migrateAdminAccount(accounts){
 return accounts.map(account=>account.id==='U001'&&account.email==='huangxm@example.com'?{...account,email:'level0@example.com'}:account);
}
export function readDemoAccounts() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (Array.isArray(stored)){const next=migrateAdminAccount(stored);if(JSON.stringify(next)!==JSON.stringify(stored)){try{window.localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Continue with the migrated in-memory account. */}}return next;}
  } catch { /* Keep invalid stored data intact; use defaults in memory. */ }
  return INITIAL_ACCOUNTS;
}
