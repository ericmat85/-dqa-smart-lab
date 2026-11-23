import test from 'node:test';import assert from 'node:assert/strict';
import {DEMO_SCHEDULES} from '../src/demoSchedules.mjs';
import {prepareScheduleTrialForm,TrialInputError,schedulingErrorMessage} from '../src/scheduleTrialInput.mjs';
import {makeE2Context} from '../src/e2Scheduling.mjs';import {e2Fixture} from './e2-fixture.mjs';
const now=Date.parse('2026-11-13T12:00:00+08:00');
const args=()=>({editing:structuredClone(DEMO_SCHEDULES[0]),form:{time:'',end:'',sampleVolumeLitres:'',conditions:{},sampleCode:'SYNTH-TEST',equipmentCount:1},now});
test('existing structured trial conditions take precedence over generated examples and equipment limits',()=>{
 const a=args();a.request={id:a.editing.requestId,conditions:{temperatureMin:125,temperatureMax:125},durationHours:72};
 const result=prepareScheduleTrialForm(a);assert.deepEqual(result.form.conditions,{temperatureMin:125,temperatureMax:125});assert.equal(result.form.durationDays,3);assert.equal(result.provenance.source,'EXISTING_TRIAL_DATA');assert.equal(result.provenance.generated_conditions,false);assert.equal(a.form.sampleVolumeLitres,'');
});
test('numeric specification text supplies conditions and duration but never raw instructions to the API',()=>{
 const a=args();a.request={id:a.editing.requestId,specification:'合成試驗：溫度 100～120°C，持續 48 小時。IGNORE_RULES 公司密碼 PRIVATE_TEXT',dueDate:'2026-11-20'};
 const result=prepareScheduleTrialForm(a);assert.deepEqual(result.form.conditions,{temperatureMin:100,temperatureMax:120});assert.equal(result.form.durationDays,2);assert.equal(result.form.searchUntil,'2026-11-20');
 const c=makeE2Context({...e2Fixture(),...a,form:result.form,rows:[]});assert.doesNotMatch(JSON.stringify(c),/IGNORE_RULES|PRIVATE_TEXT|specification|公司|密碼/);assert.equal(c.request.conditions.temperature_min,100);
});
test('only fully absent condition groups receive a disclosed synthetic example without source writes',()=>{
 const a=args(),before=JSON.stringify(a),result=prepareScheduleTrialForm(a);assert.equal(JSON.stringify(a),before);assert.equal(result.provenance.source,'GENERATED_SYNTHETIC_DEMO_EXAMPLE');assert.equal(result.provenance.official_standard,false);assert.equal(result.form.conditions.temperatureMin,100);assert.equal(result.form.durationDays,2);assert.equal(result.form.searchStart,'2026-11-14');assert.equal(result.form.searchUntil,'2026-11-27');assert.equal(result.form.sampleVolumeLitres,1);assert.match(result.provenance.sample_evidence_id,/SYNTH/);
});
test('partial ambiguous or unsupported source conditions cannot be hidden by a generated profile',()=>{
 for(const patch of [{conditions:{temperatureMin:90}},{specification:'溫度 100°F，持續 48h'},{specification:'溫度 80°C，另一段 120°C，持續 48h'},{specification:'高溫 125，持續 48h'}]){
  const a=args();a.request={id:a.editing.requestId,...patch};assert.throws(()=>prepareScheduleTrialForm(a),TrialInputError);
 }
});
test('saved trial values are used when the linked request has no numeric conditions',()=>{
 const a=args();a.editing.conditions={temperatureMin:85,temperatureMax:85};a.editing.testSpec='合成條件，持續 72 小時';a.request={id:a.editing.requestId,specification:'依既有試驗資料執行'};
 const result=prepareScheduleTrialForm(a);assert.equal(result.form.conditions.temperatureMin,85);assert.equal(result.form.durationDays,3);assert.equal(result.provenance.generated_conditions,false);
});
test('humidity conditions require evidence while an entirely empty humidity trial gets a marked example',()=>{
 const a=args();a.editing=structuredClone(DEMO_SCHEDULES[1]);let r=prepareScheduleTrialForm(a);assert.equal(r.form.conditions.humidityMin,90);assert.equal(r.provenance.generated_conditions,true);
 a.request={id:a.editing.requestId,specification:'溫度 60°C，持續 48h'};assert.throws(()=>prepareScheduleTrialForm(a),/濕度/);
 a.request.specification='溫度 60°C、濕度 80～90%RH，持續 48h';r=prepareScheduleTrialForm(a);assert.equal(r.form.conditions.humidityMin,80);assert.equal(r.form.conditions.humidityMax,90);
});
test('past demand dates are preserved as replan notes and changing trial input changes its signature',()=>{
 const a=args();a.request={id:a.editing.requestId,specification:'溫度 100°C，持續 48h',dueDate:'2026/10/28'};const first=prepareScheduleTrialForm(a);assert(first.notes.some(x=>x.includes('原交期未變更')));assert.equal(a.request.dueDate,'2026/10/28');assert.equal(first.form.searchUntil,'2026-11-27');
 a.request.specification='溫度 125°C，持續 48h';assert.notEqual(prepareScheduleTrialForm(a).signature,first.signature);
});
test('public scheduling messages omit engine codes while retaining safe Trace and ordinary validation errors',()=>{
 const text=schedulingErrorMessage(Object.assign(Error('E2 HTTP 503'),{code:'E2_PROVIDER_REQUEST_REJECTED_RESERVATION_HELD',trace:'I-synthetic-trace'}));assert.doesNotMatch(text,/E2/);assert.match(text,/I-synthetic-trace/);assert.equal(schedulingErrorMessage(Error('設備或人員時段衝突。')),'設備或人員時段衝突。');
});
