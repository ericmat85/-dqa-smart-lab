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
  for(const account of accounts){
   const canvas=document.createElement('canvas');canvas.width=480;canvas.height=100;
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,480,100);context.fillStyle='#17365e';context.font='28px sans-serif';context.fillText(`DEMO ${account.name}`,12,60);
   localStorage.setItem(`dqa-default-signature-v1:${account.id}`,canvas.toDataURL('image/png')||signature);
  }
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

test('report is returned, revised, signed by two supervisors and archived with request-first PDF',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/lab/login');await page.getByRole('button',{name:'登入系統'}).click();
 await page.getByRole('button',{name:'建立已完成範例（假資料）',exact:true}).click();
 await expect(page.getByRole('button',{name:'提交報告',exact:true})).toBeVisible();
 const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa_lab_demo_requests_v1'))[0].id);
 async function submit(){
  await page.goto('/lab/login');
  if(await page.getByRole('button',{name:'登入系統'}).count())await page.getByRole('button',{name:'登入系統'}).click();
  await page.getByRole('button',{name:'提交報告',exact:true}).click();
  await expect(page.getByText('主管簽名位置設定',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'DEMO 填入',exact:true}).click();
  await expect(page.locator('.report-review-status')).toContainText('通過 AI 全檢（Demo 規則模擬）');
  await page.getByRole('button',{name:'提交',exact:true}).click();
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('待審核');
 }
 async function openReview(email){
  await lmsLogin(page,email);await page.locator('.sidebar').getByRole('button',{name:/試驗委託/}).click();
  await page.getByRole('button',{name:'審核',exact:true}).click();
 }
 await submit();await openReview('level2@example.com');
 await page.getByLabel('退回原因（退回時必填）').fill('DEMO：請補充結果');await page.getByRole('button',{name:'退回報告',exact:true}).click();
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('已完成');
 await submit();
 for(const email of ['level2@example.com','level3@example.com']){
  await openReview(email);await useSignature(page);await page.getByRole('button',{name:'簽名並核准報告',exact:true}).click();await expect(page.locator('.report-review-dialog')).not.toBeVisible({timeout:15000});
 }
 await requestLogin(page,true);await page.getByRole('button',{name:'查看',exact:true}).first().click();
 await expect(page.getByText('Demo 圖片簽名，不具正式電子簽章效力；結案 PDF 順序：委託單 → 試驗報告。')).toBeVisible();
 await expect(page.getByRole('button',{name:'下載結案 PDF（委託單＋報告）',exact:true})).toHaveCount(0);
 expect(await page.evaluate(async id=>{const {getReport}=await import('/src/reportStore.mjs');return Boolean((await getReport(id)).pdf);},id)).toBe(false);
 await page.getByRole('button',{name:'確認查閱並封存',exact:true}).click();
 await expect(page.getByRole('button',{name:'下載結案 PDF（委託單＋報告）',exact:true})).toBeVisible({timeout:30000});
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'下載結案 PDF（委託單＋報告）',exact:true}).click();
 const download=await downloadEvent;await download.saveAs(test.info().outputPath('closure-demo.pdf'));expect(download.suggestedFilename()).toBe(`${id}-結案文件-DEMO.pdf`);
 const info=await page.evaluate(async id=>{
  const {getReport}=await import('/src/reportStore.mjs');const report=await getReport(id);return {stage:report.stage,sections:report.pdfSections,history:report.history,revision:report.revisionNumber};
 },id);
 expect(info.stage).toBe('archived');expect(info.sections.map(row=>row.kind)).toEqual(['request','report']);expect(info.revision).toBe(2);expect(info.history.some(row=>row.action.includes('退回'))).toBe(true);
 await page.reload();await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('已結案');
 await page.locator('.rq-sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();
 await expect(page.locator('.archive-page')).toContainText(id);await expect(page.locator('.archive-page').getByRole('button',{name:'下載 PDF',exact:true})).toBeVisible();
 const fileEvent=page.waitForEvent('download');await page.locator('.archive-page').getByRole('button',{name:'下載 PDF',exact:true}).click();expect((await fileEvent).suggestedFilename()).toBe(`${id}-結案文件-DEMO.pdf`);
 await page.goto('/lab/login');if(await page.getByRole('button',{name:'登入系統'}).count())await page.getByRole('button',{name:'登入系統'}).click();
 await page.locator('.lab-sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();await expect(page.locator('.archive-page')).toContainText(id);
 await lmsLogin(page);await page.locator('.sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();await expect(page.locator('.archive-page')).toContainText(id);
 await page.locator('.archive-page').getByRole('button',{name:'查看 PDF',exact:true}).click();await expect(page.getByRole('dialog',{name:'結案 PDF 預覽'})).toBeVisible();await page.getByRole('button',{name:'關閉預覽',exact:true}).click();

});

test('two-machine scheduling checks space and buffers and saves a sample allocation',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{
  localStorage.setItem('dqa-request-demo-v2',JSON.stringify([{id:'MULTI',productCode:'MULTI',testItems:['低溫試驗'],quantity:5,status:'待排程',lmsReview:{approval:2}}]));
  localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(['A','B'].map(id=>({id,name:`環境試驗箱 ${id}`,status:'待機中',capacity:3,usableVolumeLitres:30,specification:'-40～150°C'}))));
 });
 await lmsLogin(page);await page.locator('.sidebar').getByRole('button',{name:/排程管理/}).click();await page.getByRole('button',{name:'編輯排程',exact:true}).click();
 await page.getByLabel('設備台數',{exact:true}).fill('2');await page.getByLabel('每件樣品使用空間 L（選填）').fill('10');
 await page.getByLabel('準備時間（分鐘）').fill('60');await page.getByLabel('清理時間（分鐘）').fill('90');
 await page.getByRole('button',{name:/AI 自動化排程/}).click();await expect(page.getByRole('dialog',{name:'正在準備排程建議'})).not.toBeVisible({timeout:10000});await page.getByRole('button',{name:'儲存排程',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1'))[0].status)).toBe('已排程');
 const schedule=await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-schedules-demo-v1'))[0]);
 expect(schedule.equipmentIds.length).toBe(2);expect(schedule.allocations.map(row=>row.quantity)).toEqual([3,2]);expect(schedule.preparationMinutes).toBe(60);expect(schedule.cleanupMinutes).toBe(90);
});

test('a stale draft editor cannot overwrite a newer saved revision',async({page})=>{
 await requestLogin(page);await demoRequest(page);await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 await page.getByRole('button',{name:'編輯草稿',exact:true}).click();
 await page.getByLabel('產品代碼',{exact:false}).fill('STALE-VALUE');
 await page.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('dqa-request-demo-v2'));rows[0].productCode='NEWER-VALUE';localStorage.setItem('dqa-request-demo-v2',JSON.stringify(rows));});
 await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 await expect(page.getByText('草稿已在其他頁面更新，請重新開啟後編輯。')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dqa-request-demo-v2'))[0].productCode)).toBe('NEWER-VALUE');
});

test('general performance upload recognizes the supplied blank template and submits filled data in its original layout',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:1366,height:768});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/lab/login');await page.getByRole('button',{name:'登入系統'}).click();
 await page.getByRole('button',{name:'建立已完成範例（假資料）',exact:true}).click();
 const id=await page.evaluate(()=>{
  const records=JSON.parse(localStorage.getItem('dqa-request-demo-v2'));records[0].testItems=['一般性能試驗'];localStorage.setItem('dqa-request-demo-v2',JSON.stringify(records));return records[0].id;
 });
 await page.reload();await page.getByRole('button',{name:'提交報告',exact:true}).click();
 await expect(page.getByText('主管簽名位置設定',{exact:true})).toHaveCount(0);
 const quickButton=await page.getByRole('button',{name:'DEMO 填入',exact:true}).boundingBox();
 expect(quickButton.y).toBeGreaterThan(0);expect(quickButton.y+quickButton.height).toBeLessThan(768);
 expect((await page.locator('.report-quickfill-panel').boundingBox()).height).toBeLessThan(200);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下載本案 Excel 範本',exact:true}).click();
 expect((await download).suggestedFilename()).toContain(id);
 await page.getByRole('button',{name:'DEMO 填入',exact:true}).click();
 await expect(page.getByText(id+'-DEMO.xlsx',{exact:true})).toBeVisible();
 await expect(page.locator('.report-review-status')).toContainText('通過 AI 全檢（Demo 規則模擬）');
 await page.locator('.report-quickfill-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:test.info().outputPath('quickfill-review-ready.png')});
 expect(await page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('已完成');
 const preparedDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下載目前 Excel 報告',exact:true}).click();expect((await preparedDownload).suggestedFilename()).toBe(id+'-DEMO.xlsx');
 await expect(page.locator('#lab-report-file')).toBeEnabled();
 await page.locator('#lab-report-file').setInputFiles('public/templates/general-performance-v1.xlsx');
 await expect(page.locator('.report-review-status')).toContainText('尚未檢查');
 await page.getByRole('button',{name:'重新檢查報告',exact:true}).click();
 await expect(page.locator('.report-review-status')).toContainText('未通過檢查');
 await page.getByRole('button',{name:'提交',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('報告未通過');
 await expect(page.locator('.report-checks')).toContainText('報告編號對應本案');
 await expect(page.locator('.report-checks')).toContainText('合格／不合格擇一勾選');
 await expect(page.getByText(/16,?384 欄/)).toHaveCount(0);
 await page.getByRole('button',{name:'DEMO 填入',exact:true}).click();
 await page.getByRole('button',{name:'提交',exact:true}).click();
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).status,id)).toBe('待審核');
 const meta=await page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-request-demo-v2')).find(row=>row.id===id).reportInfo,id);
 expect(meta.check.profileId).toBe('general-performance-v1');expect(errors).toEqual([]);
 await expect(page.locator('.report-demo-review-badge')).toContainText('通過 AI 全檢（Demo 規則模擬）');
 await page.reload();await expect(page.locator('.report-demo-review-badge')).toContainText('通過 AI 全檢（Demo 規則模擬）');
 for(const email of ['level2@example.com','level3@example.com']){
  await lmsLogin(page,email);await page.locator('.sidebar').getByRole('button',{name:/試驗委託/}).click();
  await page.getByRole('button',{name:id,exact:true}).click();
  await expect(page.getByRole('dialog',{name:id+'｜委託單資訊'})).toBeVisible();
  await expect(page.getByText('試驗執行結果',{exact:true})).toBeVisible();await expect(page.getByRole('list',{name:'簽核流程',exact:true})).toBeVisible();
  await expect(page.locator('.report-review-dialog')).toHaveCount(0);await page.getByRole('button',{name:'關閉委託單資訊',exact:true}).click();
  await page.getByRole('button',{name:'審核',exact:true}).click();
  const workbook=page.getByRole('region',{name:'Excel 報告唯讀檢視',exact:true});
  expect((await page.locator('.report-review-dialog').boundingBox()).width).toBeGreaterThan(1000);
  await expect(workbook.getByRole('tab',{name:'1.1一般性能試驗-1',exact:true})).toBeVisible();
  await expect(workbook.locator('[data-cell="F13"]')).toHaveText('DEMO-E2E-001');
  await expect(workbook.locator('[data-cell="AF54"]')).toContainText('陳');
  await expect(workbook.locator('img')).toHaveCount(email==='level2@example.com'?1:2);
  await expect(page.locator('.report-review-dialog>header')).toContainText(email==='level2@example.com'?'第二階主管審核':'第三階主管審核');
  await page.screenshot({path:test.info().outputPath(email==='level2@example.com'?'excel-cover-stage2.png':'excel-cover-stage3.png')});
  if(email==='level3@example.com')await expect(workbook.locator('[data-cell="S54"]')).toContainText('二階');
  await workbook.getByRole('tab',{name:'1.1一般性能試驗-2',exact:true}).click();
  await expect(workbook.locator('[data-cell="Q147"]')).toHaveText('0～2 Ω');await expect(workbook.locator('[data-cell="Q193"]')).toHaveText('4.90');
  await workbook.locator('.workbook-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth;});
  await expect(workbook.locator('[data-cell="AK228"]')).toHaveText('N/A');
  for(const [width,height]of [[1366,768],[1440,900],[1920,1080]]){
   await page.setViewportSize({width,height});const footer=await page.locator('.report-review-dialog>footer').boundingBox();expect(footer.y).toBeGreaterThanOrEqual(0);expect(footer.y+footer.height).toBeLessThanOrEqual(height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1366,height:768});
  expect(await page.evaluate(async id=>{const {getReport}=await import('/src/reportStore.mjs');return Boolean((await getReport(id)).pdf);},id)).toBe(false);
  await page.screenshot({path:test.info().outputPath(email==='level2@example.com'?'excel-review-stage2.png':'excel-review-stage3.png')});
  await useSignature(page);await page.getByRole('button',{name:'簽名並核准報告',exact:true}).click();await expect(page.locator('.report-review-dialog')).not.toBeVisible({timeout:15000});
 }
 await requestLogin(page,true);await page.locator('.rq-sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();await expect(page.getByText('目前沒有您可查閱的已封存報告。')).toBeVisible();
 await page.locator('.rq-sidebar').getByRole('button',{name:'全部委託單',exact:true}).click();await page.getByRole('button',{name:'查看',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'下載結案 PDF（委託單＋報告）',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'確認查閱並封存',exact:true}).click();await expect(page.getByRole('button',{name:'下載結案 PDF（委託單＋報告）',exact:true})).toBeVisible({timeout:30000});
 const archived=await page.evaluate(async id=>{const {getReport}=await import('/src/reportStore.mjs');const report=await getReport(id);return {stage:report.stage,sections:report.pdfSections};},id);expect(archived.stage).toBe('archived');expect(archived.sections.find(row=>row.kind==='report').pageCount).toBe(7);
 await page.getByRole('button',{name:'關閉委託單資訊',exact:true}).click();await page.locator('.rq-sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();await expect(page.locator('.archive-page')).toContainText(id);expect(errors).toEqual([]);
 await page.locator('.archive-page').getByRole('button',{name:id,exact:true}).click();await expect(page.getByRole('dialog',{name:id+'｜委託單資訊'})).toBeVisible();await expect(page.getByRole('list',{name:'簽核流程',exact:true})).toBeVisible();await page.getByRole('button',{name:'關閉委託單資訊',exact:true}).click();
 const archiveDownload=page.waitForEvent('download');await page.locator('.archive-page').getByRole('button',{name:'下載 PDF',exact:true}).click();await (await archiveDownload).saveAs(test.info().outputPath('general-archived-demo.pdf'));
 await page.screenshot({path:test.info().outputPath('report-archive-page.png')});

});

test('custom role archive entry is hidden unless explicitly granted',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{
  const accounts=JSON.parse(localStorage.getItem('dqa-shared-demo-accounts-v1'));accounts.push({id:'ARCHIVE-LIMITED',name:'Demo archive reader',email:'archive-limited@example.com',role:'ARCHIVE-LIMITED',status:'啟用中',department:'DEMO'});localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  localStorage.setItem('dqa-custom-roles-v1',JSON.stringify([{id:'A',name:'ARCHIVE-LIMITED',level:0,pages:['dashboard'],manageAccounts:false}]));
 });
 await lmsLogin(page,'archive-limited@example.com');await expect(page.locator('.sidebar').getByRole('button',{name:'報告資料庫',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{const roles=JSON.parse(localStorage.getItem('dqa-custom-roles-v1'));roles[0].pages.push('archive');localStorage.setItem('dqa-custom-roles-v1',JSON.stringify(roles));});
 await page.reload();await page.locator('.sidebar').getByRole('button',{name:'報告資料庫',exact:true}).click();await expect(page.getByText('目前沒有您可查閱的已封存報告。')).toBeVisible();
});
