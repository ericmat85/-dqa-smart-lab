import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
for(const width of [1366,375])test(`equipment schedule grouping, chronological order and filters at ${width}px`,async({page})=>{
 await page.addInitScript(({accounts,equipment})=>{
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));sessionStorage.setItem('dqa-lms-account-id','U001');
  for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify([
   {id:'LATE',requestId:'REQ-LATE',time:'2099-01-10',end:'2099-01-11'},
   {id:'NEAR',requestId:'REQ-NEAR',time:'2099-01-02',end:'2099-01-03',equipmentIds:[equipment[0].id,equipment[1].id]},
  ].map(row=>({title:'低溫試驗',quantity:1,ownerId:'U003',owner:'陳工程師',equipmentId:equipment[0].id,eq:equipment[0].name,status:'已排程',...row}))));
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT.slice(0,3)});
 await page.setViewportSize({width:1366,height:900});await page.goto('/lms/dashboard');await page.locator('.sidebar').getByRole('button',{name:'排程管理',exact:true}).click();
 const tab=page.getByRole('tab',{name:/依設備排程/});await tab.click();
 const panel=page.getByRole('tabpanel',{name:/依設備排程/}),cards=panel.locator('.equipment-schedule-card');
 await expect(cards).toHaveCount(3);await expect(cards.first().locator('.equipment-schedule-count')).toHaveText('2 件委託 · 2 筆試驗');
 await expect(panel.locator('.equipment-schedule-kpis')).toContainText('委託 2 件（不重複）');
 await expect(cards.first().locator('tbody tr').first()).toContainText('REQ-NEAR');await expect(cards.first().locator('tbody tr').last()).toContainText('REQ-LATE');
 await page.setViewportSize({width,height:900});
 await expect(tab).toHaveCSS('color','rgb(124, 58, 237)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.getByRole('button',{name:'全部收合',exact:true}).click();await expect(cards.first().locator('.schedule-table-region')).toBeHidden();
 await panel.getByRole('button',{name:'全部展開',exact:true}).click();await expect(cards.first().locator('.schedule-table-region')).toBeVisible();
 await page.getByRole('searchbox',{name:'搜尋排程'}).fill('REQ-LATE');await expect(cards).toHaveCount(1);await expect(cards.first().locator('tbody tr')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'搜尋排程'}).fill(DEMO_EQUIPMENT[1].name);await expect(cards).toHaveCount(1);await expect(cards.first().locator('tbody tr')).toContainText('REQ-NEAR');
 await page.getByRole('searchbox',{name:'搜尋排程'}).fill('不存在設備');await expect(panel.getByText('沒有符合篩選條件的設備排程')).toBeVisible();
 await page.getByRole('searchbox',{name:'搜尋排程'}).fill('');await page.screenshot({path:test.info().outputPath(`equipment-schedules-${width}.png`),fullPage:true});
 await tab.focus();await tab.press('Home');await expect(page.getByRole('tab',{name:/全部排程/})).toBeFocused();await page.getByRole('tab',{name:/全部排程/}).press('End');await expect(tab).toBeFocused();
 expect(await page.pageErrors()).toEqual([]);
});
