import {test,expect} from '@playwright/test';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
const gradient='linear-gradient(100deg, rgb(0, 157, 145), rgb(7, 159, 186))';
async function centered(outer,inner){const a=await outer.boundingBox(),b=await inner.boundingBox();expect(Math.abs(a.x+a.width/2-b.x-b.width/2)).toBeLessThanOrEqual(1);expect(Math.abs(a.y+a.height/2-b.y-b.height/2)).toBeLessThanOrEqual(1);}
test('all entry buttons share green and eye icons are centered on desktop and mobile',async({page})=>{
 for(const width of [1366,375]){await page.setViewportSize({width,height:900});for(const system of ['lms','request','lab','validation']){
  await page.goto(`/${system}/login`);const button=page.getByRole('button',{name:system==='validation'?'暫未開放':'登入系統',exact:false});await expect(button).toHaveCSS('background-image',gradient);
  const offset=await button.evaluate(element=>{const nodes=[...element.childNodes],node=nodes.find(node=>node.nodeType===Node.TEXT_NODE&&/登入系統|暫未開放/.test(node.textContent)),text=node.textContent,match=text.match(/登入系統|暫未開放/),range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const r=range.getBoundingClientRect(),b=element.getBoundingClientRect();return {x:Math.abs(r.x+r.width/2-b.x-b.width/2),y:Math.abs(r.y+r.height/2-b.y-b.height/2)};});expect(offset.x).toBeLessThanOrEqual(2);expect(offset.y).toBeLessThanOrEqual(3);
  const eye=page.getByRole('button',{name:'按住顯示密碼'});await centered(eye,eye.locator('svg'));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }}expect(await page.pageErrors()).toEqual([]);
});
test('schedule AI SVG is centered and save is purple without preparation or cleanup fields',async({page})=>{
 await page.addInitScript(({accounts,equipment})=>{
  localStorage.setItem('dqa-shared-demo-accounts-v1',JSON.stringify(accounts));localStorage.setItem('dqa-equipment-demo-v1',JSON.stringify(equipment));sessionStorage.setItem('dqa-lms-account-id','U001');
  for(const key of ['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa_lab_demo_requests_v1','dqa-lab-operations-v1'])localStorage.setItem(key,'[]');
  localStorage.setItem('dqa-schedules-demo-v1',JSON.stringify([{id:'CENTER',requestId:'REQ-CENTER',title:'低溫試驗',status:'未排程',quantity:1}]));
 },{accounts:INITIAL_ACCOUNTS,equipment:DEMO_EQUIPMENT});
 await page.goto('/lms/dashboard');await page.locator('.sidebar').getByRole('button',{name:'排程管理',exact:true}).click();await page.getByRole('button',{name:'編輯排程',exact:true}).click();
 const editor=page.getByRole('dialog',{name:/編輯試驗排程/}),icon=editor.locator('.schedule-ai-button-icon');await centered(icon,icon.locator('svg'));
 await expect(editor.getByLabel('準備時間（分鐘）')).toHaveCount(0);await expect(editor.getByLabel('清理時間（分鐘）')).toHaveCount(0);await expect(editor.getByRole('button',{name:'儲存排程',exact:true})).toHaveCSS('background-color','rgb(124, 58, 237)');
 await page.setViewportSize({width:375,height:900});await centered(icon,icon.locator('svg'));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.pageErrors()).toEqual([]);
});
