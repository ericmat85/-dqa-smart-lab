import test from 'node:test';
import assert from 'node:assert/strict';
import {placeTourPopover} from '../src/tourPopover.mjs';
test('floating guidance stays inside the workspace and avoids controls at all four edges',()=>{
 const bounds={left:8,top:90,right:1592,bottom:892},width=300,height=340;
 for(const target of [{left:10,top:100,right:180,bottom:140},{left:1420,top:100,right:1580,bottom:140},{left:10,top:840,right:180,bottom:880},{left:1420,top:840,right:1580,bottom:880},{left:600,top:400,right:760,bottom:440}]){
 const p=placeTourPopover({target,bounds,width,height});assert.ok(p.left>=bounds.left&&p.left+width<=bounds.right);assert.ok(p.top>=bounds.top&&p.top+height<=bounds.bottom);assert.ok(p.left+width<=target.left||p.left>=target.right||p.top+height<=target.top||p.top>=target.bottom);
 }
 const corner=placeTourPopover({target:null,bounds,width,height});assert.equal(corner.placement,'corner');
});
