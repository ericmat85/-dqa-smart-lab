import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {advanceDemo,expectDemoDisabled} from './assistantAccelerator.mjs';
import {test,expect} from '@playwright/test';
test.beforeEach(async({context})=>context.route('**/*',route=>{const url=new URL(route.request().url());const origin=url.protocol==='blob:'?new URL(url.pathname):url;return ['http:','https:'].includes(origin.protocol)&&['127.0.0.1','localhost'].includes(origin.hostname)?route.continue():route.abort();}));
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {seedAcceptedTrial} from './acceptedTrialFixture.mjs';
for(const width of [1366])for(const theme of ['light','dark'])test(`accelerator only uses existing accepted waiting trials ${width} ${theme}`,async({page,context})=>{
 await page.setViewportSize({width,height:width===390?844:900});await page.addInitScript(({accounts,theme})=>{if(!localStorage.getItem('accepted-accelerator-seeded')){localStorage.setItem('accepted-accelerator-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');}sessionStorage.setItem('dqa-lab-account-id','U003');},{accounts:INITIAL_ACCOUNTS,theme});await page.goto('/lab/dashboard');
 const data=()=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-shared-demo-accounts-v1','dqa-equipment-demo-v1'].map(key=>[key,localStorage.getItem(key)])));const empty=await data();await expectDemoDisabled(page);expect(await data()).toEqual(empty);
 const id=await seedAcceptedTrial(page),identities=()=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1'].map(key=>[key,JSON.parse(localStorage.getItem(key)).map(row=>row.id)])));const before=await identities();const observer=await context.newPage();await observer.addInitScript(()=>sessionStorage.setItem('dqa-lms-account-id','U001'));await observer.goto('/lms/schedule');
 await advanceDemo(page);const row=page.locator('.lab-table-wrap tbody tr').filter({hasText:id});await expect(row).toContainText('試驗中');await expect(row.getByRole('progressbar',{name:'試驗日程',exact:true})).toHaveAttribute('aria-valuenow','50');await observer.getByRole('button',{name:'試驗中 1',exact:true}).click();await expect(observer.locator('tbody tr').filter({hasText:id})).toContainText('試驗中');expect(await identities()).toEqual(before);
 await advanceDemo(page);await expect(row.getByRole('button',{name:'提交報告',exact:true})).toBeVisible();expect(await identities()).toEqual(before);await expect.poll(()=>observer.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('已完成');await expect(observer.locator('tbody tr').filter({hasText:id})).toHaveCount(0);
 const completed=await data();await expectDemoDisabled(page);expect(await data()).toEqual(completed);await captureBrowserEvidence(page,{path:test.info().outputPath(`accepted-accelerator-${width}-${theme}.png`)});expect(await page.pageErrors()).toEqual([]);expect(await observer.pageErrors()).toEqual([]);await observer.close();
});
test('nearest-start sequential accelerator advances each existing trial 50 then 100 light',async({page})=>{
 await page.addInitScript(accounts=>{if(!localStorage.getItem('sequential-seeded')){localStorage.setItem('sequential-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');}sessionStorage.setItem('dqa-lab-account-id','U003');},INITIAL_ACCOUNTS);
 await page.goto('/lab/dashboard');await expectDemoDisabled(page);
 const first=await seedAcceptedTrial(page),second=await seedAcceptedTrial(page);
 await page.evaluate(id=>{const now=Date.now(),time=new Date(now+5*86400000).toISOString(),end=new Date(now+6*86400000).toISOString();const schedules=JSON.parse(localStorage.getItem('dqa-schedules-demo-v1')).map(row=>row.requestId===id?{...row,time,end}:row),lab=JSON.parse(localStorage.getItem('dqa_lab_demo_requests_v1')).map(row=>row.id===id?{...row,scheduledStart:time,scheduledEnd:end}:row);localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify(schedules));localStorage.setItem('dqa_lab_demo_requests_v1',JSON.stringify(lab));},second);await page.reload();
 const ids=()=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1'].map(k=>[k,JSON.parse(localStorage.getItem(k)).map(x=>x.id).sort()]))),before=await ids();
 for(const [id,percent] of [[first,50],[first,100],[second,50],[second,100]]){
  await advanceDemo(page);
  const row=page.locator('.lab-table-wrap tbody tr').filter({hasText:id});
  if(percent===50)await expect(row.getByRole('progressbar',{name:'試驗日程',exact:true})).toHaveAttribute('aria-valuenow','50');
  else await expect(row.getByRole('button',{name:'提交報告',exact:true})).toBeVisible();
  expect(await ids()).toEqual(before);
 }
 await expectDemoDisabled(page);
 await captureBrowserEvidence(page,{path:test.info().outputPath('sequential-50-100-no-generation.png')});
});
