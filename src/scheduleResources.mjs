import {isVirtualRequest} from './requestExecutionKind.mjs';
import {scheduleProgress} from './scheduleProgress.mjs';
export function equipmentIds(row){return [...new Set([row.equipmentId,...(row.equipmentIds||[])].filter(Boolean))];}
export function usesEquipment(row,machine){const ids=equipmentIds(row);return ids.length?ids.includes(machine.id):row.eq===machine.name;}
export function bufferMinutes(value){const number=Number(value??0);if(!Number.isInteger(number)||number<0||number>1440)throw Error('準備／清理時間須為 0～1440 分鐘整數。');return number;}
export function reservationWindow(row,now=Date.now()){
 if(row.businessDatabase&&isVirtualRequest(row))return null;
 const bounds=scheduleProgress({...row,status:'已排程'},now);
 if(bounds.start===undefined)return null;
 const completed=Date.parse(row.completedAt);
 const end=['已完成','已結案'].includes(row.status)&&Number.isFinite(completed)&&completed>=bounds.start?Math.min(bounds.end,completed):bounds.end;
 return {start:bounds.start-bufferMinutes(row.preparationMinutes)*60000,end:row.pauseStartedAt?Infinity:end+bufferMinutes(row.cleanupMinutes)*60000};
}
export function resourceBusy(row,now){
 if(!['已排程','試驗中','進行中','暫停中','待核准','已完成','已結案'].includes(row.status))return false;
 const window=reservationWindow(row,now);return Boolean(window&&now>=window.start&&now<window.end);
}
