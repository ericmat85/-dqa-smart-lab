import {scheduleProgress} from './scheduleProgress.mjs';
import {usesEquipment} from './scheduleResources.mjs';
export function shiftGanttDate(date,days){return new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);}
export function ganttLanes(rows,equipment,accounts,kind,date,days,now=Date.now()){
 const base=Date.parse(`${date}T00:00:00+08:00`),limit=base+days*86400000;
 const tasks=rows.filter(row=>!['取消','已取消','未排程','待核准'].includes(row.status)).flatMap(row=>{
  const bounds=scheduleProgress({...row,status:row.status==='有衝突'?'已排程':row.status==='已結案'?'已完成':row.status},now);
  if(bounds.start===undefined||bounds.end<=base||bounds.start>=limit)return [];
  return [{row,start:bounds.start,end:bounds.end,left:(Math.max(base,bounds.start)-base)/(limit-base)*100,width:(Math.min(limit,bounds.end)-Math.max(base,bounds.start))/(limit-base)*100}];
 });
 const lanes=new Map();
 for(const task of tasks){
  const resources=kind==='equipment'?equipment.filter(machine=>usesEquipment(task.row,machine)).map(machine=>({id:machine.id,name:machine.name})): [{id:task.row.ownerId||task.row.owner||'unassigned',name:accounts.find(a=>a.id===task.row.ownerId)?.name||task.row.owner||'未指派人員'}];
  if(kind==='equipment'&&!resources.length)resources.push({id:`unlinked:${task.row.equipmentId||task.row.eq||'none'}`,name:task.row.eq||'未關聯設備'});
  for(const resource of resources){if(!lanes.has(resource.id))lanes.set(resource.id,{...resource,tasks:[]});lanes.get(resource.id).tasks.push({...task});}
 }
 for(const lane of lanes.values()){
  const ends=[];
  lane.tasks.sort((a,b)=>a.start-b.start||a.end-b.end).forEach(task=>{let stack=ends.findIndex(end=>end<=task.start);if(stack<0)stack=ends.length;ends[stack]=task.end;task.stack=stack;});
  lane.stacks=ends.length;
 }
 return [...lanes.values()];
}
