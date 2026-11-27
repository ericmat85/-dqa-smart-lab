import test from 'node:test';
import assert from 'node:assert/strict';
import {compactAIContext,conciseAIQuestion,boundedAIHistory} from '../server/business/aiContext.mjs';
import {isPendingScheduleSource} from '../src/pendingScheduleSource.mjs';

test('bulk model context preserves every value, row order and citation with less repeated JSON',()=>{
 const records=Array.from({length:22},(_,i)=>({reference:'R'+(i+1),legacy_id:'REQ-'+String(i).padStart(32,'0'),execution_kind:'REAL',product_code:'PROD-'+i,quantity:i+1,requested_date:'2026-12-08',status:'AWAITING_REQUEST_MANAGER',revision:2}));
 records.push({reference:'R23',name:'條件未提供',value:null,enabled:false,zero:0,empty:'',nested:{limits:[1,2]}});
 const source={source:'AUTHORIZED_DATABASE',records,references:['SUMMARY',...records.map(r=>r.reference)],counts:{requests:22}},before=structuredClone(source),packed=compactAIContext(source);
 assert.equal(packed.records_format,'columnar-v1');assert.equal(packed.record_count,23);
 const restored=packed.record_tables.flatMap(t=>t.rows.map(row=>Object.fromEntries(t.columns.map((column,index)=>[column,row[index]]))));
 assert.deepEqual(restored,records);assert.deepEqual(packed.references,source.references);assert.deepEqual(packed.counts,source.counts);assert.deepEqual(source,before);
 assert.ok(Buffer.byteLength(JSON.stringify(packed))<Buffer.byteLength(JSON.stringify(source))*.65);
});
test('small contexts retain their shape and user purpose is never truncated',()=>{
 const context={records:[{reference:'R1',name:'試驗'}],references:['R1']};assert.deepEqual(compactAIContext(context),context);
 for(const engine of ['E1','E2','E3','E4'])assert.ok(conciseAIQuestion(engine,'核對試驗').startsWith('核對試驗'));
 const long='試'.repeat(4000);assert.equal(conciseAIQuestion('E3',long),long);
});
test('report pending sources match the displayed preapproval workflow, without treating all reviews as scheduled',()=>{
 assert.equal(isPendingScheduleSource({status:'AWAITING_SCHEDULING'}),true);
 assert.equal(isPendingScheduleSource({status:'AWAITING_LMS_REVIEW',reviewLevel:0,preapprovalWorkflow:true}),true);
 for(const data of [{status:'AWAITING_LMS_REVIEW',reviewLevel:1,preapprovalWorkflow:true},{status:'AWAITING_LMS_REVIEW',reviewLevel:0,preapprovalWorkflow:false},{status:'AWAITING_REQUEST_MANAGER',reviewLevel:0,preapprovalWorkflow:true},{status:'CANCELLED',reviewLevel:0,preapprovalWorkflow:true}])assert.equal(isPendingScheduleSource(data),false);
});
test('oversized interpretation history omits complete turns with notice and never changes current evidence',()=>{
 const short={question:'查詢設備',reply:'請指定設備'},long={question:'詳細資料',reply:'舊建議'.repeat(900)},history=[short,long],before=structuredClone(history),result=boundedAIHistory(history);
 assert.deepEqual(result.history_for_interpretation_only,[short]);assert.equal(result.history_turns_omitted,1);assert.match(result.history_policy,/CURRENT_RECORDS_NOT_TRUNCATED/);assert.deepEqual(history,before);assert.deepEqual(boundedAIHistory([]),{});
 assert.deepEqual(boundedAIHistory([long,short]).history_for_interpretation_only,[]);
});
