import {originalBusinessEnabled} from './originalBusiness.mjs';
import {appStorage} from './originalBusiness.mjs';
import {getReport,allReports,saveReport} from './reportStore.mjs';
import {inspectReport,stampReport} from './reportWorkbook.mjs';
import {REPORT_STATUS,DEFAULT_SIGNATURE_CELLS,canReviewReport,canConfirmReport,reportMetadata} from './reportRules.mjs';
import {caseResetVersion,caseResetActive} from './resetCases.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {commitLifecycleTransaction} from './scheduleLifecycle.mjs';
const repo={get:getReport,list:allReports,save:saveReport};
const read=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('報告流程資料無法讀取。');return rows;};
const actor=(storage,id)=>read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(row=>row.id===id);
const request=(storage,id)=>read(storage,'dqa-request-demo-v2').find(row=>row.id===id);
const ensureEpoch=(storage,epoch)=>{if(caseResetActive(storage)||caseResetVersion(storage)!==epoch)throw Error('系統資料已清除或重設，已停止此操作。');};
const buffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
export function projectReportState(report,storage=appStorage()){
 if(originalBusinessEnabled())return false;
 if(caseResetActive(storage))return false;
 const meta=reportMetadata(report);if(!meta)return false;
 const requests=read(storage,'dqa-request-demo-v2'),original=requests.find(row=>row.id===report.requestId);if(!original||original.status==='取消')return false;
 if(original.reportInfo?.revision===meta.revision)return false;
 const status=REPORT_STATUS[report.stage];
 const lab=read(storage,'dqa_lab_demo_requests_v1').map(row=>row.id===report.requestId?{...row,status,reportSubmitted:report.stage!=='returned',reportName:report.fileName,reportInfo:meta}:row);
 const schedules=read(storage,'dqa-schedules-demo-v1').map(row=>row.requestId===report.requestId?{...row,status:report.stage==='archived'?'已結案':row.status,reportInfo:meta}:row);
 commitLifecycleTransaction(storage,{requests:JSON.stringify(requests.map(row=>row.id===report.requestId?{...row,status,reportInfo:meta,execution:row.execution?{...row.execution,reportSubmitted:report.stage!=='returned'}:row.execution}:row)),labRequests:JSON.stringify(lab),schedules:JSON.stringify(schedules)});return true;
}
export async function submitReportWorkflow({requestId,file,signature,actorId,onProgress=()=>{},minimumMs=1000,expectedSource},storage=appStorage(),repository=repo){
 if(originalBusinessEnabled())return (await import('./businessHumanClient.mjs')).submitBusinessReport({requestId,file,signature,onProgress,source:expectedSource});
 const epoch=caseResetVersion(storage),started=Date.now(),account=actor(storage,actorId),source=request(storage,requestId),lab=read(storage,'dqa_lab_demo_requests_v1').find(row=>row.id===requestId);
 if(!accessSystem(account,'lab',storage)||!source||!lab||lab.status!=='已完成')throw Error('案件尚未完成、已提交或此帳號無提交權限。');
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('請先完成電子簽名。');if(!file)throw Error('請選擇 Excel 檔案。');
 const existing=await repository.get(requestId);if(existing?.stage&&existing.stage!=='returned')throw Error('此報告已提交，請重新整理案件狀態。');
 onProgress(20,'讀取 Excel 檔案');const bytes=new Uint8Array(await file.arrayBuffer());onProgress(45,'檢查委託編號、試驗結果與公式');const check=await inspectReport(bytes,requestId,file.name,source);
 if(!check.ok){const error=Error('報告未通過防呆檢查，請修正後重新提交。');error.check=check;throw error;}
 const cells=check.cells||{...DEFAULT_SIGNATURE_CELLS};
 // Validate signature anchors against the actual sheet before a reviewer can get stuck on invalid locations.
 await stampReport(bytes,{sheetName:check.sheetName,cells,level:2,signature,actor:'位置驗證',at:new Date().toISOString()});
 const at=new Date().toISOString();
 if(!cells.executor)throw Error('請設定執行人員簽名位置（例如 G21）。');
 const issued=await stampReport(bytes,{sheetName:check.sheetName,cells,level:'executor',signature,actor:account.name,at});
 onProgress(80,'確認簽名位置及檔案可讀性');await new Promise(resolve=>setTimeout(resolve,Math.max(0,minimumMs-(Date.now()-started))));ensureEpoch(storage,epoch);
 if(!accessSystem(actor(storage,actorId),'lab',storage)||read(storage,'dqa_lab_demo_requests_v1').find(row=>row.id===requestId)?.status!=='已完成')throw Error('帳號權限或案件狀態已變更。');
 const report={requestId,revision:crypto.randomUUID(),stage:'level2',fileName:file.name,original:buffer(bytes),signedExcel:buffer(issued),sheetName:check.sheetName,profileId:check.profileId,cells,submitterId:account.id,submitter:account.name,submitterSignature:signature,submittedAt:at,approvals:[],revisionNumber:(existing?.revisionNumber||0)+1,documentKind:(source.testItems||[]).includes('一般性能試驗')?'一般性能試驗報告':'通常試驗報告',priorApprovals:[...(existing?.priorApprovals||[]),...(existing?.approvals||[])],check,history:[...(existing?.history||[]),{id:crypto.randomUUID(),at,actor:account.name,action:'提交報告並通過 Demo 防呆檢查'}]};
 await repository.save(report,existing?.revision??null,epoch);ensureEpoch(storage,epoch);projectReportState(report,storage);onProgress(100,'已提交 LMS 二階主管審核');return reportMetadata(report);
}
export async function approveReportWorkflow({requestId,actorId,signature,expectedRevision},storage=appStorage(),repository=repo){
 if(originalBusinessEnabled())return (await import('./businessHumanClient.mjs')).reviewBusinessReport({requestId,signature,expectedRevision},'REPORT_APPROVE');
 const epoch=caseResetVersion(storage),report=await repository.get(requestId),source=request(storage,requestId),account=actor(storage,actorId);if(!report||report.revision!==expectedRevision)throw Error('報告已更新，請重新開啟審核視窗。');
 if(!canReviewReport(account,report,source,storage))throw Error('本階段僅限對應的二／三階主管簽核，且不得重複或自行簽核。');
 const level=report.stage==='level2'?2:3,at=new Date().toISOString();const stamped=await stampReport(report.signedExcel,{sheetName:report.sheetName,cells:report.cells,level,signature,actor:account.name,at});ensureEpoch(storage,epoch);
 if(!canReviewReport(actor(storage,actorId),report,request(storage,requestId),storage))throw Error('帳號權限或案件狀態已變更。');
 const next={...report,revision:crypto.randomUUID(),signedExcel:buffer(stamped),stage:level===2?'level3':'view',approvals:[...report.approvals,{level,actorId,actor:account.name,at,signature}],history:[...report.history,{id:crypto.randomUUID(),at,actor:account.name,action:`第${level}階主管核准並轉印簽名至 ${report.cells[`level${level}`]}`}]};
 await repository.save(next,report.revision,epoch);ensureEpoch(storage,epoch);projectReportState(next,storage);return reportMetadata(next);
}
export async function confirmReportViewed({requestId,actorId,expectedRevision,fontBytes},storage=appStorage(),repository=repo){
 if(originalBusinessEnabled())return (await import('./businessHumanClient.mjs')).archiveBusinessReport({requestId,expectedRevision,fontBytes});
 const epoch=caseResetVersion(storage),report=await repository.get(requestId),source=request(storage,requestId),account=actor(storage,actorId);
 if(!report||report.revision!==expectedRevision)throw Error('報告已更新，請重新開啟。');if(!canConfirmReport(account,report,source))throw Error('僅指定委託者主管可確認查閱，且須先完成二、三階審核。');
 const {reportToPdf}=await import('./reportPdf.mjs');
 const {buildCasePdf}=await import('./casePdf.mjs');
 const reportPdf=await reportToPdf(report.signedExcel,{requestId,fontBytes});
 const dossier=await buildCasePdf({request:source,reportBytes:reportPdf,fontBytes});ensureEpoch(storage,epoch);
 if(!canConfirmReport(actor(storage,actorId),report,request(storage,requestId)))throw Error('帳號權限或案件狀態已變更。');
 const at=new Date().toISOString(),next={...report,revision:crypto.randomUUID(),stage:'archived',pdf:buffer(dossier.bytes),reportPdf:buffer(reportPdf),pdfSections:dossier.sections,pdfName:`${requestId}-結案文件-DEMO.pdf`,confirmedAt:at,confirmedBy:account.name,confirmedById:account.id,archivedAt:at,history:[...report.history,{id:crypto.randomUUID(),at,actor:account.name,action:'確認查閱，合併委託單與含三方圖片簽名之報告，Demo PDF 封存至本機'}]};
 await repository.save(next,report.revision,epoch);ensureEpoch(storage,epoch);projectReportState(next,storage);return reportMetadata(next);
}

export async function returnReportWorkflow({requestId,actorId,comment,expectedRevision},storage=appStorage(),repository=repo){
 if(originalBusinessEnabled())return (await import('./businessHumanClient.mjs')).reviewBusinessReport({requestId,comment,expectedRevision},'REPORT_RETURN');
 const epoch=caseResetVersion(storage),report=await repository.get(requestId),source=request(storage,requestId),account=actor(storage,actorId);
 if(!report||report.revision!==expectedRevision)throw Error('報告已更新，請重新開啟審核視窗。');
 if(!canReviewReport(account,report,source,storage))throw Error('此帳號無權退回目前階段的報告。');
 const reason=String(comment||'').trim();if(!reason)throw Error('退回報告時須填寫原因。');
 const at=new Date().toISOString(),level=report.stage==='level2'?2:3;
 const next={...report,revision:crypto.randomUUID(),stage:'returned',returnReason:reason,priorApprovals:[...(report.priorApprovals||[]),{level,actorId,actor:account.name,at,decision:'退回'}],history:[...report.history,{id:crypto.randomUUID(),at,actor:account.name,actorId,level,action:`第${level}階主管退回報告：${reason}`} ]};
 ensureEpoch(storage,epoch);await repository.save(next,report.revision,epoch);ensureEpoch(storage,epoch);projectReportState(next,storage);return reportMetadata(next);
}

// Requester-manager readback return: resubmit through the existing report review chain.
export async function returnViewedReport({requestId,actorId,comment,expectedRevision},storage=appStorage(),repository=repo){
 if(originalBusinessEnabled())return (await import('./businessHumanClient.mjs')).reviewBusinessReport({requestId,comment,expectedRevision},'REPORT_RETURN');
 const epoch=caseResetVersion(storage),report=await repository.get(requestId),source=request(storage,requestId),account=actor(storage,actorId);
 if(!report||report.revision!==expectedRevision)throw Error('報告已更新，請重新開啟。');
 if(!canConfirmReport(account,report,source))throw Error('僅指定委託者主管可退回待查閱報告。');
 const reason=String(comment||'').trim();if(!reason)throw Error('退回原因必填。');
 const at=new Date().toISOString(),next={...report,revision:crypto.randomUUID(),stage:'returned',returnReason:reason,history:[...report.history,{id:crypto.randomUUID(),at,actor:account.name,actorId:account.id,action:`委託者主管查閱退回：${reason}`} ]};
 ensureEpoch(storage,epoch);await repository.save(next,report.revision,epoch);ensureEpoch(storage,epoch);projectReportState(next,storage);return reportMetadata(next);
}
