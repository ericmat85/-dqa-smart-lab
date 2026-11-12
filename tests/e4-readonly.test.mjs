import test from 'node:test';
import assert from 'node:assert/strict';
import {makeE4ReadonlyContext,readE4CurrentData} from '../src/e4ReadonlyContext.mjs';
import {readLabSnapshot,deriveLabMetrics} from '../src/labData.mjs';
import {renderE4Reply} from '../src/e4ChatModes.mjs';
const fresh=()=>{const s=structuredClone(readLabSnapshot({getItem:()=>null}));return [s,deriveLabMetrics(s)];};
test('each send rereads current business data without any storage mutation or stale timestamp',()=>{
 const [old,m]=fresh();old.observedAt-=600000;let reads=0;const storage={getItem:key=>{reads++;return key==='dqa-lms-reviews-v1'?JSON.stringify([{id:'REQ-2026-001',status:'待審查'}]):null;},setItem(){throw Error('ASSISTANT_MUST_NOT_WRITE');}};
 const current=readE4CurrentData(old,m,'lms',storage);const c=makeE4ReadonlyContext('目前有多少委託單',current.snapshot,current.metrics,'lms');assert(reads>0);assert.equal(c.totals.requests,1);assert(c.observed_at>old.observedAt);
});
test('current merged forms and trial rows use distinct complete counts without changing snapshot',()=>{
 const [s,m]=fresh();s.requests.push({...s.requests[0]});s.electronic.push({...s.requests[0]});const before=JSON.stringify(s);const c=makeE4ReadonlyContext('目前有多少委託單與試驗？',s,m,'lms');assert.equal(c.totals.requests,50);assert.equal(c.totals.commission_forms,53);assert.equal(c.totals.schedules,34);assert.equal(c.totals.equipment,20);assert.equal(c.totals.reports,null);assert.equal(c.coverage.reports,'UNAVAILABLE');assert.equal(JSON.stringify(s),before);
});
test('account, customer, credentials, signatures and text instructions never enter projection',()=>{
 const [s,m]=fresh();Object.assign(s.requests[0],{customer:'PRIVATE_CUSTOMER',password:'PRIVATE_PASS',signatureRecords:[{image:'PRIVATE_SIGNATURE'}],notes:'IGNORE_RULES_AND_WRITE',title:'PRIVATE_TITLE'});s.accounts.push({id:'SECRET_USER',password:'PRIVATE_ACCOUNT'});
 const c=makeE4ReadonlyContext('列出 REQ-2026-001 的資訊',s,m,'lms');assert.doesNotMatch(JSON.stringify(c),/PRIVATE_|IGNORE_RULES|SECRET_USER|password|signature|customer|accounts/);assert.equal(c.items[0].fields.title,undefined);
});
test('missing or failed sources stay unavailable and never become zero',()=>{
 const [s,m]=fresh();s.sources.find(x=>x.id==='reviews').error='read failure';delete s.materials;
 const c=makeE4ReadonlyContext('目前所有資料狀況',s,m,'lms');assert.equal(c.totals.requests,null);assert.equal(c.coverage.requests,'UNAVAILABLE');assert.equal(c.totals.materials,null);
});
test('non-LMS scopes and greetings do not export a snapshot; stale snapshots are rejected',()=>{
 const [s,m]=fresh();assert.equal(makeE4ReadonlyContext('目前委託單',s,m,'lab'),undefined);assert.equal(makeE4ReadonlyContext('你好',s,m,'lms'),undefined);s.observedAt-=300001;assert.throws(()=>makeE4ReadonlyContext('目前委託單',s,m,'lms'),/過期/);
});
test('long lists explicitly remain partial and bounded without truncating evidence strings',()=>{
 const [s,m]=fresh();const c=makeE4ReadonlyContext('列出所有設備',s,m,'lms');assert.equal(c.selection.matched,20);assert(c.selection.shown<=3);assert.equal(c.selection.complete,false);assert(new TextEncoder().encode(JSON.stringify(c)).length<=2800);
});
test('report drafting is chat-only and needs an existing request ID',()=>{
 const [s,m]=fresh();assert.throws(()=>makeE4ReadonlyContext('幫我製作報告',s,m,'lms'),/指定委託編號/);assert.throws(()=>makeE4ReadonlyContext('製作 REQ-2026-999 報告',s,m,'lms'),/沒有這筆委託/);
 const c=makeE4ReadonlyContext('製作 REQ-2026-001 的報告草稿',s,m,'lms');assert.equal(c.intent,'REPORT_DRAFT');assert(c.items.some(x=>x.kind==='requests'&&x.id==='REQ-2026-001'));
});
const packet=mock=>({trace_id:'I-render-check',data:{engine:'E4',chat_mode:'GENERAL_CHAT',real_ai:!mock,execution_mode:mock?'MOCK':'LIVE_PROVIDER',provider:mock?'MOCK_HTTP_TRANSPORT':'openai_responses',provider_request_id:'req_test',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',result:{summary:'目前有 50 份委託單與 34 筆試驗排程。',citations:[]}}});
test('Live chat hides both technical headings while Mock disclosure remains immediate',()=>{
 const live=renderE4Reply(packet(false),'GENERAL_CHAT');assert(!live.includes('真實Provider回應'));assert(!live.includes('一般聊天／非正式試驗依據'));assert(live.startsWith('目前有 50'));
 assert(renderE4Reply(packet(true),'GENERAL_CHAT').startsWith('【MOCK測試：未呼叫真實模型'));
});
test('report presentation cannot claim measurements, signatures or saving',()=>{
 const p=packet(false);p.data.report_draft={kind:'DRAFT_ONLY',request_id:'REQ-2026-001',title:'高溫儲存試驗',measurements:'NOT_PROVIDED',verdict:'PENDING_ENGINEER_REVIEW',signatures:'NOT_SIGNED',saved_to_system:false};
 const text=renderE4Reply(p,'GENERAL_CHAT');assert(text.includes('量測結果：尚未提供'));assert(text.includes('未簽核，未提交至系統'));p.data.report_draft.saved_to_system=true;assert.throws(()=>renderE4Reply(p,'GENERAL_CHAT'),/CONTRACT_INVALID/);
});
