import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSchedulesByExecutor,filterScheduleRows} from '../src/scheduleGroups.mjs';
import {groupSchedulesByEquipment} from '../src/equipmentScheduleGroups.mjs';

test('all laboratory executors appear, including people with no assigned schedules',()=>{
  const accounts=[{id:'a',name:'陳工程師',role:'實驗室工程師'},{id:'b',name:'林工程師',role:'實驗室副工程師'},{id:'admin',name:'管理員',role:'系統管理員'}];
  const rows=[{id:'1',ownerId:'a',owner:'陳工程師'}];
  const groups=groupSchedulesByExecutor(rows,accounts);
  assert.equal(groups.length,2);
  assert.equal(groups[0].rows.length,1);
  assert.equal(groups[1].rows.length,0);
  assert.equal(groups[1].name,'林工程師');
  assert.equal(rows.length,1);
});

test('ID matches, legacy names and unassigned tasks are grouped exactly once',()=>{
  const accounts=[{id:'a',name:'同名',role:'實驗室工程師'},{id:'b',name:'同名',role:'實驗室工程師'}];
  const rows=[{id:'1',ownerId:'b',owner:'舊姓名'},{id:'2',owner:'同名'},{id:'3',owner:'原工程師'},{id:'4',owner:''}];
  const groups=groupSchedulesByExecutor(rows,accounts);
  assert.equal(groups.find(group=>group.key==='account:b').rows[0].id,'1');
  assert.equal(groups.find(group=>group.key==='account:a').rows.length,0);
  assert.equal(groups.find(group=>group.key==='legacy-name:同名').rows[0].id,'2');
  assert.equal(groups.find(group=>group.key==='unassigned').rows[0].id,'4');
  assert.deepEqual(groups.flatMap(group=>group.rows.map(row=>row.id)).sort(),['1','2','3','4']);
});

test('shared filters apply consistently to both list and person groups',()=>{
  const rows=[{id:'1',requestId:'REQ-1',owner:'陳工程師',status:'未排程'},{id:'2',requestId:'REQ-2',owner:'林工程師',status:'已排程'}];
  assert.equal(filterScheduleRows(rows,'全部','REQ-2')[0].id,'2');
  assert.equal(filterScheduleRows(rows,'未排程','陳')[0].id,'1');
  assert.equal(filterScheduleRows(rows,'已排程','陳').length,0);
});

test('equipment filtering preserves chronological groups while the main list keeps priority order',()=>{
 const rows=[
  {id:'LATE',requestId:'REQ-LATE',equipmentId:'A',status:'已排程',priority:'急件',time:'2099-01-10',end:'2099-01-11'},
  {id:'NEAR',requestId:'REQ-NEAR',equipmentId:'A',status:'已排程',priority:'一般',time:'2099-01-02',end:'2099-01-03'},
 ];
 const grouped=groupSchedulesByEquipment(rows,[{id:'A',name:'試驗箱'}],Date.parse('2098-12-01T00:00:00Z'))[0].rows;
 assert.deepEqual(filterScheduleRows(grouped,'全部','REQ-',{preserveOrder:true}).map(r=>r.id),['NEAR','LATE']);
 assert.deepEqual(filterScheduleRows(grouped,'全部','REQ-').map(r=>r.id),['LATE','NEAR']);
 assert.deepEqual(grouped.map(r=>r.id),['NEAR','LATE']);
 assert.deepEqual(rows.map(r=>r.id),['LATE','NEAR']);
});
