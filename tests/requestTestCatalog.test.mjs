import test from 'node:test';
import assert from 'node:assert/strict';
import {testOptions,getTestReference,buildSpecification,buildAcceptanceCriteria} from '../src/requestTestCatalog.mjs';
import {trialProfile} from '../src/trialProfiles.mjs';
import {explicitHours,sourceConditions} from '../src/trialSourceFacts.mjs';
import {prepareScheduleTrialForm} from '../src/scheduleTrialInput.mjs';
import {makeE2Context} from '../src/e2Scheduling.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';

test('twenty concrete trial choices cover all existing profiles and omit the other option',()=>{
 assert.equal(testOptions.length,20);assert.equal(new Set(testOptions).size,20);assert(!testOptions.includes('其他'));
 assert.equal(new Set(testOptions.map(name=>getTestReference(name).profileId)).size,19);
 assert(testOptions.includes('高溫運作試驗'));assert(testOptions.includes('高溫試驗'));
 assert.match(getTestReference('高溫運作試驗').specification,/通電電壓、負載/);
 assert.match(getTestReference('高溫試驗').specification,/儲存或不通電/);
 assert.equal(getTestReference('其他'),null);assert.equal(getTestReference('不存在的試驗'),null);
});
test('every editable reference round-trips through the real source parser without conflicting conditions or hours',()=>{
 for(const name of testOptions){
  const profile=trialProfile(name),reference=getTestReference(name),text=buildSpecification([name]);
  assert(profile.aliases.includes(name),name);assert.equal(reference.synthetic,true);assert.equal(reference.officialStandard,false);
  assert.match(text,/合成 Demo/);assert.match(text,/非核准正式規範/);assert.equal(explicitHours({specification:text}),profile.hours,name);
  assert.deepEqual(sourceConditions({specification:text}).conditions,profile.conditions,name);
  assert(buildAcceptanceCriteria(name),name);assert(text.includes(reference.specification),name);
 }
 assert.match(getTestReference('高溫高濕').duration,/250/);assert.match(getTestReference('高溫高濕').calendar,/跨週末/);
 assert.match(getTestReference('振動試驗').duration,/20/);assert.match(getTestReference('振動試驗').calendar,/跳過週末/);
 assert(buildAcceptanceCriteria('機械衝擊')); // Saved legacy names remain readable.
});
test('all twenty request titles produce valid dynamic scheduling contracts from their selected reference text',()=>{
 const now=Date.parse('2026-11-19T12:00:00+08:00');
 for(const [index,title] of testOptions.entries()){
  const requestId='REQ-2026-'+index.toString(16).padStart(8,'0'),specification=buildSpecification([title]);
  const editing={id:'SCH-'+requestId,requestId,title,quantity:'3',status:'未排程',testSpec:specification};
  const request={id:requestId,specification};
  const prepared=prepareScheduleTrialForm({editing,request,form:{time:'2026-11-20',end:'',equipmentCount:1,sampleSpaceUnits:1,sampleCode:'SYNTHETIC-CATALOG'},now});
  const context=makeE2Context({editing,form:prepared.form,equipment:structuredClone(DEMO_EQUIPMENT),accounts:INITIAL_ACCOUNTS,rows:[],now});
  assert.equal(context.request.test_title,title);assert.equal(context.request.profile_id,trialProfile(title).id);
  assert.equal(context.request.duration_hours,trialProfile(title).hours);assert.equal(prepared.provenance.generated_conditions,false);
  assert.equal(prepared.provenance.generated_duration,false);assert(!('customer' in context));
 }
});
