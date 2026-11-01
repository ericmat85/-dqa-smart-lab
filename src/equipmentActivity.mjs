import {getRequestDate,isCalendarDate} from './requestDate.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
import {usesEquipment} from './scheduleResources.mjs';
export function equipmentActivityWindow(preferences,now){
 const days=[7,14,30,60,90].includes(Number(preferences.equipmentDays))?Number(preferences.equipmentDays):14;
 const from=isCalendarDate(preferences.equipmentStart)?preferences.equipmentStart:getRequestDate(new Date(now));
 const start=Date.parse(`${from}T00:00:00+08:00`),end=start+days*86400000;
 return {start,end,from,to:getRequestDate(new Date(end-1)),days};
}
export function equipmentActivity(schedules,equipment,preferences,now){
 const window=equipmentActivityWindow(preferences,now);
 const machines=[...new Map(equipment.map(machine=>[machine.id,machine])).values()];
 let occupiedMs=0;
 for(const machine of machines){
  const periods=schedules.filter(row=>usesEquipment(row,machine)).flatMap(row=>{
   if(!['已排程','試驗中','進行中','暫停中','已完成','已結案'].includes(row.status))return [];
   const period=scheduleProgress({...row,status:row.status==='已結案'?'已完成':row.status},now);
   if(period.start===undefined)return [];
   const start=Math.max(window.start,period.start),end=Math.min(window.end,period.end);
   return start<end?[[start,end]]:[];
  }).sort((a,b)=>a[0]-b[0]);
  let last=null;
  for(const [start,end] of periods){if(!last)last=[start,end];else if(start<=last[1])last[1]=Math.max(last[1],end);else{occupiedMs+=last[1]-last[0];last=[start,end];}}
  if(last)occupiedMs+=last[1]-last[0];
 }
 const totalMs=machines.length*(window.end-window.start);
 return {...window,occupiedMs,totalMs,rate:totalMs?Math.round(occupiedMs/totalMs*100):0};
}
