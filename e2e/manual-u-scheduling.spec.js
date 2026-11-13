import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const ID='REQ-2026-e4f9f4b8';
test('new synthetic request without litres saves with U and accelerates after receipt',async({page})=>{
 let aiCalls=0;
 await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(/\/api\/preview\/ui\/live\/E[1-4]/.test(url.pathname))aiCalls++;return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 const manager=INITIAL_ACCOUNTS.find(a=>a.role==='一階主管'&&a.status==='啟用中'),engineer=INITIAL_ACCOUNTS.find(a=>a.role==='實驗室工程師'&&a.status==='啟用中');
 const date=days=>new Date(Date.now()+days*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
 await page.addInitScript(({accounts,equipment,managerId,engineerId,id})=>{
  if(!localStorage.getItem('manual-u-regression-seeded')){
   localStorage.setItem('manual-u-regression-seeded','1');for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment.map(x=>x.id==='EQ-001'?{...x,status:'待機中',currentRequest:'',estimatedEnd:''}:x)));
   localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id,ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',status:'待排程',synthetic:true,requester:'合成委託者',department:'合成實驗室',productCode:'SYNTHETIC-SAMPLE',product:'合成試驗樣品',quantity:'5',testItems:['高溫儲存試驗'],specification:'合成展示條件；非正式規範',judgementCriteria:'合成外觀確認',notes:'本機合成回歸測試',dueDate:'2026-11-30',lmsReview:{approval:2}}]));
  }
  sessionStorage.setItem('dqa-lms-account-id',managerId);sessionStorage.setItem('dqa-lab-account-id',engineerId);
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,managerId:manager.id,engineerId:engineer.id,id:ID});
 await page.setViewportSize({width:1600,height:1000});await page.goto('/lms/schedule');
 const row=page.locator('tbody tr').filter({hasText:ID});await row.getByRole('button',{name:'編輯排程',exact:true}).click();const dialog=page.getByRole('dialog',{name:new RegExp('編輯試驗排程.*'+ID)});
 await dialog.getByLabel('設備選擇',{exact:true}).selectOption('EQ-001');await dialog.getByLabel('執行人',{exact:false}).selectOption(engineer.id);await dialog.getByLabel('每件樣品使用空間 U *',{exact:true}).fill('1');await dialog.getByLabel('開始日期',{exact:false}).fill(date(2));await dialog.getByLabel('預計完成日期',{exact:false}).fill(date(6));
 await expect(dialog.getByText('6 U',{exact:true})).toBeVisible();await expect(dialog.locator('input[aria-label*="體積"]')).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('manual-u-filled-without-litres.png')});await dialog.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(dialog).not.toBeVisible();
 const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1')).find(x=>x.requestId===id),ID);expect(Number(saved.sampleSpaceUnits)).toBe(1);expect(saved.sampleVolumeLitres).toBe('');expect(saved.capacityValidation).toEqual({basis:'DEMO_SPACE_UNITS_ONLY',physicalFeasibility:'NOT_ASSESSED'});expect(saved.allocations).toEqual([{equipmentId:'EQ-001',quantity:5}]);
 const sources=await page.evaluate(()=>localStorage.getItem('dqa-request-demo-v2'));expect(JSON.parse(sources)[0].sampleVolumeLitres).toBeUndefined();
 await page.goto('/lab/dashboard');const labRow=page.locator('.lab-table-wrap tbody tr').filter({hasText:ID}),accelerator=page.getByRole('button',{name:'Demo試驗加速器',exact:true});await expect(accelerator).toBeDisabled();await labRow.getByRole('button',{name:'確認接收',exact:true}).click();await page.getByRole('button',{name:'確認送出',exact:true}).click();await page.getByRole('button',{name:'關閉',exact:true}).click();
 await expect(accelerator).toBeEnabled();await accelerator.click();await expect(labRow.getByRole('progressbar',{name:'試驗日程',exact:true})).toHaveAttribute('aria-valuenow','50');await accelerator.click();await expect(labRow.getByRole('button',{name:'提交報告',exact:true})).toBeVisible();await expect(accelerator).toBeDisabled();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).map(x=>x.id))).toEqual([ID]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1')).length)).toBe(1);expect(aiCalls).toBe(0);expect(await page.pageErrors()).toEqual([]);await page.screenshot({path:test.info().outputPath('manual-u-received-and-completed.png')});
});
