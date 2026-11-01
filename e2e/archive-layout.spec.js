import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
for(const width of [1366,390])test(`archive aligns with management pages at ${width}px in both themes`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');},INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
 async function nav(name){if(width<=900)await page.getByRole('button',{name:'切換側邊欄'}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();}
 for(const dark of [false,true]){
  if(dark)await page.getByRole('button',{name:'切換深色或淺色模式'}).click();
  await nav('設備管理');const frame=await page.locator('.dashboard-content > .panel').boundingBox(),title=await page.getByRole('heading',{name:'設備管理',exact:true}).boundingBox();
  await nav('資料庫');const archive=page.locator('.dashboard-content > .archive-page'),box=await archive.boundingBox(),heading=await page.getByRole('heading',{name:'資料庫',exact:true}).boundingBox();
  for(const key of ['x','y','width'])expect(Math.abs(frame[key]-box[key])).toBeLessThan(1);
  expect(Math.abs(title.x-heading.x)).toBeLessThan(1);expect(Math.abs(title.y-heading.y)).toBeLessThan(1);
  await expect(archive.getByRole('searchbox',{name:'搜尋已結案報告'})).toBeVisible();
  await expect(archive.locator('.template-table')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await archive.getByRole('searchbox',{name:'搜尋已結案報告'}).fill('NO-ARCHIVED-MATCH');await expect(archive).toContainText('目前沒有您可查閱的已封存報告');
 }
});
