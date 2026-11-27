import {runDemoCommand} from './assistantDemoCommand.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
for(const width of [1920,1366,390])for(const theme of ['light','dark'])test(`Demo placement ${width} ${theme}: tools never cover content or assistant`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});
 await page.addInitScript(({accounts,theme})=>{if(!localStorage.getItem('placement-seeded')){localStorage.setItem('placement-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));for(const key of ['dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lms-reviews-v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id:'DEMO-PLACEMENT',status:'待主管簽核',ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',requester:'假委託者',productCode:'FAKE-001',testItems:['高溫試驗'],signatureRecords:[]} ]));}sessionStorage.setItem('dqa-lab-account-id','U003');sessionStorage.setItem('dqa-request-account-id','DEMO-SUPERVISOR');sessionStorage.setItem('dqa-request-role','supervisor');},{accounts:INITIAL_ACCOUNTS,theme});
 await page.goto('/lab/dashboard');
 for(const name of ['試驗委託','設備狀態','物料管理','操作歷程','資料庫']){
  if(width===390)await page.getByRole('button',{name:'切換功能選單',exact:true}).click();
  await page.locator('.lab-sidebar').getByRole('button',{name,exact:true}).click();
  await expect(page.locator('.clear-cases-control')).toHaveCount(0);await expect(page.getByRole('button',{name:'Demo 工具',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'展開AI智能助理',exact:true})).toBeVisible();
 }
 await page.goto('/request/cases/DEMO-PLACEMENT');
 const header=page.locator('.rq-case-detail>.rq-panel-head');await expect(header.getByRole('button',{name:/demo.*填|DEMO.*填|填.*demo/i})).toHaveCount(0);await runDemoCommand(page,'/demo fill in manager',{reply:'尚未送出簽核'});await expect(page.getByAltText('主管簽名預覽')).toBeVisible();
 await expect(page.getByRole('button',{name:'Demo 工具',exact:true})).toHaveCount(0);await expect(page).toHaveURL(/\/request\/cases\/DEMO-PLACEMENT$/);
 await header.scrollIntoViewIfNeeded();await captureBrowserEvidence(page,{path:test.info().outputPath(`demo-case-header-${width}-${theme}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.pageErrors()).toEqual([]);
});
