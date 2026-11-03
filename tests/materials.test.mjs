import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_MATERIALS,MATERIAL_KEY,MATERIAL_STATUSES,changeMaterialStatus} from '../src/demoMaterials.mjs';

test('twenty independent material items include consumables, EOL testers and tools',()=>{
  assert.equal(DEMO_MATERIALS.length,20);
  assert.equal(new Set(DEMO_MATERIALS.map(row=>row.id)).size,20);
  assert.equal(new Set(DEMO_MATERIALS.map(row=>row.serial)).size,20);
  assert.ok(DEMO_MATERIALS.every(row=>row.available<=row.quantity&&row.owner&&row.location&&row.specification&&row.records.length));
  for(const category of ['物料耗材','工具','完檢機','治具配件','輔助儀器'])assert.ok(DEMO_MATERIALS.some(row=>row.category===category));
  assert.notEqual(MATERIAL_KEY,'dqa-equipment-demo-v1');
});

test('materials can transition freely between all supported states without changing inventory',()=>{
  for(const from of MATERIAL_STATUSES){
    for(const to of MATERIAL_STATUSES.filter(value=>value!==from)){
      const original=[{id:'MAT-1',status:from,quantity:5,available:3,records:[]},{id:'MAT-2',status:'使用中'}];
      const next=changeMaterialStatus(original,{id:'MAT-1',status:to,reason:'盤點確認',actor:'管理員',actorId:'user'});
      assert.equal(next[0].status,to);
      assert.equal(next[0].quantity,5);
      assert.equal(next[0].available,3);
      assert.equal(next[0].records[0].detail,'盤點確認');
      assert.equal(next[0].records[0].actorId,'user');
      assert.equal(next[1],original[1]);
      assert.equal(original[0].status,from);
      assert.equal(original[0].records.length,0);
    }
  }
});

test('invalid material changes cannot create misleading records',()=>{
  const rows=[{id:'MAT-1',status:'可用'}];
  const params={id:'MAT-1',status:'借出',reason:'借用',actor:'管理員',actorId:'user'};
  for(const change of [{id:'missing'},{status:'可用'},{status:'invalid'},{reason:' '},{actorId:''}])assert.throws(()=>changeMaterialStatus(rows,{...params,...change}));
});

test('maintenance is not a material action; legacy entries can transition without losing history or stock',()=>{
  assert.ok(!MATERIAL_STATUSES.includes('維護中'));
  assert.ok(DEMO_MATERIALS.every(row=>MATERIAL_STATUSES.includes(row.status)));
  const params={id:'MAT-OLD',reason:'盤點確認停用',actor:'管理員',actorId:'manager'};
  const rows=[{id:'MAT-OLD',status:'維護中',quantity:5,available:0,records:[{id:'OLD',type:'狀態變更',result:'可用 → 維護中'}]}];
  assert.throws(()=>changeMaterialStatus(rows,{...params,status:'維護中'}),/有效的物料狀態/);
  const next=changeMaterialStatus(rows,{...params,status:'停用'});
  assert.equal(next[0].status,'停用');assert.equal(next[0].quantity,5);assert.equal(next[0].available,0);assert.equal(next[0].records[1].id,'OLD');assert.equal(rows[0].status,'維護中');assert.equal(rows[0].records.length,1);
});
