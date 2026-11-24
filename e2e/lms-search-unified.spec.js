import {resetVisibleListFilters} from './list-filter-controls.mjs';
import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
for(const width of [1366,390])for(const theme of ['light','dark'])test(`LMS unified search ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:768});await page.addInitScript(({accounts,theme})=>{if(!localStorage.getItem('search-unified-seeded')){localStorage.setItem('search-unified-seeded','1');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));}sessionStorage.setItem('dqa-lms-account-id','U001');},{accounts:INITIAL_ACCOUNTS,theme});
 let icon;
 for(const path of ['equipment','maintenance','requests','schedule','archive','accounts','requests/history','schedule/history']){
  await page.goto(`/lms/${path}`);const toolbar=page.locator('.catalog-search-toolbar').filter({visible:true}).first(),input=toolbar.getByRole('searchbox');await expect(input).toBeVisible();await expect(input).toHaveCSS('height',await input.evaluate(e=>e.closest('.workspace-tab-toolbar')?'32px':'36px'));await expect(input).toHaveCSS('font-size','12px');const svg=await toolbar.locator('.schedule-search-wrap svg').evaluate(el=>el.outerHTML);if(icon)expect(svg).toBe(icon);else icon=svg;
  await input.fill('SEARCH-NO-MATCH-TEST');await expect(input).toHaveValue('SEARCH-NO-MATCH-TEST');await resetVisibleListFilters(page);await expect(input).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(['requests','archive','accounts','requests/history'].includes(path))await captureBrowserEvidence(page,{animations:'disabled',path:test.info().outputPath(`search-${path.replace('/','-')}-${width}-${theme}.png`)});
 }
 await page.goto('/lms/reports');await expect(page.locator('.lab-report-category-description')).toHaveCount(0);await expect(page.locator('.lab-report-controls .schedule-search-wrap')).toHaveCount(0);await expect(page.getByRole('searchbox',{name:'搜尋報表',exact:true})).toBeVisible();await captureBrowserEvidence(page,{animations:'disabled',path:test.info().outputPath(`reports-clean-${width}-${theme}.png`)});
 await page.goto('/lms/settings');
 // Settings groups can move; select the appearance section by its visible title.
 const appearance=page.locator('details').filter({has:page.locator('summary').filter({hasText:'介面外觀'})});
 const fontSize=appearance.getByRole('combobox',{name:'字體大小',exact:true});
 await expect(appearance).not.toHaveAttribute('open','');
 await expect(fontSize).not.toBeVisible();
 await captureBrowserEvidence(page,{animations:'disabled',path:test.info().outputPath(`appearance-collapsed-${width}-${theme}.png`)});
 await appearance.locator('summary').click();
 await expect(fontSize).toBeVisible();
 await fontSize.selectOption('small');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-ui-preferences-v1')).fontSize)).toBe('small');
 await page.reload();
 await expect(appearance).not.toHaveAttribute('open','');
 await appearance.locator('summary').click();
 await expect(fontSize).toHaveValue('small');
 expect(await page.pageErrors()).toEqual([]);
});
