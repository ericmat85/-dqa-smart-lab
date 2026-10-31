import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';

test.beforeEach(async({page})=>{
 await page.addInitScript(accounts=>{
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  sessionStorage.setItem('dqa-lms-account-id','U001');
 },INITIAL_ACCOUNTS);
});

for(const [width,height] of [[1920,1080],[1366,768],[1280,720]])test(`LMS bottom dock, avatar and selected columns ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/lms/dashboard');
 const avatar=page.locator('.system-header-actions .avatar');
 const launcher=page.getByRole('button',{name:'展開AI智能助理'});
 const position=await launcher.boundingBox();
 expect(position.width).toBe(40);expect(position.height).toBe(40);
 expect(position.y).toBeGreaterThan(height-56);expect(position.x).toBeGreaterThan(width-60);
 for(const name of ['儀錶板','試驗委託','排程管理']){
  await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  await expect(avatar).toHaveCSS('background-color','rgb(237, 233, 254)');
  const bounds=await page.locator('.dashboard-content').boundingBox();
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(position.y);
 }
 const chart=page.getByRole('button',{name:'排程管理圖表',exact:true});
 await expect(chart).toHaveCSS('background-color','rgb(115, 123, 133)');await expect(chart).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(chart.locator('svg')).toHaveCSS('stroke','rgb(255, 255, 255)');
 const headers=page.locator('.schedule-table thead th');
 await headers.nth(0).click();await expect(headers.nth(0)).toHaveAttribute('aria-sort','ascending');
 await expect(headers.nth(0)).toHaveCSS('color','rgb(91, 75, 213)');
 await headers.nth(1).click();await expect(headers.nth(0)).not.toHaveAttribute('aria-sort');
 await expect(headers.nth(1)).toHaveCSS('background-color','rgb(237, 233, 254)');
 await page.screenshot({path:test.info().outputPath(`lms-schedule-${width}x${height}.png`)});
 await page.locator('.system-header-actions .theme-toggle').click();
 await expect(avatar).toHaveCSS('background-color','rgb(237, 233, 254)');
 await expect(chart).toHaveCSS('background-color','rgb(115, 123, 133)');
 await expect(headers.nth(1)).toHaveCSS('color','rgb(196, 181, 253)');
 await launcher.click();const panel=await page.getByRole('complementary',{name:'AI智能助理'}).boundingBox();
 expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);
 expect(panel.y+panel.height).toBeLessThanOrEqual(position.y);
 expect(await page.pageErrors()).toEqual([]);
});

test('FAQ focuses the newest turn; replies append and scroll down without moving the workspace',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/lms/dashboard');
 await page.getByRole('button',{name:'展開AI智能助理'}).click();
 const questions=['如何安排新的試驗日程？','發生排程衝突時怎麼辦？','如何新增帳號並設定角色權限？'];
 const articles=page.locator('.intelligent-conversation article'),body=page.locator('.intelligent-body');
 const originalScroll=await page.locator('.dashboard-content').evaluate(el=>el.scrollTop);
 for(const [index,question] of questions.entries()){
  await page.locator('.intelligent-examples summary').click();
  await page.locator('.intelligent-examples').getByRole('button',{name:question,exact:false}).click();
  await expect(articles).toHaveCount(index+1);await expect(articles.last()).toBeFocused();
  await expect(page.locator('.intelligent-examples')).not.toHaveAttribute('open');
  await expect(articles.last().locator('.intelligent-reply')).toHaveAttribute('aria-busy','false',{timeout:12000});
  await expect.poll(()=>body.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
 }
 await expect(page.locator('.intelligent-question')).toHaveText(questions);
 expect(await body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 expect(await page.locator('.dashboard-content').evaluate(el=>el.scrollTop)).toBe(originalScroll);
 await page.getByRole('button',{name:'收合AI智能助理'}).last().click();
 await page.getByRole('button',{name:'展開AI智能助理'}).click();await expect(articles).toHaveCount(3);
 await expect.poll(()=>body.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
 expect(await page.pageErrors()).toEqual([]);
});
