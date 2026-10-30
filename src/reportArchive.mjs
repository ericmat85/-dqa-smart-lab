import {accessSystem,ROLE} from './demoPermissions.mjs';
import {customRole} from './customRoles.mjs';
import {canReadReport} from './reportRules.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {getReport} from './reportStore.mjs';
export function canOpenReportArchive(actor,system,storage){
 if(!accessSystem(actor,system,storage))return false;
 const custom=customRole(actor,storage);return !custom||custom.pages.includes('archive');
}
export function canReadArchivedReport(actor,report,request,system,storage){
 if(!canOpenReportArchive(actor,system,storage)||!request||request.status!=='已結案'||report?.stage!=='archived'||!report.confirmedAt||!report.archivedAt||!report.pdfName)return false;
 if(actor.role===ROLE.ADMIN||canReadReport(actor,report,request,storage))return true;
 return (request.signatureRecords||[]).some(row=>row.actorId===actor.id&&['核准','送出'].includes(row.decision));
}
export function archiveRequests(storage){
 const value=JSON.parse(storage.getItem('dqa-request-demo-v2')||'[]');if(!Array.isArray(value))throw Error('委託資料無法讀取，無法確認資料庫權限。');return value;
}
export async function readArchivedPdf({actorId,requestId,system},storage=window.localStorage,repository={get:getReport}){
 const authorize=report=>{
  const accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS));if(!Array.isArray(accounts))throw Error('帳號資料無法讀取，拒絕提供檔案。');
  const actor=accounts.find(row=>row.id===actorId),request=archiveRequests(storage).find(row=>row.id===requestId);
  if(!canReadArchivedReport(actor,report,request,system,storage))throw Error('此案件尚未完成主管查閱封存，或您沒有查閱權限。');
 };
 const report=await repository.get(requestId);authorize(report);
 if(!report.pdf?.byteLength)throw Error('封存 PDF 不存在，請重新確認封存結果。');
 authorize(report);return {bytes:report.pdf,name:report.pdfName};
}
