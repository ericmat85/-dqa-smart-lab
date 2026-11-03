import {buildNineStageSeed,NINE_SEED_KEY,SEED_KEYS} from './nineStageSeed.mjs';
import {CASE_RESET_KEY,caseResetActive} from './resetCases.mjs';
import {recoverLifecycleTransaction,commitLifecycleTransaction} from './scheduleLifecycle.mjs';
import {allReports,getReport,replaceReportSet} from './reportStore.mjs';
const fields={requests:'dqa-request-demo-v2',reviews:'dqa-lms-reviews-v1',schedules:'dqa-schedules-demo-v1',labRequests:'dqa_lab_demo_requests_v1',labAudit:'dqa_lab_demo_audit_v1',labOperations:'dqa-lab-operations-v1',borrows:'dqa-borrow-requests-v1',cancellations:'dqa-cancelled-requests-v1',equipment:'dqa-equipment-demo-v1',materials:'dqa-materials-demo-v1',accounts:'dqa-shared-demo-accounts-v1',demoFlowMarker:'dqa-completed-flow-provisioned-v1'};
const repository={list:allReports,get:getReport,replace:replaceReportSet};
export async function installNineStageSeed(options,storage=window.localStorage,reports=repository){
 if(caseResetActive(storage))throw Error('另一個分頁正在重設，請稍後再試。');
 recoverLifecycleTransaction(storage);
 const keys=[...SEED_KEYS,CASE_RESET_KEY,NINE_SEED_KEY],before=new Map(keys.map(key=>[key,storage.getItem(key)]));
 const previousIndex=await reports.list(),previousReports=await Promise.all(previousIndex.map(row=>reports.get(row.requestId)));
 const bundle=await buildNineStageSeed(options,storage);
 // Preparation can take time; never erase edits made in another tab meanwhile.
 if(keys.some(key=>storage.getItem(key)!==before.get(key))||JSON.stringify(await reports.list())!==JSON.stringify(previousIndex))throw Error('準備期間資料已更新，未清除原案件；請重新執行。');
 const id=crypto.randomUUID();let replaced=false;
 try{
  storage.setItem(CASE_RESET_KEY,JSON.stringify({id,phase:'clearing'}));
  await reports.replace(bundle.reports);replaced=true;
  const transaction=Object.fromEntries(Object.entries(fields).map(([field,key])=>[field,bundle.storage.getItem(key)]));
  commitLifecycleTransaction(storage,transaction);
  storage.setItem(NINE_SEED_KEY,JSON.stringify({version:1,ids:Array.from({length:18},(_,i)=>`DEMO-${String(i+1).padStart(3,'0')}`),createdAt:bundle.createdAt,counts:bundle.counts,simulated:true}));
  storage.setItem(CASE_RESET_KEY,JSON.stringify({id,phase:'done',at:new Date().toISOString(),seed:'nine-stage'}));
 }catch(error){
  // Drop the seed journal before restoring the previous snapshots, so recovery cannot replay it.
  storage.removeItem('dqa-schedule-lifecycle-pending-v1');
  for(const [key,value]of before){if(value===null)storage.removeItem(key);else storage.setItem(key,value);}
  if(replaced)await reports.replace(previousReports.filter(Boolean));
  throw error;
 }
 if(typeof window!=='undefined'&&storage===window.localStorage)for(const name of ['dqa:cases-reset','dqa:request-updated','dqa:schedules-updated','dqa:equipment-updated','dqa:review-updated'])window.dispatchEvent(new Event(name));
 return {ids:JSON.parse(storage.getItem(NINE_SEED_KEY)).ids,counts:bundle.counts};
}
