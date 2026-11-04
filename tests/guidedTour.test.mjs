import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryStorage,tourDatabaseName} from '../src/guidedTourStorage.mjs';
import {guidedStepDone,GUIDED_STEPS} from '../src/guidedTourSteps.mjs';
test('private storage supports native-style access without touching other stores',()=>{
 let changes=0;const first=memoryStorage({case:'original'},()=>changes++),second=memoryStorage();first.setItem('case','updated');first.extra=12;assert.equal(first.getItem('case'),'updated');assert.equal(first.extra,'12');assert.equal(first.length,2);assert.equal(first.key(0),'case');assert.deepEqual({...first},{case:'updated',extra:'12'});assert.equal(second.getItem('case'),null);first.removeItem('case');assert.equal(first.getItem('case'),null);first.clear();assert.equal(first.length,0);assert.equal(changes,4);
 assert.equal(tourDatabaseName('dqa_lab_demo_reports'),null);assert.equal(tourDatabaseName('dqa-guided-tour-a123-45'),'dqa-tour-reports-a123-45');
});
test('visitor cannot advance checkpoints before real request, schedule and report actions complete',()=>{
 assert.equal(GUIDED_STEPS.length,11);assert.deepEqual([...new Set(GUIDED_STEPS.map(s=>s.stage))],[1,2,3,4,5,6,7,8,9]);for(let i=0;i<11;i++)assert.equal(guidedStepDone(i,{}),false);
 const states=[{request:{status:'已核准'}},{request:{lmsReview:{approval:1}}},{request:{lmsReview:{approval:2}}},{schedule:{reservationId:'saved'}},{lab:{status:'試驗中',acceptedAt:'2026-11-04T00:00:00Z'}},{lab:{status:'已完成'},equipmentVisited:true},{report:{stage:'level2'}},{report:{stage:'level3'}},{report:{stage:'view'}},{report:{stage:'archived'}},{report:{stage:'archived'},pdfVisited:true}];states.forEach((state,i)=>assert.equal(guidedStepDone(i,state),true));assert.equal(guidedStepDone(10,{report:{stage:'archived'}}),false);assert.equal(guidedStepDone(7,{report:{stage:'level2'}}),false);assert.equal(guidedStepDone(6,{report:{stage:'level3'}}),true);assert.equal(guidedStepDone(4,{lab:{status:'已完成',acceptedAt:'2026-11-04T00:00:00Z'}}),true);
});
