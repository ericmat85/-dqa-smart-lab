import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
test.beforeEach(async({page})=>{
 await page.addInitScript(({accounts,equipment})=>{
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));sessionStorage.setItem('dqa-lms-account-id','U001');
  for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify([{id:'ALIGN',requestId:'REQ-ALIGN',title:'低溫試驗',status:'未排程',quantity:1}]));
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT});
});
for(const width of [1366,375,320])test(`expanded launcher content aligns left and the panel keeps its width at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/lms/dashboard');
 const launcher=page.locator('.intelligent-launcher');await launcher.click();await expect(launcher).toHaveCSS('width','136px');
 const panel=page.getByRole('complementary',{name:'AI智能助理'});await expect(panel).toBeVisible();
 const p=await panel.boundingBox();expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x+p.width).toBeLessThanOrEqual(width);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y+p.height).toBeLessThanOrEqual(844);
 await expect(launcher).toHaveCSS('justify-content','flex-start');
 const alignment=await launcher.evaluate(element=>{const button=element.getBoundingClientRect(),icon=element.querySelector('svg').getBoundingClientRect(),label=element.querySelector('.intelligent-launcher-label').getBoundingClientRect();return {left:icon.left-button.left,vertical:Math.abs(icon.top+icon.height/2-label.top-label.height/2),gap:label.left-icon.right};});
 expect(alignment.left).toBe(8);expect(alignment.vertical).toBeLessThanOrEqual(1);expect(alignment.gap).toBe(6);
 if(width<=600){expect(p.x).toBe(12);expect(p.width).toBe(width-24);expect(p.y).toBe(56);}else expect(p.width).toBe(390);
 for(const button of await panel.locator('header button,.intelligent-composer button').all()){await expect(button).toHaveCSS('align-items','center');await expect(button).toHaveCSS('justify-content','center');}
 await panel.getByRole('button',{name:'收合AI智能助理',exact:true}).click();await expect(launcher).toHaveCSS('width','68px');expect(await page.pageErrors()).toEqual([]);
});
test('assistant fits the visible area after mobile page zoom',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/lms/dashboard');const client=await context.newCDPSession(page);await client.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
 const launcher=page.locator('.intelligent-launcher');await launcher.evaluate(element=>element.click());
 const panel=page.locator('.intelligent-panel');await expect(panel).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const panel=document.querySelector('.intelligent-panel').getBoundingClientRect(),view=visualViewport;return panel.left>=view.offsetLeft&&panel.right<=view.offsetLeft+view.width&&panel.top>=view.offsetTop&&panel.bottom<=view.offsetTop+view.height;})).toBe(true);
 const fits=await launcher.evaluate(element=>{const box=element.getBoundingClientRect(),view=visualViewport;return box.left>=view.offsetLeft&&box.right<=view.offsetLeft+view.width;});expect(fits).toBe(true);await client.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
});
test('AI chips are shared, schedule dates are left aligned and buttons remain centered',async({page})=>{
 await page.goto('/lms/dashboard');const chip=await page.locator('.intelligent-launcher svg').innerHTML();await page.locator('.sidebar').getByRole('button',{name:'排程管理',exact:true}).click();await page.getByRole('button',{name:'編輯排程',exact:true}).click();
 const editor=page.getByRole('dialog',{name:/編輯試驗排程/});expect(await editor.locator('.schedule-ai-button-icon svg').innerHTML()).toBe(chip);
 for(const width of [1366,375]){
  await page.setViewportSize({width,height:900});
  for(const name of ['開始日期 *','預計完成日期 *']){const input=editor.getByLabel(name,{exact:true});await input.fill(name.startsWith('開始')?'2099-11-07':'2099-11-08');await expect(input).toHaveCSS('text-align','left');await expect(input).toHaveCSS('direction','ltr');}
  for(const name of ['儲存排程','中止排程']){const button=editor.getByRole('button',{name,exact:true});await expect(button).toHaveCSS('align-items','center');await expect(button).toHaveCSS('justify-content','center');}
 }
 await editor.getByRole('button',{name:/AI 自動化排程/}).click();await expect(page.getByRole('dialog',{name:'正在準備排程建議'})).toBeVisible();expect(await page.locator('.schedule-ai-symbol svg').innerHTML()).toBe(chip);await page.getByRole('button',{name:'取消分析'}).click();expect(await page.pageErrors()).toEqual([]);
});
