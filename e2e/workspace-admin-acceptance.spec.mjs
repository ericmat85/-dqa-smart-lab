import {test,expect} from '@playwright/test';
import {state,install,lmsOpen,upload,apply,SIG} from './fixtures/preapproval-workflow.mjs';

test('one workspace administrator can submit, review as manager, and complete both LMS stages',async({page,isMobile})=>{
 const s=state();s.workspaceAdmin=true;s.noSupervisor=true;
 await install(page,s,'owner');
 await page.goto('/request/edit/REQ-SYNTHETIC-1');
 await expect(page.getByRole('heading',{name:'編輯委託單草稿'})).toBeVisible();
 if(isMobile)await page.getByRole('button',{name:'切換功能選單',exact:true}).click();
 await expect(page.getByRole('button',{name:'待簽核/查閱',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'新增委託單',exact:true})).toBeVisible();
 if(isMobile)await page.getByRole('button',{name:'切換功能選單',exact:true}).click();
 await expect(page.getByText('你沒有此頁的操作權限。')).toHaveCount(0);
 await page.getByRole('button',{name:/^送出主管簽核/}).click();
 await expect.poll(()=>s.rows[0].status).toBe('AWAITING_REQUEST_MANAGER');
 await page.goto('/request/cases/REQ-SYNTHETIC-1');
 await upload(page);
 await page.getByRole('button',{name:'✓ 核准委託單',exact:true}).click();
 await expect.poll(()=>s.rows[0].status).toBe('AWAITING_LMS_REVIEW');
 for(const level of [1,2]){
  await lmsOpen(page);await upload(page);
  await page.getByRole('button',{name:`核准第 ${level} 階`,exact:true}).click();
  await expect.poll(()=>s.rows[0].request_review_level).toBe(level);
 }
 expect(s.rows[0].status).toBe('AWAITING_SCHEDULING');
 expect(s.events.map(e=>e.stage)).toEqual(['REQUESTER','REQUEST_MANAGER','LMS_1','LMS_2']);
 expect(new Set(s.events.map(e=>e.actor_member_id)).size).toBe(1);
 expect(s.signatures).toHaveLength(4);expect(s.errors).toEqual([]);
});

test('ordinary requester cannot open the manager review route or approve their own submission',async({page})=>{
 const s=state();apply(s,{request_id:s.rows[0].id,expected_revision:1,action:'SUBMIT',signature_data:SIG,comment:''},'owner');
 await install(page,s,'owner');await page.goto('/request/reviews');
 await expect(page.getByText('你沒有此頁的操作權限。')).toBeVisible();
 await page.goto('/request/cases/REQ-SYNTHETIC-1');
 await expect(page.getByRole('button',{name:'✓ 核准委託單',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/核准第 [12] 階/})).toHaveCount(0);
 expect(s.writes).toHaveLength(0);
});
