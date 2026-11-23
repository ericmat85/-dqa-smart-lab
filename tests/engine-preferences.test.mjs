import test from 'node:test';import assert from 'node:assert/strict';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';import {memoryStorage} from '../src/guidedTourStorage.mjs';
import {ENGINE_DEFAULTS,readEnginePreferences,validateEnginePreferences,saveEnginePreferences,requireEngineEnabled,enginePreferenceKey} from '../src/enginePreferences.mjs';
import {e3SourceStamp} from '../src/e3ReportDraft.mjs';
import {stageReportDraftHandoff,takeReportDraftHandoff,clearReportDraftHandoff} from '../src/reportDraftHandoff.mjs';
import {beginE3Activity,finishE3Activity,readE3Activity,clearE3Activity} from '../src/e3Activity.mjs';
import {observeE4Local,readE4Activity,clearE4Activity,summarizeE4Activity,e4ErrorLayer} from '../src/e4Activity.mjs';
const admin=INITIAL_ACCOUNTS.find(a=>a.id==='U001'),engineer=INITIAL_ACCOUNTS.find(a=>a.id==='U003');
const setup=()=>({storage:memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS)}),session:memoryStorage({'dqa-lms-account-id':'U001'})});
test('bounded preferences cannot introduce provider, budget, history or unknown fields',()=>{
 for(const engine of ['E3','E4']){assert.deepEqual(readEnginePreferences(engine,memoryStorage({})).settings,ENGINE_DEFAULTS[engine]);for(const extra of ['apiKey','budget','history','providerEnabled'])assert.throws(()=>validateEnginePreferences(engine,{...ENGINE_DEFAULTS[engine],[extra]:true}));}
 for(const patch of [{speed:14},{speed:81},{speed:1.1},{enabled:'true'},{punctuation:null}])assert.throws(()=>validateEnginePreferences('E4',{...ENGINE_DEFAULTS.E4,...patch}));
 for(const patch of [{extraLimit:9},{extraLimit:-1},{preset:'__proto__'},{title:'x'.repeat(41)},{title:''}])assert.throws(()=>validateEnginePreferences('E3',{...ENGINE_DEFAULTS.E3,...patch}));
});
test('fresh management authority, revision conflict, persistence failure and pause remain effective',()=>{
 const {storage}=setup(),saved=saveEnginePreferences('E4',{...ENGINE_DEFAULTS.E4,speed:20},admin,{storage,expectedRevision:0});assert.equal(saved.revision,1);
 assert.throws(()=>saveEnginePreferences('E4',ENGINE_DEFAULTS.E4,admin,{storage,expectedRevision:0}),/其他分頁/);
 assert.throws(()=>saveEnginePreferences('E3',ENGINE_DEFAULTS.E3,engineer,{storage,expectedRevision:0}),/權限/);
 storage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS.map(a=>a.id==='U001'?{...a,status:'已停用'}:a)));assert.throws(()=>saveEnginePreferences('E3',ENGINE_DEFAULTS.E3,admin,{storage,expectedRevision:0}),/權限/);
 storage.setItem(enginePreferenceKey('E4'),'broken');assert.throws(()=>readEnginePreferences('E4',storage),/未重置/);assert.equal(storage.getItem(enginePreferenceKey('E4')),'broken');
 const next=setup();saveEnginePreferences('E3',{...ENGINE_DEFAULTS.E3,enabled:false},admin,{storage:next.storage,expectedRevision:0});assert.throws(()=>requireEngineEnabled('E3',next.storage),/暫停/);
});
test('report source stamp tracks selected data, schema and scope without losing sources',()=>{
 const source={columns:[{key:'id',label:'編號'},{key:'result',label:'結果'}],rows:[{id:'REQ-2026-001',result:'',secret:'not selected'}],scope:'all'};const first=e3SourceStamp(source);
 assert(!first.includes('not selected'));assert.equal(first,e3SourceStamp({...source,rows:[{...source.rows[0],secret:'different'}]}));assert.notEqual(first,e3SourceStamp({...source,rows:[{...source.rows[0],result:'new'}]}));assert.notEqual(first,e3SourceStamp({...source,scope:'filtered'}));assert.equal(e3SourceStamp({...source,rows:Array(5001).fill(source.rows[0])}),null);
});
test('handoff contains only a strict request identifier, expires and cannot cross identities',()=>{
 const env=setup();clearReportDraftHandoff();assert.throws(()=>stageReportDraftHandoff('https://invalid/',env));stageReportDraftHandoff('REQ-2026-001',{...env,now:1000});assert.deepEqual(takeReportDraftHandoff({...env,now:1001}),{requestId:'REQ-2026-001'});assert.equal(takeReportDraftHandoff(env),null);
 stageReportDraftHandoff('REQ-2026-001',{...env,now:1000});assert.throws(()=>takeReportDraftHandoff({...env,now:301001}),/過期/);
 stageReportDraftHandoff('REQ-2026-001',{...env,now:1000});env.session.setItem('dqa-lms-account-id','U003');assert.throws(()=>takeReportDraftHandoff({...env,now:1001}));assert.equal(takeReportDraftHandoff(env),null);
});
test('observations never become provider usage, contain no content and retain isolation',()=>{
 clearE3Activity();clearE4Activity('lms');const t=beginE3Activity('U001',{preset:'special',rowCount:5});finishE3Activity(t,{status:'SUCCESS',trace:'I-local-only'});assert.equal(readE3Activity('U001').length,1);assert.equal(readE3Activity('U003').length,0);assert(!JSON.stringify(readE3Activity('U001')).includes('report body'));
 observeE4Local({system:'lms',accountId:'U001',route:'FAQ'});observeE4Local({system:'lms',accountId:'U001',route:'RULE',status:'ERROR',errorCode:'IDENTITY_SCOPE_DENIED'});
 const records=readE4Activity('lms','U001'),stats=summarizeE4Activity(records);assert.equal(stats.requests,0);assert.equal(stats.faq,1);assert.equal(stats.scopeBlocked,1);assert.equal(stats.live.count,0);assert.equal(stats.mock.count,0);assert(records.every(r=>r.model===null&&r.inputTokens===null&&r.costUsd===null));assert.equal(readE4Activity('request','U001').length,0);
 assert.equal(e4ErrorLayer('ORIGIN_DENIED'),'Proxy Origin');assert.equal(e4ErrorLayer('AUTHENTICATION_REQUIRED'),'待核對來源');clearE3Activity();clearE4Activity('lms');
});
