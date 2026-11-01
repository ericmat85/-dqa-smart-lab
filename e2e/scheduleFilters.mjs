// Tests that inspect every status explicitly clear the new pending-only default.
export async function showAllSchedules(page){
 await page.locator('.schedule-kpi-button').first().waitFor();
 const selected=page.locator('.schedule-kpi-button[aria-pressed="true"]');
 if(await selected.count())await selected.click();
}
