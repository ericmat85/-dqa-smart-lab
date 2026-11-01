import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date('2030-01-01T04:00:00Z'));
 await page.addInitScript(({accounts,equipment})=>{
  if(!localStorage.getItem('activity-seed')){
   localStorage.setItem('activity-seed','yes');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
   for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify([{id:'ACTIVITY-1',requestId:'REQ-ACTIVITY',title:'低溫試驗',equipmentId:equipment[0].id,equipmentIds:equipment.map(row=>row.id),eq:equipment[0].name,time:'2030-01-01',end:'2030-01-07',status:'已排程'}]));
   localStorage.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{id:'REQ-ACTIVITY',scheduleId:'ACTIVITY-1',status:'試驗中',scheduledStart:'2030-01-01',scheduledEnd:'2030-01-07',acceptedAt:'2029-12-31T04:00:00Z'}]));
  }
  sessionStorage.setItem('dqa-lms-account-id','U001');
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT.slice(0,2)});
 await page.goto('/lms/dashboard');
});
async function nav(page,name){await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();}
test('saved activity horizon updates schedule KPI and dashboard calculations, and survives reload',async({page})=>{
 await nav(page,'排程管理');const kpi=page.locator('.equipment-activity-kpi');await expect(kpi).toContainText('設備稼動率（14 天）');await expect(kpi.locator('strong')).toHaveText('50%');
 await nav(page,'系統設定');await page.locator('#equipment-activity-settings>summary').click();await page.getByLabel('設備稼動率統計天數').selectOption('7');await page.getByRole('button',{name:'儲存偏好'}).click();
 await nav(page,'排程管理');await expect(kpi).toContainText('設備稼動率（7 天）');await expect(kpi.locator('strong')).toHaveText('100%');
 await nav(page,'儀錶板');await expect(page.locator('.live-metric').filter({hasText:'設備稼動率'})).toContainText('100%');
 await page.reload();await nav(page,'系統設定');await page.locator('#equipment-activity-settings>summary').click();await expect(page.getByLabel('設備稼動率統計天數')).toHaveValue('7');await page.getByLabel('設備稼動率起始日期').fill('2030-02-01');await page.getByRole('button',{name:'儲存偏好'}).click();
 await nav(page,'排程管理');await expect(kpi.locator('strong')).toHaveText('0%');await expect(kpi).toContainText('2030-02-01 — 2030-02-07');
 expect(await page.pageErrors()).toEqual([]);
});
test('personal settings use purple upload and a quiet close button with working keyboard focus',async({page})=>{
 for(const dark of [false,true]){
  if(dark)await page.locator('.system-header-actions .theme-toggle').click();
  await page.getByRole('button',{name:'個人帳號選單'}).click();await page.getByRole('button',{name:'⚙ 個人設定',exact:true}).click();
  const dialog=page.locator('.shared-personal-settings'),upload=dialog.getByRole('button',{name:'＋ 上傳照片',exact:true}),close=dialog.getByRole('button',{name:'關閉個人設定',exact:true});
  await expect(upload).toHaveCSS('background-color','rgb(8, 102, 232)');await expect(upload).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(dialog).toBeFocused();await close.hover();await expect(close).toHaveCSS('border-top-width','0px');await expect(close).toHaveCSS('box-shadow','none');await expect(close).toHaveCSS('outline-style','none');
  await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'個人帳號選單'})).toBeFocused();
 }
 expect(await page.pageErrors()).toEqual([]);
});
