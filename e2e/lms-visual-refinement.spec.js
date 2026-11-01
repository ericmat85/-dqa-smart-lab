import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';

test.beforeEach(async({page})=>{
 await page.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));sessionStorage.setItem('dqa-lms-account-id','U001');},INITIAL_ACCOUNTS);
 await page.goto('/lms/dashboard');
});
test('compact help follows the request title and dashboard uses three distinct vector icons',async({page})=>{
 await expect(page.locator('.welcome-block')).toHaveText('COLONG LMS');
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
test('every schedule status tile filters, toggles off and uses orange selection in both themes',async({page})=>{
 await page.locator('.sidebar').getByRole('button',{name:'排程管理',exact:true}).click();
 const tiles=page.locator('.schedule-kpi-button');await expect(tiles).toHaveCount(4);
 for(const dark of [false,true]){
  if(dark)await page.getByRole('button',{name:'切換深色或淺色模式'}).click();
  for(let index=0;index<4;index++){
   const tile=tiles.nth(index);await tile.click();await expect(tile).toHaveAttribute('aria-pressed','true');await expect(tile).toHaveCSS('border-top-color','rgb(249, 115, 22)');
   await page.getByRole('tab',{name:/依設備排程/}).click();await expect(tile).toHaveAttribute('aria-pressed','true');
   await tile.click();await expect(tile).toHaveAttribute('aria-pressed','false');
  }
 }
});
