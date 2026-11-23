import {expect} from '@playwright/test';
export async function fillVirtualRequest(page){
 await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();
 const input=page.getByRole('textbox',{name:'輸入問題',exact:true});
 await input.fill('/demo start');await input.press('Enter');
 await expect(page.locator('.intelligent-reply').last()).toContainText('已填入虛擬委託資料');
 await page.locator('.intelligent-panel header button').click();
}
