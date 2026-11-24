import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const manager=INITIAL_ACCOUNTS.find(x=>x.role==='一階主管'&&x.status==='啟用中');
function friday(){const d=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})+'T00:00:00Z');do{d.setUTCDate(d.getUTCDate()+1);}while(d.getUTCDay()!==5);return d.toISOString().slice(0,10);}
for(const type of ['humidity','vibration'])test(`${type}: original editor reads trial data, fills rules-based dates and saves without model or automatic writes`,async({page,context})=>{
 let upstream=0,model=0;const id=type==='humidity'?'REQ-2026-aabbccdd':'REQ-2026-bbccddee',title=type==='humidity'?'高溫高濕':'振動耐久試驗';
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
  if(url.pathname==='/api/preview/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,accountId:manager.id,system:'lms',conversation_id:'a'.repeat(32),session_created:true})});
  if(url.pathname==='/api/preview/ui/live/E2'){
   upstream++;const body=request.postDataJSON();expect(body.synthetic).toBe(true);expect(body.schedule_context.request.profile_id).toBe(type==='humidity'?'HIGH_HUMIDITY':'VIBRATION_DURABILITY');
   const p=spawnSync('python',['-B','-c',"import json,sys; from gateway.e2_scheduling import evaluate; v=json.load(sys.stdin); print(json.dumps(evaluate(v['context'],v['now']/1000)))"],{input:JSON.stringify({context:body.schedule_context,now:Date.now()}),encoding:'utf8',env:{PATH:process.env.PATH,PYTHONPATH:process.cwd()+'/render-backend',LANG:'C.UTF-8'}});expect(p.status,p.stderr).toBe(0);
   const a=JSON.parse(p.stdout),trace='I-OFFLINE-PROFILE-BROWSER';expect(a.status).toBe('PROPOSAL_AVAILABLE');
   return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-ID':trace},body:JSON.stringify({synthetic:true,trace_id:trace,data:{engine:'E2',trace_id:trace,writes:'NONE',requires_confirmation:true,summary:'離線確定性規則；未呼叫 AI 模型。',risks:[],assessment:a,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',model:'MOCK_ONLY',provider_request_id:'req_MOCK_OFFLINE',provider_response_id:'resp_MOCK_OFFLINE',usage:{input_tokens:0,output_tokens:0},estimated_cost_usd:'0',selected_candidate_id:a.candidates[0].id}})});
  }
  if(/\/api\/preview\/ui\/live\/E[1-4]/.test(url.pathname)){model++;return route.abort();}
  return route.continue();
 });
 await page.addInitScript(({accounts,equipment,managerId,id,title,type})=>{
  if(!localStorage.getItem('profile-browser-seeded')){
   localStorage.setItem('profile-browser-seeded','1');for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
   localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id,ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',status:'待排程',synthetic:true,requester:'合成委託者',department:'合成實驗室',productCode:'SYNTH-PROFILE',product:'合成樣品',quantity:'3',testItems:[title],specification:type==='humidity'?'合成試驗條件：85°C、85%RH、持續 250h':'合成振動耐久試驗；每顆 20h',judgementCriteria:'合成外觀確認',notes:'本機測試',dueDate:'2026-12-10',lmsReview:{approval:2}}]));
  }
  sessionStorage.setItem('dqa-lms-account-id',managerId);sessionStorage.setItem('dqa-ai-revocation-v1:lms',JSON.stringify({status:'CONFIRMED',epoch:1}));
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,managerId:manager.id,id,title,type});
 await page.setViewportSize({width:1600,height:1000});await page.goto('/lms/schedule');await expect(page.getByText('AI 對話撤銷已由後端確認。',{exact:true})).toHaveCount(0);
 const row=page.locator('tbody tr').filter({hasText:id});await row.getByRole('button',{name:'編輯排程',exact:true}).click();const editor=page.getByRole('dialog',{name:new RegExp('編輯試驗排程.*'+id)});
 await expect(editor.getByLabel('試驗工時與設備規則')).toContainText(type==='humidity'?'連續 250 小時':'每顆 20 小時');expect(await editor.locator('input[aria-label*="溫度下限"]').count()).toBe(0);expect(await editor.innerText()).not.toMatch(/\bE2\b/);
 await editor.getByLabel('開始日期',{exact:false}).fill(friday());const before=await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'));
 await editor.getByRole('button',{name:/AI 自動化排程/}).click();await expect(page.getByRole('dialog',{name:'正在準備排程建議',exact:true})).toBeHidden();await expect(editor.locator('.schedule-arrangement-message')).toContainText('未呼叫');
 expect(await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'))).toBe(before);const start=await editor.getByLabel('開始日期',{exact:false}).inputValue(),end=await editor.getByLabel('預計完成日期',{exact:false}).inputValue();
 const expected=new Date(start+'T00:00:00Z');expected.setUTCDate(expected.getUTCDate()+(type==='humidity'?10:4));expect(end).toBe(expected.toISOString().slice(0,10));
 const selected=await editor.getByLabel('設備選擇',{exact:true}).inputValue();expect(type==='humidity'?['EQ-006','EQ-008']:['EQ-010']).toContain(selected);
 await captureBrowserEvidence(page,{path:test.info().outputPath(type+'-profile-editor.png')});await editor.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(editor).toBeHidden();
 const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1')).find(x=>x.requestId===id),id);expect(saved.durationHours).toBe(type==='humidity'?250:20);expect(saved.trialExecution.segments.length).toBe(type==='humidity'?1:3);expect(saved.capacityValidation).toBeUndefined();expect(upstream).toBe(1);expect(model).toBe(0);
 if(type==='vibration')expect(saved.trialExecution.segments.every(s=>{const d=new Date(s.start_ms+8*3600000).getUTCDay();return d!==0&&d!==6&&s.quantity===1;})).toBe(true);
 expect(await page.pageErrors()).toEqual([]);
});

test('removing the toast still requires fresh authenticated session after an unconfirmed revocation',async({page,context})=>{
 let calls=0,sessions=0;await context.route('**/api/preview/**',route=>{if(new URL(route.request().url()).pathname==='/api/preview/session'){sessions++;expect(route.request().postDataJSON().freshConversation).toBe(true);return route.fulfill({status:401,contentType:'application/json',headers:{'X-Trace-ID':'I-LOCAL-SESSION-REJECTED'},body:JSON.stringify({scope:'SANDBOX_ONLY',synthetic:true,trace_id:'I-LOCAL-SESSION-REJECTED',error:{code:'AUTHENTICATION_REQUIRED'}})});}calls++;return route.abort();});
 await page.addInitScript(({accounts,managerId})=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id',managerId);sessionStorage.setItem('dqa-ai-revocation-v1:lms',JSON.stringify({status:'UNCONFIRMED',epoch:2}));},{accounts:INITIAL_ACCOUNTS,managerId:manager.id});
 await page.goto('/lms/dashboard');await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();await page.getByRole('textbox',{name:'輸入問題',exact:true}).fill('你好');await page.getByRole('button',{name:'送出問題',exact:true}).click();await expect(page.locator('.intelligent-reply').last()).toContainText(/Session.*401/);expect(sessions).toBe(1);expect(calls).toBe(0);await expect(page.locator('[data-ai-session-status]')).toHaveCount(0);
});

test('the confirmed revocation toast is absent from request, LMS and lab pages',async({page,context})=>{
 await context.route('**/api/preview/**',route=>route.abort());
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-request-account-id','DEMO-SUPERVISOR');sessionStorage.setItem('dqa-lms-account-id','DEMO-LEVEL1');sessionStorage.setItem('dqa-lab-account-id','U003');for(const system of ['request','lms','lab'])sessionStorage.setItem('dqa-ai-revocation-v1:'+system,JSON.stringify({status:'CONFIRMED',epoch:1}));},INITIAL_ACCOUNTS);
 for(const system of ['request','lms','lab']){await page.goto('/'+system+'/dashboard');await expect(page.locator('[data-ai-session-status]')).toHaveCount(0);await expect(page.getByText('AI 對話撤銷已由後端確認。',{exact:true})).toHaveCount(0);if(system==='request')await captureBrowserEvidence(page,{path:test.info().outputPath('request-dashboard-without-fixed-ai-toast.png')});}
});
