import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleProgress,effectiveScheduleStatus} from '../src/scheduleProgress.mjs';

const row={status:'已排程',time:'2026-10-28',end:'2026-10-30'};
test('both dates and a saved reservation are required to display a timeline',()=>{
  for(const extra of [{time:''},{end:''},{status:'未排程'},{status:'有衝突'}])assert.equal(scheduleProgress({...row,...extra},Date.now()).phase,'unscheduled');
});
test('date-only schedules begin at Taipei midnight and include the entire finish day',()=>{
  const before=scheduleProgress(row,Date.parse('2026-10-27T15:59:59Z'));
  assert.equal(before.phase,'waiting');assert.equal(before.fraction,0);
  const start=scheduleProgress(row,Date.parse('2026-10-27T16:00:00Z'));
  assert.equal(start.phase,'running');assert.equal(start.fraction,0);
  const middle=scheduleProgress(row,Date.parse('2026-10-29T04:00:00Z'));
  assert.equal(middle.fraction,0.5);
  assert.equal(scheduleProgress(row,Date.parse('2026-10-30T15:59:59Z')).phase,'running');
  const end=scheduleProgress(row,Date.parse('2026-10-30T16:00:00Z'));
  assert.equal(end.phase,'elapsed');assert.equal(end.fraction,1);
});
test('same-day and explicit time reservations calculate real elapsed time',()=>{
  const sameDay=scheduleProgress({...row,end:'2026-10-28'},Date.parse('2026-10-28T04:00:00Z'));
  assert.equal(sameDay.fraction,0.5);
  const timed=scheduleProgress({...row,time:'2026-10-28T09:00',end:'2026-10-28T11:00'},Date.parse('2026-10-28T02:00:00Z'));
  assert.equal(timed.fraction,0.5);
  assert.equal(scheduleProgress({...row,time:'2026-10-28T01:00:00Z',end:'2026-10-28T03:00:00Z'},Date.parse('2026-10-28T02:00:00Z')).fraction,0.5);
});
test('invalid or reversed dates do not display a misleading progress bar',()=>{
  for(const extra of [{time:'invalid'},{time:'2026-02-30'},{end:'2026-10-26'}])assert.equal(scheduleProgress({...row,...extra},Date.now()).phase,'invalid');
});

test('saved reservations switch from scheduled to running exactly at their start',()=>{
  assert.equal(effectiveScheduleStatus(row,Date.parse('2026-10-27T15:59:59Z')),'已排程');
  assert.equal(effectiveScheduleStatus(row,Date.parse('2026-10-27T16:00:00Z')),'試驗中');
  assert.equal(effectiveScheduleStatus(row,Date.parse('2026-10-28T00:00:00Z')),'試驗中');
  assert.equal(effectiveScheduleStatus(row,Date.parse('2026-11-01T00:00:00Z')),'已完成');
  assert.equal(effectiveScheduleStatus({...row,status:'已完成'},Date.now()),'已完成');
  assert.equal(effectiveScheduleStatus({...row,time:''},Date.now()),'未排程');
  assert.equal(effectiveScheduleStatus({...row,status:'有衝突'},Date.now()),'有衝突');
});
test('early completion displays the actual finish timestamp without changing the reservation rule',()=>{
 const at='2026-10-28T03:00:00Z';const completed={...row,status:'已完成',completedAt:at};
 assert.equal(scheduleProgress(completed,Date.parse(at)).end,Date.parse(at));
 assert.equal(scheduleProgress({...completed,completedAt:'bad'},Date.parse(at)).end,scheduleProgress(row,Date.parse(at)).end);
});
