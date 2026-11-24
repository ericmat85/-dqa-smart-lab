import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const CASE='REQ-2026-aa112233';
function friday(){const d=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})+'T00:00:00Z');do{d.setUTCDate(d.getUTCDate()+1);}while(d.getUTCDay()!==5);return d.toISOString().slice(0,10);}
async function seed(page,{theme='light',actor='DEMO-LEVEL2',paused=false}={}){
 await page.addInitScript(({accounts,equipment,id,theme,actor,paused})=>{
  if(!localStorage.getItem('e2-management-fixture')){
   localStorage.setItem('e2-management-fixture','1');localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
   localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
   for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id,ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',status:'待排程',synthetic:true,requester:'合成委託者',department:'合成實驗室',productCode:'SYNTH-MANAGEMENT',quantity:'3',testItems:['振動耐久試驗'],specification:'合成振動耐久試驗；每顆 20h',judgementCriteria:'合成外觀確認',notes:'本機受控 Mock 測試',dueDate:'2026-12-10',lmsReview:{approval:2}}]));
   if(paused)localStorage.setItem('dqa-e2-planning-settings-v1',JSON.stringify({version:1,revision:1,settings:{enabled:false,searchDays:14,preparationMinutes:0,cleanupMinutes:0},events:[]}));
  }
  if(!sessionStorage.getItem('dqa-lms-account-id'))sessionStorage.setItem('dqa-lms-account-id',actor);
  sessionStorage.setItem('dqa-ai-revocation-v1:lms',JSON.stringify({status:'CONFIRMED',epoch:1}));
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,id:CASE,theme,actor,paused});
}
const management=page=>page.getByRole('region',{name:'AI 排程設定與運行監控'});
async function go(page,name){await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();}
async function goAI(page){await go(page,'系統管理');await page.getByRole('button',{name:'開啟AI 引擎管理',exact:true}).click();await page.getByRole('button',{name:'開啟AI 排程智慧化',exact:true}).click();}
async function openSchedule(page){await go(page,'排程管理');await page.locator('tbody tr').filter({hasText:CASE}).getByRole('button',{name:'編輯排程',exact:true}).click();return page.getByRole('dialog',{name:new RegExp('編輯試驗排程.*'+CASE)});}

for(const theme of ['light','dark'])test(`E2 management settings drive the original scheduler and monitor a verified Mock response ${theme}`,async({page,context})=>{
 test.setTimeout(120000);await page.setViewportSize({width:theme==='light'?1600:1366,height:1000});await seed(page,{theme});let sessionCalls=0,apiCalls=0;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
  if(url.pathname==='/api/preview/session'){sessionCalls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,session_created:true,conversation_id:'a'.repeat(32)})});}
  if(url.pathname==='/api/preview/ui/live/E2'){
   apiCalls++;const body=route.request().postDataJSON(),req=body.schedule_context.request;expect(req.preparation_minutes).toBe(30);expect(req.cleanup_minutes).toBe(15);expect(Date.parse(req.deadline)-Date.parse(req.earliest)).toBeLessThanOrEqual(6*86400000);
   const p=spawnSync('python',['-B','-c',"import json,sys;from gateway.e2_scheduling import evaluate;v=json.load(sys.stdin);print(json.dumps(evaluate(v['context'],v['now']/1000)))"],{input:JSON.stringify({context:body.schedule_context,now:Date.now()}),encoding:'utf8',env:{PATH:process.env.PATH,PYTHONPATH:process.cwd()+'/render-backend',LANG:'C.UTF-8'}});expect(p.status,p.stderr).toBe(0);const assessment=JSON.parse(p.stdout);expect(assessment.status).toBe('PROPOSAL_AVAILABLE');
   await new Promise(resolve=>setTimeout(resolve,180));const trace='I-LOCAL-E2-MANAGEMENT';
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({synthetic:true,trace_id:trace,data:{engine:'E2',trace_id:trace,request_id:'O-'+'a'.repeat(64),writes:'NONE',requires_confirmation:true,summary:'本機 Mock：未呼叫真實模型。',risks:[],assessment,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',model:'MOCK_ONLY',provider_request_id:'req_MOCK_E2_MANAGEMENT',provider_response_id:'resp_MOCK_E2_MANAGEMENT',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',selected_candidate_id:assessment.candidates[0].id}})});
  }
  if(url.pathname.startsWith('/api/preview/'))return route.abort();return route.continue();
 });
 await page.goto('/lms/settings/ai/E2');const panel=management(page);await expect(panel).toContainText('尚無排程請求');await expect(page.locator('.lms-breadcrumbs [aria-current=page]')).toHaveText('E2 AI 排程智慧化');
 const observer=await context.newPage();await observer.addInitScript(()=>sessionStorage.setItem('dqa-lms-account-id','DEMO-LEVEL2'));await observer.goto('/lms/settings/ai/E2');await page.getByRole('button',{name:'調整排程設定',exact:true}).click();const dialog=page.getByRole('dialog',{name:'調整 AI 排程設定'});
 await dialog.getByLabel('搜尋範圍上限（天）',{exact:true}).fill('7');await dialog.getByLabel('準備保留時間下限（分鐘）',{exact:true}).fill('30');await dialog.getByLabel('清理保留時間下限（分鐘）',{exact:true}).fill('15');
 await expect(dialog.getByLabel(/API Key|模型|預算/)).toHaveCount(0);await dialog.getByRole('button',{name:'儲存排程設定',exact:true}).click();await expect(management(observer).locator('.e2-setting-values')).toContainText('7 天');
 const editor=await openSchedule(page);await editor.getByLabel('開始日期',{exact:false}).fill(friday());const before=await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'));
 await editor.getByRole('button',{name:/AI 自動化排程/}).evaluate(button=>{button.click();button.click();});await expect(page.getByRole('dialog',{name:'正在準備排程建議',exact:true})).toBeHidden();await expect(editor.locator('.schedule-arrangement-message')).toContainText('模擬測試：未呼叫真實模型');
 expect(apiCalls).toBe(1);expect(sessionCalls).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'))).toBe(before);
 await editor.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(editor).toBeHidden();await goAI(page);
 const records=panel.getByRole('region',{name:'E2 即時排程紀錄'});await expect(records).toContainText('使用者已儲存');await expect(records).toContainText('Mock 測試');await expect(records).toContainText('80／40');await expect(records).toContainText('模擬 USD 0.000028');await expect(panel).toContainText('尚無 Provider 回應');
 await records.getByText('查看 Trace／Provider',{exact:true}).click();await expect(records).toContainText('I-LOCAL-E2-MANAGEMENT');await expect(records).toContainText('req_MOCK_E2_MANAGEMENT');
 await panel.getByLabel('排程監控狀態篩選').selectOption('ERROR');await expect(records).toContainText('沒有符合篩選');await panel.getByLabel('排程監控狀態篩選').selectOption('ALL');
 await panel.scrollIntoViewIfNeeded();await captureBrowserEvidence(page,{path:test.info().outputPath('e2-management-'+theme+'.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(management(observer).getByRole('region',{name:'E2 即時排程紀錄'})).toContainText('尚無排程請求');await observer.close();
 const saved=await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'));await panel.getByRole('button',{name:'清除本分頁排程紀錄',exact:true}).click();await expect(records).toContainText('尚無排程請求');expect(await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'))).toBe(saved);
 await page.reload();await expect(panel.locator('.e2-setting-values')).toContainText('30 分鐘');expect(apiCalls).toBe(1);expect(await page.pageErrors()).toEqual([]);
});
test('E2 management preserves the third-level read-only boundary and fits mobile',async({page,context})=>{
 await context.route('**/api/preview/**',route=>route.abort());await seed(page,{actor:'DEMO-LEVEL3',theme:'dark'});await page.setViewportSize({width:390,height:844});await page.goto('/lms/settings/ai/E2');
 const panel=management(page);await expect(panel.getByRole('button',{name:'調整排程設定'})).toBeDisabled();await expect(panel).toContainText('目前帳號為唯讀');await expect(panel.getByRole('button',{name:'還原排程預設值'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.scrollIntoViewIfNeeded();await captureBrowserEvidence(page,{path:test.info().outputPath('e2-management-mobile-readonly.png'),fullPage:true});expect(await page.pageErrors()).toEqual([]);
});
test('a paused scheduler sends no Session or AI requests and records the actual local block',async({page,context})=>{
 await seed(page,{paused:true});let calls=0;await context.route('**/api/preview/**',route=>{calls++;return route.abort();});await page.goto('/lms/settings/ai/E2');const editor=await openSchedule(page);
 await editor.getByRole('button',{name:/AI 自動化排程/}).click();await expect(page.getByRole('dialog',{name:'正在準備排程建議',exact:true})).toBeHidden();await expect(editor.locator('.schedule-arrangement-message')).toContainText('暫停');await editor.getByRole('button',{name:'關閉',exact:true}).click();await goAI(page);
 await expect(management(page).getByRole('region',{name:'E2 即時排程紀錄'})).toContainText('E2_CLIENT_PAUSED');expect(calls).toBe(0);
});
