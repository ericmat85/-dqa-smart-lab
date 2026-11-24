import {revealListSearch} from './list-filter-controls.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
for(const system of ['lms','request','lab'])test(`${system} archive categories retain theme, keyboard access and template downloads`,async({page})=>{
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');sessionStorage.setItem('dqa-request-account-id','DEMO-SUPERVISOR');sessionStorage.setItem('dqa-request-role','supervisor');sessionStorage.setItem('dqa-lab-account-id','U003');},INITIAL_ACCOUNTS);
 await page.goto(`/${system}/dashboard`);
 if(system==='request')await page.goto('/request/archive');else await page.locator(system==='lms'?'.sidebar':'.lab-sidebar').getByRole('button',{name:'資料庫',exact:true}).click();
 const archive=page.locator('.archive-page'),tabs=archive.getByRole('tablist',{name:'資料庫分類'});
 await expect(tabs.getByRole('tab')).toHaveCount(4);
 for(const dark of [false,true]){
  if(dark)await page.getByRole('button',{name:'切換深色或淺色模式',exact:true}).click();
  const colors={lms:['rgb(15, 23, 42)','rgb(241, 245, 249)'],request:['rgb(15, 23, 42)','rgb(241, 245, 249)'],lab:['rgb(15, 23, 42)','rgb(241, 245, 249)']};
  await tabs.getByRole('tab',{name:'試驗報告',exact:true}).click();await expect(tabs.getByRole('tab',{name:'試驗報告',exact:true})).toHaveCSS('color',colors[system][dark?1:0]);
  for(const name of ['試驗規範','試驗手冊']){await tabs.getByRole('tab',{name,exact:true}).click();await expect(archive.getByRole('tabpanel',{name,exact:true})).toContainText(`目前沒有可查閱的${name}`);}
  await tabs.getByRole('tab',{name:'報告範本',exact:true}).click();const downloadEvent=page.waitForEvent('download');await archive.getByRole('link',{name:'下載範本'}).click();const download=await downloadEvent;expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await revealListSearch(page);await archive.getByRole('searchbox',{name:'搜尋報告範本'}).fill('不存在');await expect(archive).toContainText('沒有符合搜尋條件的報告範本');
  await tabs.getByRole('tab',{name:'報告範本',exact:true}).focus();await page.keyboard.press('Home');await expect(tabs.getByRole('tab',{name:'試驗報告',exact:true})).toBeFocused();await revealListSearch(page);await expect(archive.getByRole('searchbox',{name:'搜尋已結案報告'})).toHaveValue('');
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
