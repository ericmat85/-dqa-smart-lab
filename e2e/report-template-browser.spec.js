import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {readFile} from 'node:fs/promises';
async function seed(page){
 await page.addInitScript(accounts=>{
  if(!localStorage.getItem('template-browser-seeded')){localStorage.setItem('template-browser-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-ui-preferences-v1',JSON.stringify({fontSize:'normal',language:'zh-TW',pageSize:10}));}
  sessionStorage.setItem('dqa-lms-account-id','U001');sessionStorage.setItem('dqa-request-account-id','DEMO-SUPERVISOR');sessionStorage.setItem('dqa-request-role','supervisor');sessionStorage.setItem('dqa-lab-account-id','U003');
 },INITIAL_ACCOUNTS);
}
test.beforeEach(async({context})=>{await context.route('**/*',r=>{const u=new URL(r.request().url());return ['http:','https:'].includes(u.protocol)&&(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname.startsWith('/api/'))?r.abort():r.continue();});});
async function open(page,system){await seed(page);await page.goto(`/${system}/dashboard`);if(system==='lab')await page.locator('.lab-sidebar').getByRole('button',{name:'資料庫',exact:true}).click();else await page.goto(`/${system}/archive`);await page.getByRole('tab',{name:'報告範本',exact:true}).click();return page.getByRole('region',{name:'委託單與報告範本管理'});}
for(const system of ['lms','request','lab'])test(`${system} database uses compact searchable categories and preserves dark theme`,async({page})=>{
 await page.setViewportSize({width:1366,height:900});const center=await open(page,system),tabs=center.getByRole('tablist',{name:'範本用途分類'});
 await expect(tabs.getByRole('tab')).toHaveCount(4);await expect(center.locator('.rtb-row')).toHaveCount(10);
 await expect(center.getByRole('navigation',{name:'列表分頁'})).toBeVisible();
 await tabs.getByRole('tab',{name:/^試驗範本/}).click();await expect(center.getByRole('status')).toContainText('20 份');
 await page.getByRole('searchbox',{name:'搜尋報告範本'}).fill('振動耐久試驗');await expect(center.locator('.rtb-row')).toHaveCount(1);await expect(center.locator('.rtb-row h4')).toHaveText('振動試驗');
 const details=center.locator('.rtb-details');await expect(details).not.toHaveAttribute('open','');await details.getByText('範本內容與對應資料',{exact:true}).click();await expect(details).toContainText('耐久振動試驗');await expect(details).toContainText('適用設備');
 await tabs.getByRole('tab',{name:/^上傳版本/}).click();await expect(center.getByText('沒有符合搜尋條件的報告範本',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'搜尋報告範本'}).fill('');await tabs.getByRole('tab',{name:/^上傳版本/}).click();await expect(center.getByText('尚無上傳範本',{exact:true})).toBeVisible();
 await tabs.getByRole('tab',{name:/^全部範本/}).click();await page.getByRole('button',{name:'切換深色或淺色模式',exact:true}).click();
 const colors=await center.locator('.rtb-row').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));expect(colors.background).not.toBe('rgb(255, 255, 255)');expect(colors.background).not.toBe(colors.color);
 await page.screenshot({path:test.info().outputPath(`${system}-templates-dark.png`),fullPage:true});
 await tabs.getByRole('tab',{name:/^全部範本/}).focus();await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:/^上傳版本/})).toBeFocused();await expect(tabs.getByRole('tab',{name:/^上傳版本/})).toHaveAttribute('aria-selected','true');
});
for(const width of [320,390,768])test(`mobile ${width} keeps rows contained and inline X clears category as well as search`,async({page})=>{
 await page.setViewportSize({width,height:844});const center=await open(page,'lms');await center.getByRole('tab',{name:/^試驗範本/}).click();const field=page.getByRole('searchbox',{name:'搜尋報告範本'});await field.fill('高溫高濕');await expect(center.locator('.rtb-row')).toHaveCount(1);
 const clear=page.getByRole('button',{name:'清除搜尋與篩選',exact:true});await clear.click();await expect(field).toHaveValue('');await expect(field).toBeFocused();await expect(center.getByRole('tab',{name:/^全部範本/})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const boxes=await center.locator('.rtb-row').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};}));expect(boxes.every(r=>r.left>=0&&r.right<=width)).toBe(true);
 await expect(page.getByRole('button',{name:'清除篩選',exact:true})).toBeHidden();
 await page.screenshot({path:test.info().outputPath(`templates-mobile-${width}.png`),fullPage:true});
});
test('trial, blank and general previews and downloads remain usable with no model requests',async({page})=>{
 test.setTimeout(90000);let apiRequests=0;page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests++;});await page.setViewportSize({width:1366,height:900});const center=await open(page,'lms');
 await center.getByRole('tab',{name:/^通用文件/}).click();await expect(center.locator('.rtb-row')).toHaveCount(2);
 await center.getByRole('button',{name:'預覽空白委託單',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByRole('table',{name:'委託單',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 await center.getByRole('button',{name:'預覽一般性能報告範本',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('region',{name:'試驗範本 Excel 預覽',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 const event=page.waitForEvent('download');await center.getByRole('link',{name:'下載範本',exact:true}).click();const file=await event;expect((await readFile(await file.path())).subarray(0,2).toString()).toBe('PK');
 await center.getByRole('tab',{name:/^試驗範本/}).click();await page.getByRole('searchbox',{name:'搜尋報告範本'}).fill('高溫高濕');await center.getByRole('button',{name:'預覽高溫高濕範本',exact:true}).click();dialog=page.getByRole('dialog',{name:'高溫高濕｜試驗範本預覽',exact:true});await expect(dialog.getByRole('table',{name:'委託單',exact:true})).toContainText('250');await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 const trialEvent=page.waitForEvent('download');await center.getByRole('button',{name:'下載高溫高濕Excel範本',exact:true}).click();const trialFile=await trialEvent;expect(trialFile.suggestedFilename()).toMatch(/高溫高濕.*xlsx$/);expect((await readFile(await trialFile.path())).subarray(0,2).toString()).toBe('PK');expect(apiRequests).toBe(0);
 await page.getByRole('searchbox',{name:'搜尋報告範本'}).fill('不存在的範本');await expect(center.getByText('沒有符合搜尋條件的報告範本',{exact:true})).toBeVisible();
});
