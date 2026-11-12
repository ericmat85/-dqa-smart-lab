// Client contract tests use in-memory HTTP responses only; no model or network calls.
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ALL_DEMO_REQUESTS} from '../src/demoLmsRequests.mjs';
import {DEMO_SCHEDULES} from '../src/demoSchedules.mjs';
import {readLabSnapshot,deriveLabMetrics} from '../src/labData.mjs';
import {readE4Activity,clearE4Activity} from '../src/e4Activity.mjs';

let code=fs.readFileSync(new URL('../src/previewAssistant.mjs',import.meta.url),'utf8')
 .replaceAll('import.meta.env?.VITE_PRIVATE_PREVIEW',"'1'")
 .replaceAll('import.meta.env?.VITE_SANDBOX_API_BASE',"'/api/preview'");
code=code.replace(/(['"])(\.\/[^'"]+\.mjs)\1/g,(_literal,_quote,module)=>JSON.stringify(new URL('../src/'+module.slice(2),import.meta.url).href));
const api=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const storage={getItem:()=> 'DEMO-LEVEL1'};
beforeEach(()=>clearE4Activity('lms'));
function fetcher(data){return async url=>url.endsWith('/session')?{ok:true,status:200}:{ok:true,status:200,json:async()=>({trace_id:'I-CLIENT_CONTRACT_TEST',data})};}
function claimedUpstream(engine,summary='Synthetic contract validation only'){
 return {engine,execution_mode:'LIVE_PROVIDER',real_ai:true,provider:'openai_responses',provider_request_id:'req_CLIENT_CONTRACT_NOT_REAL',model:'gpt-6-luna',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',result:{summary,issues:[],advice:[],citations:[]}};
}
function mockE4(){return {...claimedUpstream('E4'),execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',provider_request_id:'req_MOCK_CLIENT_CONTRACT',model:'MOCK_ONLY',chat_mode:'DOCUMENT_QA'};}
test('E1 rejects fixture pretending to be a real model',async()=>{
 const data=claimedUpstream('E1');data.execution_mode='FIXTURE';await assert.rejects(api.askEngineAdvice('E1',ALL_DEMO_REQUESTS[0],{},'lms',{storage,fetchImpl:fetcher(data)}),/REAL_AI_NOT_VERIFIED/);
});
test('existing E2 contract rejects feasible claims with missing capacity',async()=>{
 for(const summary of ['FEASIBLE','NO_FEASIBLE_SCHEDULE'])await assert.rejects(api.askEngineAdvice('E2',DEMO_SCHEDULES[0],{},'lms',{storage,fetchImpl:fetcher(claimedUpstream('E2',summary))}),/CAPACITY_AUTHORITY_UNKNOWN/);
});
test('existing E3 contract refuses invented numeric report output',async()=>{
 await assert.rejects(api.askEngineAdvice('E3',ALL_DEMO_REQUESTS[0],{},'lms',{storage,fetchImpl:fetcher(claimedUpstream('E3','Temperature 999.9'))}),/NO_VERIFIED_MEASUREMENTS/);
});
test('E4 document QA refuses missing citations',async()=>{
 await assert.rejects(api.askPreviewAssistant('文件問答：合成條件','lms',{storage,fetchImpl:fetcher(mockE4())}),/EVIDENCE_INSUFFICIENT/);
});
test('E4 document citations stay in chat while Trace stays in monitoring',async()=>{
 const data=mockE4();data.result.citations=[{document_id:'SYNTH-TECH-001',version:'1',quote:'合成溫度試驗範例'}];
 const text=await api.askPreviewAssistant('文件問答：合成條件','lms',{storage,fetchImpl:fetcher(data)});
 assert.match(text,/SYNTH-TECH-001@1/);assert.match(text,/MOCK測試/);assert.doesNotMatch(text,/Trace|I-CLIENT_CONTRACT_TEST/);assert.equal(readE4Activity('lms','DEMO-LEVEL1')[0].traceId,'I-CLIENT_CONTRACT_TEST');
});
for(const engine of ['E1','E2','E3'])test(engine+' no login does not call fetch',async()=>{
 await assert.rejects(api.askEngineAdvice(engine,engine==='E2'?DEMO_SCHEDULES[0]:ALL_DEMO_REQUESTS[0],{},'lms',{storage:{getItem:()=>null},fetchImpl:()=>assert.fail('no request')}),/AI_SESSION_REQUIRED/);
});
test('chat report drafting uses existing E4 route with a read-only synthetic projection',async()=>{
 const snapshot=readLabSnapshot({getItem:()=>null});let route,payload;
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/session'))return{ok:true,status:200};route=url;payload=JSON.parse(options.body);return{ok:false,status:503,json:async()=>({trace_id:'I-DRAFT-CONTRACT',error:{code:'LIVE_PROVIDER_DISABLED'}})};
 };
 await assert.rejects(api.askPreviewAssistant('請為 REQ-2026-002 生成報告草稿','lms',{storage,snapshot,metrics:deriveLabMetrics(snapshot),fetchImpl}),/LIVE_PROVIDER_DISABLED/);
 assert.equal(route,'/api/preview/ui/live/E4');assert.equal(payload.synthetic,true);assert.equal(payload.demo_context.intent,'REPORT_DRAFT');assert(payload.demo_context.items.some(row=>row.kind==='requests'&&row.id==='REQ-2026-002'));
});
test('report draft without case ID refuses before any Session or Provider request',async()=>{
 const snapshot=readLabSnapshot({getItem:()=>null});await assert.rejects(api.askPreviewAssistant('幫我生成試驗報告','lms',{storage,snapshot,metrics:deriveLabMetrics(snapshot),fetchImpl:()=>assert.fail('no network')}),/指定委託編號/);
});
