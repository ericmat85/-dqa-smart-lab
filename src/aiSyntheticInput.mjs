import {ALL_DEMO_REQUESTS} from './demoLmsRequests.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
const sensitive=/@|(?:sk-|ghp_|password|api[_ -]?key|postgres(?:ql)?:\/\/|公司|股份)/i;
function fail(code){throw Error(code);}
function pick(record,fields){const out={};for(const k of fields){const v=record?.[k];if(v===undefined||v===null||v==='')continue;if(!['string','number','boolean'].includes(typeof v)||String(v).length>240||sensitive.test(String(v))||typeof v==='number'&&!Number.isFinite(v))fail('AI_DTO_BLOCKED: UNSAFE_OR_INVALID_FIELD '+k);out[k]=v;}return out;}
function prove(record,seeds){const seed=seeds.find(r=>r.id===record?.id);if(!seed)fail('AI_DATA_BLOCKED: UNVERIFIED_SYNTHETIC_SOURCE');return seed;}
function verifyProjection(current,seed,fields){const out=pick(current,fields);for(const k of Object.keys(out))if(JSON.stringify(current[k])!==JSON.stringify(seed[k]))fail('AI_DATA_BLOCKED: MODIFIED_DEMO_FIELD '+k);return out;}
export function makeEngineInput(engine,record,context={}){
 if(!['E1','E2','E3'].includes(engine))fail('AI_DTO_BLOCKED: ENGINE_UNKNOWN');
 const seed=prove(record,engine==='E2'?DEMO_SCHEDULES:ALL_DEMO_REQUESTS);
 const fields=engine==='E2'?['title','requestedDate','quantity','testSpec','judgment']:['title','requestedDate','quantity','specification','judgment','productVersion','pcbaVersion','softwareVersion'];
 const data={source:'APPROVED_STATIC_DEMO',case_id:record.id,request:verifyProjection(record,seed,fields)};
 if(engine==='E1')Object.assign(data,{known_differences:'UNKNOWN',approval:'HUMAN_ONLY'});
 if(engine==='E2'){
  const equipment=context.equipment||DEMO_EQUIPMENT,match=equipment.find(e=>e.name===record.eq),approved=DEMO_EQUIPMENT.find(e=>e.id===match?.id);
  if(match&&!approved)fail('AI_DATA_BLOCKED: UNVERIFIED_EQUIPMENT');
  data.equipment=match?verifyProjection(match,approved,['id','name','specification','status']):null;
  // Legacy space-unit capacity is not a volume in litres.
  data.capacity_evidence='UNKNOWN';data.sample_volume_litres=null;data.compatibility='UNKNOWN';data.feasibility='UNKNOWN';
  data.busy_slots=(context.rows||DEMO_SCHEDULES).filter(r=>r.eq===record.eq&&r.time&&r.end).slice(0,3).map(r=>verifyProjection(r,prove(r,DEMO_SCHEDULES),['time','end']));
  data.personnel_evidence='UNKNOWN';data.writes='FORBIDDEN';
 }
 if(engine==='E3'){
  const measurements=context.measurements||[];
  if(!Array.isArray(measurements))fail('AI_DTO_BLOCKED: INVALID_MEASUREMENTS');
  if(measurements.length)fail('AI_DATA_BLOCKED: MEASUREMENT_PROVENANCE_NOT_VERIFIED');
  data.supplied_measurements=[];data.measurement_status='UNKNOWN_NO_VERIFIED_RESULTS';data.report_kind='ADVISORY_DRAFT_ONLY';data.signatures='FORBIDDEN';
 }
 const question='SYNTH '+JSON.stringify({engine,data});
 if(question.length>1500||new TextEncoder().encode(JSON.stringify({synthetic:true,question})).length>7000)fail('AI_DTO_BLOCKED: PAYLOAD_TOO_LARGE');
 return {synthetic:true,question};
}
export function selectDemoReport(id,snapshot){
 const current=snapshot?.electronic?.find(r=>r.id===id)||snapshot?.requests?.find(r=>r.id===id)||ALL_DEMO_REQUESTS.find(r=>r.id===id);
 if(!current)fail('AI_DATA_BLOCKED: REPORT_CASE_NOT_FOUND');return current;
}
