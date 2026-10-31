import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
test('desktop Chrome actual 200 percent tab zoom retains navigation, table scroll and signature actions',async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'dqa-zoom-'));
 const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,viewport:{width:1366,height:768},args:['--disable-dev-shm-usage']});
 try{
 await context.addInitScript(accounts=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));const requester=accounts.find(a=>a.role==='委託者');const supervisor=accounts.find(a=>a.id===requester.supervisorId);localStorage.setItem('dqa-request-demo-v2',JSON.stringify(Array.from({length:25},(_,i)=>({id:`ZOOM-${i}`,productCode:'DEMO-LONG-PRODUCT',status:i%2?'待主管簽核':'草稿',ownerId:requester.id,requester:requester.name,supervisorId:supervisor.id}))));},INITIAL_ACCOUNTS);
 const page=await context.newPage();await page.goto('chrome://settings/appearance');await page.locator('#zoomLevel').selectOption({label:'200%'});await page.goto('http://127.0.0.1:4173/request/login');
 await expect.poll(()=>page.evaluate(()=>window.devicePixelRatio)).toBe(2);expect(await page.evaluate(()=>innerWidth)).toBe(683);
 await page.getByRole('button',{name:'登入系統',exact:false}).click();await page.goto('http://127.0.0.1:4173/request/requests');expect(await page.locator('.rq-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.rq-table-wrap').scrollIntoViewIfNeeded();await page.screenshot({path:'/workspace/artifacts/request-ux/after/chrome-actual-200-percent-list.png',fullPage:false});await page.getByRole('button',{name:'切換功能選單'}).click();await page.locator('.rq-sidebar').getByRole('button',{name:'新增委託單'}).click();await page.getByRole('link',{name:'6. 簽名與主管'}).click();await expect(page.getByRole('button',{name:'送出主管簽核 →'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'送出主管簽核 →'}).scrollIntoViewIfNeeded();await page.screenshot({path:'/workspace/artifacts/request-ux/after/chrome-actual-200-percent.png',fullPage:false});
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
