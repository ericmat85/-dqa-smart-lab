import {equipmentIds} from './scheduleResources.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
const excluded=new Set(['已完成','已結案','完成','取消','已取消']);
export function scheduleOrder(row,now){
 const period=scheduleProgress({...row,status:'已排程'},now);
 if(['未排程','待排程'].includes(row.status)||period.start===undefined)return [3,Infinity];
 if(row.pauseStartedAt||period.start<=now&&period.end>now)return [0,period.start];
 return period.start>=now?[1,period.start]:[2,-period.start];
}
export function groupSchedulesByEquipment(rows,equipment,now){
 const groups=equipment.map(machine=>({key:machine.id,name:machine.name,machine,rows:[]}));
 const byId=new Map(groups.map(group=>[group.key,group]));
 for(const row of rows){
  if(excluded.has(row.status))continue;
  let ids=equipmentIds(row);
  if(!ids.length){const matches=groups.filter(group=>group.name===row.eq);ids=matches.length===1?[matches[0].key]:[row.eq?`legacy:${row.eq}`:'unassigned'];}
  for(const id of ids){
   let group=byId.get(id);
   if(!group){group={key:id,name:id==='unassigned'?'尚未指定設備':id.startsWith('legacy:')?row.eq:`台帳外設備 ${id}`,machine:null,rows:[]};groups.push(group);byId.set(id,group);}
   group.rows.push(row);
  }
 }
 const compare=(a,b)=>{const x=scheduleOrder(a,now),y=scheduleOrder(b,now);return x[0]-y[0]||(x[1]===y[1]?0:x[1]-y[1])||String(a.id).localeCompare(String(b.id));};
 for(const group of groups){group.rows.sort(compare);group.requestCount=new Set(group.rows.map(row=>row.requestId||row.id)).size;}
 return groups.sort((a,b)=>a.rows.length&&b.rows.length?compare(a.rows[0],b.rows[0])||a.name.localeCompare(b.name):a.rows.length?-1:b.rows.length?1:a.name.localeCompare(b.name));
}
