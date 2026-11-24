import {resetVisibleListFilters,revealListSearch} from './list-filter-controls.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {DEMO_MATERIALS} from '../src/demoMaterials.mjs';
const contrast=(a,b)=>{const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(n=>{const v=Number(n)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
for(const width of [1920,1366,390])for(const theme of ['light','dark'])test(`inventory icons ${width} ${theme}: distinct status symbols, contrast and filters`,async({page})=>{
 await page.setViewportSize({width,height:width===1920?1080:width===390?844:768});await page.addInitScript(({accounts,equipment,materials,theme})=>{localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));localStorage.setItem('dqa-materials-demo-v1',JSON.stringify(materials));for(const key of ['dqa-schedules-demo-v1','dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');sessionStorage.setItem('dqa-lms-account-id','U001');},{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,materials:DEMO_MATERIALS,theme});await page.goto('/lms/dashboard');
 const data=()=>page.evaluate(()=>Object.fromEntries(['dqa-equipment-demo-v1','dqa-materials-demo-v1','dqa-schedules-demo-v1'].map(key=>[key,localStorage.getItem(key)])));const before=await data();
 for(const [name,kind,count]of [['設備管理','equipment',6],['物料管理','materials',6]]){
  if(width===390)await page.getByRole('button',{name:'切換側邊欄',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  const cards=page.locator('.equipment-counts>.summary-tile');await expect(cards).toHaveCount(count);const paths=await cards.locator('svg path').evaluateAll(es=>es.map(e=>e.getAttribute('d')));expect(new Set(paths).size).toBe(count);
  for(const card of await cards.all()){const icon=card.locator('.workspace-summary-icon'),svg=icon.locator('svg');await expect(svg).toHaveCSS('width','20px');await expect(svg).toHaveCSS('height','20px');await expect(svg).toHaveAttribute('stroke','currentColor');const colors=await icon.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));expect(contrast(colors.fg,colors.bg)).toBeGreaterThanOrEqual(3);await expect(card.locator('.workspace-shortcut-arrow,.rq-kpi-arrow')).toHaveCount(0);}
  await page.mouse.move(0,0);await captureBrowserEvidence(page,{path:test.info().outputPath(`${kind}-icons-${width}-${theme}.png`)});
  if(width===390){await revealListSearch(page);await page.getByRole('searchbox').first().focus();await page.getByRole('button',{name:'清除搜尋與篩選',exact:true}).click();}else await resetVisibleListFilters(page);for(const card of await cards.all()){const expected=Number(await card.locator(':scope>strong').innerText());await card.click();await expect(card).toHaveAttribute('aria-pressed','true');await expect(page.locator('.catalog-category-views .template-table tbody tr')).toHaveCount(Math.min(expected,20));await card.click();await expect(card).toHaveAttribute('aria-pressed','false');await expect(page.locator('.catalog-category-views .template-table tbody tr')).toHaveCount(20);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(await data()).toEqual(before);expect(await page.pageErrors()).toEqual([]);
});
