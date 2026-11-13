import catalog from '../render-backend/gateway/e2_demo_catalog.json' with {type:'json'};
import {equipmentIds,reservationWindow} from './scheduleResources.mjs';
import {dateOnly,validateSchedule} from './scheduleEquipment.mjs';
import {isCalendarDate} from './requestDate.mjs';

const machines=new Map(catalog.equipment.map(x=>[x.id,x]));
const cases=new Map(catalog.cases.map(x=>[x.id,x]));
const statuses={'未排程':'UNSCHEDULED','有衝突':'CONFLICT','已排程':'SCHEDULED','試驗中':'RUNNING','進行中':'RUNNING','暫停中':'RUNNING','已完成':'COMPLETED','已結案':'COMPLETED','取消':'CANCELLED','待核准':'PENDING_APPROVAL'};
const deviceStatuses={'待機中':'STANDBY','使用中':'IN_USE','維護中':'MAINTENANCE','校驗中':'CALIBRATION'};
const knownAccounts=new Set(['U001','U002','U003','U004','DEMO-REQUESTER','DEMO-SUPERVISOR','DEMO-LEVEL1','DEMO-LEVEL2','DEMO-LEVEL3']);
const failure=code=>{throw Error('E2_DATA_BLOCKED: '+code);};
const day=value=>isCalendarDate(value)?Date.parse(value+'T00:00:00+08:00'):NaN;
const todayAt=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const optional=value=>value===undefined||value===null||String(value).trim()===''?null:Number(value);
const calendarDay=value=>isCalendarDate(dateOnly(value))?dateOnly(value):null;
const addCalendarDays=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const durationFrom=(start,end)=>{const a=calendarDay(start),b=calendarDay(end);return a&&b&&b>=a?Math.round((day(b)-day(a))/86400000)+1:null;};

// A search window is planning input, never an invented trial date or delivery promise.
export function e2PlanningWindow({editing,form,now=Date.now()}){
 const tomorrow=addCalendarDays(todayAt(now),1),manualStart=calendarDay(form.time),manualEnd=calendarDay(form.end);
 const earliest=form.searchStart!==undefined?calendarDay(form.searchStart):manualStart&&manualStart>=tomorrow?manualStart:tomorrow;
 const requested=calendarDay(editing.requestedDate),hasRequested=editing.requestedDate!==undefined&&editing.requestedDate!==null&&String(editing.requestedDate).trim()!=='';
 const deadline=form.searchUntil!==undefined?calendarDay(form.searchUntil):hasRequested?requested:((manualEnd&&earliest&&manualEnd>=earliest)?manualEnd:earliest?addCalendarDays(earliest,13):null);
 const formDuration=durationFrom(form.time,form.end),savedDuration=durationFrom(editing.time,editing.end);
 const duration=form.durationDays!==undefined?optional(form.durationDays):formDuration??savedDuration;
 return {earliest,deadline,duration_days:duration,tomorrow,duration_source:form.durationDays!==undefined?'USER_INPUT':formDuration!==null?'FORM_DATES':savedDuration!==null?'EXISTING_SCHEDULE':'MISSING',default_search_window:form.searchUntil===undefined&&!hasRequested&&!(manualEnd&&earliest&&manualEnd>=earliest)};
}
export function e2InputIssues({editing,form,now=Date.now()}){
 const w=e2PlanningWindow({editing,form,now}),issues=[];
 const add=(field,message)=>issues.push({field,message});
 if(!w.earliest||w.earliest<w.tomorrow)add('searchStart','搜尋開始日必須是明日或之後的有效日期。');
 if(!w.deadline)add('searchUntil','請填寫搜尋最晚完成日。');
 else if(w.earliest&&w.deadline<w.earliest)add('searchUntil','搜尋最晚完成日早於搜尋開始日；請確認搜尋範圍，原委託交期不會因此變更。');
 if(!Number.isInteger(w.duration_days)||w.duration_days<1||w.duration_days>14)add('durationDays','請填寫 1～14 天的試驗天數；不會自行假定試驗時長。');
 else if(w.earliest&&w.deadline&&w.deadline>=w.earliest&&durationFrom(w.earliest,w.deadline)<w.duration_days)add('searchUntil','搜尋期間不足以容納目前試驗天數。');
 const volume=optional(form.sampleVolumeLitres);if(volume===null||!Number.isFinite(volume)||volume<=0)add('sampleVolumeLitres','原始試驗資料缺少可查核的樣品體積。');
 if(form.sampleSpaceUnits!==undefined){const units=optional(form.sampleSpaceUnits);if(!Number.isSafeInteger(units)||units<1||units>1000)add('sampleSpaceUnits','請填寫每件樣品使用空間（U）的正整數。');}
 const quantity=optional(editing.quantity);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)add('quantity','委託樣品數量必須為 1～1000 的整數，請先確認委託資料。');
 const entry=cases.get(editing.id),humidity=entry?.family==='TEMPERATURE_HUMIDITY'||['humidityMin','humidityMax'].some(k=>optional(form.conditions?.[k])!==null);
 if(entry&&entry.family!=='UNVERIFIED_CONDITIONS')for(const [name,label] of [['temperature','溫度'],...(humidity?[['humidity','濕度']]:[])]){
  const low=optional(form.conditions?.[name+'Min']),high=optional(form.conditions?.[name+'Max']);
  for(const [suffix,value,text] of [['Min',low,'下限'],['Max',high,'上限']])if(value===null||!Number.isFinite(value))add(name+suffix,`請填寫${label}${text}，不能從設備能力反推試驗條件。`);
  if(Number.isFinite(low)&&low!==null&&Number.isFinite(high)&&high!==null&&low>high)add(name+'Min',`${label}下限不可大於上限。`);
 }
 return issues;
}
export function canonicalE2(value){const sort=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(sort):Object.fromEntries(Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>[k,sort(x[k])])):x;return JSON.stringify(sort(value));}
export async function e2Fingerprint(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalE2(value)))),n=>n.toString(16).padStart(2,'0')).join('');}

export function makeE2Context({editing,form,equipment,accounts,rows,now=Date.now(),observedAt=now,onCoverageIssue=()=>{}}){
 const issue=(code,id)=>onCoverageIssue({code,id:typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id)?id:'未識別'});
 const entry=cases.get(editing?.id);
 if(!entry||entry.title!==editing.title)failure('UNVERIFIED_SYNTHETIC_CASE');
 if(!Array.isArray(equipment)||equipment.length>24||!Array.isArray(accounts)||accounts.length>30||!Array.isArray(rows)||rows.length>500)failure('RESOURCE_LIMIT');
 let unitsComplete=true;const ids=new Set();const devices=equipment.map(x=>{if(!machines.has(x.id)||ids.has(x.id)||!deviceStatuses[x.status])failure('UNVERIFIED_OR_DUPLICATE_EQUIPMENT');const doc=machines.get(x.id);if(['name','model','specification'].some(key=>x[key]!==doc[key]))failure('EQUIPMENT_IDENTITY_OR_SPEC_CHANGED');if(form.sampleSpaceUnits!==undefined&&Number(x.capacity)!==doc.space_units){unitsComplete=false;issue('EQUIPMENT_SPACE_UNITS_CHANGED',x.id);}ids.add(x.id);return {id:x.id,status:deviceStatuses[x.status]};});
 const people=[];const seen=new Set();let personnelComplete=true;
 for(const x of accounts){if(!knownAccounts.has(x.id)){personnelComplete=false;issue('UNVERIFIED_PERSONNEL',x.id);continue;}if(seen.has(x.id))failure('DUPLICATE_PERSONNEL');seen.add(x.id);if(!['啟用中','已停用'].includes(x.status)){personnelComplete=false;issue('UNKNOWN_PERSONNEL_STATUS',x.id);}people.push({id:x.id,enabled:x.status==='啟用中'&&(!catalog.executors.includes(x.id)||['實驗室工程師','實驗室副工程師'].includes(x.role))});}
 for(const id of machines.keys())if(!ids.has(id))issue('MISSING_EQUIPMENT',id);
 const {earliest,deadline,duration_days:duration}=e2PlanningWindow({editing,form,now});
 const conditions={temperature_min:optional(form.conditions?.temperatureMin),temperature_max:optional(form.conditions?.temperatureMax),humidity_min:optional(form.conditions?.humidityMin),humidity_max:optional(form.conditions?.humidityMax)};
 const preparation=Number(form.preparationMinutes||0),cleanup=Number(form.cleanupMinutes||0);
 const request={id:editing.id,status:statuses[editing.status],quantity:optional(editing.quantity),equipment_count:Number(form.equipmentCount||1),sample_volume_litres:optional(form.sampleVolumeLitres),earliest,deadline,duration_days:duration,preparation_minutes:preparation,cleanup_minutes:cleanup,preferred_equipment_ids:equipmentIds(form),conditions};
 if(form.sampleSpaceUnits!==undefined)request.sample_space_units=optional(form.sampleSpaceUnits);
 if(!request.status||!Number.isInteger(request.equipment_count)||request.equipment_count<1||request.equipment_count>4||request.quantity!==null&&(!Number.isSafeInteger(request.quantity)||request.quantity<1||request.quantity>1000)||request.sample_volume_litres!==null&&(!Number.isFinite(request.sample_volume_litres)||request.sample_volume_litres<=0)||Object.values(conditions).some(x=>x!==null&&!Number.isFinite(x))||![preparation,cleanup].every(x=>Number.isInteger(x)&&x>=0&&x<=1440)||duration!==null&&(!Number.isInteger(duration)||duration<1||duration>14))failure('INVALID_SCHEDULE_FIELDS');
 if(request.preferred_equipment_ids.some(x=>!machines.has(x)))failure('UNVERIFIED_EQUIPMENT');
 const start=day(earliest)-preparation*60000,end=deadline?day(deadline)+86400000+cleanup*60000:NaN;
 const reservations=[];let reservationsComplete=Number.isFinite(start)&&Number.isFinite(end);
 if(!reservationsComplete)issue('SEARCH_WINDOW_REQUIRED',editing.id);
 for(const row of rows){
  if(row.id===editing.id||!['已排程','試驗中','進行中','暫停中','待核准','已完成','已結案'].includes(row.status))continue;
  let period;try{period=reservationWindow(row,now);}catch{reservationsComplete=false;issue('INVALID_RESERVATION_DATES_OR_BUFFER',row.id);continue;}
  if(!period||!Number.isFinite(period.start)){reservationsComplete=false;issue('RESERVATION_DATES_REQUIRED',row.id);continue;}
  if(Number.isFinite(start)&&period.end<=start||Number.isFinite(end)&&period.start>=end)continue;
  const deviceIds=equipmentIds(row).length?equipmentIds(row):String(row.eq||'').split('、').map(name=>catalog.equipment.find(x=>x.name===name)?.id);
  const owner=row.ownerId||accounts.find(x=>x.name===row.owner)?.id;
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(row.id||'')){reservationsComplete=false;issue('RESERVATION_ID_INVALID',row.id);continue;}
  if(!deviceIds.length||deviceIds.some(id=>!machines.has(id))||new Set(deviceIds).size!==deviceIds.length){reservationsComplete=false;issue('RESERVATION_EQUIPMENT_REQUIRED',row.id);continue;}
  if(!catalog.executors.includes(owner)){reservationsComplete=false;issue('RESERVATION_OWNER_UNVERIFIED',row.id);continue;}
  if(!Number.isSafeInteger(period.start)||period.end!==Infinity&&!Number.isSafeInteger(period.end)){reservationsComplete=false;issue('INVALID_RESERVATION_DATES_OR_BUFFER',row.id);continue;}
  reservations.push({id:row.id,equipment_ids:deviceIds,owner_id:owner,start_ms:period.start,end_ms:period.end===Infinity?null:period.end,open_ended:period.end===Infinity});
 }
 if(reservations.length>32)failure('RESERVATIONS_TOO_LARGE_NO_TRUNCATION');
 const c={version:1,source:'BROWSER_SYNTHETIC_SCHEDULE_V1',observed_at:observedAt,equipment_complete:ids.size===catalog.equipment.length&&unitsComplete,personnel_complete:personnelComplete,reservations_complete:reservationsComplete,request,equipment:devices,personnel:people,reservations};
 if(new TextEncoder().encode(JSON.stringify({synthetic:true,question:'CHECK_SYNTHETIC_SCHEDULE',schedule_context:c})).length>8192)failure('PAYLOAD_TOO_LARGE_NO_TRUNCATION');
 return c;
}

export function e2EquipmentOverlay(equipment){return equipment.map(row=>{const m=machines.get(row.id),e=m?.evidence;return e?{...row,capacity:e.max_samples,spaceUnits:m.space_units,usableVolumeLitres:e.inner_mm.reduce((a,b)=>a*b,1)/1000000}:row;});}
export const e2MachineEvidence=id=>structuredClone(machines.get(id)?.evidence||null);
export const e2SampleEvidence=id=>structuredClone(cases.get(id)?.sample||null);

function assertCandidate(candidate,context){
 const request=context.request,entry=cases.get(request.id),sample=entry?.sample;
 if(!sample||candidate.sample_evidence_id!==sample.evidence_id||!['UNSCHEDULED','CONFLICT','SCHEDULED'].includes(request.status)||!context.equipment_complete||!context.personnel_complete||!context.reservations_complete)failure('CANDIDATE_EVIDENCE_MISMATCH');
 const names=['temperature',...((entry.family==='TEMPERATURE_HUMIDITY'||request.conditions.humidity_min!==null||request.conditions.humidity_max!==null)?['humidity']:[])];
 for(const allocation of candidate.allocations){
  const e=machines.get(allocation.equipment_id)?.evidence;
  if(!e||names.some(name=>!e[name]||request.conditions[name+'_min']===null||request.conditions[name+'_max']===null||request.conditions[name+'_min']>request.conditions[name+'_max']||request.conditions[name+'_min']<e[name][0]||request.conditions[name+'_max']>e[name][1])||request.sample_volume_litres<sample.dimensions_mm.reduce((a,b)=>a*b,1)/1000000)failure('CAPACITY_OR_CONDITION_UNVERIFIED');
  const [a,b,c]=sample.dimensions_mm,shapes=[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]],gap=sample.clearance_mm;
  const grid=Math.max(...shapes.map(shape=>shape.reduce((n,size,i)=>n*Math.floor((e.inner_mm[i]+gap)/(size+gap)),1)));
  const unitLimit=request.sample_space_units===undefined?Infinity:Math.floor(machines.get(allocation.equipment_id).space_units/request.sample_space_units);
  const capacity=Math.min(e.max_samples,grid,Math.floor(e.inner_mm.reduce((n,x)=>n*x,1)/1000000/request.sample_volume_litres),Math.floor(e.max_load_kg/sample.mass_kg),unitLimit);
  if(allocation.capacity!==capacity||allocation.quantity>capacity)failure('CAPACITY_OR_GEOMETRY_MISMATCH');
 }
 const begin=day(candidate.start)-request.preparation_minutes*60000,finish=day(candidate.end)+86400000+request.cleanup_minutes*60000;
 if(context.reservations.some(r=>r.id!==request.id&&begin<(r.end_ms??Infinity)&&r.start_ms<finish&&(r.owner_id===candidate.owner_id||r.equipment_ids.some(id=>candidate.equipment_ids.includes(id)))))failure('RESERVATION_CONFLICT');
}

export async function verifyE2Result(packet,context){
 const d=packet?.data,a=d?.assessment;
 if(!/^I-[A-Za-z0-9_-]{1,80}$/.test(packet?.trace_id||'')||d?.engine!=='E2'||d.trace_id!==packet.trace_id||d.writes!=='NONE'||d.requires_confirmation!==true||typeof d.summary!=='string'||d.summary.length>1200||!Array.isArray(d.risks)||d.risks.length>5||d.risks.some(x=>typeof x!=='string'||x.length>200)||a?.context_fingerprint!==await e2Fingerprint(context)||!['UNKNOWN','INFEASIBLE_IN_WINDOW','PROPOSAL_AVAILABLE'].includes(a.status)||!Array.isArray(a.candidates)||a.candidates.length>3||!Array.isArray(a.reasons))failure('RESPONSE_CONTRACT');
 if(d.execution_mode==='RULE_BASED_ONLY'){if(d.real_ai!==false||d.provider!=='NONE')failure('FALSE_PROVIDER_CLAIM');}
 else if(d.execution_mode==='MOCK'){if(d.real_ai!==false||d.provider!=='MOCK_HTTP_TRANSPORT')failure('FALSE_PROVIDER_CLAIM');}
 else if(d.execution_mode==='LIVE_PROVIDER'){if(d.real_ai!==true||d.provider!=='openai_responses'||!/^req_[A-Za-z0-9_-]+$/.test(d.provider_request_id||'')||!/^resp_[A-Za-z0-9_-]+$/.test(d.provider_response_id||'')||!Number.isSafeInteger(d.usage?.input_tokens)||!Number.isSafeInteger(d.usage?.output_tokens))failure('UNVERIFIED_PROVIDER');}
 else failure('UNKNOWN_PROVIDER_MODE');
 if(a.status!=='PROPOSAL_AVAILABLE'&&a.candidates.length||a.status==='PROPOSAL_AVAILABLE'&&!a.candidates.length)failure('ASSESSMENT_MISMATCH');
 for(const candidate of a.candidates){
  const {id,...unsigned}=candidate;
  if(id!=='P-'+(await e2Fingerprint(unsigned)).slice(0,20)||!Array.isArray(candidate.equipment_ids)||candidate.equipment_ids.length!==context.request.equipment_count||new Set(candidate.equipment_ids).size!==candidate.equipment_ids.length||!catalog.executors.includes(candidate.owner_id)||!context.personnel.some(x=>x.id===candidate.owner_id&&x.enabled)||!candidate.equipment_ids.every(id=>context.equipment.some(x=>x.id===id&&x.status==='STANDBY')))failure('CANDIDATE_RESOURCE_MISMATCH');
  if(!Array.isArray(candidate.allocations)||candidate.allocations.length!==candidate.equipment_ids.length||candidate.allocations.reduce((n,x)=>n+x.quantity,0)!==context.request.quantity||candidate.allocations.some((x,i)=>x.equipment_id!==candidate.equipment_ids[i]||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>x.capacity||x.evidence_id!==machines.get(x.equipment_id)?.evidence?.id))failure('ALLOCATION_MISMATCH');
  if(!isCalendarDate(candidate.start)||!isCalendarDate(candidate.end)||day(candidate.start)<day(context.request.earliest)||day(candidate.end)>Math.min(day(context.request.deadline),day(context.request.earliest)+13*86400000)||Math.round((day(candidate.end)-day(candidate.start))/86400000)+1!==context.request.duration_days)failure('CANDIDATE_DATE_MISMATCH');
  assertCandidate(candidate,context);
 }
 if(d.selected_candidate_id!==null&&!a.candidates.some(x=>x.id===d.selected_candidate_id))failure('UNVERIFIED_MODEL_SELECTION');
 return d;
}

export function makeE2Draft({editing,form,equipment,accounts,rows,context,candidate,now=Date.now()}){
 if(now-context.observed_at>300000)failure('RESULT_EXPIRED');
 const expected=makeE2Context({editing,form,equipment,accounts,rows,now,observedAt:context.observed_at});
 if(canonicalE2(expected)!==canonicalE2(context))failure('STALE_RESOURCES_RECALCULATE');
 const caseData=cases.get(editing.id);
 if(!caseData||candidate.sample_evidence_id!==caseData.sample.evidence_id)failure('SAMPLE_EVIDENCE_MISMATCH');
 assertCandidate(candidate,context);
 const owner=accounts.find(x=>x.id===candidate.owner_id),chosen=candidate.equipment_ids.map(id=>equipment.find(x=>x.id===id));
 if(!owner||chosen.some(x=>!x))failure('RESOURCE_REMOVED');
 const draft={...form,equipmentId:chosen[0].id,equipmentIds:chosen.map(x=>x.id),equipmentCount:chosen.length,eq:chosen.map(x=>x.name).join('、'),ownerId:owner.id,owner:owner.name,time:candidate.start,end:candidate.end};
 const proposal=validateSchedule({editing,form:draft,equipment:e2EquipmentOverlay(equipment),accounts,rows,today:todayAt(now)});
 if(canonicalE2(proposal.allocations)!==canonicalE2(candidate.allocations.map(x=>({equipmentId:x.equipment_id,quantity:x.quantity}))))failure('CAPACITY_REVALIDATION_FAILED');
 return {form:draft,context,sourceForm:structuredClone(form),candidate,appliedForm:structuredClone(draft)};
}

export function validateE2Applied({editing,form,equipment,accounts,rows,approved,now=Date.now()}){
 if(canonicalE2(form)!==canonicalE2(approved.appliedForm))failure('APPLIED_FORM_CHANGED');
 makeE2Draft({editing,form:approved.sourceForm,equipment,accounts,rows,context:approved.context,candidate:approved.candidate,now});
 return validateSchedule({editing,form,equipment:e2EquipmentOverlay(equipment),accounts,rows,today:todayAt(now)});
}

const reasons={RESOURCE_OR_RESERVATION_COVERAGE_INCOMPLETE:'設備、人員或占用資料不完整，無法確認可行性。',SAMPLE_QUANTITY_OR_VOLUME_REQUIRED:'請確認樣品數量與原始試驗的體積資料。',SAMPLE_SPACE_UNITS_REQUIRED:'請填寫每件樣品使用空間（U）。',MACHINE_SPACE_UNITS_EVIDENCE_MISSING:'設備缺少可核對的空間容量（U）。',DURATION_AND_SEARCH_DATES_REQUIRED:'請填寫開始、完成日期及搜尋截止日。',TEST_CONDITIONS_INCOMPLETE:'請補齊可查核的溫度／濕度上下限。',MACHINE_CAPACITY_EVIDENCE_MISSING:'設備缺少可查核的尺寸／容量證據。',TEST_TYPE_CONDITION_EVIDENCE_MISSING:'此試驗類型尚缺可查核的條件與設備證據。',SAMPLE_VOLUME_BELOW_DOCUMENTED_ENVELOPE:'輸入的單件體積小於合成樣品外框，請確認單位與尺寸。',ENABLED_ENGINEER_REQUIRED:'沒有可核對的啟用實驗室工程師。',NO_SLOT_WITHIN_VERIFIED_DEMO_WINDOW:'在已核對的 Demo 設備與搜尋期間內沒有找到時段。',CONDITION_OUTSIDE_DOCUMENTED_RANGE:'試驗條件超出已記錄的設備範圍。',TRIAL_STATE_NOT_SCHEDULABLE:'此案件狀態不可重新安排排程。',SEARCH_LIMIT_REACHED:'已達搜尋限制，不能據此判定不可行。'};
export const describeE2Reason=code=>reasons[code]||code;
export function describeE2CoverageIssue(issue){
 const messages={UNVERIFIED_PERSONNEL:'帳號尚未列入核准的合成人員資料；不會自動信任其角色。',UNKNOWN_PERSONNEL_STATUS:'帳號狀態無法核對，請在帳號管理檢查。',MISSING_EQUIPMENT:'設備資料未完整讀取，請檢查設備台帳。',SEARCH_WINDOW_REQUIRED:'請填寫有效的開始日期及搜尋最晚完成日，才能檢查占用。',INVALID_RESERVATION_DATES_OR_BUFFER:'排程日期或準備／清理時間無法核對。',RESERVATION_DATES_REQUIRED:'此筆既有占用排程缺少有效開始日期；無法假定設備空閒。',RESERVATION_ID_INVALID:'既有排程編號無法核對。',RESERVATION_EQUIPMENT_REQUIRED:'既有排程的設備編號缺少、重複或未登錄。',RESERVATION_OWNER_UNVERIFIED:'既有排程的執行人無法對照核准的合成工程師。'};
 if(issue.code==='EQUIPMENT_SPACE_UNITS_CHANGED')return `${issue.id}：設備空間容量（U）與核准的合成台帳不同，請先確認資料。`;
 return `${issue.id}：${messages[issue.code]||'資料無法核對。'}`;
}
