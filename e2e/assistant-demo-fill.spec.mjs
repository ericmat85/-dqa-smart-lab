import {test,expect} from '@playwright/test';
import {state,install,apply,SIG} from './fixtures/preapproval-workflow.mjs';
import {runDemoCommand} from './assistantDemoCommand.mjs';
function managerCase(kind='VIRTUAL'){
 const s=state();s.rows[0].execution_kind=kind;
 apply(s,{request_id:s.rows[0].id,expected_revision:1,action:'SUBMIT',signature_data:SIG,comment:''},'owner');
 return s;
}
const noFillButtons=page=>expect(page.getByRole('button',{name:/^(?:demo\s*填(?:寫|入)|fill demo data|建立完整流程 Demo 案件)$/i})).toHaveCount(0);

test('manager Demo fill is assistant-only and leaves approval to the user',async({page})=>{
 const s=managerCase();await install(page,s,'manager');await page.goto('/request/cases/REQ-SYNTHETIC-1');await noFillButtons(page);
 await runDemoCommand(page,'/demo fill in manager',{reply:'尚未送出簽核'});
 await expect(page.getByAltText('主管簽名預覽')).toBeVisible();
 await expect(page.getByPlaceholder('請輸入核准說明或退件補正事項…')).toHaveValue(/DEMO 測試/);
 expect(s.writes).toHaveLength(0);expect(s.rows[0].status).toBe('AWAITING_REQUEST_MANAGER');expect(s.signatures).toHaveLength(1);
 await page.getByRole('button',{name:'✓ 核准委託單',exact:true}).click();
 await expect.poll(()=>s.rows[0].status).toBe('AWAITING_LMS_REVIEW');expect(s.writes).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('generic fill preserves the workspace administrator combined rights',async({page})=>{
 const s=managerCase();s.workspaceAdmin=true;await install(page,s,'owner');await page.goto('/request/cases/REQ-SYNTHETIC-1');
 await noFillButtons(page);await runDemoCommand(page,'/demo fill',{reply:'尚未送出簽核'});
 await expect(page.getByAltText('主管簽名預覽')).toBeVisible();expect(s.writes).toEqual([]);
});
test('real requests and unauthorized requester roles cannot generate supervisor signatures',async({page})=>{
 const real=managerCase('REAL');await install(page,real,'manager');await page.goto('/request/cases/REQ-SYNTHETIC-1');
 const comment=page.getByPlaceholder('請輸入核准說明或退件補正事項…');await comment.fill('保留人工意見');
 await runDemoCommand(page,'/demo fill in manager',{reply:'只適用虛擬委託'});
 await expect(comment).toHaveValue('保留人工意見');await expect(page.getByAltText('主管簽名預覽')).toHaveCount(0);expect(real.writes).toEqual([]);
 await page.unroute('**/api/**');const owner=managerCase();await install(page,owner,'owner');await page.goto('/request/cases/REQ-SYNTHETIC-1');
 await runDemoCommand(page,'/demo fill in manager',{reply:'無權簽核'});expect(owner.writes).toEqual([]);await expect(page.getByAltText('主管簽名預覽')).toHaveCount(0);
});
test('generic request fill changes only the current blank form and command guide lists the entry points',async({page})=>{
 const s=state();await install(page,s,'owner');await page.goto('/request/new');await noFillButtons(page);
 await runDemoCommand(page,'/demo fill',{reply:'已填入虛擬委託資料'});
 await expect(page.getByLabel('產品代碼（送簽必填）',{exact:true})).not.toHaveValue('');
 expect(s.writes).toEqual([]);expect(s.draftWrites).toEqual([]);expect(s.rows).toHaveLength(1);
 await runDemoCommand(page,'查看 AI 機器人指令碼',{reply:'/demo fill in manager'});
});
test('cancelling a second fill keeps manual changes and never approves',async({page})=>{
 const s=managerCase();await install(page,s,'manager');await page.goto('/request/cases/REQ-SYNTHETIC-1');
 await runDemoCommand(page,'/demo fill',{reply:'尚未送出簽核'});
 const comment=page.getByPlaceholder('請輸入核准說明或退件補正事項…');await comment.fill('手動補充，請保留');
 page.once('dialog',d=>d.dismiss());await runDemoCommand(page,'/demo fill in manager',{reply:'已取消填入'});
 await expect(comment).toHaveValue('手動補充，請保留');expect(s.writes).toEqual([]);expect(s.signatures).toHaveLength(1);
});
