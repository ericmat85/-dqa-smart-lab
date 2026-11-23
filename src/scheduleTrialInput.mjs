// Read existing synthetic trial facts first. Generated examples are never standards.
import catalog from '../render-backend/gateway/e2_demo_catalog.json' with {type:'json'};
import {e2PlanningWindow,e2InputIssues,canonicalE2} from './e2Scheduling.mjs';
import {isCalendarDate} from './requestDate.mjs';
import {present,numeric,TrialInputError,sourceConditions,explicitDuration,explicitHours} from './trialSourceFacts.mjs';
export {TrialInputError} from './trialSourceFacts.mjs';
import {trialProfile,profileById,trialExecution,scheduleCase,sequentialAllocations} from './trialProfiles.mjs';
function savedDuration(editing,form){
 if(typeof editing.time==='string'&&editing.time.includes('T')&&typeof editing.end==='string'&&editing.end.includes('T')){
  const hours=(Date.parse(editing.end)-Date.parse(editing.time))/3600000;if(Number.isFinite(hours)&&hours>0)return Math.ceil(hours/24);
 }
 return e2PlanningWindow({editing,form}).duration_days;
}
const normalizeDate=value=>typeof value==='string'?value.slice(0,10).replaceAll('/','-'):'';
export function prepareScheduleTrialForm({editing,form,request=null,now=Date.now()}){
 if(request&&request.id!==editing.requestId)throw new TrialInputError('委託與排程關聯不一致，請重新開啟試驗資訊。');
 const entry=scheduleCase(editing,catalog.cases);if(!entry)throw new TrialInputError('此試驗尚未登錄可查核的合成排程資料。');
 const source=request||editing,primary=sourceConditions(source),read=primary.supplied||!request?primary:sourceConditions(editing),profile=profileById(entry.profile_id)||trialProfile(editing.title);
 if(!read.supplied&&!profile)throw new TrialInputError('原始試驗資料尚缺可查核的條件，請先確認試驗資訊。');
 const conditions=read.supplied?read.conditions:profile.conditions;
 const explicit=explicitHours(source)??(request?explicitHours(editing):null);
 if(profile.fixed_duration&&explicit!==null&&explicit!==profile.hours)throw new TrialInputError(`此試驗固定 ${profile.hours} 小時，原始資料時長不一致，請先確認試驗資料。`);
 const hours=profile.fixed_duration?profile.hours:explicit??((savedDuration(editing,form)??0)*24||profile.hours);
 const batches=profile.mode==='serial'?Math.ceil(Number(editing.quantity)/(Number(form.equipmentCount||1)*Math.max(1,Math.floor(profile.daily_hours/hours)))):1;
 const duration=profile.mode==='serial'?batches:Math.ceil(hours/24),existingDuration=explicit===null?null:Math.ceil(explicit/24);
 const generatedConditions=!read.supplied&&Object.keys(profile.conditions).length>0,generatedDuration=!profile.fixed_duration&&explicit===null;
 const generated=generatedConditions||generatedDuration;
 let volume=present(form.sampleVolumeLitres)?numeric(form.sampleVolumeLitres):present(source.sampleVolumeLitres)?numeric(source.sampleVolumeLitres):present(editing.sampleVolumeLitres)?numeric(editing.sampleVolumeLitres):null;
 if(volume===null&&entry.sample?.evidence_id&&entry.sample.dimensions_mm?.length===3&&entry.sample.dimensions_mm.every(x=>Number.isFinite(x)&&x>0))volume=entry.sample.dimensions_mm.reduce((a,b)=>a*b,1)/1000000;
 const initial=e2PlanningWindow({editing:{...editing,requestedDate:undefined},form:{...form,end:'',searchStart:undefined,searchUntil:undefined},now});
 const due=normalizeDate(source.dueDate||source.requestedDate||editing.requestedDate),notes=[];
 let deadline=initial.deadline;
 if(due&&isCalendarDate(due)){if(due>=initial.earliest)deadline=due;else notes.push('原需求日期已過；本次只產生重排草稿，原交期未變更。');}
 else if(due)throw new TrialInputError('原始委託需求日期無效，請先確認委託資料。');
 const units=form.sampleSpaceUnits!==undefined?form.sampleSpaceUnits:source.sampleSpaceUnits??editing.sampleSpaceUnits??1;
 const resolved={...form,trialProfileId:profile.id,durationHours:hours,conditions:{...conditions},durationDays:duration??'',sampleVolumeLitres:volume??'',sampleSpaceUnits:units,searchStart:initial.earliest,searchUntil:deadline};
 const issues=e2InputIssues({editing,form:resolved,now});if(issues.length)throw new TrialInputError('請先確認原始試驗資料：'+issues.map(x=>x.message).join(' '));
 const provenance={source:generated?'GENERATED_SYNTHETIC_DEMO_EXAMPLE':'EXISTING_TRIAL_DATA',profile_id:generated?profile?.id:null,official_standard:false,sample_evidence_id:entry.sample.evidence_id,generated_conditions:generatedConditions,generated_duration:generatedDuration,rule_source:profile.source};
 const signature=canonicalE2({conditions:resolved.conditions,durationDays:resolved.durationDays,durationHours:resolved.durationHours,trialProfileId:profile.id,sampleVolumeLitres:resolved.sampleVolumeLitres,sampleSpaceUnits:resolved.sampleSpaceUnits,provenance,due});
 const describe=(a,b,unit)=>a===b?`${a}${unit}`:`${a}～${b}${unit}`;
 const parts=[];if(conditions.temperatureMin!==undefined)parts.push(`溫度 ${describe(conditions.temperatureMin,conditions.temperatureMax,'°C')}`);if(conditions.humidityMin!==undefined)parts.push(`濕度 ${describe(conditions.humidityMin,conditions.humidityMax,'%RH')}`);if(conditions.frequencyMin!==undefined)parts.push(`頻率 ${describe(conditions.frequencyMin,conditions.frequencyMax,'Hz')}`);parts.push(profile.id==='HIGH_HUMIDITY'?'連續 250 小時，可跨週末':profile.mode==='serial'?`每顆 ${hours} 小時，單台 ${editing.quantity} 顆需 ${Math.ceil(Number(editing.quantity)/Math.max(1,Math.floor(profile.daily_hours/hours)))} 作業日，週末不作業`:`試驗 ${hours} 小時`);
 return {form:resolved,provenance,signature,notes,summary:(generated?'合成試驗範例':'既有試驗資料')+'（'+parts.join('、')+'）'};
}
export function prepareManualTrialForm({editing,form,updateEnd=false}){
 const profile=trialProfile(editing.title);if(!profile)return {...form};
 const supplied=sourceConditions(editing),formConditions=Object.values(form.conditions||{}).some(present)?sourceConditions({conditions:form.conditions}):null;
 const known=explicitHours(editing);
 if(profile.fixed_duration&&known!==null&&known!==profile.hours)throw new TrialInputError(`此試驗固定 ${profile.hours} 小時，原始資料時長不一致。`);
 const hours=profile.fixed_duration?profile.hours:known??(present(form.durationHours)?numeric(form.durationHours):profile.hours);
 const result={...form,trialProfileId:profile.id,durationHours:hours,conditions:{...(formConditions?.conditions||supplied.supplied&&supplied.conditions||profile.conditions)}};
 if(form.time&&(updateEnd||!form.end)){
  const count=Number(form.equipmentCount||1),quantity=Number(editing.quantity);
  const ids=Array.from({length:count},(_,i)=>'PLANNING-'+i),allocations=profile.mode==='serial'?sequentialAllocations(ids,quantity):ids.map((id,i)=>({equipment_id:id,quantity:i===0?quantity-(count-1):1,capacity:quantity}));
  try{result.end=trialExecution(profile,form.time,allocations,hours).end_date;}
  catch(error){if(error.message==='OPERATION_WEEKDAY_START_REQUIRED')throw new TrialInputError('操作型試驗請從週一至週五開始；週末不作業。');throw error;}
 }
 return result;
}
export function schedulingErrorMessage(error){
 if(error instanceof TrialInputError)return error.message;
 const code=error?.code||'',trace=typeof error?.trace==='string'&&/^I-[A-Za-z0-9_-]{1,80}$/.test(error.trace)?error.trace:null;
 if(typeof error?.message==='string'&&/[\u4e00-\u9fff]/.test(error.message)&&error.message.length<=500&&!/E2|https?:|sk-|password|api[_ -]?key/i.test(error.message))return error.message;
 const messages={SESSION_REQUIRED:'請先登入後再使用自動化排程。',SESSION_AUTH_FAILED:'請重新登入後再使用自動化排程。',BUDGET_EXPIRED:'本輪模型使用期限已過，請先確認使用授權。',OUTCOME_RECONCILIATION_REQUIRED:'前一筆模型請求需完成費用確認，未重送請求。',STALE_INPUT:'資料已變更，請重新分析。'};
 return (messages[code]||'排程建議尚未取得，請確認試驗資料、設備狀態與服務連線後再試。')+(trace?' 追蹤碼 '+trace:'');
}
