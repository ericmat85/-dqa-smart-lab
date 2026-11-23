import {assertReportFileSize,reportDownloadURL,readReportResponseBytes} from './reportFilePolicy.mjs';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {businessIdentity,originalHumanSource,originalReportIndex,appStorage,refreshOriginalBusiness} from './originalBusiness.mjs';
const working=new Set();
export function humanPendingKey(){const me=businessIdentity();return me?'dqa-human-pending-v1:'+me.user.id+':'+me.member.id:null;}
export function pendingHumanOperation(){try{const key=humanPendingKey(),p=key?JSON.parse(sessionStorage.getItem(key)||'null'):null;return /^[a-f0-9-]{36}$/.test(p?.operation_id||'')?p:null;}catch{return null;}}
function pending(value){const key=humanPendingKey();if(!key)throw Error('請先登入。');if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);window.dispatchEvent(new Event('dqa:human-pending'));}
export function humanCommand(action,requestId,{signature='',comment='',uploadId=null,source=originalHumanSource(requestId)}={}){if(!source?.request)throw Error('委託資料已變動，請重新開啟。');return {action,request_id:source.request.id,expected_request_revision:source.request.revision,expected_schedule_revision:source.schedule?.revision||0,expected_report_revision:source.report?.revision||0,expected_draft_revision:source.draft?.revision||0,signature_data:signature,comment,upload_id:uploadId};}
export async function executeHuman(command){
 const key=humanPendingKey();if(!key||working.has(key)||pendingHumanOperation())throw Error('請先完成上一筆操作的結果查詢。');working.add(key);const operation_id=crypto.randomUUID();let dispatched=false;
 try{await businessClient.request('/execution/prepare',{method:'POST',body:{operation_id,command}});pending({operation_id});dispatched=true;const result=await businessClient.request('/execution/execute',{method:'POST',body:{operation_id,command}});pending(null);await refreshOriginalBusiness({afterWrite:true});return result.data;}
 catch(e){if(dispatched&&!e.outcomeUnknown)pending(null);throw e;}finally{working.delete(key);}
}
export async function lookupHuman(){const p=pendingHumanOperation();if(!p)return null;const {data}=await businessClient.request('/execution/result/'+p.operation_id);if(['SAVED','EXPIRED'].includes(data.state)){pending(null);await refreshOriginalBusiness({afterWrite:true});}return data.state;}
export const humanMessage=e=>e.code?businessErrorMessage(e):e.message;
export async function humanFile(id,expectedHash){
 const {data}=await businessClient.request('/execution/download/'+id);
 if(!/^[a-f0-9]{64}$/.test(data?.sha256||'')||expectedHash&&expectedHash!==data.sha256)throw Error('報告檔案雜湊不一致，已停止讀取。');
 assertReportFileSize(data.byte_size);
 const response=await fetch(reportDownloadURL(data.url),{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(60000)});
 const bytes=await readReportResponseBytes(response,data.byte_size),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==data.sha256)throw Error('報告檔案雜湊不一致，已停止讀取。');return bytes;
}
export async function getBusinessReport(requestId){
 const meta=originalReportIndex().find(r=>r.requestId===requestId);if(!meta)return null;
 const original=await humanFile(meta.fileId,meta.fileSha256),request=JSON.parse(appStorage().getItem('dqa-request-demo-v2')||'[]').find(r=>r.id===requestId);
 const {inspectReport,stampReport}=await import('./reportWorkbook.mjs');const check=await inspectReport(original,requestId,meta.fileName,request);if(!check.ok)throw Error('已保存的報告未通過欄位檢查，請由填寫人補正。');let signedExcel=original;
 for(const record of meta.signatureRecords){const {data}=await businessClient.request('/execution/signature/'+record.signatureId);const raw=Uint8Array.from(atob(data.signature_data.split(',')[1]),c=>c.charCodeAt(0));const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==record.signatureSha256)throw Error('簽名圖片雜湊不一致。');signedExcel=await stampReport(signedExcel,{sheetName:check.sheetName,cells:check.cells,level:record.stage==='REPORT_SUBMIT'?'executor':Number(record.stage.slice(-1)),signature:data.signature_data,actor:record.actor,at:record.at});}
 return {...meta,original,signedExcel,check,sheetName:check.sheetName,cells:check.cells,pdf:meta.archiveFileId?await humanFile(meta.archiveFileId):undefined};
}
async function uploadHuman(kind,requestId,bytes,name,source){
 assertReportFileSize(bytes.byteLength);const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID();
 const {data}=await businessClient.request('/execution/upload',{method:'POST',body:{id,request_id:source.request.id,kind,file_name:name,byte_size:bytes.byteLength,sha256:sha,request_revision:source.request.revision,report_revision:source.report?.revision||0}});
 const response=await fetch(data.url,{method:'PUT',headers:{'Content-Type':data.mime_type,'x-upsert':'false'},body:bytes,redirect:'error'});if(!response.ok)throw Error('檔案尚未成功上傳，未提交報告。');return id;
}
export async function submitBusinessReport({requestId,file,signature,onProgress=()=>{},source:expectedSource}){
 if(!signature)throw Error('請先完成執行人簽名。');assertReportFileSize(file.size);if(pendingHumanOperation())throw Error('請先查詢上一筆操作。');const source=expectedSource||originalHumanSource(requestId);onProgress(10,'核對已完成試驗與報告');const bytes=new Uint8Array(await file.arrayBuffer());const {inspectReport}=await import('./reportWorkbook.mjs'),request=JSON.parse(appStorage().getItem('dqa-request-demo-v2')||'[]').find(r=>r.id===requestId),check=await inspectReport(bytes,requestId,file.name,request);if(!check.ok)throw Object.assign(Error('報告欄位尚未完成，未送簽。'),{check});onProgress(40,'上傳不可覆寫的報告版本');const uploadId=await uploadHuman('REPORT',requestId,bytes,file.name,source);onProgress(70,'後端驗證檔案與委託關聯');await executeHuman(humanCommand('REPORT_SUBMIT',requestId,{signature,uploadId,source}));onProgress(100,'報告已送交二階主管審查');return originalReportIndex().find(r=>r.requestId===requestId);}
export async function reviewBusinessReport({requestId,signature='',comment='',expectedRevision},action){const source=originalHumanSource(requestId);if(source.report?.revision!==expectedRevision)throw Error('報告版本已變更，請重新開啟審查。');await executeHuman(humanCommand(action,requestId,{signature,comment,source}));return originalReportIndex().find(r=>r.requestId===requestId);}
export async function archiveBusinessReport({requestId,expectedRevision,fontBytes}){
 const source=originalHumanSource(requestId);if(source.report?.revision!==expectedRevision)throw Error('報告版本已變更，請重新開啟。');const report=await getBusinessReport(requestId),request=JSON.parse(appStorage().getItem('dqa-request-demo-v2')||'[]').find(r=>r.id===requestId);
 for(const record of request.signatureRecords||[]){if(!record.signatureId)continue;const {data}=await businessClient.request('/workflow/signature/'+record.signatureId);const bytes=Uint8Array.from(atob(data.signature_data.split(',')[1]),c=>c.charCodeAt(0));const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==record.signatureSha256)throw Error('委託簽名圖片雜湊不一致。');record.signature=data.signature_data;}
 const {reportToPdf}=await import('./reportPdf.mjs'),{buildCasePdf}=await import('./casePdf.mjs');const pdf=await buildCasePdf({request,reportBytes:await reportToPdf(report.signedExcel,{requestId,fontBytes,fontSubset:true}),fontBytes,fontSubset:true});const uploadId=await uploadHuman('ARCHIVE',requestId,pdf.bytes,requestId+'-結案文件.pdf',source);await executeHuman(humanCommand('CONFIRM_ARCHIVE',requestId,{uploadId,source}));return originalReportIndex().find(r=>r.requestId===requestId);
}
