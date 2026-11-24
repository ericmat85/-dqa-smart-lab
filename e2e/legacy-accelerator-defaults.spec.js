import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {advanceDemo,expectDemoDisabled,openDemoAccelerator} from './assistantAccelerator.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const ID='REQ-2026-005';
test('fresh Demo legacy REQ-2026-005 can accelerate after real schedule and receipt without a persisted review key',async({page})=>{
 let modelCalls=0;
 await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(/\/api\/preview\/ui\/live\/E[1-4]/.test(url.pathname))modelCalls++;return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 const manager=INITIAL_ACCOUNTS.find(a=>a.role==='一階主管'&&a.status==='啟用中'),engineer=INITIAL_ACCOUNTS.find(a=>a.role==='實驗室工程師'&&a.status==='啟用中');
 await page.addInitScript(({accounts,equipment,managerId,engineerId})=>{
  if(!localStorage.getItem('legacy-default-review-test')){
   localStorage.setItem('legacy-default-review-test','1');localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment.map(e=>e.id==='EQ-001'?{...e,status:'待機中',currentRequest:'',estimatedEnd:''}:e)));
   // Keep the original review and request keys absent. The UI must use its own
   // unchanged default Demo records; no fixture creates an approved review.
  }
  sessionStorage.setItem('dqa-lms-account-id',managerId);sessionStorage.setItem('dqa-lab-account-id',engineerId);
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,managerId:manager.id,engineerId:engineer.id});
 await page.setViewportSize({width:1600,height:1000});await page.goto('/lms/schedule');
 expect(await page.evaluate(()=>localStorage.getItem('dqa-lms-reviews-v1'))).toBeNull();
 const visibleReview=await page.evaluate(async()=>{const {readLabSnapshot}=await import('/src/labData.mjs');const r=readLabSnapshot(localStorage).reviews.find(r=>r.id==='REQ-2026-005');return {id:r.id,status:r.status,approval:r.approval};});expect(visibleReview).toEqual({id:ID,status:'完成',approval:2});
 const row=page.locator('tbody tr').filter({hasText:ID});await row.getByRole('button',{name:'編輯排程',exact:true}).click();const modal=page.getByRole('dialog',{name:new RegExp('編輯試驗排程.*'+ID)});
 const date=days=>new Date(Date.now()+days*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
 await modal.getByLabel('設備選擇',{exact:true}).selectOption('EQ-001');await modal.getByLabel('執行人',{exact:false}).selectOption(engineer.id);await modal.getByLabel('每件樣品使用空間 U *',{exact:true}).fill('1');await modal.getByLabel('開始日期',{exact:false}).fill(date(2));await modal.getByLabel('預計完成日期',{exact:false}).fill(date(12));await modal.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(modal).not.toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('dqa-lms-reviews-v1'))).toBeNull();await page.goto('/lab/dashboard');
 const labRow=page.locator('.lab-table-wrap tbody tr').filter({hasText:ID});await expectDemoDisabled(page);await labRow.getByRole('button',{name:'確認接收',exact:true}).click();await page.getByRole('button',{name:'確認送出',exact:true}).click();await page.getByRole('button',{name:'關閉',exact:true}).click();
 await expect(labRow).toContainText('已接收，等待開始');expect(await page.evaluate(()=>localStorage.getItem('dqa-lms-reviews-v1'))).toBeNull();
 await captureBrowserEvidence(page,{path:test.info().outputPath('legacy-005-received-before-acceleration.png')});{const control=await openDemoAccelerator(page);await expect(control.locator('[data-flow-test-action]')).toBeEnabled();await control.getByRole('button',{name:'關閉',exact:true}).click();};
 const ids=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1')).map(x=>x.id));const before=await ids();await advanceDemo(page);await expect(labRow.getByRole('progressbar',{name:'試驗日程',exact:true})).toHaveAttribute('aria-valuenow','50');await advanceDemo(page);await expect(labRow.getByRole('button',{name:'提交報告',exact:true})).toBeVisible();await expectDemoDisabled(page);expect(await ids()).toEqual(before);expect(await page.evaluate(()=>localStorage.getItem('dqa-lms-reviews-v1'))).toBeNull();expect(modelCalls).toBe(0);expect(await page.pageErrors()).toEqual([]);await captureBrowserEvidence(page,{path:test.info().outputPath('legacy-005-completed-with-default-review.png')});
});
