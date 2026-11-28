import {resetVisibleListFilters,revealListSearch} from './list-filter-controls.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {excelModule} from '../src/reportWorkbook.mjs';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
test.beforeEach(async({page})=>{
 await page.addInitScript(({accounts,equipment})=>{
  if(!localStorage.getItem('management-seed')){
   localStorage.setItem('management-seed','yes');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
   for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify(Array.from({length:25},(_,i)=>({id:`EXPORT-${i}`,requestId:`REQ-EXPORT-${i}`,title:'低溫試驗',equipmentId:equipment[0].id,eq:equipment[0].name,owner:'陳工程師',ownerId:'U003',time:'2099-11-07',end:'2099-11-08',status:'已排程'}))));
  }
  sessionStorage.setItem('dqa-lms-account-id','U001');
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT});
 await page.goto('/lms/dashboard');
});
async function nav(page,name){
 await expect(page.locator('.sidebar')).toBeAttached();
 if(page.viewportSize().width<=900){const toggle=page.getByRole('button',{name:'切換側邊欄',exact:true});await expect(toggle).toBeVisible();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');}
 await page.locator('.sidebar').getByRole('button',{name:name==='帳號管理'?'系統管理':name,exact:true}).click();
 if(name==='帳號管理')await page.getByRole('button',{name:'開啟帳號與權限管理',exact:true}).click();
}
test('report export downloads valid complete Excel and Chinese PDF with column selection',async({page})=>{
 await nav(page,'報表分析');await expect(page.getByRole('heading',{name:'報表分析',exact:true})).toBeVisible();
 await page.locator('.management-export-menu>summary').click();await expect(page.locator('.management-export-menu>summary')).toHaveCSS('background-color','rgb(8, 102, 232)');
 let waiting=page.waitForEvent('download');await page.getByRole('button',{name:/Excel 活頁簿/}).click();let download=await waiting;expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(await readFile(await download.path()));expect(book.worksheets[0].rowCount).toBe(26);expect(book.worksheets[1].name).toBe('匯出摘要');
 await page.locator('.management-export-menu>summary').click();waiting=page.waitForEvent('download');await page.getByRole('button',{name:/PDF 文件/}).click();download=await waiting;expect(download.suggestedFilename()).toMatch(/\.pdf$/);const pdf=await PDFDocument.load(await readFile(await download.path()));expect(pdf.getPageCount()).toBeGreaterThan(0);expect(pdf.getTitle()).toBe('試驗執行統計');
 await revealListSearch(page);await page.getByRole('searchbox',{name:'搜尋報表'}).fill('REQ-EXPORT-24');await expect(page.locator('.lab-report-scope')).toContainText('顯示 1／25 筆');
 await page.locator('.management-fold>summary').click();await page.locator('.management-column-options').getByLabel('設備',{exact:true}).uncheck();
 await expect(page.locator('.live-record-table thead')).not.toContainText('設備');
 await resetVisibleListFilters(page);await expect(page.locator('.lab-report-scope')).toContainText('顯示 25／25 筆');
 expect(await page.pageErrors()).toEqual([]);
});
test('accounts and roles share a workspace, assign custom permissions and preserve them after reload',async({page})=>{
 await nav(page,'帳號管理');await expect(page.getByRole('heading',{name:'帳號與權限管理'})).toBeVisible();
 await page.getByRole('tab',{name:/角色與權限/}).click();await expect(page.locator('dialog.role-dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'建立新角色',exact:true}).click();const role=page.getByRole('dialog',{name:'建立角色',exact:true});await role.getByLabel('角色名稱',{exact:true}).fill('排程協作專員');await role.getByLabel('排程管理',{exact:true}).check();await role.getByRole('button',{name:'儲存角色權限'}).click();await expect(page.getByRole('status')).toContainText('角色權限已儲存');
 await page.getByRole('tab',{name:/帳號清單/}).click();await page.locator('.account-table tbody tr').filter({hasText:'U003'}).getByRole('button',{name:'編輯',exact:true}).click();
 const form=page.locator('.account-form');await form.getByLabel('角色',{exact:true}).selectOption({label:'排程協作專員'});await form.getByRole('button',{name:'儲存修改'}).click();
 await revealListSearch(page);await page.getByLabel('依角色篩選').selectOption({label:'排程協作專員'});await expect(page.locator('.account-table tbody tr')).toHaveCount(1);await expect(page.locator('.account-table')).toContainText('2 個功能頁面');
 await page.reload();await nav(page,'帳號管理');await revealListSearch(page);await page.getByLabel('依角色篩選').selectOption({label:'排程協作專員'});await expect(page.locator('.account-table')).toContainText('U003');
 expect(await page.pageErrors()).toEqual([]);
});
test('report export settings persist preferences while system settings retain appearance and health controls',async({page})=>{
 await nav(page,'系統管理');const settings=page.locator('.settings-management');
 await expect(settings.locator('.management-fold')).toHaveCount(0);await expect(settings.getByText('資料來源健檢',{exact:true})).toHaveCount(0);
 await expect(settings.getByLabel('報表預設日期範圍')).toHaveCount(0);await nav(page,'報表分析');await page.getByText('報表顯示與匯出設定',{exact:true}).click();const preferences=page.locator('.report-preferences');await preferences.getByLabel('報表預設日期範圍').selectOption('month');await preferences.locator('.settings-checkbox input').uncheck();await preferences.getByRole('button',{name:'儲存偏好'}).click();await expect(preferences.getByRole('status')).toContainText('偏好已儲存');
 await nav(page,'報表分析');await expect(page.getByLabel('日期範圍',{exact:true})).toHaveValue('month');
 await nav(page,'系統管理');await page.getByRole('button',{name:'切換深色或淺色模式'}).click();await expect(page.locator('.dashboard-shell')).toHaveClass(/theme-dark/);
 await settings.getByRole('button',{name:'開啟系統監控',exact:true}).click();await expect(page.getByRole('region',{name:'資料來源健檢',exact:true})).toBeVisible();await page.getByRole('tab',{name:'管理總覽',exact:true}).click();
 await settings.getByRole('button',{name:'重新檢查',exact:true}).click();await expect(settings.getByRole('region',{name:'工作區主題',exact:true}).getByRole('status')).toContainText('資料已重新讀取');
 await expect(settings.locator('.settings-home-footer')).toHaveCount(0);await page.locator('.sidebar').getByRole('button',{name:'回到首頁',exact:true}).click();await expect(page).toHaveURL(/\/$/);expect(await page.evaluate(()=>sessionStorage.getItem('dqa-lms-account-id'))).toBe('U001');
 await page.goto('/lms/dashboard');await page.locator('.sidebar').getByRole('button',{name:'回到首頁',exact:true}).click();await expect(page).toHaveURL(/\/$/);
 expect(await page.pageErrors()).toEqual([]);
});
for(const width of [1366,375])test(`management pages fit ${width}px in both themes`,async({page})=>{
 await page.setViewportSize({width,height:900});
 for(const dark of [false,true]){
  if(dark)await page.locator('.system-header-actions .theme-toggle').click();
  for(const name of ['報表分析','帳號管理','系統管理']){
   await nav(page,name);if(name==='報表分析')await page.locator('.report-config>summary').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await captureBrowserEvidence(page,{path:test.info().outputPath(`management-${name}-${width}-${dark?'dark':'light'}.png`),fullPage:true});
  }
 }
});
