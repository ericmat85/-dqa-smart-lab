import data from '../render-backend/gateway/trial_profiles.json' with {type:'json'};
const HOUR=3600000,DAY=24*HOUR;
export const TRIAL_PROFILES=data.profiles;
export const trialProfile=title=>/[、,，;]/.test(String(title||''))?null:TRIAL_PROFILES.find(p=>new RegExp(p.match,'i').test(String(title||'')))||null;
export const profileById=id=>TRIAL_PROFILES.find(p=>p.id===id)||null;
export const profileMachineEvidence=machine=>machine?.evidence||data.machine_evidence[machine?.id]||null;
export function scheduleCase(editing,cases){
 const stored=cases.find(x=>x.id===editing?.id&&x.title===editing.title);if(stored)return stored;
 const profile=trialProfile(editing?.title);
 if(profile&&profile.aliases.includes(editing.title)&&/^SCH-REQ-2026-[a-f0-9]{8}$/.test(editing.id||'')&&editing.requestId===editing.id.slice(4))return {id:editing.id,request_id:editing.requestId,title:editing.title,profile_id:profile.id,family:profile.family,sample:profile.sample,template:true};
 return null;
}
export const profileEquipmentMatches=(profile,machine)=>Boolean(profile&&new RegExp(profile.equipment_pattern,'i').test(String(machine?.name||'')));
export const taipeiDay=ms=>new Date(ms+8*HOUR).toISOString().slice(0,10);
export const profileMidnight=date=>{const parsed=Date.parse(date+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===date?Date.parse(date+'T00:00:00+08:00'):NaN;};
export const operationDay=date=>{const n=new Date(date+'T00:00:00Z').getUTCDay();return n!==0&&n!==6;};
const weekdaysOnly=(begin,end)=>{for(let at=begin;at<end;at=Math.min(end,profileMidnight(taipeiDay(at))+DAY))if(!operationDay(taipeiDay(at)))return false;return true;};
export function operationBuffersAllowed(plan,preparation=0,cleanup=0){
 if(plan.calendar!=='weekdays')return true;
 return weekdaysOnly(plan.start_ms-preparation*60000,plan.start_ms)&&weekdaysOnly(plan.end_ms,plan.end_ms+cleanup*60000);
}
export const shiftedOperationAllowed=(plan,offset,cut)=>plan.calendar!=='weekdays'||plan.segments.filter(s=>s.end_ms>cut).every(s=>weekdaysOnly(Math.max(s.start_ms,cut)+offset,s.end_ms+offset));
export function plannedOperatingHours(row){const profile=profileById(row.trialProfileId);return profile?Number(row.durationHours)*(profile.mode==='serial'?Number(row.quantity):1):null;}

export function sequentialAllocations(ids,quantity,capacityFor=()=>1){
 if(!Number.isSafeInteger(quantity)||quantity<ids.length||!ids.length)throw Error('TRIAL_ALLOCATION_INVALID');
 let remaining=quantity;return ids.map((id,index)=>{const count=Math.ceil(remaining/(ids.length-index));remaining-=count;return {equipment_id:id,quantity:count,capacity:capacityFor(id)};});
}

// Pure, bounded calendar calculation. Batch exposure is never rounded to days.
// Sequential allocations describe processed samples, NOT simultaneous capacity.
export function trialExecution(profile,start,allocations,hours=profile?.hours){
 if(!profile||!Number.isFinite(profileMidnight(start))||!Number.isFinite(hours)||hours<=0||hours>24000||!Array.isArray(allocations)||!allocations.length||allocations.length>4)throw Error('TRIAL_EXECUTION_DATA_REQUIRED');
 if(profile.fixed_duration&&hours!==profile.hours)throw Error('FIXED_TRIAL_HOURS_REQUIRED');
 if(profile.calendar==='weekdays'&&!operationDay(start))throw Error('OPERATION_WEEKDAY_START_REQUIRED');
 const segments=[],dates=new Set(),seen=new Set();
 for(const a of allocations){
  const id=a.equipment_id??a.equipmentId;
  if(!id||seen.has(id)||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1000||!Number.isSafeInteger(a.capacity)||a.capacity<1)throw Error('TRIAL_ALLOCATION_INVALID');
  seen.add(id);
  if(profile.mode==='batch'){
   if(a.quantity>a.capacity)throw Error('BATCH_CAPACITY_EXCEEDED');
   segments.push({equipment_id:id,quantity:a.quantity,start_ms:profileMidnight(start),end_ms:profileMidnight(start)+hours*HOUR});dates.add(start);continue;
  }
  if(hours>profile.daily_hours)throw Error('OPERATION_EXCEEDS_DAILY_HOURS');
  const capacity=profile.id==='VIBRATION_DURABILITY'?1:a.capacity;
  let remaining=a.quantity,offset=0;
  while(remaining>0){
   if(offset>2048||segments.length>4000)throw Error('TRIAL_PLANNING_LIMIT');
   const date=taipeiDay(profileMidnight(start)+offset*DAY);offset++;
   if(profile.calendar==='weekdays'&&!operationDay(date))continue;
   for(let used=0;remaining>0&&used+hours<=profile.daily_hours;used+=hours){
    const quantity=Math.min(capacity,remaining),begin=profileMidnight(date)+used*HOUR;
    segments.push({equipment_id:id,quantity,start_ms:begin,end_ms:begin+hours*HOUR});remaining-=quantity;dates.add(date);
   }
  }
 }
 const startMs=Math.min(...segments.map(s=>s.start_ms)),endMs=Math.max(...segments.map(s=>s.end_ms));
 const unitHours=segments.reduce((n,s)=>n+(s.end_ms-s.start_ms)/HOUR*s.quantity,0);
 return {version:1,profile_id:profile.id,calendar:profile.calendar,hours_per_batch:hours,start_ms:startMs,end_ms:endMs,end_date:taipeiDay(endMs-1),working_dates:[...dates].sort(),total_sample_hours:unitHours,segments,synthetic:true,official_standard:false};
}

export function executionFraction(execution,clock){
 const required=execution.total_sample_hours*HOUR;
 return required>0?Math.max(0,Math.min(1,execution.segments.reduce((n,s)=>n+Math.max(0,Math.min(clock,s.end_ms)-s.start_ms)*s.quantity,0)/required)):0;
}

export function profileSummary(profile,quantity=1){
 if(!profile)return '試驗類型待確認；不會套用其他試驗的設備或工時。';
 if(profile.id==='VIBRATION_DURABILITY')return `每台一次 1 顆，每顆 20 小時；${quantity} 顆以單台排 ${quantity} 個作業日，週六、週日不作業。`;
 if(profile.id==='HIGH_HUMIDITY')return '恆溫恆濕機或具濕控資料的環境試驗箱；連續 250 小時，包含週末。';
 return `${profile.label}；${profile.calendar==='weekdays'?'僅平日作業':'可連續跨週末'}。既有試驗資料優先，缺漏時的 ${profile.hours} 小時為合成示範參數。`;
}
