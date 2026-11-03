import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
const keys={lms:'dqa-lms-account-id',request:'dqa-request-account-id',lab:'dqa-lab-account-id'};
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
 await page.addInitScript(accounts=>{if(localStorage.getItem('idle-seeded'))return;localStorage.setItem('idle-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1','dqa-schedules-demo-v1'])localStorage.setItem(key,'[]');},INITIAL_ACCOUNTS);
});
async function login(page,system){await page.goto(`/${system}/login`);await page.getByRole('button',{name:'登入系統',exact:false}).click();await expect(page).toHaveURL(new RegExp(`/${system}/dashboard$`));}
for(const system of Object.keys(keys)){
 test(`${system} keeps authentication when returning home and reentering its portal`,async({page})=>{
  await login(page,system);const id=await page.evaluate(key=>sessionStorage.getItem(key),keys[system]);
  if(system==='lms')await page.locator('.sidebar').getByRole('button',{name:'回到首頁',exact:true}).click();else if(system==='lab')await page.locator('.lab-back').click();else await page.goto('/');
  await expect(page).toHaveURL(/\/$/);expect(await page.evaluate(key=>sessionStorage.getItem(key),keys[system])).toBe(id);await page.locator(`.portal-card-${system}`).click();await expect(page).toHaveURL(new RegExp(`/${system}/dashboard$`));
  expect(await page.pageErrors()).toEqual([]);
 });
 test(`${system} logs out at 30 minutes, shows a modal and allows a fresh login`,async({page})=>{
  await login(page,system);await page.clock.fastForward(29*60*1000+59000);await expect(page.getByRole('dialog',{name:'已自動登出'})).toHaveCount(0);
  await page.clock.fastForward(1000);const modal=page.getByRole('dialog',{name:'已自動登出'});await expect(modal).toBeVisible();await expect(modal).toContainText('超過 30 分鐘未操作');await expect(page).toHaveURL(new RegExp(`/${system}/login$`));expect(await page.evaluate(key=>sessionStorage.getItem(key),keys[system])).toBeNull();
  await expect(modal.getByRole('button',{name:'確認，重新登入'})).toHaveCSS('background-color','rgb(8, 102, 232)');await modal.getByRole('button',{name:'確認，重新登入'}).click();await expect(modal).toHaveCount(0);await page.getByRole('button',{name:'登入系統',exact:false}).click();await expect(page).toHaveURL(new RegExp(`/${system}/dashboard$`));expect(await page.pageErrors()).toEqual([]);
 });
}
test('user interaction renews the idle deadline while reload does not',async({page})=>{
 await login(page,'lms');await page.clock.fastForward(29*60*1000);await page.keyboard.press('Tab');await page.clock.fastForward(2*60*1000);await expect(page).toHaveURL(/lms\/dashboard$/);
 await page.reload();await page.clock.fastForward(28*60*1000);await expect(page.getByRole('dialog',{name:'已自動登出'})).toBeVisible();
});
test('home idle expiration can be acknowledged and does not restore the old session',async({page})=>{
 await login(page,'lms');await page.goto('/');await page.clock.fastForward(30*60*1000);const modal=page.getByRole('dialog',{name:'已自動登出'});await expect(modal).toBeVisible();await modal.getByRole('button').click();await expect(modal).toHaveCount(0);await page.locator('.portal-card-lms').click();await expect(page).toHaveURL(/lms\/login$/);
});
test('an expired request session closes an active modal before showing the timeout notice',async({page})=>{
 await login(page,'request');await page.locator('.rq-sidebar').getByRole('button',{name:/申請借用/}).click();await page.getByRole('button',{name:'＋申請借用',exact:true}).click();await expect(page.getByRole('dialog',{name:'申請借用'})).toBeVisible();
 await page.clock.fastForward(30*60*1000);await expect(page.getByRole('dialog',{name:'申請借用'})).toHaveCount(0);await page.getByRole('dialog',{name:'已自動登出'}).getByRole('button').click();await expect(page.getByRole('button',{name:'登入系統',exact:false})).toBeEnabled();expect(await page.pageErrors()).toEqual([]);
});
