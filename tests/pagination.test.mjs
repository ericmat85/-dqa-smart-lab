import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_SIZE,pageSlice,pageNumbers,listIdentity} from '../src/pagination.mjs';

test('every page contains at most 20 records with no loss or duplication',()=>{
  assert.equal(PAGE_SIZE,20);
  for(const total of [0,1,19,20,21,40,41,101]){
    const rows=Array.from({length:total},(_,index)=>({id:`ROW-${index}`}));
    const pages=pageSlice(rows).pages;
    const combined=[];
    for(let page=1;page<=pages;page++){
      const result=pageSlice(rows,page);
      assert.ok(result.items.length<=20);
      combined.push(...result.items);
      assert.equal(result.offset,(page-1)*20);
    }
    assert.deepEqual(combined,rows);
    assert.equal(rows.length,total);
  }
});
test('empty, out-of-range and shrinking data sets use valid page bounds',()=>{
  const rows=Array.from({length:21},(_,index)=>index);
  assert.equal(pageSlice(rows,999).page,2);
  assert.deepEqual(pageSlice(rows,2).items,[20]);
  assert.equal(pageSlice(rows.slice(0,20),2).page,1);
  assert.equal(pageSlice([],3).page,1);
  assert.equal(pageSlice(rows,-1).page,1);
});
test('page controls expose the first, last and current page without duplicate numbers',()=>{
  assert.deepEqual(pageNumbers(1,3),[1,2,3]);
  const numbers=pageNumbers(10,40);
  assert.equal(numbers[0],1);assert.equal(numbers.at(-1),40);
  assert.ok(numbers.includes(10));assert.ok(numbers.includes('…'));
  assert.equal(new Set(numbers.filter(value=>typeof value==='number')).size,numbers.filter(value=>typeof value==='number').length);
});
test('live status or progress updates preserve identity while sorting and filtering reset it',()=>{
  const rows=[{id:'a',status:'已排程'},{id:'b',status:'試驗中'}];
  assert.equal(listIdentity(rows),listIdentity(rows.map(row=>({...row,status:'已完成'}))));
  assert.notEqual(listIdentity(rows),listIdentity([...rows].reverse()));
  assert.notEqual(listIdentity(rows),listIdentity(rows.slice(0,1)));
});
