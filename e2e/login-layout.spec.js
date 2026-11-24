import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {PORTAL_TITLES} from '../src/portalLabels.mjs';
for(const system of ['request','lms','lab','validation']){
 test(`${system} login has a split enterprise panel, header-only branded, and matches its portal card title`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[375,812]]){
   await page.setViewportSize({width,height});await page.goto(`/${system}/login`);await expect(page.getByRole('heading',{name:PORTAL_TITLES[system],exact:true})).toBeVisible();
   const card=page.locator(system==='request'?'.rq-login-card':system==='lab'?'.lab-login-card':'.login-card');await expect(card.locator('img,.company-brand-logo')).toHaveCount(0);await expect(card.locator(':scope>.eyebrow,:scope>.rq-eyebrow,:scope>.lab-eyebrow,:scope>.login-description,:scope>.lab-login-description,:scope>.rq-muted,:scope>.login-note,:scope>.lab-login-note,:scope>.rq-demo-hint')).toHaveCount(0);
   const logo=page.locator('header .company-brand-logo img');await expect(logo).toHaveCount(1);await expect(logo).toHaveAttribute('src',/colong-ie-transparent.png$/);expect(await logo.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
   const box=await card.boundingBox();expect(box.width).toBeLessThanOrEqual(430);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const header=await page.locator('.enterprise-login-header').boundingBox(),panel=await page.locator('.enterprise-login-panel').boundingBox();if(width>720){expect(panel.y).toBe(header.height);expect(panel.x).toBeGreaterThan(width*.45);const rightGap=width-panel.x-panel.width;expect(Math.abs(rightGap)).toBeLessThanOrEqual(1);const content=await page.locator('.enterprise-panel-content').boundingBox();expect(content.y-panel.y).toBeLessThanOrEqual(57);}else{expect(panel.width).toBe(width);}
   if(width===1366)await captureBrowserEvidence(page,{path:test.info().outputPath(`${system}-slim-login.png`),fullPage:true});
  }
  if(system==='lms'){await expect(page.getByLabel('登入帳號（電子郵件）')).toHaveValue('level1@example.com');await expect(page.getByLabel('密碼',{exact:true})).toHaveValue('demo1234');}
  if(system==='validation')await expect(page.getByRole('button',{name:/暫未開放/})).toBeDisabled();
  expect(errors).toEqual([]);
 });
}
test('other login forms match request frame and field geometry while retaining their labels',async({page})=>{
 const measure=async(cardSelector,inputSelector,labelSelector)=>{
  await page.locator(cardSelector).waitFor({state:'visible'});
  await page.locator(inputSelector).first().waitFor({state:'visible'});
  await page.locator(labelSelector).first().waitFor({state:'visible'});
  return page.evaluate(({cardSelector,inputSelector,labelSelector})=>{
  const card=getComputedStyle(document.querySelector(cardSelector)),input=getComputedStyle(document.querySelector(inputSelector)),label=getComputedStyle(document.querySelector(labelSelector));
  return {frame:[card.width,card.padding,card.borderRadius,card.borderWidth],field:[input.height,input.padding,input.borderRadius,input.fontSize],label:[label.fontSize,label.fontWeight]};
 },{cardSelector,inputSelector,labelSelector});
 };
 for(const width of [1366,375]){
  await page.setViewportSize({width,height:900});await page.goto('/request/login');const reference=await measure('.rq-login-card','.rq-login-card input','.rq-login-card .rq-label');
  for(const system of ['lms','lab','validation']){
   await page.goto(`/${system}/login`);const card=system==='lab'?'.lab-login-card':'.login-card';
   expect(await measure(card,`${card} input`,`${card} label`)).toEqual(reference);
   await expect(page.getByRole('heading',{name:PORTAL_TITLES[system],exact:true})).toBeVisible();
  }
 }
});
