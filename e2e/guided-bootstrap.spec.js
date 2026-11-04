import {test,expect} from '@playwright/test';
test('desktop application bootstrap opens real guided workspace',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());const errors=[];page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Application bootstrap failed'))errors.push(message.text());});await page.setViewportSize({width:1366,height:900});await page.goto('/');const start=page.getByRole('button',{name:'AI 機器人導覽',exact:true});await expect(start.or(page.getByText('畫面載入失敗，請重新整理或重新開始導覽。',{exact:true}))).toBeVisible();expect(errors).toEqual([]);await start.click();await expect(page.frameLocator('iframe[title="九階導覽實際系統畫面"]').getByRole('button',{name:'簽核',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
