import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ganttLanes,shiftGanttDate} from '../src/scheduleGantt.mjs';
const equipment=[{id:'a',name:'同名設備'},{id:'b',name:'同名設備'}],accounts=[{id:'u',name:'工程師'}];
const row={id:'s',title:'試驗',requestId:'r',equipmentId:'a',equipmentIds:['a','b'],ownerId:'u',time:'2026-11-03',end:'2026-11-03',status:'已排程'};
test('Gantt uses Taiwan full calendar days and distinct resource IDs for both views',()=>{
 const lanes=ganttLanes([row],equipment,accounts,'equipment','2026-11-03',1);
 assert.equal(lanes.length,2);assert.equal(lanes[0].tasks[0].width,100);assert.equal(lanes[0].tasks[0].left,0);
 const people=ganttLanes([row],equipment,accounts,'people','2026-11-03',1);assert.equal(people[0].name,'工程師');assert.equal(people[0].tasks[0].row.id,'s');
 assert.equal(shiftGanttDate('2026-11-03',-14),'2026-10-20');
});
test('Gantt includes completed history, excludes cancelled and clips across range bounds',()=>{
 const rows=[{...row,id:'done',status:'已完成',time:'2026-11-02',end:'2026-11-04'},{...row,id:'cancel',status:'取消'},{...row,id:'pending',status:'待核准'}];
 const lanes=ganttLanes(rows,equipment,accounts,'people','2026-11-03',1);assert.equal(lanes[0].tasks.length,1);assert.equal(lanes[0].tasks[0].width,100);
 assert.deepEqual(ganttLanes(rows,equipment,accounts,'people','2027-01-01',1),[]);
});
test('Gantt stacks overlaps and uses pause-adjusted end times',()=>{
 const now=Date.parse('2026-11-05T00:00:00+08:00');
 const rows=[{...row,id:'paused',status:'暫停中',pauseStartedAt:'2026-11-03T12:00:00+08:00'},{...row,id:'other',time:'2026-11-04',end:'2026-11-05'}];
 const lanes=ganttLanes(rows,equipment,accounts,'people','2026-11-04',2,now);assert.equal(lanes[0].stacks,2);assert.equal(lanes[0].tasks[1].stack,1);assert.ok(lanes[0].tasks[0].width>0);
});
