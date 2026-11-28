import {getRequestDate,isCalendarDate} from './requestDate.mjs';
export const BATCH_SCHEDULE_LIMIT=20;
export const BATCH_SCHEDULE_PREFIX='dqa-schedule-batch-v1';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function batchRowReason(row){
 if(row.readOnly||!row.businessDatabase||!UUID.test(row.requestDatabaseId||''))return '此筆為唯讀或非工作區排程';
 if(row.status!=='未排程'||row.pendingCancellation||row.reportInfo?.stage)return '此階段不可批次安排';
 if(!Number.isSafeInteger(row.requestRevision)||row.requestRevision<1||!Number.isSafeInteger(row.draftRevision??0)||row.draftRevision<0)return '資料版本待重新讀取';
 return '';
}
export function changeBatchSelection(selected,rows,checked){const next=new Set(selected);for(const row of rows){if(!checked)next.delete(row.id);else if(!batchRowReason(row))next.add(row.id);}if(next.size>BATCH_SCHEDULE_LIMIT)throw Error(`一次最多選取 ${BATCH_SCHEDULE_LIMIT} 筆，請縮小選取範圍。`);return [...next];}
export const shiftBatchDate=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function batchDateDefaults(now=new Date()){const earliest=shiftBatchDate(getRequestDate(now),1);return {earliest,latest:shiftBatchDate(earliest,13)};}
export function buildBatchCommand(member,rows,values,options){
 if(!UUID.test(member||'')||rows.length<1||rows.length>BATCH_SCHEDULE_LIMIT)throw Error('請重新確認登入帳號與選取範圍。');
 if(!isCalendarDate(options.earliest)||!isCalendarDate(options.latest)||options.earliest<=getRequestDate()||options.latest<options.earliest||options.latest>shiftBatchDate(options.earliest,31))throw Error('請設定明日起、最多 32 天的搜尋期間。');
 const seen=new Set();return {expected_member:member,options,selection:rows.map(row=>{
  if(seen.has(row.requestDatabaseId))throw Error('同一委託只能選取一次。');seen.add(row.requestDatabaseId);
  const form=values[row.id]||{},external=row.outsourced===true||row.priority==='委外',units=form.units===undefined||form.units===''?null:Number(form.units),count=external?0:Number(form.count??row.equipmentCount??1);
  return {request_id:row.requestDatabaseId,expected_request_revision:row.requestRevision,expected_draft_revision:row.draftRevision??0,sample_space_units:external?1:Number.isSafeInteger(units)&&units>=1&&units<=100000?units:null,equipment_count:Number.isSafeInteger(count)&&count>=0&&count<=4?count:null,sample_code:row.preapprovalWorkflow?'':String(form.code??row.sampleCode??'').trim()};
 })};
}
export function validateBatchPacket(packet,id,expectedIds){
 if(!packet||packet.id!==id||!UUID.test(id)||!['PLANNED','SAVED','EXPIRED','PROCESSING','NOT_FOUND'].includes(packet.state))throw Error('批次排程回應無法核對，請查詢處理結果。');
 if(['PROCESSING','NOT_FOUND'].includes(packet.state))return packet;
 if(!Array.isArray(packet.jobs)||packet.jobs.length>BATCH_SCHEDULE_LIMIT||packet.scope!=='DRAFT_ONLY'||packet.reserved!==false||packet.mode!=='VALIDATED_RULES')throw Error('批次排程回應格式不正確。');
 const ids=new Set();for(const job of packet.jobs){if(!UUID.test(job.request_id||'')||ids.has(job.request_id)||expectedIds&&!expectedIds.includes(job.request_id)||!['READY','BLOCKED'].includes(job.state)||typeof job.legacy_id!=='string'||typeof job.title!=='string'||!Array.isArray(job.equipment_labels)||job.equipment_labels.some(s=>typeof s!=='string'))throw Error('批次排程來源無法核對。');ids.add(job.request_id);if(job.state==='READY'&&(!isCalendarDate(job.plan?.start_date)||!isCalendarDate(job.plan?.end_date)||job.plan.end_date<job.plan.start_date||typeof job.plan.executor_label!=='string'))throw Error('排程建議缺少有效的日期或執行人。');}
 if(expectedIds&&(packet.jobs.length!==expectedIds.length)||packet.ready_count!==packet.jobs.filter(j=>j.state==='READY').length||packet.blocked_count!==packet.jobs.filter(j=>j.state==='BLOCKED').length||packet.state==='SAVED'&&(!Array.isArray(packet.results)||packet.results.length!==packet.ready_count))throw Error('批次排程筆數無法核對。');if(packet.state==='SAVED'){const ready=packet.jobs.filter(j=>j.state==='READY').map(j=>j.request_id),receipts=new Set();for(const r of packet.results){if(!ready.includes(r.request_id)||receipts.has(r.request_id)||r.state!=='SAVED'||r.reserved!==false||r.scope!=='DRAFT_ONLY'||!UUID.test(r.draft_id||'')||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error('批次儲存憑證無法核對。');receipts.add(r.request_id);}}return packet;
}
