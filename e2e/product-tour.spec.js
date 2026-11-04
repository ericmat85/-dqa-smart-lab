import {test,expect} from '@playwright/test';
for(const width of [1366,390])for(const theme of ['light','dark'])test(`robot tour completes nine stages ${width} ${theme} without changing business data`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:1000});
 await page.addInitScript(theme=>{if(!localStorage.getItem('tour-test-seeded')){localStorage.setItem('tour-test-seeded','1');localStorage.setItem('dqa-global-theme',theme);localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id:'PRESERVE-CASE',status:'待主管簽核'}]));localStorage.setItem('dqa-schedules-demo-v1','[]');localStorage.setItem('dqa-shared-demo-accounts-v1','[]');sessionStorage.setItem('dqa-lms-account-id','PRESERVE-SESSION');}},theme);
 await page.goto('/');const before=await page.evaluate(()=>({local:{...localStorage},session:Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>!key.startsWith('dqa-session-activity-v1:')))}));await page.getByRole('button',{name:'機器人九階導覽',exact:true}).click();await expect(page).toHaveURL(/\/tour$/);
 const coach=page.getByRole('complementary',{name:'AI機器人導覽'}),progress=page.getByRole('progressbar',{name:'九階導覽進度'});
 for(let stage=1;stage<=9;stage++){
  await expect(progress).toHaveAttribute('aria-valuenow',String(stage),{timeout:30000});await expect(coach.getByRole('heading')).toContainText(stage===9?'已走完':`第 ${stage} 階`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(stage===8){await expect(page.getByRole('region',{name:'報告與結案'})).toContainText('尚未產生結案 PDF');await expect(page.getByRole('link',{name:'下載示範 PDF'})).toHaveCount(0);}
  if(stage===4){await coach.getByRole('button',{name:'上一步',exact:true}).click();await expect(progress).toHaveAttribute('aria-valuenow','3');await coach.getByRole('button',{name:'下一步',exact:true}).click();await expect(progress).toHaveAttribute('aria-valuenow','4');}
  if(stage<9)await coach.getByRole('button',{name:/^示範/}).click();
 }
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'下載示範 PDF'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toContain('DEMO.pdf');expect(await download.failure()).toBeNull();
 await page.getByRole('button',{name:'預覽示範 PDF',exact:true}).click();await expect(page.getByTitle('導覽結案示範 PDF')).toHaveAttribute('src',/^blob:/);await page.getByRole('button',{name:'收合示範 PDF',exact:true}).click();
 expect(await page.evaluate(()=>({local:{...localStorage},session:Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>!key.startsWith('dqa-session-activity-v1:')))}))).toEqual(before);expect(await page.pageErrors()).toEqual([]);
 await page.screenshot({path:test.info().outputPath(`tour-complete-${width}-${theme}.png`),fullPage:true});
 await coach.getByRole('button',{name:'重新開始',exact:true}).click();await expect(progress).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('link',{name:'下載示範 PDF'})).toHaveCount(0);await page.getByRole('button',{name:'離開導覽',exact:true}).click();await expect(page).toHaveURL(/\/$/);
});
test('automatic tour can pause, resume, finish and reload safely',async({page})=>{
 await page.clock.install();await page.goto('/tour');const coach=page.getByRole('complementary',{name:'AI機器人導覽'}),progress=page.getByRole('progressbar',{name:'九階導覽進度'});await expect(progress).toHaveAttribute('aria-valuenow','1');
 await coach.getByRole('button',{name:'自動導覽（每階 12 秒）',exact:true}).click();await page.clock.fastForward(12000);await expect(progress).toHaveAttribute('aria-valuenow','2');await coach.getByRole('button',{name:'暫停自動導覽',exact:true}).click();await page.clock.fastForward(36000);await expect(progress).toHaveAttribute('aria-valuenow','2');
 await coach.getByRole('button',{name:'自動導覽（每階 12 秒）',exact:true}).click();for(let stage=3;stage<=9;stage++){await page.clock.fastForward(12000);await expect(progress).toHaveAttribute('aria-valuenow',String(stage),{timeout:30000});}await expect(coach.getByRole('button',{name:'自動導覽（每階 12 秒）',exact:true})).toBeDisabled();await page.reload();await expect(progress).toHaveAttribute('aria-valuenow','1');
});
test('archive failure is visible and can retry without skipping the final stage',async({page})=>{
 await page.route('**/fonts/NotoSansCJKtc-Regular.otf',route=>route.abort());await page.goto('/tour');const coach=page.getByRole('complementary',{name:'AI機器人導覽'}),progress=page.getByRole('progressbar',{name:'九階導覽進度'});
 for(let stage=1;stage<8;stage++){await expect(progress).toHaveAttribute('aria-valuenow',String(stage),{timeout:30000});await coach.getByRole('button',{name:/^示範/}).click();}await expect(progress).toHaveAttribute('aria-valuenow','8');await coach.getByRole('button',{name:/^示範/}).click();await expect(coach.getByRole('alert')).toContainText('此步驟未完成');await expect(progress).toHaveAttribute('aria-valuenow','8');await expect(page.getByRole('link',{name:'下載示範 PDF'})).toHaveCount(0);
 await page.unroute('**/fonts/NotoSansCJKtc-Regular.otf');await coach.getByRole('button',{name:'重試此步驟',exact:true}).click();await expect(progress).toHaveAttribute('aria-valuenow','9',{timeout:30000});await expect(page.getByRole('link',{name:'下載示範 PDF'})).toBeVisible();
});
test('existing AI robot offers the tour without switching the signed-in account',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('dqa-lms-account-id','U001'));await page.goto('/lms/dashboard');await page.getByRole('button',{name:'展開AI智能助理',exact:true}).click();await page.getByRole('link',{name:'機器人九階導覽 →',exact:true}).click();await expect(page).toHaveURL(/\/tour$/);await expect(page.getByRole('progressbar',{name:'九階導覽進度'})).toHaveAttribute('aria-valuenow','1');expect(await page.evaluate(()=>sessionStorage.getItem('dqa-lms-account-id'))).toBe('U001');
});
