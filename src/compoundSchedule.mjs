import {profileById,trialProfile} from './trialProfiles.mjs';
import {findTrialDefinition} from './trialCatalogStore.mjs';
export const COMPOUND_PROFILE='COMPOUND_ENVIRONMENT';
export const COMPOUND_NAME='複合式環境試驗';
export const COMPOUND_LIMIT=20;
export const COMPOUND_MODES=['CONTINUOUS','DISCONTINUOUS'];
export const compoundModeLabel=mode=>mode==='DISCONTINUOUS'?'複合型非連續試驗':'複合型連續試驗';
export const isDiscontinuousCompound=row=>row?.compoundMode==='DISCONTINUOUS'||!row?.compoundMode&&row?.calendarPolicy?.mode==='COMPOUND_DISCONTINUOUS';
export function compoundStageWindow(segments,index){const pieces=segments?.filter((s,i)=>s.stage_index?s.stage_index===index+1:i===index)||[];return pieces.length?{...pieces[0],ends_at:pieces.at(-1).ends_at}:null;}

export const isCompoundRequest=row=>Array.isArray(row?.compoundStages)&&row.compoundStages.length>0;
export function compoundItemDefaults(name){const p=trialProfile(name);let row;try{row=findTrialDefinition(name);}catch{/* The protocol validator will report an unavailable catalog. */}const hours=p?.fixed_duration?p.hours:row?.durationHours||p?.hours;return {label:name,durationHours:hours?String(hours):'',operation:p?.mode==='batch'?'continuous':'operator'};}
export function compoundProtocol(items,trials){
 if(!Array.isArray(items)||items.length<2||items.length>COMPOUND_LIMIT)throw Error('複合試驗須有 2～20 個階段。');
 let quantity=null,total=0;
 const stages=items.map((item,index)=>{const t=trials.find(t=>[t.name,...(t.aliases||[])].includes(item.name)),profile=profileById(t?.profile_code||t?.profileId)||trialProfile(item.name),minutes=Number(item.durationHours)*60;
  if(!t||!profile||t.profile_code===COMPOUND_PROFILE)throw Error(`第 ${index+1} 階段尚無可核對的試驗類型。`);
  if(!Number.isSafeInteger(minutes)||minutes<1||minutes>525600)throw Error(`第 ${index+1} 階段工時須為有效分鐘，不可留空。`);
  if(profile.fixed_duration&&minutes!==profile.hours*60)throw Error(`第 ${index+1} 階段必須保留 ${profile.hours} 小時的試驗條件。`);
  if(!['continuous','operator'].includes(item.operation)||profile.mode!=='batch'&&item.operation==='continuous')throw Error(`第 ${index+1} 階段須由人員操作，不能改成無人連續運轉。`);
  if(quantity!==null&&Number(item.quantity)!==quantity)throw Error('複合試驗各階段須使用同一批、相同數量的樣品。');quantity=Number(item.quantity);
  const label=String(item.label||item.name).trim();if(!label||label.length>100)throw Error('階段名稱須為 1～100 字。');total+=minutes;
  return {trial_id:t.id,trial_revision:t.revision,profile_id:profile.id,name:t.name,label,duration_minutes:minutes,operation:item.operation,specification:item.specification,acceptance:item.judgementCriteria||'',judgementRequired:item.judgementRequired};
 });
 if(total>525600)throw Error('複合試驗總工時不可超過一年。');if(new TextEncoder().encode(JSON.stringify(stages)).length>12000)throw Error('複合試驗階段說明過長，請精簡條件並另附詳細規範。');return stages;
}
const clock=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
export function taipeiInput(value){const t=Date.parse(value);return Number.isFinite(t)?new Date(t+28800000).toISOString().slice(0,16):'';}
function localTime(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||''))throw Error('請選擇有效的開始日期與時間。');const ms=Date.parse(value+':00+08:00');if(!Number.isFinite(ms)||taipeiInput(new Date(ms).toISOString())!==value)throw Error('開始時間無效。');return ms;}
export function compoundTimeline(stages,options){
 if(!Array.isArray(stages)||stages.length<2||stages.length>COMPOUND_LIMIT)throw Error('請先完成複合試驗的階段資料。');
 const shiftStart=clock(options.shiftStart||'09:00'),shiftEnd=clock(options.shiftEnd||'18:00');if(!Number.isFinite(shiftStart)||!Number.isFinite(shiftEnd)||shiftStart>=shiftEnd)throw Error('切換作業時段須在同一天，結束須晚於開始。');
 const start=localTime(options.startLocal),issues=[],segments=[];let at=start,total=0;
 const working=(ms,end=false)=>{const d=new Date(ms+28800000),weekday=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();return weekday>0&&weekday<6&&minute>=shiftStart&&(end?minute<=shiftEnd:minute<shiftEnd);};
 stages.forEach((s,i)=>{if(!Number.isSafeInteger(s.duration_minutes)||s.duration_minutes<1)throw Error(`第 ${i+1} 階段工時無效。`);total+=s.duration_minutes;if(total>525600)throw Error('複合試驗總工時不可超過一年。');const end=at+s.duration_minutes*60000;
  const firstWeekend=i===0&&s.profile_id==='HIGH_TEMPERATURE'&&s.operation==='continuous'&&options.preloadedWeekend===true&&[0,6].includes(new Date(at+28800000).getUTCDay());
  if(!working(at)&&!firstWeekend)issues.push({stage:i+1,message:`第 ${i+1} 階段「${s.label}」的${i?'切換':'開始'}時間不在平日作業時段。`});
  if(s.operation==='operator'&&(!working(at)||!working(end,true)||taipeiInput(new Date(at).toISOString()).slice(0,10)!==taipeiInput(new Date(end).toISOString()).slice(0,10)))issues.push({stage:i+1,message:`第 ${i+1} 階段「${s.label}」需人員操作，須完整安排在同一上班時段。`});
  segments.push({...s,start_ms:at,end_ms:end,starts_at:new Date(at).toISOString(),ends_at:new Date(end).toISOString(),equipment_id:options.stageEquipmentIds?.[i]||''});at=end;
 });
 if(!working(at,true))issues.push({stage:stages.length,message:'整串試驗完成點須落在工作日上班時段，請調整起始時間；不可跨至休息時段或假日完成。'});
 return {valid:issues.length===0,issues,segments,starts_at:new Date(start).toISOString(),ends_at:new Date(at).toISOString(),duration_minutes:total};
}
export function compoundStartSuggestions(stages,options,{days=21,limit=3}={}){
 const start=localTime(options.startLocal),until=start+days*86400000,prefix=[0];for(const s of stages)prefix.push(prefix.at(-1)+s.duration_minutes);compoundTimeline(stages,options);
 const shift=clock(options.shiftStart||'09:00'),date=Date.parse(options.startLocal.slice(0,10)+'T00:00:00+08:00'),candidates=new Set([start]);
 for(let day=0;day<=days+Math.ceil(prefix.at(-1)/1440)+1;day++){const handoff=date+day*86400000+shift*60000;for(const minutes of prefix){const candidate=handoff-minutes*60000;if(candidate>=start&&candidate<=until)candidates.add(candidate);}}
 const found=[];for(const ms of [...candidates].sort((a,b)=>a-b)){const candidate=taipeiInput(new Date(ms).toISOString());if(compoundTimeline(stages,{...options,startLocal:candidate}).valid){found.push(candidate);if(found.length>=limit)break;}}return found;
}
export const profileForCompoundStage=s=>profileById(s.profile_id);
export function compoundFormFromPlan(plan,equipment){const c=plan?.compound;if(!c)return {};return {startLocal:c.start_local,shiftStart:c.shift_start,shiftEnd:c.shift_end,preloadedWeekend:c.preloaded_weekend,...(c.stage_start_dates?{stageStartDates:c.stage_start_dates}:{}),stageEquipmentIds:c.stage_equipment_ids.map(id=>equipment.find(m=>[m.id,m.databaseId].includes(id))?.id||equipment.find(m=>m.id===id)?.legacy_id||'')};}
