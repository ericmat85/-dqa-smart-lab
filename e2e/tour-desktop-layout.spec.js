import {test,expect} from '@playwright/test';
for(const system of ['lms','lab'])test(`assistant compact entry opens the real tour from ${system}`,async({page})=>{
 await page.setViewportSize({width:1600,height:900});await page.goto(`/${system}/login`);await page.getByRole('button',{name:/^登入系統/}).click();await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();
 const entry=page.getByRole('link',{name:'機器人九階導覽 →',exact:true});await expect(entry).toBeVisible();const size=await entry.boundingBox();expect(size.height).toBeLessThanOrEqual(38);expect(size.width).toBeLessThan(250);
 await entry.click();await expect(page).toHaveURL(/\/tour$/);await expect(page.frameLocator('iframe[title="九階導覽實際系統畫面"]').getByRole('button',{name:'簽核',exact:true})).toBeVisible();
});
test('desktop tour expands and enters fullscreen while preserving the interactive case',async({page})=>{
 await page.setViewportSize({width:1600,height:900});await page.goto('/tour');const workspace=page.locator('.tour-live-workspace'),coach=page.getByRole('complementary',{name:'AI機器人導覽'}),frame=page.frameLocator('iframe[title="九階導覽實際系統畫面"]');await expect(frame.getByRole('button',{name:'簽核',exact:true})).toBeVisible();
 const before=await workspace.boundingBox();expect(before.height).toBeGreaterThan(800);await page.getByRole('button',{name:'放大操作畫面',exact:true}).click();await expect(coach).toBeHidden();const expanded=await workspace.boundingBox();expect(expanded.width).toBeGreaterThan(before.width+250);await expect(frame.getByRole('button',{name:'簽核',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'展開解說',exact:true}).click();await expect(coach).toBeVisible();await page.getByRole('button',{name:'全螢幕',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);await expect(coach).toBeHidden();await page.getByRole('button',{name:'退出全螢幕',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
 await page.getByRole('button',{name:'展開解說',exact:true}).click();await page.screenshot({path:test.info().outputPath('desktop-tour-expanded-controls.png')});
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>frame.locator('.guided-target').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
