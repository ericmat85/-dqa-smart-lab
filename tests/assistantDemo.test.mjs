import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSISTANT_DEMOS,assistantReply} from '../src/assistantDemo.mjs';
const snapshot={equipment:[{status:'待機中'},{status:'維護中'}]};
const metrics={counts:{'未排程':4,'有衝突':2,'已排程':3,'試驗中':5,'已完成':6},lowStock:[]};
test('demo board has twenty distinct questions with working answers',()=>{
 assert.equal(ASSISTANT_DEMOS.length,20);assert.equal(new Set(ASSISTANT_DEMOS.map(row=>row.id)).size,20);
 for(const item of ASSISTANT_DEMOS)assert.ok(assistantReply(item.question,snapshot,metrics).length>20);
});
test('count answers read live snapshot instead of fixed demo counts',()=>{
 assert.match(assistantReply('目前有多少試驗還沒排程？',snapshot,metrics),/4 筆/);
 assert.match(assistantReply('目前有多少試驗正在進行？',snapshot,metrics),/5 筆/);
 assert.match(assistantReply('現在有多少設備可以安排試驗？',snapshot,metrics),/1 台/);
 const changed={...metrics,counts:{...metrics.counts,'未排程':9},lowStock:[{name:'膠帶',available:1,minStock:3,unit:'卷'}]};
 assert.match(assistantReply('待排程',snapshot,changed),/9 筆/);
 assert.match(assistantReply('缺料',snapshot,changed),/膠帶/);
 assert.match(assistantReply('這是一個無關的問題',snapshot,metrics),/Demo/);
});
