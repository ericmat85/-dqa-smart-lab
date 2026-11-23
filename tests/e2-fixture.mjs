import catalog from '../render-backend/gateway/e2_demo_catalog.json' with {type:'json'};
import {makeE2Context,e2Fingerprint} from '../src/e2Scheduling.mjs';
import {DEMO_SCHEDULES} from '../src/demoSchedules.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
export function e2Fixture(){
 const now=Date.now(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),date=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const editing=structuredClone(DEMO_SCHEDULES[4]),equipment=structuredClone(DEMO_EQUIPMENT),accounts=structuredClone(INITIAL_ACCOUNTS),rows=structuredClone(DEMO_SCHEDULES);
 const form={equipmentId:'EQ-003',equipmentIds:[],equipmentCount:1,ownerId:'U003',owner:'黃小明',sampleCode:'SMP-E2-SYNTHETIC',time:date(1),end:date(2),searchUntil:date(7),sampleVolumeLitres:1,preparationMinutes:0,cleanupMinutes:0,note:'',conditions:{temperatureMin:-20,temperatureMax:80,humidityMin:'',humidityMax:''}};
 return {now,editing,equipment,accounts,rows,form,context:makeE2Context({editing,form,equipment,accounts,rows,now})};
}
export async function e2Packet(context){
 const candidate={equipment_ids:['EQ-003'],owner_id:'U003',start:context.request.earliest,end:new Date(Date.parse(context.request.earliest)+86400000*(context.request.duration_days-1)).toISOString().slice(0,10),allocations:[{equipment_id:'EQ-003',quantity:context.request.quantity,capacity:8,evidence_id:'SYNTH-E2-CHAMBER-EQ-003-v1'}],sample_evidence_id:catalog.cases.find(x=>x.id===context.request.id).sample.evidence_id};
 candidate.id='P-'+(await e2Fingerprint(candidate)).slice(0,20);
 const trace='I-SYNTHETIC-E2-TEST';
 return {scope:'SYNTHETIC_PREVIEW_SCHEDULING_ADVICE_ONLY',synthetic:true,trace_id:trace,data:{engine:'E2',trace_id:trace,request_id:'O-'+'a'.repeat(64),conversation_id:'a'.repeat(32),writes:'NONE',requires_confirmation:true,synthetic:true,execution_mode:'RULE_BASED_ONLY',real_ai:false,provider:'NONE',provider_status:'E2_SPEND_APPROVAL_REQUIRED',summary:'規則檢查；未呼叫模型。',risks:[],selected_candidate_id:candidate.id,assessment:{status:'PROPOSAL_AVAILABLE',reasons:[],candidates:[candidate],context_fingerprint:await e2Fingerprint(context),synthetic:true,capacity_source:'SYNTHETIC_DIMENSION_DOCUMENTS',writes:'NONE',requires_confirmation:true}}};
}
