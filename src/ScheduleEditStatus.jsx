import {effectiveScheduleStatus} from './scheduleProgress.mjs';
export default function ScheduleEditStatus({row,now}){
 const status=effectiveScheduleStatus(row,now)||'未排程';
 const labels={'未排程':'未排程','待排程':'未排程','有衝突':'排程衝突'};
 const label=labels[status]||status;
 const planned=['已排程','試驗中','進行中','暫停中'].includes(status);
 return <span className={`schedule-edit-status ${planned?'is-planned':'is-unplanned'}`} role="status" aria-label={`排程狀態：${label}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>{planned?<path d="m8 15 3 3 5-5"/>:<path d="M9 15h6"/>}</svg><span>{label}</span></span>;
}
