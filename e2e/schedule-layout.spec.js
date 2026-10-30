import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]){
 test(`schedule layout ${width}x${height}: local scroll, sticky actions, groups and AI clearance`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.addInitScript(({accounts,equipment})=>{
   localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
   localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
   for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
   localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify(Array.from({length:8},(_,index)=>({id:`LAYOUT-${index}`,requestId:`REQ-LAYOUT-${index}`,productCode:'DEMO-產品代碼',title:'低溫試驗及長文字可完整換行'.repeat(6),quantity:2,eq:'環境試驗箱 #03',equipmentId:'EQ-003',ownerId:'U003',owner:'陳工程師',sampleCode:'SAMPLE-LAYOUT-TEST',time:'2099-11-07',end:'2099-11-08',status:'已排程'}))));
   sessionStorage.setItem('dqa-lms-account-id','U001');
  },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT});
  await page.goto('/lms/dashboard');await page.locator('.sidebar').getByRole('button',{name:/排程管理/}).click();
  async function checkTable(){
   const region=page.getByRole('region',{name:'排程表格，可水平捲動'}).filter({visible:true}).first();
   await expect(region).toBeVisible();
   await expect(region.locator('tbody tr').first().locator('td').nth(2)).toHaveCSS('white-space','normal');
   const data=await region.evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth,right:element.getBoundingClientRect().right,pageWidth:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
   expect(data.pageWidth).toBeLessThanOrEqual(data.viewport+1);expect(data.right).toBeLessThan(width-56);
   const button=region.getByRole('button',{name:'編輯排程',exact:true}).first();
   await button.scrollIntoViewIfNeeded();await button.click({trial:true});
   const before=await button.boundingBox();
   await region.evaluate(element=>{element.scrollLeft=0;});
   const atStart=await button.boundingBox();
   await region.evaluate(element=>{element.scrollLeft=element.scrollWidth;});
   const atEnd=await button.boundingBox();
   expect(Math.abs(atStart.x-atEnd.x)).toBeLessThanOrEqual(2);expect(before.width).toBeGreaterThan(50);
   const launcher=await page.getByRole('button',{name:'展開AI智能助理'}).boundingBox();
   expect(atEnd.x+atEnd.width).toBeLessThanOrEqual(launcher.x);
   await button.click();await expect(page.getByRole('heading',{name:/編輯試驗排程/})).toBeVisible();
   await expect(page.getByLabel('設備選擇')).toBeVisible();
   await page.getByRole('dialog',{name:/編輯試驗排程/}).getByRole('button',{name:'關閉',exact:true}).click();
   if(data.scroll>data.client){await region.focus();await region.evaluate(element=>{element.scrollLeft=0;});await page.keyboard.press('ArrowRight');await expect.poll(()=>region.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);}
  }
  await checkTable();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:test.info().outputPath(`schedule-default-${width}x${height}.png`),fullPage:false});
  await page.getByRole('tab',{name:/依執行人員/}).click();await page.getByRole('button',{name:'全部展開',exact:true}).click();await checkTable();
  await page.getByRole('searchbox',{name:'搜尋排程'}).fill('not-found');await expect(page.getByText('目前篩選條件下沒有排程').first()).toBeVisible();
  await page.getByRole('searchbox',{name:'搜尋排程'}).fill('');
  await page.getByRole('button',{name:'切換側邊欄'}).click();await checkTable();
  await page.screenshot({path:test.info().outputPath(`schedule-${width}x${height}.png`),fullPage:false});
  expect(await page.pageErrors()).toEqual([]);
 });
}
