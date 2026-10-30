import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
async function login(page){
 await page.addInitScript(accounts=>{
  if(localStorage.getItem('request-borrow-ui-seeded'))return;
  localStorage.setItem('request-borrow-ui-seeded','yes');localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));
  for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-completed-flow-provisioned-v1',JSON.stringify({created:false}));
 },INITIAL_ACCOUNTS);
 await page.goto('/request/login');await page.getByRole('button',{name:'登入系統',exact:false}).click();await expect(page).toHaveURL(/request\/dashboard$/);
}
test('green approval and reading tabs match the sidebar; request and borrow use the same floating frame at desktop sizes',async({page})=>{
 await login(page);await page.getByRole('button',{name:'待簽核/查閱',exact:false}).click();
 const sidebarColor=await page.locator('.rq-nav.active').evaluate(el=>getComputedStyle(el).color);
 await expect(page.getByRole('tab',{name:'簽核清單',exact:true})).toHaveCSS('color',sidebarColor);await page.getByRole('tab',{name:'查閱清單',exact:true}).click();await expect(page.getByRole('tab',{name:'查閱清單',exact:true})).toHaveCSS('color',sidebarColor);
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.locator('.rq-sidebar').getByRole('button',{name:'新增委託單',exact:false}).click();
  const request=page.getByRole('dialog',{name:'新增委託單',exact:true});await expect(request).toBeVisible();const rq=await request.boundingBox();expect(rq.width).toBeLessThan(width);expect(rq.y).toBeGreaterThan(0);expect(rq.y+rq.height).toBeLessThanOrEqual(height);
  await expect(request.getByRole('button',{name:'送出主管簽核 →',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(request).toHaveCount(0);expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(false);
  await page.locator('.rq-sidebar').getByRole('button',{name:'申請借用',exact:false}).click();await page.getByRole('button',{name:'＋申請借用',exact:true}).click();
  const borrow=page.getByRole('dialog',{name:'申請借用',exact:true});await expect(borrow).toBeVisible();const br=await borrow.boundingBox();expect(br.width).toBe(rq.width);expect(br.y).toBeGreaterThan(0);expect(br.y+br.height).toBeLessThanOrEqual(height);
  await expect(borrow.getByRole('button',{name:'送出借用申請 →',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath(`borrow-modal-${width}.png`)});await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('my request and borrow tabs preserve submit/approval flow and do not expose another account borrowing',async({page})=>{
 await login(page);const requester=INITIAL_ACCOUNTS.find(a=>a.email==='requester@example.com');
 await page.evaluate(name=>localStorage.setItem('dqa-borrow-requests-v1',JSON.stringify([{id:'BOR-PRIVATE',actorId:'another-user',requester:name,equipment:'PRIVATE-EQUIPMENT',status:'待核准'}])),requester.name);await page.reload();
 await page.locator('.rq-sidebar').getByRole('button',{name:'我的委託/借用',exact:false}).click();await expect(page.getByRole('heading',{name:'我的委託/借用',exact:true})).toBeVisible();await page.getByRole('tab',{name:'借用單',exact:true}).click();await expect(page.locator('.rq-table')).not.toContainText('BOR-PRIVATE');
 await page.locator('.rq-sidebar').getByRole('button',{name:'申請借用',exact:false}).click();await page.getByRole('button',{name:'＋申請借用',exact:true}).click();const form=page.getByRole('dialog',{name:'申請借用',exact:true});
 await form.getByRole('button',{name:'送出借用申請 →',exact:true}).click();await expect(page.getByRole('status')).toContainText('請完成所有必填');await expect(form).toBeVisible();
 await form.getByLabel('設備名稱').selectOption('高低溫試驗箱');await form.getByLabel('借用用途').fill('Demo 借用流程測試');await form.getByLabel('預計借用日期').fill('2026-11-02');await form.getByLabel('預計歸還日期').fill('2026-11-03');await form.getByRole('button',{name:'送出借用申請 →',exact:true}).click();await expect(form).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'借用單',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.rq-table')).toContainText('高低溫試驗箱');await expect(page.locator('.rq-table')).not.toContainText('BOR-PRIVATE');
 const borrowId=await page.evaluate(id=>JSON.parse(localStorage.getItem('dqa-borrow-requests-v1')).find(r=>r.actorId===id).id,requester.id);
 await page.evaluate(async id=>{const {decideBorrowRequest}=await import('/src/borrowApprovals.mjs');decideBorrowRequest({id,actorId:'DEMO-LEVEL1',approve:true,comment:'Demo 核准'});window.dispatchEvent(new Event('focus'));},borrowId);
 await expect(page.locator('.rq-table')).toContainText('已核准');await page.getByRole('tab',{name:'委託單',exact:true}).click();await expect(page.locator('.rq-table')).not.toContainText(borrowId);
});
test('floating forms retain dark theme and release background focus when closed',async({page})=>{
 await login(page);await page.getByRole('button',{name:'切換深色或淺色模式',exact:true}).click();await page.locator('.rq-sidebar').getByRole('button',{name:'申請借用',exact:false}).click();await page.getByRole('button',{name:'＋申請借用',exact:true}).click();const dialog=page.getByRole('dialog',{name:'申請借用',exact:true});
 await expect(dialog.locator('.rq-entry-card').first()).not.toHaveCSS('background-color','rgb(255, 255, 255)');expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(false);await expect(page.getByRole('button',{name:'＋申請借用',exact:true})).toBeFocused();
});
