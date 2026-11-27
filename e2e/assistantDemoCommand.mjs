import {expect} from '@playwright/test';
// Page and FrameLocator both expose the locators used here. No hidden UI hooks.
export async function runDemoCommand(page,command,{reply}={}){
 const panel=page.locator('.intelligent-panel');
 if(!await panel.isVisible())await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();
 const previous=await panel.locator('.intelligent-reply').count();
 const input=page.getByRole('textbox',{name:'輸入問題',exact:true});
 await input.fill(command);await input.press('Enter');
 await expect(panel.locator('.intelligent-reply')).toHaveCount(previous+1);
 const response=panel.locator('.intelligent-reply').last();
 await expect(response).toHaveAttribute('aria-busy','false',{timeout:60000});
 if(reply)await expect(response).toContainText(reply);
 await panel.locator('header button').click();
}
