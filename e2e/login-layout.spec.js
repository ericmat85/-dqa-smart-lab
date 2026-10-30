import {test,expect} from '@playwright/test';
import {PORTAL_TITLES} from '../src/portalLabels.mjs';
for(const system of ['request','lms','lab','validation']){
 test(`${system} login is narrow, header-only branded, and matches its portal card title`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[375,812]]){
   await page.setViewportSize({width,height});await page.goto(`/${system}/login`);await expect(page.getByRole('heading',{name:PORTAL_TITLES[system],exact:true})).toBeVisible();
   const card=page.locator(system==='request'?'.rq-login-card':system==='lab'?'.lab-login-card':'.login-card');await expect(card.locator('img,.company-brand-logo')).toHaveCount(0);
   const logo=page.locator('header .company-brand-logo img');await expect(logo).toHaveCount(1);await expect(logo).toHaveAttribute('src',/colong-ie-transparent.png$/);expect(await logo.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
   const box=await card.boundingBox();expect(box.width).toBeLessThanOrEqual(430);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(system==='lab'){const main=await page.locator('.lab-login-main').boundingBox();expect(main.width).toBe(width);expect(box.y).toBeLessThanOrEqual(120);}
   if(width===1366)await page.screenshot({path:test.info().outputPath(`${system}-slim-login.png`),fullPage:true});
  }
  if(system==='lms'){await expect(page.getByLabel('登入帳號（電子郵件）')).toHaveValue('level1@example.com');await expect(page.getByLabel('密碼',{exact:true})).toHaveValue('demo1234');}
  if(system==='validation')await expect(page.getByRole('button',{name:/暫未開放/})).toBeDisabled();
  expect(errors).toEqual([]);
 });
}
