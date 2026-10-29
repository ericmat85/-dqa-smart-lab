import {useSyncExternalStore} from 'react';
import {scheduleProgress} from './scheduleProgress.mjs';
import {subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot} from './scheduleClock.mjs';
import './ScheduleTimeline.css';

export default function ScheduleTimeline({row}) {
  const now=useSyncExternalStore(subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot);
  const progress=scheduleProgress(row,now);
  if(progress.phase==='unscheduled'||progress.phase==='invalid')return <span className="schedule-timeline-unset">{progress.label}</span>;
  return <div className={`schedule-timeline ${progress.phase}`} title="依台灣時間按已儲存的試驗日程自動更新">
    <div className="schedule-timeline-dates"><time>{String(row.time).slice(0,10)}</time><span aria-hidden="true">→</span><time>{String(row.end).slice(0,10)}</time></div>
    <div className="schedule-timeline-track" role="progressbar" aria-label="試驗日程" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction*100)} aria-valuetext={progress.label}><span style={{width:`${progress.fraction*100}%`}}/></div>
    <small>{progress.label}</small>
  </div>;
}
