import {test,expect} from '@playwright/test';
const colors={request:'rgb(22, 163, 74)',lms:'rgb(124, 58, 237)',lab:'rgb(37, 99, 235)',validation:'rgb(230, 22, 61)'};
for(const system of Object.keys(colors))test(`${system} login label and theme hover use entry color`,async({page})=>{
 await page.goto(`/${system}/login`);
 const eyebrow=page.locator(system==='request'?'.rq-eyebrow':system==='lab'?'.lab-login-card>.lab-eyebrow':'.login-card>.eyebrow');
 await expect(eyebrow).toHaveCSS('color',colors[system]);
 const theme=page.locator(system==='request'?'.rq-login-mode':system==='lab'?'.lab-theme-pill':'.theme-toggle');
 await theme.hover();await expect(theme).toHaveCSS('border-top-color',system==='lms'?'rgb(203, 208, 213)':colors[system]);
});
for(const system of ['request','lms','lab'])test(`${system} dashboard logo and settings use entry color`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false})));
 await page.goto(`/${system}/login`);await page.getByRole('button',{name:'登入系統',exact:false}).click();await expect(page).toHaveURL(new RegExp(`/${system}/dashboard$`));
 const logo=page.locator(system==='lms'?'.colong-sidebar-brand .company-brand-logo':system==='lab'?'.lab-global-header>.company-brand-logo':'.rq-topbar>.company-brand-logo');
 expect((await logo.boundingBox()).width).toBeLessThanOrEqual(190);
 const theme=page.locator('.system-header-actions .theme-toggle');await theme.hover();await expect(theme).toHaveCSS('border-top-color',system==='lms'?'rgb(203, 208, 213)':colors[system]);
 const profile=page.getByRole('button',{name:'個人帳號選單'});await profile.hover();await expect(profile).toHaveCSS('border-top-color',system==='lms'?'rgba(0, 0, 0, 0)':colors[system]);await profile.click();
 const settings=page.getByRole('button',{name:'⚙ 個人設定',exact:true});await settings.hover();await expect(settings).toHaveCSS('border-top-color',system==='lms'?'rgb(203, 208, 213)':colors[system]);await settings.click();
 const upload=page.getByRole('button',{name:'＋ 上傳照片',exact:true});await upload.hover();await expect(upload).toHaveCSS('border-top-color',system==='lms'?'rgb(203, 208, 213)':colors[system]);await page.getByRole('button',{name:'關閉個人設定',exact:true}).click();await expect(profile).toBeFocused();
 if(system==='lms'){
  await theme.click();await theme.hover();await expect(theme).toHaveCSS('border-top-color','rgb(203, 208, 213)');
  await expect(page.locator('.sidebar button.active')).toHaveCSS('background-color','rgb(121, 127, 134)');
  await profile.hover();await expect(profile).toHaveCSS('box-shadow','none');
 }
});
