import {getRequestDate,isCalendarDate} from './requestDate.mjs';
const terminal=new Set(['已完成','已結案','取消','已取消','已中止','已終止']);
export function labRequestOverdue(row,schedules=[],now=new Date()){
 if(terminal.has(row.status))return false;
 const schedule=schedules.find(item=>item.id===row.scheduleId||item.requestId===row.id);
 const raw=String(schedule?.end||row.scheduledEnd||'');
 if(!isCalendarDate(raw)&&(!/^\d{4}-\d{2}-\d{2}T/.test(raw)||!isCalendarDate(raw.slice(0,10))||!Number.isFinite(Date.parse(raw))))return false;
 const end=isCalendarDate(raw)?raw:getRequestDate(new Date(raw));
 return end<getRequestDate(now);
}
