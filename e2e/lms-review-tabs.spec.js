import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';

test('review tabs combine classification, counts, search, pagination and keyboard navigation',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.addInitScript(accounts=>{
  sessionStorage.setItem('dqa-lms-account-id','U001');
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  for(const key of ['dqa-request-demo-v2','dqa-lab-operations-v1','dqa-borrow-requests-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-lms-reviews-v1',JSON.stringify(Array.from({length:25},(_,i)=>({id:`REVIEW-${String(i).padStart(2,'0')}`,title:`Demo 試驗 ${i}`,productCode:'DEMO-PRODUCT',department:'假資料部門',applicant:'假資料工程師',submitted:'2026-10-31',status:'待審查',history:[],approval:0}))));
  localStorage.setItem('dqa-lab-operations-v1',JSON.stringify([{id:'OP-DEMO',requestId:'REVIEW-00',action:'interrupt',status:'待審核',actor:'假資料工程師',at:'2026-10-31T02:00:00Z',reason:'測試用申請'}]));
  localStorage.setItem('dqa-borrow-requests-v1',JSON.stringify([{id:'BOR-DEMO',status:'待核准',equipment:'DEMO設備',requester:'假資料工程師',department:'假資料部門',createdAt:'2026-10-31T02:00:00Z',purpose:'測試用借用'}]));
 },INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
 await expect(page.locator('.dashboard-topbar .lms-breadcrumbs').getByRole('button',{name:'COLONG LMS',exact:true})).toHaveText('COLONG LMS');
 await page.evaluate(async()=>{
  const {saveReport}=await import('/src/reportStore.mjs');
  await saveReport({requestId:'REPORT-DEMO',stage:'level2',revision:'demo-revision',fileName:'Demo-report.xlsx',submitter:'假資料工程師',submittedAt:'2026-10-31T02:00:00Z'});
 });
 await expect(page.locator('.live-dashboard-meta')).toHaveCount(0);
 await expect(page.getByText('工作資料同步中',{exact:true})).toHaveCount(0);
 await page.locator('.sidebar').getByRole('button',{name:'試驗委託',exact:true}).click();
 const tabs=page.getByRole('tablist',{name:'委託審查分類'}),table=page.locator('#request-review-panel .template-table');
 const all=tabs.getByRole('tab',{name:/全部委託/}),review=tabs.getByRole('tab',{name:/待審查/}),approval=tabs.getByRole('tab',{name:/待核准/}),report=tabs.getByRole('tab',{name:/待審核/});
 await expect(report.locator('span')).toHaveText('1');await expect(all.locator('span')).toHaveText('27');
 await expect(review.locator('span')).toHaveText('24');await expect(approval.locator('span')).toHaveText('2');
 await expect(page.locator('.request-kpis')).toHaveCount(0);
 await expect(all).toHaveAttribute('aria-selected','true');await expect(table.locator('tbody tr')).toHaveCount(20);
 await review.click();await table.getByRole('button',{name:'第 2 頁',exact:true}).click();await expect(table.locator('tbody tr')).toHaveCount(4);
 const search=page.getByPlaceholder('搜尋委託編號、產品代碼、試驗項目、部門…');
 await search.fill('REVIEW-24');await expect(table.locator('tbody tr')).toHaveCount(1);await expect(table).toContainText('REVIEW-24');
 await expect(table.getByRole('navigation',{name:'列表分頁'})).toHaveCount(0);
 await search.fill('');await expect(table.locator('tbody tr')).toHaveCount(20);
 await approval.click();await expect(table.locator('tbody tr')).toHaveCount(2);await expect(table).toContainText('BOR-DEMO');await expect(table).not.toContainText('REPORT-DEMO');
 await report.click();await expect(table.locator('tbody tr')).toHaveCount(1);await expect(table).toContainText('REPORT-DEMO');
 await report.press('Home');await expect(all).toBeFocused();await expect(all).toHaveAttribute('aria-selected','true');await expect(all).toHaveCSS('outline-style','solid');await expect(all).toHaveCSS('outline-width','2px');
 await all.press('ArrowRight');await expect(review).toBeFocused();await expect(review).toHaveAttribute('aria-selected','true');
 await review.press('End');await expect(report).toBeFocused();await expect(report).toHaveAttribute('aria-selected','true');
 await report.press('ArrowLeft');await expect(approval).toBeFocused();await expect(approval).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tabpanel',{name:/待核准/})).toBeVisible();
 await search.fill('not-found');await expect(page.getByText('沒有符合條件的委託',{exact:true})).toBeVisible();
 expect(await page.pageErrors()).toEqual([]);
});

test('LMS tabs use enterprise blue selection with transparent hover in either theme',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');},INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
 async function checkTabs(tablist,dark){
  const selected=tablist.locator('[role=tab][aria-selected=true]');
  const selectedId=await selected.evaluate(el=>el.id||el.textContent);
  for(const tab of (await tablist.getByRole('tab').all()).slice(0,2)){
   await page.mouse.move(600,30);const initialColor=await tab.evaluate(el=>getComputedStyle(el).color);
   await tab.hover();await expect(tab).toHaveCSS('color',dark?'rgb(133, 189, 255)':'rgb(8, 102, 232)');
   await expect(tab).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
   await expect(tab).toHaveCSS('box-shadow','none');await expect(tab).toHaveCSS('border-top-width','0px');
   await expect.poll(()=>selected.evaluate(el=>el.id||el.textContent)).toBe(selectedId);
   await page.mouse.move(600,30);await expect(tab).toHaveCSS('color',initialColor);
  }
 }
 for(const dark of [false,true]){
  if(dark)await page.locator('.system-header-actions .theme-toggle').click();
  for(const name of ['試驗委託','排程管理','設備管理','物料管理','報表分析']){
   await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
   await expect(page.locator('.dashboard-topbar .lms-breadcrumbs').getByRole('button',{name:'COLONG LMS',exact:true})).toHaveText('COLONG LMS');
   await checkTabs(page.getByRole('tablist').first(),dark);
   if(name==='排程管理'){
    await page.getByRole('button',{name:'排程管理圖表',exact:true}).click();await checkTabs(page.getByRole('tablist',{name:'甘特圖類型'}),dark);
    await page.getByRole('button',{name:'關閉排程管理圖表',exact:true}).click();
   }
   if(name==='設備管理'||name==='物料管理'){
    const kind=name==='設備管理'?'設備':'物料';
    await page.getByRole('button',{name:`${kind}資訊`,exact:true}).first().click();await checkTabs(page.getByRole('tablist',{name:`${kind}資訊分類`}),dark);
    await page.getByRole('dialog').getByRole('button',{name:/關閉/}).first().click();
   }
  }
 }
 expect(await page.pageErrors()).toEqual([]);
});

for(const [width,height] of [[1920,1080],[1366,768],[1280,720]])test(`LMS enterprise canvas, white icons and blue bot ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');},INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
 await expect(page.locator('.live-dashboard-meta')).toHaveCount(0);
 const content=page.locator('.dashboard-content'),launcher=page.getByRole('button',{name:'展開AI智能助理'});
 await expect(content).toHaveCSS('background-color','rgb(245, 247, 250)');
 await expect(launcher).toHaveCSS('background-color','rgb(8, 102, 232)');
 const icons=page.locator('.sidebar .lms-sidebar-icon');expect(await icons.count()).toBeGreaterThanOrEqual(9);
 for(const icon of await icons.all()){await expect(icon).toHaveCSS('stroke','rgb(255, 255, 255)');await expect(icon).toHaveAttribute('fill','none');}
 await page.screenshot({path:test.info().outputPath(`dashboard-${width}x${height}.png`)});
 await page.locator('.sidebar').getByRole('button',{name:'試驗委託',exact:true}).click();
 await expect(content).toHaveCSS('background-color','rgb(245, 247, 250)');
 await page.getByRole('tab',{name:/待審查/}).click();
 await page.screenshot({path:test.info().outputPath(`request-tabs-${width}x${height}.png`)});
 await page.locator('.system-header-actions .theme-toggle').click();
 await expect(launcher).toHaveCSS('background-color','rgb(8, 102, 232)');
 await expect(content).not.toHaveCSS('background-color','rgb(245, 247, 250)');
 await expect(page.getByRole('tab',{name:/待審查/})).toHaveCSS('color','rgb(133, 189, 255)');
 await expect(icons.first()).toHaveCSS('stroke','rgb(255, 255, 255)');
 expect(await page.pageErrors()).toEqual([]);
});
