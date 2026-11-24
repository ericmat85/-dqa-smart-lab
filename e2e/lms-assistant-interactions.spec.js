import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {installMockE4Transport} from './mockE4Transport.mjs';

test.beforeEach(async({page})=>{
 await page.addInitScript(accounts=>{
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  sessionStorage.setItem('dqa-lms-account-id','U001');
 },INITIAL_ACCOUNTS);
});

for(const [width,height] of [[1920,1080],[1366,768],[1280,720]])test(`LMS fixed launcher, avatar and selected columns ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/lms/dashboard');
 const avatar=page.locator('.system-header-actions .avatar');
 const launcher=page.getByRole('button',{name:'展開AI智能助理'});
 const position=await launcher.boundingBox();
 expect(position.width).toBe(48);expect(position.height).toBe(48);
 await expect(page.locator('.intelligent-assistant')).toHaveCSS('position','fixed');
 await expect(page.locator('.lms-assistant-dock')).toHaveCount(0);
 const symbol=await launcher.locator('.intelligent-launcher-symbol').boundingBox();expect(Math.abs(symbol.x+symbol.width/2-position.x-position.width/2)).toBeLessThanOrEqual(1);expect(Math.abs(symbol.y+symbol.height/2-position.y-position.height/2)).toBeLessThanOrEqual(1);
 expect(position.y).toBe(height-64);expect(position.x).toBe(width-64);
 for(const name of ['儀錶板','試驗委託','排程管理']){
  await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  await expect(avatar).toHaveCSS('background-color','rgb(233, 242, 255)');
  const bounds=await page.locator('.dashboard-content').boundingBox();
  expect(Math.abs(bounds.y+bounds.height-height)).toBeLessThanOrEqual(1);
  await page.locator('.dashboard-content').evaluate(el=>el.scrollTop=el.scrollHeight);
  const after=await launcher.boundingBox();expect(after.x).toBe(position.x);expect(after.y).toBe(position.y);
 }
 const chart=page.getByRole('link',{name:'排程管理圖表',exact:true});
 await expect(chart).toHaveCSS('background-color','rgb(8, 102, 232)');await expect(chart).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(chart.locator('.schedule-chart-button-icon')).toHaveCSS('stroke','rgb(255, 255, 255)');
 const headers=page.locator('.schedule-table thead th');
 await headers.nth(0).click();await expect(headers.nth(0)).toHaveAttribute('aria-sort','ascending');
 await expect(headers.nth(0)).toHaveCSS('color','rgb(8, 102, 232)');
 await headers.nth(1).click();await expect(headers.nth(0)).not.toHaveAttribute('aria-sort');
 await expect(headers.nth(1)).toHaveCSS('background-color','rgb(233, 242, 255)');
 await captureBrowserEvidence(page,{path:test.info().outputPath(`lms-schedule-${width}x${height}.png`)});
 await page.locator('.system-header-actions .theme-toggle').click();
 await expect(avatar).toHaveCSS('background-color','rgb(22, 58, 97)');
 await expect(chart).toHaveCSS('background-color','rgb(8, 102, 232)');
 await expect(headers.nth(1)).toHaveCSS('color','rgb(133, 189, 255)');
 await launcher.click();const panel=await page.getByRole('complementary',{name:'AI智能助理'}).boundingBox();
 expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);
 expect(panel.y+panel.height).toBeLessThanOrEqual(height);
 expect(await page.pageErrors()).toEqual([]);
});

test('FAQ focuses the newest turn; replies append and scroll down without moving the workspace',async({page})=>{
 await installMockE4Transport(page);await page.addInitScript(()=>sessionStorage.setItem('dqa-lms-account-id','DEMO-LEVEL1'));
 await page.setViewportSize({width:1366,height:768});await page.goto('/lms/dashboard');
 await page.getByRole('button',{name:'展開AI智能助理'}).click();
 const questions=['如何安排新的試驗日程？','發生排程衝突時怎麼辦？','資料會自動同步嗎？重新整理會不會不見？'];
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


test('AI edge launcher moves vertically only and retains its circular size while expanded',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await page.goto('/lms/dashboard');
 const launcher=page.locator('.intelligent-launcher');
 const before=await launcher.boundingBox();
 await page.mouse.move(before.x+20,before.y+20);await page.mouse.down();
 await page.mouse.move(before.x-180,before.y-180,{steps:12});await page.mouse.up();
 const moved=await launcher.boundingBox();
 expect(moved.x).toBe(before.x);expect(moved.y).toBe(before.y-200);
 await expect(launcher).toHaveAttribute('aria-expanded','false');
 await launcher.click();await expect(launcher).toHaveCSS('width','48px');
 const expanded=await launcher.boundingBox();expect(expanded.x+expanded.width).toBe(1264);expect(expanded.y).toBe(moved.y);
 await page.locator('.intelligent-panel').getByRole('button',{name:'收合AI智能助理'}).click();
 await expect(launcher).toHaveCSS('width','48px');await expect(launcher).toBeFocused();
 await launcher.press('ArrowUp');expect((await launcher.boundingBox()).y).toBe(moved.y-24);
 await page.setViewportSize({width:375,height:300});
 const small=await launcher.boundingBox();expect(small.y+small.height).toBeLessThanOrEqual(300);expect(small.x+small.width).toBe(359);
});
