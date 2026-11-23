import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceScheduleAnimation,SCHEDULE_ANIMATION_MIN_MS} from '../src/scheduleAnimation.mjs';

test('even an immediate result takes at least five seconds to fill the bar',()=>{
 let value=0;
 for(let ms=50;ms<SCHEDULE_ANIMATION_MIN_MS;ms+=50){value=advanceScheduleAnimation(value,50,2,true);assert.ok(value<100);}
 assert.equal(advanceScheduleAnimation(value,50,2,true),100);
});
test('actual phases cap waiting progress and never claim an unreturned result',()=>{
 let value=0;
 for(const [stage,limit] of [[0,30],[1,64],[2,92]]){
  for(let n=0;n<200;n++)value=advanceScheduleAnimation(value,50,stage,false);
  assert.equal(value,limit);
 }
 assert.ok(value<100);
});
test('instant phase changes and background-tab stalls cannot make the bar burst or rewind',()=>{
 let value=0;
 for(const [ms,stage,ready] of [[50,0,false],[50,2,false],[60000,2,true],[50,1,false],[50,2,true]]){
  const next=advanceScheduleAnimation(value,ms,stage,ready);assert.ok(next>=value);assert.ok(next-value<=2);value=next;
 }
 assert.equal(advanceScheduleAnimation(value,-100,2,true),value);
});
