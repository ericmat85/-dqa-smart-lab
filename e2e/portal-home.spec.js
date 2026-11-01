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
test('portal highlight follows hover and keyboard focus with one red marker and gray inactive arrows',async({page})=>{
 await page.goto('/');const cards=page.locator('.portal-card'),red='rgb(230, 22, 61)',gray='rgb(139, 150, 172)';
 await expect(page.locator('.portal-card.is-marker')).toHaveClass(/portal-card-request/);await expect(page.locator('.portal-card.is-highlighted')).toHaveCount(0);
 await expect(page.locator('.portal-card-number')).toHaveCount(0);
 const textColors=await cards.evaluateAll(elements=>elements.map(card=>[card.querySelector('strong'),card.querySelector('.portal-card-kicker'),card.querySelector('.portal-card-desc'),card.querySelector('.portal-card-bottom')].map(el=>getComputedStyle(el).color)));
 const iconColors=['rgb(22, 163, 74)','rgb(124, 58, 237)','rgb(37, 99, 235)',red];
 const iconBackgrounds=['rgb(232, 249, 238)','rgb(242, 234, 255)','rgb(234, 242, 255)','rgb(255, 240, 243)'];
 for(const card of await cards.all())await expect(card.locator('.portal-card-bottom b')).toHaveCSS('color',gray);
 for(let i=0;i<4;i++){
  const card=cards.nth(i);await card.hover();await expect(page.locator('.portal-card.is-marker')).toHaveCount(1);await expect(card).toHaveClass(/is-marker/);for(const [index,selector] of ['strong','.portal-card-kicker','.portal-card-desc','.portal-card-bottom'].entries())await expect(card.locator(selector)).toHaveCSS('color',textColors[i][index]);await expect(card.locator('.portal-card-icon')).toHaveCSS('color',iconColors[i]);await expect(card.locator('.portal-card-icon')).toHaveCSS('background-color',iconBackgrounds[i]);await expect(card.locator('.portal-card-bottom b')).toHaveCSS('color',red);
  for(let j=0;j<4;j++)if(i!==j){await expect(cards.nth(j).locator('.portal-card-icon')).toHaveCSS('color',gray);await expect(cards.nth(j).locator('.portal-card-bottom b')).toHaveCSS('color',gray);}
 }
 await page.locator('.portal-header').hover();await expect(page.locator('.portal-card.is-highlighted')).toHaveCount(0);await expect(page.locator('.portal-card.is-marker')).toHaveClass(/portal-card-request/);
 await cards.nth(1).focus();await expect(cards.nth(1)).toHaveClass(/is-highlighted/);await expect(cards.nth(1).locator('.portal-card-bottom b')).toHaveCSS('color',red);await page.keyboard.press('Enter');await expect(page).toHaveURL(/lms\/login$/);
});
test('five portal themes rotate every 15 seconds, wrap, pause and allow manual selection',async({page})=>{
 await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));await page.goto('/');
 const intro=page.getByRole('region',{name:'平台主題輪播'});
 await expect(intro.locator('.portal-story-count')).toHaveCount(0);
 await expect(intro.locator('.portal-story-pause svg')).toHaveCount(1);
 await expect(intro.locator('.portal-story-pause')).toHaveText('');
 const tags=['DESIGN QUALITY','TESTING & LAB','E-REQUEST','REGULATORY','ANALYSIS'];
 await expect(intro.locator('.portal-overline')).toHaveText(tags[0]);
 await page.clock.fastForward(14999);await expect(intro.locator('.portal-overline')).toHaveText(tags[0]);
 await page.clock.fastForward(1);await expect(intro.locator('.portal-overline')).toHaveText(tags[1]);
 for(let i=2;i<5;i++){await page.clock.fastForward(15000);await expect(intro.locator('.portal-overline')).toHaveText(tags[i]);}
 await page.clock.fastForward(15000);await expect(intro.locator('.portal-overline')).toHaveText(tags[0]);
 await page.getByRole('button',{name:'暫停主題輪播',exact:true}).click();await page.clock.fastForward(30000);await expect(intro.locator('.portal-overline')).toHaveText(tags[0]);
 await page.getByRole('button',{name:'第 4 張：REGULATORY',exact:true}).click();await expect(intro.locator('.portal-overline')).toHaveText(tags[3]);
 await page.getByRole('button',{name:'播放主題輪播',exact:true}).click();await page.clock.fastForward(15000);await expect(intro.locator('.portal-overline')).toHaveText(tags[4]);
 for(const [width,height]of [[1366,768],[1440,900],[1920,1080],[960,600]]){
  await page.setViewportSize({width,height});
  for(let i=0;i<5;i++){await page.getByRole('button',{name:`第 ${i+1} 張：${tags[i]}`,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);}
 }
});
