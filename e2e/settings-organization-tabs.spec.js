import {resetVisibleListFilters,revealListSearch} from './list-filter-controls.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';

async function seed(page,{theme='light',readonly=false}={}){
 await page.addInitScript(({accounts,equipment,theme,readonly})=>{
  if(!localStorage.getItem('settings-tabs-seed')){
   localStorage.setItem('settings-tabs-seed','1');
   localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
   localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment.map((r,i)=>i===0?{...r,nextCalibration:'2000-01-01'}:r)));
   localStorage.setItem('dqa-global-theme',theme);
   localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
   for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
  }
  sessionStorage.setItem('dqa-lms-account-id',readonly?'DEMO-LEVEL3':'U001');
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,theme,readonly});
}
const business=page=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa-equipment-demo-v1','dqa-materials-demo-v1','dqa-shared-demo-accounts-v1','dqa-trial-catalog-v1'].map(k=>[k,localStorage.getItem(k)])));
test.beforeEach(async({context})=>{
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&!['127.0.0.1','localhost'].includes(u.hostname)?route.abort():route.continue();});
});
for(const [width,theme] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']])test(`parameter tabs, full-width search and expandable trials ${width} ${theme}`,async({page})=>{
 await seed(page,{theme});await page.setViewportSize({width,height:900});
 const calls=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
 await page.goto('/lms/settings/parameters');const before=await business(page),p=page.getByRole('region',{name:'試驗項目與設備參數管理'}),tabs=p.getByRole('tablist');
 await expect(tabs.getByRole('tab')).toHaveCount(4);
 const trials=p.getByRole('tabpanel',{name:'共用試驗項目與方法',exact:true});await expect(trials).toBeVisible();
 await expect(p.getByRole('tabpanel')).toHaveCount(1);
 const cards=trials.locator('.trial-catalog-list article');await expect(cards).toHaveCount(20);
 const first=cards.first();await expect(first.locator('details')).not.toHaveAttribute('open');
 await first.locator('summary').click();await expect(first.getByText('試驗規範／試驗手法',{exact:true})).toBeVisible();
 await first.locator('summary').focus();await page.keyboard.press('Enter');await expect(first.getByText('試驗規範／試驗手法',{exact:true})).toBeHidden();
 await revealListSearch(page);const search=trials.getByRole('searchbox',{name:'搜尋試驗項目與規範'}),bounds=await search.boundingBox();
 expect(bounds.width).toBeGreaterThan(120);expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(page.viewportSize().width);const toolbar=await trials.locator('.catalog-search-toggle').boundingBox();expect(toolbar.width).toBe(36);await revealListSearch(page);await search.fill('高溫高濕');await expect(cards).toHaveCount(1);
 await cards.locator('summary').click();await expect(cards).toContainText('250 小時');
 await captureBrowserEvidence(page,{path:test.info().outputPath(`parameters-${width}-${theme}.png`),fullPage:true});
 const equipmentTab=tabs.getByRole('tab',{name:'設備可用空間與規格',exact:true});await equipmentTab.click();
 const equipment=p.getByRole('tabpanel',{name:'設備可用空間與規格',exact:true});await expect(equipment).toBeVisible();await expect(equipment.getByRole('columnheader',{name:'可用空間 U',exact:true})).toBeVisible();await expect(equipment.locator('tbody tr')).toHaveCount(20);
 await equipmentTab.press('ArrowRight');await expect(p.getByRole('tabpanel',{name:'既有排程空間與保留時間'})).toBeVisible();
 await tabs.getByRole('tab',{name:'既有排程空間與保留時間'}).press('Home');await revealListSearch(page);await expect(search).toHaveValue('高溫高濕');await expect(search).toBeVisible();
 await resetVisibleListFilters(page);await expect(cards).toHaveCount(20);
 expect(await business(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(calls).toEqual([]);expect(await page.pageErrors()).toEqual([]);
});
test('home diagnostics move to the relevant modules and keep live source navigation',async({page})=>{
 await seed(page);await page.goto('/lms/settings');const before=await business(page),home=page.locator('.settings-management');
 await expect(home.locator('.management-fold')).toHaveCount(0);await expect(home.locator('.admin-module-card')).toHaveCount(13);
 for(const title of ['資料來源健檢','待處理工作提醒','系統規則與資料說明'])await expect(home.getByText(title,{exact:true})).toHaveCount(0);
 await home.getByRole('button',{name:'開啟系統監控',exact:true}).click();const health=page.getByRole('region',{name:'資料來源健檢',exact:true});await expect(health).toBeVisible();await expect(health.getByRole('columnheader',{name:'資料大小'})).toBeVisible();await expect(health.locator('tbody tr')).toHaveCount(10);await expect(health.locator('tbody')).toContainText('KB');await health.getByText('資料來源與計算方式',{exact:false}).click();await expect(health).toContainText('重疊時段不重複計算');
 await page.goto('/lms/settings/notifications');const reminders=page.getByRole('region',{name:'待處理工作提醒清單',exact:true});const row=reminders.getByRole('row').filter({hasText:'校驗到期'}).filter({hasText:'EQ-001'});await expect(row).toBeVisible();await row.getByRole('button',{name:'前往處理',exact:true}).click();await expect(page).toHaveURL(/\/lms\/equipment/);
 await page.goto('/lms/settings/backup');await expect(page.getByRole('region',{name:'資料儲存說明'})).toContainText('IndexedDB');
 await page.goto('/lms/settings/workflow');await expect(page.getByRole('region',{name:'日期與排程規則'})).toContainText('Asia / Taipei');await expect(page.locator('.admin-workflow-rules>article')).toHaveCount(9);
 await page.goto('/lms/settings/interface');await expect(page.getByRole('region',{name:'列表設定',exact:true})).toContainText('不受目前頁碼影響');
 expect(await business(page)).toEqual(before);expect(await page.pageErrors()).toEqual([]);
});
test('readonly role can expand trial details and switch tabs without editing data',async({page})=>{
 await seed(page,{readonly:true});await page.goto('/lms/settings/parameters');const p=page.getByRole('region',{name:'試驗項目與設備參數管理'}),before=await business(page);
 await expect(p.getByRole('button',{name:'試驗編輯器',exact:true})).toBeDisabled();await expect(p.getByRole('button',{name:'編輯高溫試驗',exact:true})).toBeDisabled();await p.locator('.trial-catalog-list summary').first().click();await expect(p.locator('.trial-catalog-list article').first().getByText('判定參考',{exact:true})).toBeVisible();await p.getByRole('tab',{name:'設備可用空間與規格',exact:true}).click();await expect(p.getByRole('tabpanel',{name:'設備可用空間與規格',exact:true})).toBeVisible();expect(await business(page)).toEqual(before);
});
