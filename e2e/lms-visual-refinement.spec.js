import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';

test.beforeEach(async({page})=>{
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');},INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
});
test('compact help follows the request title and dashboard uses three distinct vector icons',async({page})=>{
 await expect(page.locator('.dashboard-topbar .lms-breadcrumbs').getByRole('button',{name:'實驗室管理系統',exact:true})).toHaveText('實驗室管理系統');
 const icons=page.locator('.live-metric-icon .dashboard-metric-symbol');await expect(icons).toHaveCount(3);
 expect(new Set(await icons.evaluateAll(nodes=>nodes.map(node=>node.innerHTML))).size).toBe(3);
 await page.locator('.sidebar').getByRole('button',{name:'試驗委託',exact:true}).click();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const heading=page.getByRole('heading',{name:'試驗委託管理',exact:true});await expect(heading).toBeVisible();
  const row=heading.locator('..'),button=row.getByRole('button',{name:'說明',exact:true});await expect(button).toHaveCSS('width','16px');await expect(button).toHaveCSS('height','16px');
  const titleBox=await heading.boundingBox(),iconBox=await button.boundingBox();
  expect(Math.abs(titleBox.y+titleBox.height/2-iconBox.y-iconBox.height/2)).toBeLessThan(1);
  expect(iconBox.x).toBeGreaterThanOrEqual(titleBox.x+titleBox.width);
  await button.blur();await button.focus();await expect(page.getByRole('tooltip')).toContainText('本頁顯示待審查');await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 }
});
test('every schedule status tile filters, toggles off and uses enterprise blue selection in both themes',async({page})=>{
 await page.locator('.sidebar').getByRole('button',{name:'排程管理',exact:true}).click();
 const tiles=page.locator('.schedule-kpi-button');await expect(tiles).toHaveCount(4);await expect(tiles.first()).toHaveAttribute('aria-pressed','true');await tiles.first().click();
 for(const dark of [false,true]){
  if(dark)await page.getByRole('button',{name:'切換深色或淺色模式'}).click();
  for(let index=0;index<4;index++){
   const tile=tiles.nth(index);if(await tile.getAttribute('aria-pressed')!=='true')await tile.click();await expect(tile).toHaveAttribute('aria-pressed','true');await expect(tile).toHaveCSS('border-top-color','rgb(8, 102, 232)');
   await page.getByRole('tab',{name:/依設備排程/}).click();await expect(tile).toHaveAttribute('aria-pressed','true');
   await tile.click();await expect(tile).toHaveAttribute('aria-pressed','false');
  }
 }
});

test('management summary tiles share schedule styling and help artwork is centered',async({page})=>{
 for(const name of ['排程管理','設備管理','物料管理','報表分析']){
  await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  const tile=page.locator('.summary-tiles > .summary-tile').first();await expect(tile).toBeVisible();
  await expect(tile).toHaveCSS('flex-direction','row');await expect(tile).toHaveCSS('border-radius','8px');
  if(await tile.getAttribute('aria-pressed')!=='true')await tile.click();await expect(tile).toHaveAttribute('aria-pressed','true');await expect(tile).toHaveCSS('border-top-color','rgb(8, 102, 232)');
  const icon=page.locator('.template-heading .help-tip-icon').first();
  const centers=await icon.evaluate(svg=>{const mark=svg.querySelector('.help-tip-mark').getBoundingClientRect(),circle=svg.getBoundingClientRect(),button=svg.closest('button').getBoundingClientRect();return [Math.abs(mark.x+mark.width/2-circle.x-circle.width/2),Math.abs(mark.y+mark.height/2-circle.y-circle.height/2),Math.abs(button.x+button.width/2-circle.x-circle.width/2),Math.abs(button.y+button.height/2-circle.y-circle.height/2)];});
  for(const delta of centers)expect(delta).toBeLessThan(.1);
 }
 await page.locator('.sidebar').getByRole('button',{name:'設備管理',exact:true}).click();await page.getByRole('button',{name:'＋ 狀態變更',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'設備狀態變更',exact:true});await expect(dialog.locator('.template-info')).toBeVisible();await expect(dialog.locator('.template-info')).toContainText('可選擇全部設備');
});

test('lighter actions, export icon, larger brand and list-based settings retain their controls',async({page})=>{
 await expect(page.locator('.lms-dashboard-heading h1')).toHaveCSS('font-size','22px');
 await expect(page.locator('.intelligent-launcher')).toHaveCSS('background-color','rgb(8, 102, 232)');
 await page.locator('.sidebar').getByRole('button',{name:'試驗委託',exact:true}).click();await expect(page.getByRole('link',{name:'歷史委託',exact:true})).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.locator('.sidebar').getByRole('button',{name:'報表分析',exact:true}).click();const exportButton=page.locator('.management-export-menu>summary');await expect(exportButton).toHaveCSS('background-color','rgb(8, 102, 232)');await expect(exportButton.locator('.report-export-icon')).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'系統設定',exact:true}).click();const settings=page.locator('.settings-management');await expect(settings.locator('.management-summary,.lab-system-rules')).toHaveCount(0);await expect(settings.locator('.settings-health-list>div')).toHaveCount(4);await expect(settings.getByRole('button',{name:'重新檢查',exact:true})).toHaveCSS('background-color','rgb(8, 102, 232)');await settings.getByRole('button',{name:'重新檢查',exact:true}).click();await expect(settings.getByRole('status')).toContainText('重新讀取本機資料');
});

test('dashboard cards retain neutral surfaces and report filters keep their borders',async({page})=>{
 const light=Array(4).fill('rgb(255, 255, 255)');
 const dark=Array(4).fill('rgb(16, 38, 61)');
 for(const night of [false,true]){
  if(night)await page.getByRole('button',{name:'切換深色或淺色模式'}).click();
  await page.locator('.sidebar').getByRole('button',{name:'儀錶板',exact:true}).click();
  for(let i=0;i<4;i++)await expect(page.locator('.live-metric-grid>.live-metric').nth(i)).toHaveCSS('background-color',(night?dark:light)[i]);
  await page.locator('.sidebar').getByRole('button',{name:'報表分析',exact:true}).click();
  const controls=page.locator('.lab-report-controls');await expect(controls).toHaveCSS('border-top-width','0px');
  for(const control of await controls.locator('input,select').all()){await expect(control).toHaveCSS('border-top-style','solid');await expect(control).toHaveCSS('border-top-width','1px');expect(await control.evaluate(el=>getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');}
 }
});
