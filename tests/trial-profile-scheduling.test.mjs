import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEMO_SCHEDULES} from '../src/demoSchedules.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {TRIAL_PROFILES,trialProfile,trialExecution,executionFraction,shiftedOperationAllowed} from '../src/trialProfiles.mjs';
import {explicitHours} from '../src/trialSourceFacts.mjs';
import {prepareScheduleTrialForm,prepareManualTrialForm} from '../src/scheduleTrialInput.mjs';
import {makeE2Context,verifyE2Result,makeE2Draft,validateE2Applied} from '../src/e2Scheduling.mjs';
import {equipmentMatches,validateSchedule} from '../src/scheduleEquipment.mjs';
import {scheduleProgress} from '../src/scheduleProgress.mjs';
import {testOptions} from '../src/requestTestCatalog.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const now=Date.parse('2026-11-19T12:00:00+08:00');
function fixture(kind='vibration',quantity=3){
 const editing=kind==='vibration'?{...structuredClone(DEMO_SCHEDULES[2]),quantity:String(quantity)}:{id:'SCH-REQ-2026-aabbccdd',requestId:'REQ-2026-aabbccdd',title:'高溫高濕',quantity:String(quantity),status:'未排程',testSpec:''};
 const equipment=structuredClone(DEMO_EQUIPMENT),accounts=structuredClone(INITIAL_ACCOUNTS),rows=[];
 const original={time:'2026-11-20',end:'',sampleCode:'SYNTHETIC-PROFILE',equipmentCount:1,equipmentId:kind==='vibration'?'EQ-010':'EQ-006',sampleSpaceUnits:1,conditions:{},sampleVolumeLitres:1,note:''};
 const prepared=prepareScheduleTrialForm({editing,form:original,now});const form=prepared.form;
 return {editing,equipment,accounts,rows,form,now,prepared,context:makeE2Context({editing,equipment,accounts,rows,form,now})};
}
function backend(f){
 const program="import json,sys; from gateway.e2_scheduling import evaluate; v=json.load(sys.stdin); print(json.dumps(evaluate(v['context'],v['now']/1000)))";
 const p=spawnSync('python',['-B','-c',program],{cwd:root,input:JSON.stringify({context:f.context,now:f.now}),encoding:'utf8',env:{PATH:process.env.PATH,PYTHONPATH:root+'/render-backend',LANG:'C.UTF-8'}});
 assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
}
function packet(assessment){const trace='I-SYNTHETIC-PROFILE-TEST';return {scope:'SYNTHETIC_PREVIEW_ONLY',synthetic:true,trace_id:trace,data:{engine:'E2',trace_id:trace,writes:'NONE',requires_confirmation:true,summary:'離線確定性規則，未呼叫模型。',risks:[],assessment,execution_mode:'RULE_BASED_ONLY',real_ai:false,provider:'NONE',selected_candidate_id:assessment.candidates[0]?.id??null}};}

test('every known trial option and seeded schedule has a profile; unknown/mixed trials are not guessed',()=>{
 for(const name of testOptions.filter(x=>x!=='其他'))assert(trialProfile(name),name);
 for(const row of DEMO_SCHEDULES)assert(trialProfile(row.title),row.title);
 assert.equal(trialProfile('其他'),null);assert.equal(trialProfile('高溫高濕、振動試驗'),null);
 assert(TRIAL_PROFILES.every(p=>p.official_standard===false));
});
test('humidity runs exactly 250 hours across weekends and only compatible humidity-capable machines are proposed',async()=>{
 const f=fixture('humidity');assert.equal(f.form.durationHours,250);assert.equal(f.form.durationDays,11);
 assert(equipmentMatches('高溫高濕試驗',{name:'環境試驗箱 #01'}));assert(equipmentMatches('高溫高濕試驗',{name:'恆溫恆濕機 B'}));assert(!equipmentMatches('高溫高濕試驗',{name:'振動試驗機'}));
 const a=backend(f);assert.equal(a.status,'PROPOSAL_AVAILABLE');
 const p=packet(a);await verifyE2Result(p,f.context);const draft=makeE2Draft({...f,candidate:a.candidates[0]});
 const saved=validateE2Applied({...f,form:draft.form,approved:draft});assert.equal(saved.trialExecution.hours_per_batch,250);assert.equal(saved.trialExecution.end_ms-saved.trialExecution.start_ms,250*3600000);assert.equal(saved.end,'2026-11-30');
 assert(saved.equipmentIds.every(id=>['EQ-006','EQ-008'].includes(id)));assert.equal(scheduleProgress(saved,saved.trialExecution.start_ms+125*3600000).fraction,.5);
});
test('vibration three samples uses one machine serially for 20h each and three weekdays across the weekend',async()=>{
 const f=fixture();assert.equal(f.form.durationHours,20);assert.equal(f.form.durationDays,3);
 const a=backend(f);assert.equal(a.status,'PROPOSAL_AVAILABLE');const c=a.candidates[0];assert.deepEqual(c.equipment_ids,['EQ-010']);assert.equal(c.allocations[0].capacity,1);assert.equal(c.allocations[0].quantity,3);assert.equal(c.end,'2026-11-24');
 await verifyE2Result(packet(a),f.context);const before=JSON.stringify(f.rows),draft=makeE2Draft({...f,candidate:c}),saved=validateE2Applied({...f,form:draft.form,approved:draft});assert.equal(JSON.stringify(f.rows),before);
 const plan=saved.trialExecution;assert.deepEqual(plan.working_dates,['2026-11-20','2026-11-23','2026-11-24']);assert.equal(plan.segments.length,3);assert(plan.segments.every(s=>s.quantity===1&&s.end_ms-s.start_ms===20*3600000));assert.equal(plan.total_sample_hours,60);
 for(const stamp of ['2026-11-20T21:00:00+08:00','2026-11-21T12:00:00+08:00','2026-11-22T12:00:00+08:00'])assert.equal(scheduleProgress(saved,Date.parse(stamp)).fraction,1/3);
 assert.equal(scheduleProgress(saved,Date.parse('2026-11-24T20:00:00+08:00')).phase,'elapsed');
});
test('quantities scale as operation days and multiple machines never process two samples at once',()=>{
 const p=trialProfile('振動耐久試驗');
 for(const quantity of [1,2,3,5,9]){const e=trialExecution(p,'2026-11-20',[{equipment_id:'EQ-010',quantity,capacity:99}],20);assert.equal(e.working_dates.length,quantity);assert(e.segments.every(s=>s.quantity===1));assert.equal(e.total_sample_hours,quantity*20);}
 const e=trialExecution(p,'2026-11-20',[{equipment_id:'EQ-009',quantity:2,capacity:1},{equipment_id:'EQ-010',quantity:1,capacity:1}],20);assert.equal(e.end_date,'2026-11-23');assert.equal(executionFraction(e,e.end_ms),1);
});
test('manual schedule uses the same duration, capacity and weekend rules without hidden litre requirements',()=>{
 const f=fixture(),manual=prepareManualTrialForm({editing:f.editing,form:{...f.form,ownerId:'U003'},updateEnd:true});assert.equal(manual.end,'2026-11-24');
 delete manual.sampleVolumeLitres;const saved=validateSchedule({...f,form:manual,today:'2026-11-19'});assert.equal(saved.allocations[0].quantity,3);assert.equal(saved.trialExecution.segments.length,3);
 assert.throws(()=>validateSchedule({...f,form:{...manual,end:'2026-11-20'},today:'2026-11-19'}),/2026-11-24/);
 assert.throws(()=>prepareManualTrialForm({editing:f.editing,form:{...manual,time:'2026-11-21'},updateEnd:true}),/週末/);
});
test('explicit trial data is retained and fixed-hour conflicts fail closed instead of being overwritten',()=>{
 const f=fixture('humidity');const request={id:f.editing.requestId,specification:'溫度 85°C；濕度 85%RH；持續 250h'};
 const r=prepareScheduleTrialForm({...f,request});assert.equal(r.form.conditions.temperatureMin,85);assert.equal(r.form.conditions.humidityMin,85);assert.equal(r.form.durationHours,250);
 assert.throws(()=>prepareScheduleTrialForm({...f,request:{...request,durationHours:48}}),/固定 250/);
});
test('missing evidence remains UNKNOWN, known short windows are bounded infeasible, and declarations cannot change fixed hours',()=>{
 const f=fixture();f.context.equipment_complete=false;assert.equal(backend(f).status,'UNKNOWN');f.context.equipment_complete=true;
 f.context.request.deadline='2026-11-20';assert.equal(backend(f).status,'INFEASIBLE_IN_WINDOW');
 const p=trialProfile('高溫高濕');assert.throws(()=>trialExecution(p,'2026-11-20',[{equipment_id:'EQ-006',quantity:1,capacity:6}],48),/FIXED/);
});
test('resume shifts that would introduce weekend operation are blocked, while full-week shifts remain safe',()=>{
 const p=trialExecution(trialProfile('振動耐久試驗'),'2026-11-18',[{equipment_id:'EQ-010',quantity:3,capacity:1}],20),cut=p.start_ms+5*3600000;
 assert.equal(shiftedOperationAllowed(p,24*3600000,cut),false);assert.equal(shiftedOperationAllowed(p,7*24*3600000,cut),true);
});
test('minutes are read as source facts and missing cycle-to-hours evidence is not silently generated',()=>{
 assert.equal(explicitHours({testSpec:'試驗時間 30 分鐘'}),.5);assert.equal(explicitHours({durationMinutes:90}),1.5);assert.throws(()=>explicitHours({testSpec:'持續 100 cycles'}),/未以範例覆蓋/);
});
