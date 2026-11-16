import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
test('E4 follows the existing interface language selector and keeps FAQ free and Mock truthful',async({page,context})=>{
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await page.addInitScript(accounts=>{
  if(!localStorage.getItem('language-seed')){localStorage.setItem('language-seed','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-ui-preferences-v1',JSON.stringify({fontSize:'normal',language:'zh-TW',pageSize:20}));}
  sessionStorage.setItem('dqa-lms-account-id','DEMO-LEVEL2');
 },INITIAL_ACCOUNTS);
 let calls=0;
 await page.route('**/api/preview/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,session_created:true,conversation_id:'a'.repeat(32)})}));
 await page.route('**/api/preview/ui/live/E4',route=>{
  calls++;const payload=route.request().postDataJSON();expect(payload.synthetic).toBe(true);expect(['en','zh-TW']).toContain(payload.language);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({trace_id:'I-language-browser',data:{engine:'E4',chat_mode:'GENERAL_CHAT',response_language:payload.language,execution_mode:'MOCK',real_ai:false,provider:'MOCK_HTTP_TRANSPORT',model:'MOCK_ONLY',provider_request_id:'req_MOCK_browser',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.000028',result:{summary:payload.language==='en'?'Hello. I can help explain laboratory tests.':'您好，我可以協助解釋實驗室試驗。',citations:[]}}})});
 });
 await page.goto('/lms/settings/interface');await page.getByLabel('介面語言',{exact:true}).selectOption('en');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.locator('.intelligent-launcher').click();const panel=page.locator('#intelligent-panel');
 await panel.locator('.intelligent-examples>summary').click();await expect(panel.locator('.intelligent-examples button')).toHaveCount(20);
 await panel.locator('.intelligent-examples button').first().click();await expect(panel.locator('.intelligent-reply').last()).toContainText('FAQ');await expect(panel.locator('.intelligent-reply').last()).toContainText('Current data');expect(calls).toBe(0);
 await panel.locator('.intelligent-composer input').fill('hello');await panel.locator('button[type=submit]').click();await expect(panel.locator('.intelligent-reply').last()).toContainText('Hello. I can help');await expect(panel.locator('.intelligent-reply').last()).toContainText('[MOCK test:');
 await panel.locator('header button').click();await page.locator('select').filter({has:page.locator('option[value="zh-TW"]')}).selectOption('zh-TW');
 await expect(page.locator('html')).toHaveAttribute('lang','zh-Hant');await page.locator('.intelligent-launcher').click();await panel.locator('.intelligent-composer input').fill('你好');await panel.locator('button[type=submit]').click();await expect(panel.locator('.intelligent-reply').last()).toContainText('您好，我可以協助');expect(calls).toBe(2);
});
