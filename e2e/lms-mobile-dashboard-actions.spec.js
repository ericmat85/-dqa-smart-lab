import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
async function seed(page,theme='light'){
 await page.addInitScript(({accounts,equipment,theme})=>{
  if(!localStorage.getItem('lms-mobile-action-seed')){
   localStorage.setItem('lms-mobile-action-seed','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
   for(const k of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(k,'[]');
  }
  sessionStorage.setItem('dqa-lms-account-id','U001');sessionStorage.setItem('dqa-request-account-id','DEMO-REQUESTER');sessionStorage.setItem('dqa-request-role','requester');sessionStorage.setItem('dqa-lab-account-id','U003');
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,theme});
}
const business=page=>page.evaluate(()=>Object.fromEntries(['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa-equipment-demo-v1','dqa-shared-demo-accounts-v1'].map(k=>[k,localStorage.getItem(k)])));
const actions=page=>page.locator('.dashboard-content :is(button,a,summary):has(>.lms-header-action-label)');
test.beforeEach(async({context})=>{await context.route('**/*',r=>{const u=new URL(r.request().url());return !['127.0.0.1','localhost'].includes(u.hostname)||u.pathname.startsWith('/api/')?r.abort():r.continue();});});
for(const [width,theme] of [[320,'light'],[390,'light'],[390,'dark'],[768,'dark'],[900,'light']])test(`LMS mobile ${width} ${theme}: full-width dashboard and accessible icon headers`,async({page})=>{
 await page.setViewportSize({width,height:950});await seed(page,theme);const calls=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});await page.goto('/lms/dashboard');const before=await business(page);await expect(page.locator('.live-dashboard')).toBeVisible();const sizes=await page.locator('.dashboard-content').evaluate(content=>{const d=content.querySelector('.live-dashboard'),c=content.getBoundingClientRect(),b=d.getBoundingClientRect(),s=getComputedStyle(content);return {left:b.left-c.left-padding(s.paddingLeft),width:b.width,available:content.clientWidth-padding(s.paddingLeft)-padding(s.paddingRight),margin:getComputedStyle(d).marginRight};function padding(v){return parseFloat(v)||0;}});expect(Math.abs(sizes.left)).toBeLessThan(1);expect(Math.abs(sizes.width-sizes.available)).toBeLessThanOrEqual(1);expect(sizes.margin).toBe('0px');await expect(page.locator('.live-metric')).toHaveCount(5);await page.screenshot({path:test.info().outputPath(`dashboard-${width}-${theme}.png`),fullPage:true});
 for(const route of ['requests','schedule','equipment','maintenance','reports','settings','settings/parameters','settings/documents','settings/backup','settings/accounts','settings/ai/E2','settings/ai/E3','settings/ai/E4']){
  await page.goto('/lms/'+route);await expect(page.locator('.dashboard-content')).toBeVisible();await expect.poll(()=>actions(page).count()).toBeGreaterThan(0);
  for(const button of await actions(page).all()){
   if(!await button.isVisible())continue;await expect(button.locator('>.lms-header-action-icon')).toBeVisible();await expect(button.locator('>.lms-header-action-label')).toHaveCSS('position','absolute');await expect(button.locator('>.lms-header-action-label')).toHaveCSS('clip-path','inset(50%)');const box=await button.boundingBox();expect(box.width).toBe(36);expect(box.height).toBe(36);expect((await button.innerText()).trim().length).toBeGreaterThan(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(route==='requests'){
   const heading=page.locator('.lms-compact-requests .template-heading'),title=heading.getByRole('heading',{name:'試驗委託管理',exact:true});await expect(heading).toHaveCSS('display','grid');await expect(title).toHaveCSS('text-align','center');const area=await heading.locator('>div:first-child').boundingBox(),outer=await heading.boundingBox();expect(Math.abs(area.x+area.width/2-outer.x-outer.width/2)).toBeLessThanOrEqual(1);await expect(heading.getByRole('link',{name:'歷史委託',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath(`requests-${width}-${theme}.png`)});
  }
  if(route==='equipment')await page.screenshot({path:test.info().outputPath(`equipment-${width}-${theme}.png`)});
 }
 expect(await business(page)).toEqual(before);expect(calls).toEqual([]);expect(await page.pageErrors()).toEqual([]);
});
test('mobile header actions retain history, creation, export menu, refresh and preference callbacks',async({page})=>{
 await seed(page);await page.setViewportSize({width:390,height:900});await page.goto('/lms/dashboard');await page.getByRole('button',{name:'全部排程 ↗',exact:true}).click();await expect(page).toHaveURL(/\/lms\/schedule$/);const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'歷史排程',exact:true}).click();const history=await popup;await expect(history.getByRole('heading',{name:'歷史排程',exact:true})).toBeVisible();await history.close();
 for(const [route,name,dialogName] of [['equipment','＋ 新增設備','新增設備'],['equipment','＋ 狀態變更','設備狀態變更'],['maintenance','＋ 新增物料','新增物料'],['maintenance','＋ 狀態變更','物料狀態變更']]){await page.goto('/lms/'+route);await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('dialog',{name:dialogName,exact:true})).toBeVisible();await page.keyboard.press('Escape');}
 await page.goto('/lms/reports');await page.locator('.management-export-menu>summary').click();await expect(page.getByRole('button',{name:/Excel 活頁簿/})).toBeVisible();await expect(page.getByRole('button',{name:/AI 客製報告／特殊報告草稿/})).toBeVisible();await page.goto('/lms/settings');await page.getByRole('button',{name:'重新檢查',exact:true}).click();await expect(page.getByRole('status')).toContainText('重新讀取本機資料');await page.goto('/lms/settings/ai/E4');await page.getByRole('button',{name:'調整E4偏好',exact:true}).click();await expect(page.getByRole('dialog',{name:'調整E4偏好',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'返回 AI 引擎管理',exact:true}).click();await expect(page).toHaveURL(/\/lms\/settings\/ai$/);expect(await page.pageErrors()).toEqual([]);
});
test('desktop LMS retains its original dashboard margin and visible action text',async({page})=>{
 await seed(page);await page.setViewportSize({width:1366,height:900});await page.goto('/lms/dashboard');await expect(page.locator('.live-dashboard')).toHaveCSS('margin-right','64px');for(const route of ['requests','schedule','equipment','maintenance','reports','settings','settings/ai/E4']){await page.goto('/lms/'+route);await expect.poll(()=>actions(page).count()).toBeGreaterThan(0);for(const button of await actions(page).all()){if(!await button.isVisible())continue;await expect(button.locator('>.lms-header-action-icon')).toBeHidden();await expect(button.locator('>.lms-header-action-label')).toHaveCSS('display','contents');}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.goto('/lms/equipment');expect((await page.getByRole('button',{name:'＋ 新增設備',exact:true}).boundingBox()).width).toBeGreaterThan(70);expect(await page.pageErrors()).toEqual([]);
});
for(const system of ['request','lab'])test(`${system} mobile keeps text buttons and unchanged header styles`,async({page})=>{
 await seed(page);await page.setViewportSize({width:390,height:900});
 if(system==='lab'){
  await page.goto('/lab/dashboard');await page.getByRole('button',{name:'切換功能選單',exact:true}).click();await page.locator('.lab-sidebar').getByRole('button',{name:'資料庫',exact:true}).click();
 }else await page.goto('/request/archive');
 await page.getByRole('tab',{name:'報告範本',exact:true}).click();const button=page.getByRole('button',{name:'預覽空白委託單',exact:true});await expect(button).toBeVisible();await expect(button.locator('>.lms-header-action-icon')).toBeHidden();await expect(button.locator('>.lms-header-action-label')).toHaveCSS('display','contents');expect((await button.boundingBox()).width).toBeGreaterThan(70);expect(await page.pageErrors()).toEqual([]);
});
