import {trialExecution,profileMidnight,taipeiDay,operationDay} from './trialProfiles.mjs';
const HOUR=3600000,DAY=24*HOUR;

// Shared scheduling reserves whole days. Execution segments retain the real test hours.
export function dayBasedTrialExecution(profile,start,allocations,hours=profile?.hours){
 const original=trialExecution(profile,start,allocations,hours);
 if(hours>8760)throw Error('TRIAL_PLANNING_LIMIT');
 let segments=original.segments;
 if(profile.mode==='serial'){
  segments=[];
  for(const allocation of allocations){
   const id=allocation.equipment_id??allocation.equipmentId,capacity=profile.id==='VIBRATION_DURABILITY'?1:allocation.capacity;
   let remaining=allocation.quantity,offset=0;
   while(remaining>0){
    if(offset>=366)throw Error('TRIAL_PLANNING_LIMIT');
    const date=taipeiDay(profileMidnight(start)+offset++*DAY);
    if(profile.calendar==='weekdays'&&!operationDay(date))continue;
    const quantity=Math.min(capacity,remaining),begin=profileMidnight(date);
    segments.push({equipment_id:id,quantity,start_ms:begin,end_ms:begin+hours*HOUR});remaining-=quantity;
   }
  }
 }
 const actualEnd=Math.max(...segments.map(s=>s.end_ms)),end=profileMidnight(taipeiDay(actualEnd-1))+DAY,endDate=taipeiDay(end-1),dates=[];
 if((end-profileMidnight(start))/DAY>366)throw Error('TRIAL_PLANNING_LIMIT');
 for(let cursor=profileMidnight(start);cursor<end;cursor+=DAY){
  if(dates.length>366)throw Error('TRIAL_PLANNING_LIMIT');
  const date=taipeiDay(cursor);if(profile.calendar!=='weekdays'||operationDay(date))dates.push(date);
 }
 return {...original,scheduling_unit:'DAY',scheduling_days:dates.length,calendar_days:Math.round((end-profileMidnight(start))/DAY),end_ms:end,end_date:endDate,execution_end_ms:actualEnd,execution_ends_at:new Date(actualEnd).toISOString(),working_dates:dates,segments,total_sample_hours:segments.reduce((total,s)=>total+(s.end_ms-s.start_ms)/HOUR*s.quantity,0)};
}
