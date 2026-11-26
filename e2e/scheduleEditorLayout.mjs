import {expect} from '@playwright/test';
export async function assertScheduleEditorLayout(page,dialog){
 const viewport=page.viewportSize();
 await expect.poll(async()=>(await dialog.boundingBox())?.width||0).toBeGreaterThanOrEqual(viewport.width-32);
 const box=await dialog.boundingBox();
 expect(box.width).toBeGreaterThanOrEqual(viewport.width-32);
 expect(box.height).toBeGreaterThanOrEqual(viewport.height-32);
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
 expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
 expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 const details=dialog.locator(':scope>.schedule-edit-body>.template-info+.schedule-request-details');if(await details.count())expect(await details.evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(12);
 const body=dialog.locator(':scope>.schedule-edit-body');await body.evaluate(el=>el.scrollTop=el.scrollHeight);
 const footer=await dialog.locator(':scope>.schedule-edit-actions').boundingBox();
 expect(footer.y+footer.height).toBeLessThanOrEqual(viewport.height+1);
 expect(await body.evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
 await body.evaluate(el=>el.scrollTop=0);
}
