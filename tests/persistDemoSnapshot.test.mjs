import test from 'node:test';
import assert from 'node:assert/strict';
import {persistDemoSnapshot} from '../src/persistDemoSnapshot.mjs';
test('replayed persistence does not erase a completed workflow written between effects',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const initial=persistDemoSnapshot('requests',[],null,storage);
 storage.setItem('requests','[{"id":"COMPLETED","status":"已完成"}]');
 const replay=persistDemoSnapshot('requests',[],initial.stamp,storage);
 assert.equal(replay.written,false);assert.equal(JSON.parse(storage.getItem('requests'))[0].status,'已完成');
 const fresh=persistDemoSnapshot('requests',[{id:'COMPLETED',status:'已完成'}],initial.stamp,storage);assert.equal(fresh.written,true);
});
