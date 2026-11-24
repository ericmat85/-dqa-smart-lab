import {expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
// Run the real deterministic scheduling evaluator with synthetic browser input.
// Only the model selection is a fixture; no provider or cloud backend is called.
export async function installMockE2Transport(page){
 await page.route('**/api/preview/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/preview/session')return route.fulfill({json:{authenticated:true,accountId:request.postDataJSON().accountId,session_created:true,conversation_id:'a'.repeat(32)}});
  if(path!=='/api/preview/ui/live/E2')return route.fulfill({status:503,json:{error:{code:'LOCAL_FIXTURE_ROUTE_UNHANDLED'}}});
  const body=request.postDataJSON();expect(body.synthetic).toBe(true);
  const result=spawnSync('python',['-B','-c',"import json,sys;from gateway.e2_scheduling import evaluate;v=json.load(sys.stdin);print(json.dumps(evaluate(v['context'],v['now']/1000)))"],{input:JSON.stringify({context:body.schedule_context,now:Date.now()}),encoding:'utf8',env:{PATH:process.env.PATH,PYTHONPATH:process.cwd()+'/render-backend',LANG:'C.UTF-8'}});
  expect(result.status,result.stderr).toBe(0);const assessment=JSON.parse(result.stdout),trace='I-LOCAL-DEMO-SCHEDULER';
  return route.fulfill({json:{synthetic:true,trace_id:trace,data:{engine:'E2',trace_id:trace,writes:'NONE',requires_confirmation:true,summary:'本機確定性排程規則；模型選擇為合成回應。',risks:[],assessment,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',model:'MOCK_ONLY',provider_request_id:'req_MOCK_DEMO',provider_response_id:'resp_MOCK_DEMO',usage:{input_tokens:0,output_tokens:0},estimated_cost_usd:'0',selected_candidate_id:assessment.candidates?.[0]?.id||null}}});
 });
}
