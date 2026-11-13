// Read existing synthetic trial facts first. Generated examples are never standards.
import catalog from '../render-backend/gateway/e2_demo_catalog.json' with {type:'json'};
import {e2PlanningWindow,e2InputIssues,canonicalE2} from './e2Scheduling.mjs';
import {isCalendarDate} from './requestDate.mjs';
const present=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):NaN;
const n='(-?\\d+(?:\\.\\d+)?)';
export class TrialInputError extends Error{constructor(message){super(message);this.code='TRIAL_DATA_INCOMPLETE';}}
function interval(text,unit){
 const values=[],range=new RegExp(`${n}\\s*(?:${unit})?\\s*[~～至]\\s*${n}\\s*${unit}`,'gi');
 const rest=text.replace(range,(_,a,b)=>{values.push([Number(a),Number(b)]);return ' ';});
 if(new RegExp(`${n}\\s*-\\s*${n}\\s*${unit}`,'i').test(rest))throw new TrialInputError('試驗規範的範圍格式無法核對，請先確認原始試驗資料。');
 for(const m of rest.matchAll(new RegExp(`${n}\\s*${unit}`,'gi')))values.push([Number(m[1]),Number(m[1])]);
 const unique=new Map(values.map(x=>[x.join(':'),x]));if(unique.size>1)throw new TrialInputError('試驗規範包含多段或不一致條件，請先確認原始試驗資料。');
 return unique.size?[...unique.values()][0]:null;
}
function sourceConditions(source){
 const text=[source.specification,source.testSpec].filter(x=>typeof x==='string').join('\n').replaceAll('−','-');if(text.length>8000)throw new TrialInputError('試驗規範過長，請先整理可查核的試驗條件。');
 const result={},stored=source.conditions||{};let supplied=false;
 if(typeof stored!=='object'||Array.isArray(stored)||Object.keys(stored).some(k=>!['temperatureMin','temperatureMax','humidityMin','humidityMax'].includes(k)&&present(stored[k])))throw new TrialInputError('原始試驗條件格式無法核對，未以範例覆蓋。');
 for(const [name,unit] of [['temperature','(?:°\\s*C|℃)'],['humidity','(?:%\\s*RH|％\\s*RH)']]){
  const a=stored[name+'Min'],b=stored[name+'Max'];
  if(present(a)||present(b)){
   supplied=true;if(!present(a)||!present(b)||!Number.isFinite(numeric(a))||!Number.isFinite(numeric(b)))throw new TrialInputError('原始試驗資料的溫濕度條件不完整，請先確認委託資料。');
   result[name+'Min']=numeric(a);result[name+'Max']=numeric(b);
  }else{const pair=interval(text,unit);if(pair){supplied=true;[result[name+'Min'],result[name+'Max']]=pair;}}
 }
 if(!supplied&&/(?:溫度|温度|temperature|濕度|湿度|humidity|高溫(?:儲存|試驗)?|高温(?:存储|试验)?|低溫|低温)\s*(?:條件|条件|範圍|范围)?\s*[:：=]?\s*[-\d]|°\s*F|\b\d+\s*K\b/i.test(text))throw new TrialInputError('原始試驗條件的單位或格式無法核對，未以範例覆蓋。');
 return {conditions:result,supplied,text};
}
function explicitDuration(source){
 if(present(source.durationHours)){const v=numeric(source.durationHours);if(!Number.isFinite(v)||v<=0)throw new TrialInputError('原始試驗時長無效，請先確認試驗資料。');return Math.ceil(v/24);}
 if(present(source.durationDays)){const v=numeric(source.durationDays);if(!Number.isFinite(v)||v<=0)throw new TrialInputError('原始試驗天數無效，請先確認試驗資料。');return v;}
 const text=[source.specification,source.testSpec].filter(x=>typeof x==='string').join('\n');const values=[];
 for(const m of text.matchAll(/(?:持續|時長|試驗時間|duration)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(小時|hours?|hrs?|h|天|days?)/gi))values.push(Math.ceil(Number(m[1])*(/^(?:天|day)/i.test(m[2])?24:1)/24));
 for(const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:小時|hours?\b|hrs?\b|h\b)/gi)){if(Number(m[1])<=0)throw new TrialInputError('原始試驗時長無效，請先確認試驗資料。');values.push(Math.ceil(Number(m[1])/24));}
 const unique=new Set(values);if(unique.size>1)throw new TrialInputError('原始試驗時長不一致，請先確認試驗規範。');if(unique.size)return [...unique][0];
 return null;
}
function savedDuration(editing,form){
 if(typeof editing.time==='string'&&editing.time.includes('T')&&typeof editing.end==='string'&&editing.end.includes('T')){
  const hours=(Date.parse(editing.end)-Date.parse(editing.time))/3600000;if(Number.isFinite(hours)&&hours>0)return Math.ceil(hours/24);
 }
 return e2PlanningWindow({editing,form}).duration_days;
}
function generatedProfile(entry){
 if(entry.family==='TEMPERATURE_HUMIDITY')return {id:'SYNTHETIC-DEMO-HUMIDITY-v1',conditions:{temperatureMin:60,temperatureMax:60,humidityMin:90,humidityMax:90},days:2};
 if(entry.family==='TEMPERATURE'){
  const cycle=/循環|高低溫/.test(entry.title),low=!cycle&&/低溫/.test(entry.title);
  return {id:cycle?'SYNTHETIC-DEMO-CYCLE-v1':low?'SYNTHETIC-DEMO-COLD-v1':'SYNTHETIC-DEMO-HOT-v1',conditions:{temperatureMin:low?-20:cycle?-20:100,temperatureMax:low?-20:cycle?80:100},days:2};
 }
 return null;
}
const normalizeDate=value=>typeof value==='string'?value.slice(0,10).replaceAll('/','-'):'';
export function prepareScheduleTrialForm({editing,form,request=null,now=Date.now()}){
 if(request&&request.id!==editing.requestId)throw new TrialInputError('委託與排程關聯不一致，請重新開啟試驗資訊。');
 const entry=catalog.cases.find(x=>x.id===editing.id&&x.title===editing.title);if(!entry)throw new TrialInputError('此試驗尚未登錄可查核的合成排程資料。');
 const source=request||editing,primary=sourceConditions(source),read=primary.supplied||!request?primary:sourceConditions(editing),profile=generatedProfile(entry);
 if(!read.supplied&&!profile)throw new TrialInputError('原始試驗資料尚缺可查核的條件，請先確認試驗資訊。');
 const conditions=read.supplied?read.conditions:profile.conditions;
 const existingDuration=explicitDuration(source)??(request?explicitDuration(editing):null)??savedDuration(editing,form),duration=existingDuration??profile?.days;
 const generated=!read.supplied||existingDuration===null;
 let volume=present(form.sampleVolumeLitres)?numeric(form.sampleVolumeLitres):present(source.sampleVolumeLitres)?numeric(source.sampleVolumeLitres):present(editing.sampleVolumeLitres)?numeric(editing.sampleVolumeLitres):null;
 if(volume===null&&entry.sample?.evidence_id&&entry.sample.dimensions_mm?.length===3&&entry.sample.dimensions_mm.every(x=>Number.isFinite(x)&&x>0))volume=entry.sample.dimensions_mm.reduce((a,b)=>a*b,1)/1000000;
 const initial=e2PlanningWindow({editing:{...editing,requestedDate:undefined},form:{...form,end:'',searchStart:undefined,searchUntil:undefined},now});
 const due=normalizeDate(source.dueDate||source.requestedDate||editing.requestedDate),notes=[];
 let deadline=initial.deadline;
 if(due&&isCalendarDate(due)){if(due>=initial.earliest)deadline=due;else notes.push('原需求日期已過；本次只產生重排草稿，原交期未變更。');}
 else if(due)throw new TrialInputError('原始委託需求日期無效，請先確認委託資料。');
 const units=form.sampleSpaceUnits!==undefined?form.sampleSpaceUnits:source.sampleSpaceUnits??editing.sampleSpaceUnits??1;
 const resolved={...form,conditions:{...conditions},durationDays:duration??'',sampleVolumeLitres:volume??'',sampleSpaceUnits:units,searchStart:initial.earliest,searchUntil:deadline};
 const issues=e2InputIssues({editing,form:resolved,now});if(issues.length)throw new TrialInputError('請先確認原始試驗資料：'+issues.map(x=>x.message).join(' '));
 const provenance={source:generated?'GENERATED_SYNTHETIC_DEMO_EXAMPLE':'EXISTING_TRIAL_DATA',profile_id:generated?profile?.id:null,official_standard:false,sample_evidence_id:entry.sample.evidence_id,generated_conditions:!read.supplied,generated_duration:existingDuration===null};
 const signature=canonicalE2({conditions:resolved.conditions,durationDays:resolved.durationDays,sampleVolumeLitres:resolved.sampleVolumeLitres,sampleSpaceUnits:resolved.sampleSpaceUnits,provenance,due});
 const describe=(a,b,unit)=>a===b?`${a}${unit}`:`${a}～${b}${unit}`;
 const parts=[];if(conditions.temperatureMin!==undefined)parts.push(`溫度 ${describe(conditions.temperatureMin,conditions.temperatureMax,'°C')}`);if(conditions.humidityMin!==undefined)parts.push(`濕度 ${describe(conditions.humidityMin,conditions.humidityMax,'%RH')}`);parts.push(`排程占用 ${duration} 天`);
 return {form:resolved,provenance,signature,notes,summary:(generated?'合成試驗範例':'既有試驗資料')+'（'+parts.join('、')+'）'};
}
export function schedulingErrorMessage(error){
 if(error instanceof TrialInputError)return error.message;
 const code=error?.code||'',trace=typeof error?.trace==='string'&&/^I-[A-Za-z0-9_-]{1,80}$/.test(error.trace)?error.trace:null;
 if(typeof error?.message==='string'&&/[\u4e00-\u9fff]/.test(error.message)&&error.message.length<=500&&!/E2|https?:|sk-|password|api[_ -]?key/i.test(error.message))return error.message;
 const messages={SESSION_REQUIRED:'請先登入後再使用自動化排程。',SESSION_AUTH_FAILED:'請重新登入後再使用自動化排程。',BUDGET_EXPIRED:'本輪模型使用期限已過，請先確認使用授權。',OUTCOME_RECONCILIATION_REQUIRED:'前一筆模型請求需完成費用確認，未重送請求。',STALE_INPUT:'資料已變更，請重新分析。'};
 return (messages[code]||'排程建議尚未取得，請確認試驗資料、設備狀態與服務連線後再試。')+(trace?' 追蹤碼 '+trace:'');
}
