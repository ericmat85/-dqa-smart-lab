import {test,expect} from '@playwright/test';
for(const system of ['lms','request','lab','validation'])test(`${system} uses unified credentials and hold-to-reveal password`,async({page})=>{
 await page.goto(`/${system}/login`);
 const account=page.getByLabel('登入帳號（電子郵件）',{exact:true}),password=page.getByLabel('密碼',{exact:true}),eye=page.getByRole('button',{name:'按住顯示密碼'});
 await expect(account).toHaveAttribute('autocomplete','username');await expect(password).toHaveAttribute('autocomplete','current-password');await expect(password).toHaveAttribute('type','password');
 await expect(page.locator('.rq-eyebrow,.lab-eyebrow,.login-card>.eyebrow')).toHaveCount(0);
 await expect(eye.locator('svg')).toHaveCount(1);await expect(page.getByRole('button',{name:'忘記密碼？',exact:true})).toBeVisible();
 if(system==='validation'){await expect(eye).toBeDisabled();await expect(page.getByRole('button',{name:'暫未開放'})).toBeDisabled();return;}
 await password.fill('Hold-Password-123');const box=await eye.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect(password).toHaveAttribute('type','text');await expect(eye).toHaveAttribute('aria-pressed','true');await page.mouse.up();await expect(password).toHaveAttribute('type','password');
 await eye.focus();await page.keyboard.down('Space');await expect(password).toHaveAttribute('type','text');await page.keyboard.up('Space');await expect(password).toHaveAttribute('type','password');
 await page.keyboard.down('Enter');await expect(password).toHaveAttribute('type','text');await page.keyboard.up('Enter');await expect(password).toHaveAttribute('type','password');
 await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x-30,box.y-30);await expect(password).toHaveAttribute('type','password');await page.mouse.up();
 await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await expect(password).toHaveAttribute('type','text');await eye.dispatchEvent('pointercancel',{pointerId:1});await expect(password).toHaveAttribute('type','password');await page.mouse.up();
 await page.getByRole('button',{name:'忘記密碼？',exact:true}).click();await expect(page.getByRole('status')).toContainText('請聯絡 DQA 管理員');
 if(system==='lms')await expect(page.getByRole('button',{name:'登入系統',exact:false})).toHaveCSS('background-color','rgb(22, 163, 74)');
 expect(await page.pageErrors()).toEqual([]);
});
test('touch release hides the password and Enter submits the request login',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:375,height:812}}),page=await context.newPage();await page.goto('/request/login');
 const password=page.getByLabel('密碼',{exact:true}),eye=page.getByRole('button',{name:'按住顯示密碼'});await expect(password).toHaveAttribute('type','password');
 await eye.tap();await expect(password).toHaveAttribute('type','password');
 await password.press('Enter');await expect(page).toHaveURL(/request\/dashboard$/);await context.close();
});

for(const system of ['lms','request','lab'])test(`${system} recovery and remember checkbox are below the password and persist only the account`,async({page})=>{
 await page.goto(`/${system}/login`);
 const account=page.getByLabel('登入帳號（電子郵件）',{exact:true}),password=page.getByLabel('密碼',{exact:true}),remember=page.getByRole('checkbox',{name:'記住我',exact:true}),help=page.getByRole('button',{name:'忘記密碼？',exact:true});
 const field=await password.boundingBox(),check=await remember.boundingBox(),link=await help.boundingBox(),submit=await page.getByRole('button',{name:'登入系統',exact:false}).boundingBox();
 expect(check.y).toBeGreaterThanOrEqual(field.y+field.height);expect(link.y).toBeGreaterThanOrEqual(field.y+field.height);expect(link.y+link.height).toBeLessThanOrEqual(submit.y);
 await account.fill(`remember-${system}@example.com`);await password.fill('PRIVATE-UNSAVED-PASSWORD');await remember.check();await page.reload();
 await expect(remember).toBeChecked();await expect(account).toHaveValue(`remember-${system}@example.com`);await expect(password).not.toHaveValue('PRIVATE-UNSAVED-PASSWORD');
 const values=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('dqa-remembered-login-v1:')).map(key=>localStorage.getItem(key)));expect(values).toEqual([`remember-${system}@example.com`]);
 await remember.uncheck();await page.reload();await expect(remember).not.toBeChecked();await expect(account).not.toHaveValue(`remember-${system}@example.com`);
 if(system==='request'){
  await account.fill('requester-remember@example.com');await remember.check();await page.getByRole('button',{name:'主管登入',exact:false}).click();await expect(remember).not.toBeChecked();await expect(account).not.toHaveValue('requester-remember@example.com');await page.getByRole('button',{name:'委託者登入',exact:false}).click();await expect(account).toHaveValue('requester-remember@example.com');
 }
});
