import {expect} from '@playwright/test';
export async function openDemoAccelerator(page){
 let dialog=page.getByRole('dialog',{name:'試驗加速器 DEMO',exact:true});
 if(!await dialog.count()){
  const input=page.getByRole('textbox',{name:'輸入問題',exact:true});
  if(!await input.isVisible())await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();
  await input.fill('/demo accelerator');await page.getByRole('button',{name:'送出問題',exact:true}).click();
  await expect(dialog).toBeVisible();
 }
 return dialog;
}
export async function advanceDemo(page){const dialog=await openDemoAccelerator(page);await dialog.locator('[data-flow-test-action]').click();await dialog.getByRole('button',{name:'關閉',exact:true}).click();const collapse=page.getByRole('button',{name:'收合AI智能助理',exact:true}).last();if(await collapse.count())await collapse.click();}
export async function expectDemoDisabled(page){const dialog=await openDemoAccelerator(page);await expect(dialog.locator('[data-flow-test-action]')).toBeDisabled();await dialog.getByRole('button',{name:'關閉',exact:true}).click();const collapse=page.getByRole('button',{name:'收合AI智能助理',exact:true}).last();if(await collapse.count())await collapse.click();}
