import {test,expect} from '@playwright/test';
import {PORTAL_TITLES} from '../src/portalLabels.mjs';
for(const width of [1366,1920])for(const theme of ['light','dark'])test(`desktop photo login hero ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:width===1920?1080:900});await page.addInitScript(theme=>localStorage.setItem('dqa-global-theme',theme),theme);
 for(const system of ['lms','request','lab','validation']){
  await page.goto(`/${system}/login`);await expect(page.getByRole('heading',{name:PORTAL_TITLES[system],exact:true})).toBeVisible();await expect(page.locator('.enterprise-product')).toContainText('DQA Smart Lab');await expect(page.locator('.enterprise-platform-icon')).toBeVisible();await expect(page.locator('.enterprise-features>div')).toHaveCount(4);
  expect(await page.locator('.enterprise-story').evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('laboratory-login.jpg');await expect(page.locator('.enterprise-story-sash')).toBeVisible();const panel=await page.locator('.enterprise-login-panel').boundingBox();expect(Math.abs(panel.x+panel.width-width)).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const title=await page.locator('.enterprise-platform-heading').boundingBox(),features=await page.locator('.enterprise-features').boundingBox();expect(features.y).toBeGreaterThan(title.y+title.height);await expect(page.getByLabel('登入帳號（電子郵件）',{exact:true})).toBeVisible();await expect(page.getByLabel('密碼',{exact:true})).toBeVisible();
  if(system==='lms'){await page.screenshot({path:test.info().outputPath(`login-photo-${width}-${theme}.png`),fullPage:true});await page.getByRole('button',{name:'說明',exact:true}).click();await expect(page.getByText('登入說明',{exact:true})).toBeVisible();await page.getByRole('button',{name:'關閉',exact:true}).click();}
 }
 expect(await page.pageErrors()).toEqual([]);
});
