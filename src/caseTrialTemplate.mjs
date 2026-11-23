import {appStorage} from './originalBusiness.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {canAccessLabPage} from './customRoles.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {findTrialDefinition,readTrialCatalog} from './trialCatalogStore.mjs';
import {isGeneralTrialName} from './trialTemplateMatching.mjs';
import {createReportTemplate} from './reportWorkbook.mjs';
const rows=(storage,key,fallback=[])=>{const raw=storage.getItem(key);let value;try{value=raw===null?fallback:JSON.parse(raw);}catch{throw Error('案件來源資料無法讀取，已停止產生範本。');}if(!Array.isArray(value))throw Error('案件來源資料格式無效。');return value;};
export function caseTrialMapping(request,storage=appStorage()){
 if(!Array.isArray(request?.testItems)||request.testItems.length!==1||typeof request.testItems[0]!=='string'||!request.testItems[0].trim())throw Error('本案須明確指定單一試驗項目；多項或缺漏時停止下載，請先確認本次排程的試驗項目。');
 const name=request.testItems[0];if(isGeneralTrialName(name))return {id:'GENERAL_PERFORMANCE',name:'一般性能試驗',version:'general-performance-v1'};
 const trial=findTrialDefinition(name,storage);if(!trial)throw Error(`找不到「${name}」對應的試驗範本；請至試驗與設備參數確認名稱，未改用通用範本。`);
 return trial;
}
function executionSource(source,storage){
 const receipt=rows(storage,'dqa_lab_demo_requests_v1').find(r=>r.id===source.id);
 if(!receipt?.acceptedAt)return source;
 const schedule=rows(storage,'dqa-schedules-demo-v1').find(r=>r.requestId===source.id&&r.id===receipt.scheduleId&&r.reservationId===receipt.reservationId&&r.time===receipt.scheduledStart&&r.end===receipt.scheduledEnd);
 if(!schedule)throw Error('本案排程與接收資料不一致，請重新確認後下載。');
 return {...source,execution:{...(source.execution?.hours?{hours:source.execution.hours}:{}),scheduleId:schedule.id,reservationId:schedule.reservationId,equipment:schedule.eq,operator:schedule.owner,sampleCode:schedule.sampleCode||receipt.sampleIds||'',plannedStart:schedule.time,plannedEnd:schedule.end,completedAt:schedule.completedAt||source.execution?.completedAt||''}};
}
function fingerprint(value){const {status:_status,updatedAt:_at,executionHistory:_executionHistory,history:_history,...fields}=value;return JSON.stringify(fields);}
function sourceFor({requestId,actorId},storage){
 const actor=rows(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS).find(a=>a.id===actorId);
 if(!accessSystem(actor,'lab',storage)||!canAccessLabPage(actor,'requests',storage))throw Error('目前帳號沒有取得本案試驗範本的權限。');
 const found=rows(storage,'dqa-request-demo-v2').filter(r=>r.id===requestId);
 if(found.length!==1)throw Error('找不到唯一且完整的本案電子委託資料，已停止下載；未改用通用範本。');
 const source=found[0];if(source.businessDatabase){const work=rows(storage,'dqa_lab_demo_requests_v1').find(r=>r.id===requestId);if(!work?.acceptedAt||work.executorId!==actorId)throw Error('僅本案已確認接收的執行人員可下載試驗範本。');}if(source.status==='取消')throw Error('本案已取消，停止產生範本。');
 const mapping=caseTrialMapping(source,storage),catalog=readTrialCatalog(storage);
 return {source:structuredClone(executionSource(source,storage)),trial:structuredClone(mapping),catalogRevision:catalog.revision};
}
export async function readCaseTrialTemplate(access,storage=appStorage(),{build=(source)=>createReportTemplate(source,false,{requireTrialMatch:true,storage}),signal,onStage=()=>{}}={}){
 const active=()=>{if(signal?.aborted)throw new DOMException('範本準備已取消','AbortError');};active();
 const first=sourceFor(access,storage);onStage('BUILDING',first.trial);
 const result=await build(first.source);active();onStage('VERIFYING',first.trial);
 const last=sourceFor(access,storage);
 if(first.catalogRevision!==last.catalogRevision||JSON.stringify(first.trial)!==JSON.stringify(last.trial)||fingerprint(first.source)!==fingerprint(last.source))throw Error('委託或試驗範本資料已更新，請重新下載；未輸出舊資料。');
 const bytes=result instanceof Uint8Array?result:result?.bytes;if(!bytes?.byteLength)throw Error('試驗範本未產生，請稍後重試。');
 const label=last.trial.name.replace(/[\\/:*?"<>|]/g,'_');return {...(result instanceof Uint8Array?{}:result),bytes,name:`試驗報告單_${access.requestId}_${label}.xlsx`,trial:last.trial,source:last.source};
}
