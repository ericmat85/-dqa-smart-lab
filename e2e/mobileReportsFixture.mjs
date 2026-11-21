import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
export const longRequest='REQ-2026-MOBILE-d4e1fbb3c5094cd39f87767fc52dc01f';
export async function seedReports(page,theme='light'){
 await page.clock.setFixedTime(new Date('2026-11-19T04:00:00Z'));
 await page.addInitScript(({accounts,equipment,theme,longRequest})=>{
  if(!localStorage.getItem('mobile-reports-seeded')){localStorage.setItem('mobile-reports-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));localStorage.setItem('dqa-management-preferences-v1',JSON.stringify({reportPeriod:'all',exportSummary:true}));for(const key of ['dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id:longRequest,status:'待排程',ownerId:'DEMO-REQUESTER',requester:'合成委託者',department:'合成部門',testItems:['高溫試驗'],quantity:1,history:[]} ]));localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify(Array.from({length:8},(_,i)=>({id:`MOB-SCH-${i}`,requestId:i?`MOBILE-REPORT-${i}`:longRequest,title:'合成高溫試驗',status:'未排程',quantity:1,time:'2099-01-01',end:'2099-01-02',eq:'',owner:'',productCode:`FAKE-${i}`}))));}
  sessionStorage.setItem('dqa-lms-account-id','U001');sessionStorage.setItem('dqa-request-account-id','DEMO-REQUESTER');sessionStorage.setItem('dqa-request-role','requester');sessionStorage.setItem('dqa-lab-account-id','U003');
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,theme,longRequest});
}
export const business=page=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa-lms-reviews-v1','dqa-equipment-demo-v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'].map(key=>[key,localStorage.getItem(key)])));
