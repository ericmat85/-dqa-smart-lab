import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {memoryStorage} from '../src/guidedTourStorage.mjs';
import {E2_DEFAULTS,E2_SETTINGS_KEY,readE2Settings,saveE2Settings,resetE2Settings,requireE2Enabled,applyE2Settings} from '../src/e2PlanningSettings.mjs';
import {beginE2Activity,stageE2Activity,contextE2Activity,finishE2Activity,draftE2Activity,readE2Activity,clearE2Activity,summarizeE2Activity} from '../src/e2Activity.mjs';
import {e2Fixture} from './e2-fixture.mjs';
const admin=INITIAL_ACCOUNTS.find(a=>a.id==='U001'),reader=INITIAL_ACCOUNTS.find(a=>a.id==='DEMO-LEVEL3');
const storage=()=>memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS),'dqa-schedules-demo-v1':'UNCHANGED_BUSINESS_DATA'});
beforeEach(()=>clearE2Activity());
test('planning defaults are backwards compatible and reading them writes nothing',()=>{
 const s=storage(),before={...s};assert.deepEqual(readE2Settings(s).settings,E2_DEFAULTS);assert.deepEqual({...s},before);
});
test('fresh RBAC, bounded values and strict fields protect preference writes without changing business data',()=>{
 const s=storage();assert.throws(()=>saveE2Settings({...E2_DEFAULTS},reader,{storage:s,expectedRevision:0}),/權限/);
 assert.throws(()=>saveE2Settings({...E2_DEFAULTS},{...admin,id:'U003',role:'系統管理員'},{storage:s,expectedRevision:0}),/權限/);
 for(const patch of [{searchDays:15},{searchDays:0},{preparationMinutes:-1},{cleanupMinutes:121},{searchDays:1.5},{enabled:1},{apiKey:'DO_NOT_STORE'}])assert.throws(()=>saveE2Settings({...E2_DEFAULTS,...patch},admin,{storage:s,expectedRevision:0}));
 const result=saveE2Settings({...E2_DEFAULTS,searchDays:7,preparationMinutes:30,cleanupMinutes:15},admin,{storage:s,expectedRevision:0});assert.equal(result.events[0].actorId,'U001');assert.equal(readE2Settings(s).settings.searchDays,7);assert.equal(s.getItem('dqa-schedules-demo-v1'),'UNCHANGED_BUSINESS_DATA');
});
test('concurrent preference edits do not overwrite newer values',()=>{
 const s=storage();saveE2Settings({...E2_DEFAULTS,searchDays:7},admin,{storage:s,expectedRevision:0});
 assert.throws(()=>saveE2Settings({...E2_DEFAULTS,searchDays:10},admin,{storage:s,expectedRevision:0}),/其他頁面/);assert.equal(readE2Settings(s).settings.searchDays,7);
});
test('planning windows and buffers use settings without changing trial requirements or an earlier deadline',()=>{
 const f=e2Fixture(),form={...f.form,searchStart:f.context.request.earliest,searchUntil:new Date(Date.parse(f.context.request.earliest+'T00:00:00Z')+13*86400000).toISOString().slice(0,10),durationDays:2,preparationMinutes:60},before=structuredClone(form);
 const settings={...E2_DEFAULTS,searchDays:7,preparationMinutes:30,cleanupMinutes:15},next=applyE2Settings({editing:f.editing,form,settings,now:f.now});
 assert.equal(Date.parse(next.searchUntil)-Date.parse(next.searchStart),6*86400000);assert.equal(next.preparationMinutes,60);assert.equal(next.cleanupMinutes,15);assert.deepEqual(form,before);assert.deepEqual(next.conditions,form.conditions);assert.equal(next.durationDays,2);
 const short={...form,searchUntil:new Date(Date.parse(form.searchStart+'T00:00:00Z')+2*86400000).toISOString().slice(0,10)};assert.equal(applyE2Settings({editing:f.editing,form:short,settings,now:f.now}).searchUntil,short.searchUntil);
 assert.throws(()=>applyE2Settings({editing:f.editing,form,settings:{...settings,searchDays:1},now:f.now}),/搜尋期間不足/);
});
test('paused or corrupt preferences fail closed; only explicit authorized reset replaces corruption',()=>{
 const s=storage();saveE2Settings({...E2_DEFAULTS,enabled:false},admin,{storage:s,expectedRevision:0});assert.throws(()=>requireE2Enabled(s),/暫停/);
 s.setItem(E2_SETTINGS_KEY,'{broken');assert.throws(()=>readE2Settings(s),/停止新排程/);assert.equal(s.getItem(E2_SETTINGS_KEY),'{broken');assert.throws(()=>resetE2Settings(reader,{storage:s}),/權限/);resetE2Settings(admin,{storage:s});assert.equal(requireE2Enabled(s).settings.enabled,true);
});
const reply=(mode='MOCK')=>({engine:'E2',trace_id:'I-E2-MANAGEMENT',request_id:'O-'+'a'.repeat(64),execution_mode:mode,real_ai:mode==='LIVE_PROVIDER',provider:mode==='LIVE_PROVIDER'?'openai_responses':mode==='MOCK'?'MOCK_HTTP_TRANSPORT':'NONE',model:mode==='MOCK'?'MOCK_ONLY':'gpt-6-luna',provider_request_id:'req_MOCK_MANAGEMENT',provider_response_id:'resp_MOCK_MANAGEMENT',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',assessment:{status:'PROPOSAL_AVAILABLE',candidates:[{}],reasons:[]}});
test('monitor preserves phases, validated response metadata and manual draft save state without retaining input',()=>{
 const t=beginE2Activity('DEMO-LEVEL1',100);stageE2Activity(t,'UPSTREAM',101);contextE2Activity(t,{request:{id:'SCH-026-03',profile_id:'VIBRATION_DURABILITY',quantity:3,equipment_count:1,preparation_minutes:30,cleanup_minutes:15},question:'PRIVATE_INPUT',password:'PRIVATE_PASSWORD'},E2_DEFAULTS,102);
 assert.equal(readE2Activity('DEMO-LEVEL1',103)[0].status,'PENDING');finishE2Activity(t,{status:'SUCCESS',httpStatus:200,data:reply()},150);assert.equal(draftE2Activity(t,'SAVED',151),false);draftE2Activity(t,'APPLIED',151);draftE2Activity(t,'SAVED',152);
 const rows=readE2Activity('DEMO-LEVEL1',155);assert.equal(rows[0].draft,'SAVED');assert.equal(rows[0].traceId,'I-E2-MANAGEMENT');assert.equal(rows[0].durationMs,50);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_INPUT|PRIVATE_PASSWORD|question|password/);assert.equal(summarizeE2Activity(rows).mock.costUsd,'0.000028');assert.equal(summarizeE2Activity(rows).live.count,0);
});
test('unknown and infeasible rule-only responses never claim model usage or become saved proposals',()=>{
 for(const status of ['UNKNOWN','INFEASIBLE_IN_WINDOW']){const t=beginE2Activity('DEMO-LEVEL1',100),d=reply('RULE_BASED_ONLY');d.assessment={status,candidates:[],reasons:['RESOURCE_OR_RESERVATION_COVERAGE_INCOMPLETE','PRIVATE free text']};finishE2Activity(t,{status:'SUCCESS',httpStatus:200,data:d},110);assert.equal(draftE2Activity(t,'APPLIED',111),false);}
 const rows=readE2Activity('DEMO-LEVEL1',120),stats=summarizeE2Activity(rows);assert.equal(stats.unknown,1);assert.equal(stats.infeasible,1);assert.equal(stats.rules,2);assert.equal(stats.mock.count,0);assert.equal(stats.live.count,0);assert(rows.every(r=>r.inputTokens===null&&r.costUsd===null));assert(!JSON.stringify(rows).includes('PRIVATE free text'));
});
test('failure and cancellation preserve trace and unknown fees without accepting unverified usage',()=>{
 for(const state of ['ERROR','CANCELLED']){const t=beginE2Activity('DEMO-LEVEL1',100);stageE2Activity(t,'UPSTREAM',101);finishE2Activity(t,{status:state,httpStatus:503,traceId:'I-SAFE-ERROR',errorCode:'UPSTREAM_TIMEOUT',data:reply()},150);}
 const rows=readE2Activity('DEMO-LEVEL1',160);assert(rows.every(r=>r.costUsd===null&&r.inputTokens===null&&r.failurePhase==='UPSTREAM'));assert.equal(rows[0].traceId,'I-E2-MANAGEMENT');assert.equal(summarizeE2Activity(rows).live.count,0);
});
test('retention, account isolation and late completion after clear cannot resurrect observation data',()=>{
 const t=beginE2Activity('DEMO-LEVEL1',100);assert.deepEqual(readE2Activity('DEMO-LEVEL2',101),[]);clearE2Activity('DEMO-LEVEL1');assert.equal(finishE2Activity(t,{status:'SUCCESS',data:reply()},102),false);
 for(let i=0;i<45;i++)beginE2Activity('DEMO-LEVEL1',100+i);assert.equal(readE2Activity('DEMO-LEVEL1',200).length,40);assert.deepEqual(readE2Activity('DEMO-LEVEL1',31*60000),[]);
 const hidden=beginE2Activity('DEMO-LEVEL1',200);contextE2Activity(hidden,{request:{id:'PRIVATE_SECRET',profile_id:'PRIVATE_SECRET'}},E2_DEFAULTS,201);assert.equal(readE2Activity('DEMO-LEVEL1',202)[0].trialId,null);assert.equal(readE2Activity('DEMO-LEVEL1',202)[0].profileId,null);
});

test('offline claimed-format Provider metadata is separated from Mock and incomplete usage remains unknown',()=>{
 const a=beginE2Activity('DEMO-LEVEL1',100);finishE2Activity(a,{status:'SUCCESS',data:reply()},110);
 const b=beginE2Activity('DEMO-LEVEL1',111);finishE2Activity(b,{status:'SUCCESS',data:reply('LIVE_PROVIDER')},120);
 let stats=summarizeE2Activity(readE2Activity('DEMO-LEVEL1',121));assert.equal(stats.mock.count,1);assert.equal(stats.live.count,1);assert.equal(stats.mock.costUsd,'0.000028');assert.equal(stats.live.costUsd,'0.000028');
 const c=beginE2Activity('DEMO-LEVEL1',122),incomplete=reply('LIVE_PROVIDER');delete incomplete.estimated_cost_usd;delete incomplete.usage.output_tokens;finishE2Activity(c,{status:'SUCCESS',data:incomplete},130);stats=summarizeE2Activity(readE2Activity('DEMO-LEVEL1',131));assert.equal(stats.live.costUsd,null);assert.equal(stats.live.complete,false);
});
