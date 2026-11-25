import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {workspaceFixture} from './fixtures/workspace-design.mjs';
async function fitsViewport(dialog){
 await expect.poll(()=>dialog.locator('.trial-template-sheet').evaluate(area=>area.scrollWidth-area.clientWidth)).toBeLessThanOrEqual(2);
 await expect.poll(()=>dialog.locator('.trial-template-sheet').evaluate(area=>area.scrollHeight-area.clientHeight)).toBeLessThanOrEqual(2);
}
for(const dark of [false,true])for(const system of ['lms','request','lab'])test(`${system} Excel template full-window preview with zoom and without PDF ${dark?'dark':'light'}`,async({page,isMobile},info)=>{
 const s=await workspaceFixture(page,{dark});await page.goto(system==='lab'?'/lab/dashboard':`/${system}/archive`);await expect(page.locator('main')).toBeVisible({timeout:30000});
 if(system==='lab'){if(isMobile)await page.getByRole('button',{name:'切換功能選單',exact:true}).click();await page.locator('.lab-sidebar').getByRole('button',{name:'資料庫',exact:true}).click();}
 await page.getByRole('tab',{name:'報告範本',exact:true}).click();const trigger=page.getByRole('button',{name:'預覽空白委託單',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'空白電子委託單｜範本預覽',exact:true});await expect(dialog.getByRole('table',{name:'委託單',exact:true})).toBeVisible({timeout:30000});
 const box=await dialog.boundingBox(),viewport=page.viewportSize();expect(box.x).toBe(0);expect(box.y).toBe(0);expect(Math.abs(box.width-viewport.width)).toBeLessThanOrEqual(1);expect(Math.abs(box.height-viewport.height)).toBeLessThanOrEqual(1);
 await expect(dialog).toHaveCSS('border-radius','0px');await expect(dialog.getByRole('button',{name:'PDF 版面預覽',exact:true})).toHaveCount(0);await expect(dialog.locator('iframe,.template-pdf-preview')).toHaveCount(0);await expect(dialog.getByRole('combobox',{name:'範本預覽工作表'})).toBeVisible();
 const scale=dialog.getByRole('combobox',{name:'Excel 縮放比例',exact:true}),paper=dialog.locator('.template-preview-paper');await expect(scale).toHaveValue('100');const base=await paper.boundingBox();
 await dialog.getByRole('button',{name:'放大 Excel',exact:true}).click();await expect(scale).toHaveValue('125');await dialog.getByRole('button',{name:'縮小 Excel',exact:true}).click();await expect(scale).toHaveValue('100');
 await scale.selectOption('25');await expect(dialog.getByRole('button',{name:'縮小 Excel',exact:true})).toBeDisabled();expect(Math.abs((await paper.boundingBox()).width-base.width*.25)).toBeLessThan(2);
 await scale.selectOption('200');await expect(dialog.getByRole('button',{name:'放大 Excel',exact:true})).toBeDisabled();expect(Math.abs((await paper.boundingBox()).width-base.width*2)).toBeLessThan(2);
 const area=dialog.getByRole('region',{name:'試驗範本 Excel 預覽',exact:true});expect(await area.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);await area.evaluate(e=>{e.scrollLeft=e.scrollWidth;e.scrollTop=e.scrollHeight;});expect(await area.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 await scale.selectOption('fit');await fitsViewport(dialog);await page.setViewportSize({...viewport,height:Math.max(480,viewport.height-150)});await fitsViewport(dialog);await expect(scale).toHaveValue('fit');
 await page.screenshot({path:info.outputPath(`${system}-template-${dark}.png`)});
 const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'下載此範本 Excel',exact:true}).click();const download=await waiting;expect((await readFile(await download.path())).subarray(0,2).toString()).toBe('PK');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await trigger.click();await expect(dialog.getByRole('combobox',{name:'Excel 縮放比例',exact:true})).toHaveValue('100');await dialog.getByRole('button',{name:'關閉',exact:true}).click();expect(s.errors).toEqual([]);expect(s.writes).toEqual([]);
});
test('Excel zoom keeps worksheet images aligned and recalculates fit when switching worksheets',async({page})=>{
 const s=await workspaceFixture(page);await page.goto('/lms/archive');await page.getByRole('tab',{name:'報告範本',exact:true}).click();await page.getByRole('tab',{name:/^試驗範本/}).click();await page.getByRole('button',{name:'預覽高溫高濕範本',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'高溫高濕｜試驗範本預覽',exact:true}),scale=dialog.getByRole('combobox',{name:'Excel 縮放比例',exact:true}),sheets=dialog.getByRole('combobox',{name:'範本預覽工作表'});
 await sheets.selectOption({label:'結果與照片'});const images=dialog.locator('.template-preview-paper>img');await expect(images).toHaveCount(4);await expect.poll(()=>images.evaluateAll(rows=>rows.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
 const original=await images.first().evaluate(img=>{const image=img.getBoundingClientRect(),paper=img.parentElement.getBoundingClientRect();return {width:image.width,height:image.height,left:image.left-paper.left,top:image.top-paper.top};});
 await scale.selectOption('200');const enlarged=await images.first().evaluate(img=>{const image=img.getBoundingClientRect(),paper=img.parentElement.getBoundingClientRect();return {width:image.width,height:image.height,left:image.left-paper.left,top:image.top-paper.top};});
 for(const key of ['width','height','left','top'])expect(Math.abs(enlarged[key]-original[key]*2)).toBeLessThan(2);
 await scale.selectOption('fit');await fitsViewport(dialog);await sheets.selectOption({label:'委託單'});await expect(dialog.getByRole('table',{name:'委託單',exact:true})).toBeVisible();await expect(scale).toHaveValue('fit');await fitsViewport(dialog);
 await sheets.selectOption({label:'結果與照片'});await fitsViewport(dialog);await expect(images).toHaveCount(4);expect(s.writes).toEqual([]);expect(s.errors).toEqual([]);
});
