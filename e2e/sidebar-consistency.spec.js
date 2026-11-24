import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
const systems={lms:{sidebar:'.sidebar',header:'.dashboard-topbar'},request:{sidebar:'.rq-sidebar',header:'.rq-topbar'},lab:{sidebar:'.lab-sidebar',header:'.lab-global-header'}};
async function seed(page,theme){
 await page.addInitScript(({accounts,theme})=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);sessionStorage.setItem('dqa-lms-account-id','U001');sessionStorage.setItem('dqa-request-account-id','DEMO-REQUESTER');sessionStorage.setItem('dqa-request-role','requester');sessionStorage.setItem('dqa-lab-account-id','U003');},{accounts:INITIAL_ACCOUNTS,theme});
}
for(const theme of ['light','dark'])for(const [system,selectors] of Object.entries(systems))test(`${system} ${theme} sidebar matches LMS frame`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page,theme);await page.goto(`/${system}/dashboard`);
 const sidebar=page.locator(selectors.sidebar);await expect(sidebar).toBeVisible();const box=await sidebar.boundingBox();expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(232);expect(box.height).toBe(900);
 const logo=sidebar.locator('.company-brand-logo');await expect(logo).toBeVisible();expect((await logo.boundingBox()).width).toBe(170);await expect(page.locator(selectors.header).locator('.company-brand-logo')).toBeHidden();expect((await page.locator(selectors.header).boundingBox()).x).toBe(232);
 const home=sidebar.getByRole('button',{name:'回到首頁',exact:true});await expect(home).toBeVisible();await expect(home.locator('svg')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.pageErrors()).toEqual([]);
 await captureBrowserEvidence(page,{path:test.info().outputPath(`sidebar-${system}-${theme}.png`),fullPage:true});
 await home.click();await expect(page).toHaveURL(/\/$/);
});
for(const system of ['request','lab'])test(`${system} mobile sidebar keeps navigation accessible`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page,'dark');await page.goto(`/${system}/dashboard`);const sidebar=page.locator(systems[system].sidebar);await expect(sidebar).toBeHidden();await page.getByRole('button',{name:'切換功能選單',exact:true}).click();await expect(sidebar).toBeVisible();await expect(sidebar.locator('.company-brand-logo')).toBeVisible();await sidebar.getByRole('button',{name:system==='lab'?'操作歷程':'案件歷程',exact:true}).click();await expect(sidebar).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
