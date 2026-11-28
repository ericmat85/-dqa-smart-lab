import {getSignatureHistory} from './signatureHistory.mjs';
const stageNames={REQUESTER:'委託送出',REQUEST_MANAGER:'直屬主管簽核',LMS_1:1,LMS_2:2,LAB_PREPARE:'試驗前準備填寫',LAB_RECEIVE:'執行者接收確認',LAB_COMPLETE:'試驗完成確認'};
const confirming=new Set(['已核准','待審查','待排程','待確認','已排程','試驗中','執行中','暫停中','已完成','完成','待審核','待查閱','已結案']);
const executing=new Set(['待確認','已排程','試驗中','執行中','暫停中','已完成','完成','待審核','待查閱','已結案']);
export function resolveRequestInformation(supplied,snapshot={}){
 const source=(snapshot.electronic||[]).find(r=>r.id===supplied.id)||supplied;
 const schedule=(snapshot.schedules||[]).find(r=>r.requestId===source.id&&!['取消','未排程'].includes(r.status)&&(!r.documentVersionId||!source.documentVersionId||r.documentVersionId===source.documentVersionId));
 const execution=source.execution||(executing.has(source.status)&&schedule?{status:schedule.status,equipment:schedule.eq||schedule.equipment,operator:schedule.owner||schedule.operator,sampleCode:schedule.sampleCode,startedAt:schedule.startedAt,completedAt:schedule.completedAt}:undefined);
 return {...source,execution,productCode:source.productCode||source.product,customer:source.customer||source.customerName||source.project,requester:source.requester||source.applicant,dueDate:source.dueDate||source.requestedDate,purpose:source.purpose||source.intentions||[],testItems:source.testItems||(source.title?[source.title]:[]),judgementCriteria:source.judgementCriteria||source.judgment,notes:source.notes||source.remarks,createdAt:source.createdAt||source.submitted};
}
export function currentRequestSignatures(request){return getSignatureHistory(request).filter(r=>!request.businessDatabase||!!request.documentVersionId&&r.documentVersionId===request.documentVersionId);}
export function stageSignature(request,stage,entry){const rows=currentRequestSignatures(request).filter(r=>r.stage===stageNames[stage]||r.stage===stage);if(!entry?.at)return rows.at(-1);return rows.findLast(r=>r.at===entry.at)||rows.findLast(r=>Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)===Date.parse(entry.at)&&(!entry.actor||r.actor===entry.actor));}
export function requestInformationPhase(request,stages={}){
 const records=currentRequestSignatures(request),has=key=>!!stages[key]||!!stageSignature(request,key);
 const execution=['LAB_PREPARE','LAB_RECEIVE','LAB_COMPLETE'].some(key=>!!stages[key]||!request.businessDatabase&&!!stageSignature(request,key))||Object.values(request.execution||{}).some(v=>v!==undefined&&v!==null&&v!=='')||executing.has(request.status);
 const confirmation=execution||['LMS_1','LMS_2'].some(has)||confirming.has(request.status)||Number(request.reviewLevel??request.approval)>0;
 return {confirmation,execution,active:execution?3:confirmation?2:1,records};
}
export function stageDisplayValue(value,type){
 if(value===undefined||value===null||value==='')return '';
 const names={yes:'是',no:'否',not_applicable:'不適用',pending:'尚未確認',new_product:'新產品',design_change:'設計變更',other:'其他'};
 if(Array.isArray(value))return value.map(v=>names[v]||String(v)).join('、');
 if(type==='choice'||type==='optionalChoice'||type==='pendingChoice')return names[value]||String(value);
 return String(value);
}
export function requestScheduleFields(request,schedule,entry){
 // Signed and server-validated preview fields must never be replaced by a later schedule.
 if(entry)return entry.fields||{};
 if(!schedule||schedule.documentVersionId&&request.documentVersionId&&schedule.documentVersionId!==request.documentVersionId)return {};
 return {sampleCode:schedule.sampleCode||schedule.sample||request.sampleCode||'',equipment1:schedule.eq||schedule.equipment||'',equipmentStart1:schedule.time||'',equipmentEnd1:schedule.end||'',plannedOperator:schedule.owner||schedule.operator||'',plannedStartDate:schedule.time||''};
}
