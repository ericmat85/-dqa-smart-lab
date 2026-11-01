import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSchedulesByEquipment} from '../src/equipmentScheduleGroups.mjs';
const now=Date.parse('2030-01-02T04:00:00Z');
const equipment=[{id:'A',name:'設備 A'},{id:'B',name:'設備 B'},{id:'C',name:'設備 C'}];
const trial=(id,time,end,extra={})=>({id,requestId:`REQ-${id}`,equipmentId:'A',time,end,status:'已排程',...extra});
test('equipment grouping preserves multi-device allocations and unique request counts without mutating rows',()=>{
 const rows=[trial('1','2030-01-03','2030-01-04',{requestId:'REQ-X',equipmentIds:['A','B','B']}),trial('2','2030-01-05','2030-01-06',{requestId:'REQ-X'}),trial('3','2030-01-07','2030-01-08',{status:'已完成'}),trial('4','2030-01-07','2030-01-08',{status:'取消'})];
 const original=JSON.stringify(rows),groups=groupSchedulesByEquipment(rows,equipment,now);
 assert.equal(groups.find(g=>g.key==='A').rows.length,2);assert.equal(groups.find(g=>g.key==='A').requestCount,1);
 assert.equal(groups.find(g=>g.key==='B').rows.length,1);assert.equal(groups.find(g=>g.key==='C').rows.length,0);
 assert.equal(JSON.stringify(rows),original);
});
test('ongoing first, upcoming nearest first, then undated; devices sort by nearest trial',()=>{
 const rows=[trial('late','2030-01-10','2030-01-11'),trial('unset','','',{status:'未排程'}),trial('near','2030-01-03','2030-01-04'),trial('running','2030-01-01','2030-01-02'),trial('b','2030-01-02T13:00','2030-01-03',{equipmentId:'B'})];
 const groups=groupSchedulesByEquipment(rows,equipment,now);
 assert.deepEqual(groups.map(g=>g.key),['A','B','C']);assert.deepEqual(groups[0].rows.map(r=>r.id),['running','near','late','unset']);
});
test('legacy names, missing equipment and unknown equipment IDs stay visible',()=>{
 const groups=groupSchedulesByEquipment([{id:'legacy',eq:'設備 A',status:'未排程'},{id:'none',status:'未排程'},{id:'unknown',equipmentId:'MISSING',status:'未排程'}],equipment,now);
 assert.equal(groups.find(g=>g.key==='A').rows[0].id,'legacy');assert.equal(groups.find(g=>g.key==='unassigned').rows[0].id,'none');assert.equal(groups.find(g=>g.key==='MISSING').rows[0].id,'unknown');
});
