import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test.beforeEach(async({page})=>{
 await page.addInitScript(({accounts,equipment,signature})=>{
  if(localStorage.getItem('e2e-seeded'))return;
  localStorage.setItem('e2e-seeded','yes');
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));
  localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
  for(const account of accounts)localStorage.setItem(`dqa-default-signature-v1:${account.id}`,signature);
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT,signature});
});
async function lmsLogin(page,email='huangxm@example.com'){
 await page.goto('/lms/login');await page.getByLabel('登入帳號（電子郵件）').fill(email);
 await page.getByLabel('密碼',{exact:true}).fill('demo1234');await page.getByRole('button',{name:'登入系統'}).click();
 await expect(page).toHaveURL(/\/lms\/dashboard$/);
}
async function requestLogin(page,supervisor=false){
 await page.goto('/request/login');
 await page.getByRole('button',{name:supervisor?'主管登入':'委託者登入',exact:false}).click();
 await page.locator('.rq-login-card input').first().fill(supervisor?'supervisor@example.com':'requester@example.com');
 await page.getByRole('button',{name:'登入系統'}).click();await expect(page).toHaveURL(/\/request\/dashboard$/);
}
async function demoRequest(page){
 await page.getByRole('button',{name:/新增委託單/}).click();
 await page.evaluate(()=>{Math.random=()=>0;});
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Demo填入',exact:true}).click();
 // Keep the whole flow deterministic while using the actual form and signature UI.
 await page.getByLabel('產品代碼',{exact:false}).fill('MVP-DEMO-001');
 await page.getByLabel('測試數量',{exact:false}).fill('2');
}
async function useSignature(page){
 await page.getByLabel('上傳簽名檔',{exact:true}).check();
 await page.getByRole('button',{name:'使用預設簽名',exact:true}).click();
}
test('four portals, direct links, return and browser history stay in the correct system',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,path,title] of [['電子委託單系統','request','電子委託單系統'],['DQA LMS 實驗室管理系統','lms','DQA LMS'],['造隆實驗室系統','lab','造隆實驗室系統'],['驗證計畫','validation','DQA 驗證計畫']]){
  await page.goto('/');await page.getByRole('button',{name:new RegExp(name)}).click();
  await expect(page).toHaveURL(new RegExp(`/${path}/login$`));await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  if(path==='validation')await expect(page.getByRole('button',{name:'暫未開放'})).toBeDisabled();
  await page.getByRole('button',{name:/返回系統/}).click();await expect(page).toHaveURL(/\/$/);
 }
 await page.getByRole('button',{name:/DQA LMS 實驗室管理系統/}).click();await page.goBack();await expect(page.getByRole('heading',{name:/可靠度試驗/})).toBeVisible();
 expect(errors).toEqual([]);
});
test('LMS rejects wrong credentials, retains login on reload, switches pages and logs out',async({page})=>{
 await page.goto('/lms/dashboard');await expect(page).toHaveURL(/\/lms\/login$/);
 await page.getByLabel('密碼',{exact:true}).fill('wrong');await page.getByRole('button',{name:'登入系統'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await lmsLogin(page);await page.reload();await expect(page.getByText('歡迎，黃小明')).toBeVisible();
 for(const name of ['排程管理','設備管理','物料管理','報表分析'])await page.locator('.sidebar').getByRole('button',{name:new RegExp(name)}).click();
 await page.locator('.sidebar').getByRole('button',{name:'登出系統'}).click();await expect(page).toHaveURL(/\/lms\/login$/);
 await page.goto('/lms/dashboard');await expect(page).toHaveURL(/\/lms\/login$/);
});
test('requester creates, edits, deletes a draft then submits a new request',async({page})=>{
 await requestLogin(page);await demoRequest(page);await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 await expect(page.locator('.rq-table tbody tr').filter({hasText:'MVP-DEMO-001'})).toHaveCount(1);
 await page.getByRole('button',{name:'編輯草稿',exact:true}).click();await page.getByLabel('產品代碼',{exact:false}).fill('MVP-EDITED');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 await expect(page.locator('.rq-table')).toContainText('MVP-EDITED');
 await page.getByRole('button',{name:'刪除',exact:true}).click();await page.getByRole('button',{name:/確認刪除/}).click();
 await expect(page.locator('.rq-table')).not.toContainText('MVP-EDITED');
 await demoRequest(page);await page.getByRole('button',{name:'送出主管簽核 →',exact:true}).click();
 await expect(page.locator('.rq-table')).toContainText('待簽核');await page.reload();await expect(page.locator('.rq-table')).toContainText('MVP-DEMO-001');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2'))[0].status)).toBe('待主管簽核');
});
test('new request passes designated manager and two LMS reviews, then schedules and lab receives it',async({page})=>{
 await requestLogin(page);await demoRequest(page);await page.getByRole('button',{name:'送出主管簽核 →',exact:true}).click();
 await requestLogin(page,true);await page.getByRole('button',{name:'簽核',exact:true}).click();await useSignature(page);await page.getByRole('button',{name:'✓ 核准委託單'}).click();
 for(const email of ['level1@example.com','level2@example.com']){
  await lmsLogin(page,email);await page.locator('.sidebar').getByRole('button',{name:/試驗委託/}).click();
  await page.getByRole('button',{name:'審查',exact:true}).click();await useSignature(page);await page.getByRole('button',{name:/核准/,exact:false}).last().click();
 }
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2'))[0].status)).toBe('待排程');
 await page.locator('.sidebar').getByRole('button',{name:/排程管理/}).click();await page.getByRole('button',{name:'編輯排程',exact:true}).click();
 await page.getByRole('button',{name:/AI 自動化排程/}).click();await expect(page.getByRole('dialog',{name:'正在準備排程建議'})).not.toBeVisible({timeout:10000});
 await page.getByRole('button',{name:'儲存排程',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1'))[0].status)).toBe('已排程');
 await page.goto('/lab/login');await page.getByRole('button',{name:'登入系統'}).click();await page.getByRole('button',{name:'確認接收',exact:true}).click();await page.getByRole('button',{name:'確認送出',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa_lab_demo_requests_v1'))[0].status)).toBe('已排程');
});

test('manager returns without signature and requester can edit and resubmit from the list',async({page})=>{
 await requestLogin(page);await demoRequest(page);await page.getByRole('button',{name:'送出主管簽核 →',exact:true}).click();
 await requestLogin(page,true);await page.getByRole('button',{name:'簽核',exact:true}).click();
 await page.getByRole('button',{name:'退回補正',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2'))[0].status)).toBe('待主管簽核');
 await page.getByPlaceholder('請輸入核准說明或退件補正事項…').fill('請補充條件');
 await page.getByRole('button',{name:'退回補正',exact:true}).click();
 await requestLogin(page);await page.getByRole('button',{name:/我的委託單/}).click();
 await page.getByRole('button',{name:'編輯並重新送出',exact:true}).click();
 await page.getByLabel('產品代碼',{exact:false}).fill('MVP-RETURNED');
 await page.getByLabel('上傳簽名檔',{exact:true}).check();await page.getByRole('button',{name:'使用預設簽名',exact:true}).click();
 await page.getByRole('button',{name:'送出主管簽核 →',exact:true}).click();
 await expect(page.locator('.rq-table')).toContainText('MVP-RETURNED');
 const request=await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2'))[0]);
 expect(request.status).toBe('待主管簽核');expect(request.lmsReview).toBeNull();
 expect(request.signatureRecords.map(row=>row.decision)).toEqual(['送出','退回','重新送出']);
});

test('schedule UI rejects capacity and out-of-range conditions before saving',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{
  localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id:'MVP-CONDITIONS',productCode:'CONDITIONS',testItems:['低溫試驗'],quantity:2,status:'待排程',lmsReview:{approval:2}}]));
  localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify([
   {id:'SMALL',name:'環境試驗箱 小',status:'待機中',capacity:1,specification:'-70～180°C'},
   {id:'FIT',name:'環境試驗箱 大',status:'待機中',capacity:10,specification:'-20～150°C'},
   {id:'OVEN',name:'高溫爐',status:'待機中',capacity:10,specification:'室溫＋10～250°C'},
  ]));
 });
 await lmsLogin(page);await page.locator('.sidebar').getByRole('button',{name:/排程管理/}).click();await page.getByRole('button',{name:'編輯排程',exact:true}).click();
 await expect(page.getByRole('option',{name:/OVEN/})).toHaveAttribute('disabled','');
 await page.getByLabel('設備選擇').selectOption('SMALL');await page.getByLabel('執行人 *').selectOption('U003');
 await page.getByLabel('開始日期 *').fill('2099-11-07');await page.getByLabel('預計完成日期 *').fill('2099-11-08');
 await page.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(page.getByText('樣品數量超過設備容量（1 件）。')).toBeVisible();
 await page.getByLabel('設備選擇').selectOption('FIT');await page.getByLabel('最低溫度 °C（選填）').fill('-40');await page.getByLabel('最高溫度 °C（選填）').fill('100');
 await page.getByRole('button',{name:'儲存排程',exact:true}).click();await expect(page.getByText('試驗溫度超過設備規格範圍。')).toBeVisible();
 await page.getByLabel('最低溫度 °C（選填）').fill('-10');await page.getByRole('button',{name:'儲存排程',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1'))[0].status)).toBe('已排程');
});

test('assistant reveals characters progressively and retains completed answers',async({page})=>{
 await lmsLogin(page);await page.getByRole('button',{name:'展開AI智能助理'}).click();
 await page.getByRole('textbox',{name:'輸入問題'}).fill('如何安排新的試驗日程？');await page.getByRole('button',{name:'送出問題'}).click();
 const reply=page.locator('.intelligent-reply');await expect(reply).toHaveAttribute('aria-busy','true');
 await expect.poll(async()=>{const text=await reply.textContent();return text.includes('前往')&&!text.includes('儲存排程');}).toBe(true);
 await expect(reply).toHaveAttribute('aria-busy','false',{timeout:12000});await expect(reply).toContainText('儲存排程');
 await page.getByRole('button',{name:'收合AI智能助理'}).last().click();await page.getByRole('button',{name:'展開AI智能助理'}).click();await expect(reply).toContainText('儲存排程');
});

test.afterEach(async({page})=>{expect(await page.pageErrors()).toEqual([]);});
