import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
test.beforeEach(async({page})=>{await page.addInitScript(accounts=>localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts)),INITIAL_ACCOUNTS);});
test('request tabs stay transparent and use green selection in both themes and narrow screens',async({page})=>{
 await page.goto('/request/login');await page.getByRole('button',{name:'登入系統',exact:false}).click();
 await page.goto('/request/requests');
 const tabs=page.getByRole('tablist',{name:'我的委託與借用'}),selected=tabs.locator('[aria-selected=true]');
 for(const dark of [false,true]){
  if(dark)await page.locator('.system-header-actions .theme-toggle').click();
  await expect(selected).toHaveCSS('color',dark?'rgb(134, 239, 172)':'rgb(22, 163, 74)');
  for(const tab of await tabs.getByRole('tab').all()){await tab.hover();await expect(tab).toHaveCSS('background-color','rgba(0, 0, 0, 0)');}
  await expect(selected.locator('span')).toHaveCSS('background-color',dark?'rgb(23, 59, 42)':'rgb(232, 249, 238)');
 }
 await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('shared equipment information tabs inherit lab blue in both themes',async({page})=>{
 await page.goto('/lab/login');await page.getByRole('button',{name:'登入系統',exact:false}).click();
 // Mount the real shared information dialog in the lab shell to verify its inherited theme.
 await page.evaluate(async()=>{
  const [{default:React},{default:ReactDOM},{default:EquipmentInfoModal}]=await Promise.all([import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import('/src/EquipmentInfoModal.jsx')]);
  const host=document.createElement('div');document.querySelector('.lab-shell').append(host);
  ReactDOM.createRoot(host).render(React.createElement(EquipmentInfoModal,{equipment:{id:'EQ-THEME',name:'主題驗證設備',status:'待機中',records:[]},onClose:()=>{}}));
 });
 const selected=page.getByRole('tablist',{name:'設備資訊分類'}).locator('[aria-selected=true]');
 await expect(selected).toHaveCSS('color','rgb(37, 99, 235)');
 await page.evaluate(()=>{document.querySelector('.lab-shell').classList.add('lab-theme-dark');});
 await expect(selected).toHaveCSS('color','rgb(147, 197, 253)');
 await selected.hover();await expect(selected).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});
