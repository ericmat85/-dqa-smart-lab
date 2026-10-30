import {test,expect} from '@playwright/test';
for(const [width,height] of [[1366,768],[1672,941],[1440,900],[1920,1080],[1280,640],[960,600]]){
 test(`portal ${width}x${height} fits without scrolling and all four entries remain clickable`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});await page.goto('/');
  await expect(page.locator('.portal-choices button')).toHaveCount(4);await expect(page.locator('.portal-lab-photo')).toHaveCount(0);const logo=page.locator('.portal-brand img');await expect(logo).toHaveAttribute('src',/colong-ie-transparent.png$/);expect(await logo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,w:innerWidth,h:innerHeight}));expect(bounds.width).toBeLessThanOrEqual(bounds.w);expect(bounds.height).toBeLessThanOrEqual(bounds.h);
  for(const button of await page.locator('.portal-choices button').all()){const box=await button.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(height);expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);}
  await page.screenshot({path:test.info().outputPath(`portal-${width}.png`),fullPage:true});expect(errors).toEqual([]);
 });
}
test('portal mobile and zoom-equivalent narrow windows keep every entry accessible without horizontal clipping',async({page})=>{
 for(const [width,height]of [[375,812],[768,600],[683,384]]){await page.setViewportSize({width,height});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.portal-choices button')).toHaveCount(4);await expect(page.locator('.portal-lab-photo')).toHaveCount(0);await page.getByRole('button',{name:/設計品質管理/}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:/設計品質管理/}).click();await expect(page).toHaveURL(/validation\/login$/);await expect(page.getByRole('button',{name:'暫未開放'})).toBeDisabled();}
});
