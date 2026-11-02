import {test,expect} from '@playwright/test';
const colors={request:'rgb(8, 102, 232)',lms:'rgb(8, 102, 232)',lab:'rgb(8, 102, 232)',validation:'rgb(230, 22, 61)'};
for(const system of Object.keys(colors))test(`${system} login uses gray recovery text and an accessible icon theme control`,async({page})=>{
 await page.goto(`/${system}/login`);
 await expect(page.locator('.rq-login-card>.rq-eyebrow,.lab-login-card>.lab-eyebrow,.login-card>.eyebrow')).toHaveCount(0);
 await expect(page.locator('.login-help-button')).toHaveCSS('color','rgb(107, 114, 128)');
 const theme=page.locator('.enterprise-theme');await expect(theme).toHaveText('');await expect(theme).toHaveAttribute('title','切換深色模式');await theme.focus();await page.keyboard.press('Enter');await expect(page.locator('.enterprise-login')).toHaveClass(/enterprise-dark/);await expect(theme).toHaveAttribute('aria-label','切換淺色模式');expect(await page.evaluate(()=>localStorage.getItem('dqa-global-theme'))).toBe('dark');await page.reload();await expect(page.locator('.enterprise-login')).toHaveClass(/enterprise-dark/);

});
for(const system of ['request','lms','lab'])test(`${system} dashboard logo and settings use entry color`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false})));
 await page.goto(`/${system}/login`);await page.getByRole('button',{name:'登入系統',exact:false}).click();await expect(page).toHaveURL(new RegExp(`/${system}/dashboard$`));
 const logo=page.locator(system==='lms'?'.colong-sidebar-brand .company-brand-logo':'.workspace-sidebar-brand .company-brand-logo');
 expect((await logo.boundingBox()).width).toBeLessThanOrEqual(190);
 const theme=page.locator('.system-header-actions .theme-toggle');await theme.hover();await expect(theme).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
 const profile=page.getByRole('button',{name:'個人帳號選單'});await profile.hover();await expect(profile).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await profile.click();
 const settings=page.getByRole('button',{name:'⚙ 個人設定',exact:true});await settings.hover();await expect(settings).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await settings.click();
 const upload=page.getByRole('button',{name:'＋ 上傳照片',exact:true});await upload.hover();await expect(upload).toHaveCSS('background-color','rgb(8, 102, 232)');await expect(upload).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await page.getByRole('button',{name:'關閉個人設定',exact:true}).click();await expect(profile).toBeFocused();
 if(system==='lms'){
  await theme.click();await theme.hover();await expect(theme).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await expect(theme).toHaveCSS('box-shadow','none');
  await expect(page.locator('.sidebar button.active')).toHaveCSS('background-color','rgb(8, 102, 232)');
  await profile.hover();await expect(profile).toHaveCSS('box-shadow','none');
 }
});
