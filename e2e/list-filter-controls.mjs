export async function revealListSearch(page){
 await page.locator('.catalog-search-toggle,main input[type=search],.dashboard-content input[type=search],[role=dialog] input').first().waitFor({state:'attached'});
 if(await page.locator('[role=dialog]:visible').count())return;
 for(const button of await page.locator('.catalog-search-toggle[aria-expanded=false]').all())if(await button.isVisible())await button.click();
}
// Reset through the remaining visible controls after the explicit reset button was removed.
// These interactions only affect local list filters; they never save application records.
export async function resetVisibleListFilters(page){
 await revealListSearch(page);
 for(const field of await page.locator('input[type=search],.rq-filter-row input[type=date],.lab-report-controls input[type=date]').all()){
  if(await field.isVisible()&&await field.isEnabled())await field.fill('');
 }
 for(const field of await page.locator('.catalog-search-toolbar select,.rq-filter-row select,.lab-report-controls select').all()){
  if(await field.isVisible()&&await field.isEnabled()){
   const value=await field.locator('option').first().getAttribute('value');
   await field.selectOption(value===null?{index:0}:value);
  }
 }
 for(const card of await page.locator('.equipment-counts .summary-tile[aria-pressed=true],.schedule-kpi-button[aria-pressed=true]').all()){
  if(await card.isVisible())await card.click();
 }
 await revealListSearch(page);
}
