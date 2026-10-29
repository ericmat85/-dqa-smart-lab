import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeLabSchedules,labRequestInformation} from '../src/labScheduleBridge.mjs';
const schedule={id:'SCH1',requestId:'REQ1',title:'高溫試驗',eq:'環境箱',time:'2026-10-29T09:00',end:'2026-10-30T09:00',status:'已排程',productCode:'PRODUCT'};
test('saved schedules enter lab pending confirmation without duplicates or resetting accepted work',()=>{
 const rows=mergeLabSchedules([],[schedule]);assert.equal(rows[0].id,'REQ1');assert.equal(rows[0].status,'待確認');assert.equal(rows[0].hours,24);
 assert.equal(mergeLabSchedules(rows,[schedule]),rows);
 const accepted=[{...rows[0],status:'試驗中'}];assert.equal(mergeLabSchedules(accepted,[{...schedule,status:'試驗中'}],Date.parse('2026-10-29T10:00:00+08:00'))[0].status,'試驗中');
 assert.equal(mergeLabSchedules(rows,[{...schedule,status:'取消'}])[0].status,'取消');
 assert.equal(mergeLabSchedules([],[{...schedule,time:''}]).length,0);
});
test('request information resolves original signatures and falls back to schedule details',()=>{
 const original={id:'REQ1',productCode:'SOURCE',signatureRecords:[{signature:'image'}]};
 const snapshot={requests:[{id:'REQ1'}],electronic:[original],schedules:[schedule]};
 assert.equal(labRequestInformation({id:'REQ1'},snapshot),original);
 assert.equal(labRequestInformation({id:'REQ1'},{...snapshot,requests:[],electronic:[]}).productCode,'PRODUCT');
 assert.equal(labRequestInformation({id:'LAB1',project:'Legacy',test:'test'},{requests:[],electronic:[],schedules:[]}).id,'LAB1');
});
