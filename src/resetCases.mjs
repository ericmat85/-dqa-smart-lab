import {commitLifecycleTransaction,recoverLifecycleTransaction} from './scheduleLifecycle.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
export const CASE_RESET_KEY='dqa-case-reset-version';
export function caseResetVersion(storage=window.localStorage){return storage.getItem(CASE_RESET_KEY)||'';}
export function caseResetActive(storage=window.localStorage){try{return JSON.parse(caseResetVersion(storage)||'{}').phase==='clearing';}catch{return false;}}
async function clearReports(database){
 if(!database)return;
 await new Promise((resolve,reject)=>{
  const open=database.open('dqa_lab_demo_reports',2);
  open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('reports'))open.result.createObjectStore('reports',{keyPath:'requestId'});if(!open.result.objectStoreNames.contains('reportIndex'))open.result.createObjectStore('reportIndex',{keyPath:'requestId'});};
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result;if(!db.objectStoreNames.contains('reports')){db.close();resolve();return;}const stores=['reports',...(db.objectStoreNames.contains('reportIndex')?['reportIndex']:[])];const transaction=db.transaction(stores,'readwrite');for(const name of stores)transaction.objectStore(name).clear();transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error||Error('報告資料清除失敗。'));};};
 });
}
export async function resetSystemCases(storage=window.localStorage,database=globalThis.indexedDB){
 recoverLifecycleTransaction(storage);
 const equipmentRaw=storage.getItem('dqa-equipment-demo-v1');
 const equipment=equipmentRaw===null?DEMO_EQUIPMENT:JSON.parse(equipmentRaw);if(!Array.isArray(equipment))throw Error('設備台帳無法讀取，尚未清除案件。');
 const id=crypto.randomUUID();storage.setItem(CASE_RESET_KEY,JSON.stringify({id,phase:'clearing'}));
 try{
  const transaction={requests:'[]',reviews:'[]',schedules:'[]',labRequests:'[]',labAudit:'[]',labOperations:'[]',borrows:'[]',cancellations:'{}',equipment:JSON.stringify(equipment?.map(row=>((row.status==='使用中'&&row.currentRequest)||(row.status==='借用'&&row.activeBorrowId))?{...row,status:'待機中',currentRequest:'',activeBorrowId:null,borrower:'',borrowReturnDate:''}:row)||[])};
  commitLifecycleTransaction(storage,transaction);
  await clearReports(database);
  storage.setItem(CASE_RESET_KEY,JSON.stringify({id,phase:'done',at:new Date().toISOString()}));
 }catch(error){storage.setItem(CASE_RESET_KEY,JSON.stringify({id,phase:'failed'}));throw error;}
}
