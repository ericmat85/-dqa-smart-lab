import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {PROFILE_DEFAULTS} from '../src/workspaceProfile.mjs';
test('shared settings persist across reentry/login, cancel and synthetic report uses same source',async({page})=>{
 let data={configuration:{...PROFILE_DEFAULTS,workspaceName:'合成工作區'},revision:0,can_manage:true};const writes=[];
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(u.pathname==='/api/business/access'){if(route.request().method()==='POST'){const b=route.request().postDataJSON();writes.push(b);data={...data,configuration:b.configuration,revision:data.revision+1};}return route.fulfill({json:{data}});}return route.continue();});
 await page.goto('/e2e/fixtures/workspace-profile.html');await page.getByRole('button',{name:'編輯共用設定'}).click();await page.getByLabel('工作區顯示名稱').fill('取消的名稱');await page.getByRole('button',{name:'取消',exact:true}).click();expect(writes).toHaveLength(0);await expect(page.getByText('合成工作區',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'organization',exact:true}).click();await page.getByRole('button',{name:'編輯共用設定'}).click();await page.getByLabel('實驗室名稱',{exact:true}).fill('合成實驗室甲');await page.getByLabel('地址',{exact:true}).fill('本機合成地址');await page.getByRole('button',{name:'儲存共用設定'}).click();await expect(page.getByRole('status')).toHaveText('工作區共用資料已儲存。');
 await page.getByRole('button',{name:'登出',exact:true}).click();await page.getByRole('button',{name:'重新登入'}).click();await expect(page.getByText('合成實驗室甲',{exact:true})).toBeVisible();await page.getByRole('button',{name:'documents',exact:true}).click();await page.locator('.admin-brand-preview>summary').click();const preview=page.getByRole('article',{name:'合成報告預覽'});await expect(preview).toContainText('合成實驗室甲');await page.getByLabel('預覽頁尾').fill('本機預覽頁尾');await expect(preview).toContainText('本機預覽頁尾');expect(writes).toHaveLength(1);await captureBrowserEvidence(page,{path:test.info().outputPath('synthetic-report.png'),fullPage:true});
 data={...data,can_manage:false};await page.getByRole('button',{name:'organization',exact:true}).click();await expect(page.getByRole('button',{name:'編輯共用設定'})).toHaveCount(0);await expect(page.getByText('合成實驗室甲',{exact:true})).toBeVisible();
});
test('failed read does not offer saving defaults; unknown write requires reentry',async({page})=>{
 let failRead=true,writes=0;const data={configuration:{...PROFILE_DEFAULTS,workspaceName:'合成工作區'},revision:0,can_manage:true};
 await page.route('**/api/business/access**',route=>{if(route.request().method()==='POST'){writes++;return route.fulfill({status:503,json:{error:{code:'WRITE_OUTCOME_UNKNOWN'},outcome_unknown:true}});}return route.fulfill(failRead?{status:503,json:{error:{code:'UPSTREAM_UNAVAILABLE'}}}:{json:{data}});});
 await page.goto('/e2e/fixtures/workspace-profile.html');await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'編輯共用設定'})).toHaveCount(0);
 failRead=false;await page.getByRole('button',{name:'organization',exact:true}).click();await page.getByRole('button',{name:'編輯共用設定'}).click();await page.getByLabel('實驗室名稱',{exact:true}).fill('未知結果');await page.getByRole('button',{name:'儲存共用設定'}).click();await expect(page.getByRole('alert')).toContainText('儲存結果待確認');await expect(page.getByRole('button',{name:'儲存共用設定'})).toHaveCount(0);expect(writes).toBe(1);
 await page.getByRole('button',{name:'parameters',exact:true}).click();await expect(page.getByText('合成工作區',{exact:true})).toBeVisible();
});

test('a stalled profile read ends its loading state at the request deadline',async({page})=>{
 let calls=0;await page.route('**/api/business/access**',()=>{calls++;});await page.clock.install();await page.goto('/e2e/fixtures/workspace-profile.html');await expect(page.getByRole('status')).toHaveText('處理中…');await expect.poll(()=>calls).toBe(1);
 await page.clock.runFor(60001);await expect(page.getByRole('alert')).toContainText('連線等待逾時');await expect(page.getByRole('status')).toHaveCount(0);await expect(page.getByRole('button',{name:'編輯共用設定'})).toHaveCount(0);expect(calls).toBe(1);await captureBrowserEvidence(page,{path:test.info().outputPath('read-timeout.png'),fullPage:true});
});
test('a save whose response stalls is not replayed and can be read back on reentry',async({page})=>{
 let data={configuration:{...PROFILE_DEFAULTS,workspaceName:'合成工作區'},revision:0,can_manage:true},writes=0;
 await page.route('**/api/business/access**',route=>{if(route.request().method()==='POST'){writes++;data={...data,configuration:route.request().postDataJSON().configuration,revision:1};return;}return route.fulfill({json:{data}});});
 await page.clock.install();await page.goto('/e2e/fixtures/workspace-profile.html');await page.getByRole('button',{name:'organization',exact:true}).click();await page.getByRole('button',{name:'編輯共用設定'}).click();await page.getByLabel('實驗室名稱',{exact:true}).fill('已保存但回應遺失');await page.getByRole('button',{name:'儲存共用設定'}).click();await expect.poll(()=>writes).toBe(1);
 await page.clock.runFor(90001);await expect(page.getByRole('alert')).toContainText('儲存結果待確認');await expect(page.getByRole('button',{name:'儲存共用設定'})).toHaveCount(0);await expect(page.getByRole('status')).toHaveCount(0);await captureBrowserEvidence(page,{path:test.info().outputPath('save-timeout-no-replay.png'),fullPage:true});
 await page.getByRole('button',{name:'parameters',exact:true}).click();await page.getByRole('button',{name:'organization',exact:true}).click();await expect(page.getByText('已保存但回應遺失',{exact:true})).toBeVisible();expect(writes).toBe(1);
});

test('leaving shared settings cancels its orphaned read and releases the page indicator',async({page})=>{
 let reads=0;await page.route('**/api/business/access**',()=>{reads++;});
 await page.goto('/e2e/fixtures/workspace-profile.html');await expect(page.getByRole('status')).toHaveText('處理中…');await expect.poll(()=>reads).toBe(1);
 await expect.poll(()=>page.evaluate(async()=>{const {loadingSnapshot}=await import('/src/pageLoading.mjs');return loadingSnapshot();})).toBe(true);
 await page.getByRole('button',{name:'登出',exact:true}).click();await expect(page.getByRole('status')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(async()=>{const {loadingSnapshot}=await import('/src/pageLoading.mjs');return loadingSnapshot();})).toBe(false);expect(reads).toBe(1);
});
