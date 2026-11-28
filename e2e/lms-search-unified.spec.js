import {resetVisibleListFilters,revealListSearch} from './list-filter-controls.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
test.describe.configure({mode:'parallel'});
async function seed(page,width,theme){
 await page.setViewportSize({width,height:width===390?844:768});
 await page.addInitScript(({accounts,theme})=>{if(!localStorage.getItem('search-unified-seeded')){localStorage.setItem('search-unified-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));}sessionStorage.setItem('dqa-lms-account-id','U001');},{accounts:INITIAL_ACCOUNTS,theme});
}
for(const width of [1366,390])for(const theme of ['light','dark']){
 for(const path of ['equipment','maintenance','requests','schedule','archive','accounts','requests/history','schedule/history'])test(`LMS unified search ${path} ${width} ${theme}`,async({page})=>{
  await seed(page,width,theme);await page.goto(`/lms/${path}`);const toolbar=page.locator('.catalog-search-toolbar').filter({visible:true}).first(),input=toolbar.getByRole('searchbox'),toggle=toolbar.locator('.catalog-search-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(input).not.toBeVisible();await revealListSearch(page);await expect(input).toBeVisible();await expect(input).toHaveCSS('height','36px');await expect(input).toHaveCSS('font-size','12px');await expect(toggle.locator('[data-search-icon=magnifier]')).toHaveCount(1);
  await input.fill('SEARCH-NO-MATCH-TEST');await expect(input).toHaveValue('SEARCH-NO-MATCH-TEST');await resetVisibleListFilters(page);await expect(input).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(['requests','archive','accounts','requests/history'].includes(path))await captureBrowserEvidence(page,{animations:'disabled',path:test.info().outputPath(`search-${path.replace('/','-')}-${width}-${theme}.png`)});
  expect(await page.pageErrors()).toEqual([]);
 });
 test(`report search and interface preference ${width} ${theme}`,async({page})=>{
  await seed(page,width,theme);await page.goto('/lms/reports');await expect(page.locator('.lab-report-category-description')).toHaveCount(0);const toggle=page.getByRole('button',{name:'搜尋與篩選',exact:true});await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.click();await expect(page.getByRole('searchbox',{name:'搜尋報表',exact:true})).toBeVisible();
  await page.goto('/lms/settings/interface');const appearance=page.getByRole('region',{name:'介面外觀',exact:true}),fontSize=appearance.getByRole('combobox',{name:'字體大小',exact:true});await expect(fontSize).toBeVisible();await fontSize.selectOption('small');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-ui-preferences-v1')).fontSize)).toBe('small');await page.reload();await expect(fontSize).toHaveValue('small');expect(await page.pageErrors()).toEqual([]);
 });
}
