import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {testOptions,buildSpecification} from '../src/requestTestCatalog.mjs';

for(const [theme,width,height] of [['light',1600,1000],['dark',1366,900],['light',390,844]])test(`twenty-trial catalog previews and fills editable references ${theme} ${width}`,async({page,context})=>{
 test.setTimeout(120000);const modelRequests=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url());return ['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname)?route.abort():route.continue();});
 page.on('request',request=>{if(/\/api\/preview\/ui\/live\//.test(request.url()))modelRequests.push(request.url());});
 await page.setViewportSize({width,height});await page.addInitScript(({accounts,theme})=>{
  if(localStorage.getItem('catalog-test-initialized'))return;
  localStorage.setItem('catalog-test-initialized','1');localStorage.setItem('dqa-global-theme',theme);
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-request-demo-v2','[]');localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
 },{accounts:INITIAL_ACCOUNTS,theme});
 await page.goto('/request/login');await page.getByRole('button',{name:/登入系統/}).click();await expect(page).toHaveURL(/\/request\/dashboard$/);await page.goto('/request/new');
 const specification=page.locator('#rq-specification'),open=()=>page.getByRole('button',{name:/搜尋試驗名稱/}).click(),picker=page.getByRole('dialog',{name:'搜尋試驗項目'}),reference=picker.getByRole('complementary',{name:'試驗規格參考'});
 await open();await expect(picker.getByRole('radio')).toHaveCount(20);await expect(picker.getByRole('radio',{name:'其他',exact:true})).toHaveCount(0);await expect(picker).toContainText('共 20 項');await expect(picker.getByRole('button',{name:'確認選擇',exact:true})).toBeDisabled();
 const choices=width===1600?testOptions:['高溫高濕','振動試驗','高溫運作試驗'];
 for(const [index,name] of choices.entries()){
  if(index)await open();
  await picker.getByRole('radio',{name,exact:true}).check();await expect(reference.getByRole('heading',{name,exact:true})).toHaveText(name);await expect(reference.locator('pre')).toHaveText(buildSpecification([name]));
  if(width>760){const list=await picker.getByRole('region',{name:'試驗項目清單'}).boundingBox(),panel=await reference.boundingBox();expect(panel.x).toBeGreaterThanOrEqual(list.x+list.width-1);}
  await picker.getByRole('button',{name:'確認選擇',exact:true}).click();await expect(specification).toHaveValue(buildSpecification([name]));
 }
 expect(await page.evaluate(()=>localStorage.getItem('dqa-request-demo-v2'))).toBe('[]');
 await specification.fill('自訂合成試驗條件，保留人工編輯內容。');await open();await picker.getByRole('radio',{name:'跌落試驗',exact:true}).check();page.once('dialog',dialog=>dialog.dismiss());await picker.getByRole('button',{name:'確認選擇',exact:true}).click();await expect(picker).toBeVisible();await picker.getByRole('button',{name:'取消',exact:true}).click();await expect(specification).toHaveValue('自訂合成試驗條件，保留人工編輯內容。');
 await open();await picker.getByRole('radio',{name:'振動試驗',exact:true}).check();await expect(reference).toContainText('20 小時');await expect(reference).toContainText('週末不作業');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const box=await picker.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);await expect(picker.getByRole('button',{name:'確認選擇',exact:true})).toBeVisible();
 await page.screenshot({path:test.info().outputPath(`catalog-reference-${theme}-${width}.png`)});
 page.once('dialog',dialog=>dialog.accept());await picker.getByRole('button',{name:'確認選擇',exact:true}).click();await expect(specification).toHaveValue(buildSpecification(['振動試驗']));
 await page.getByPlaceholder('例如：VCU-2026-A01').fill('CATALOG-SYNTHETIC');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.productCode==='CATALOG-SYNTHETIC'));
 expect(saved.status).toBe('草稿');expect(saved.testItems).toEqual(['振動試驗']);expect(saved.specification).toBe(buildSpecification(['振動試驗']));
 await page.goto('/request/edit/'+saved.id);await page.reload();await expect(specification).toHaveValue(buildSpecification(['振動試驗']));expect(modelRequests).toEqual([]);
});
