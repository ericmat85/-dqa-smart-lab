import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {workspaceFixture} from './fixtures/workspace-design.mjs';
import {defaultTrialCatalog} from '../src/trialCatalogStore.mjs';
import {excelModule} from '../src/reportWorkbook.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,trial=defaultTrialCatalog()[0];
async function workbook(label){const Excel=await excelModule(),book=new Excel.Workbook();book.addWorksheet('試驗原稿').getCell('A1').value=label;return Buffer.from(await book.xlsx.writeBuffer());}
async function fixture(page,{snapshot=false,readonly=false,badHash=false,lost=false}={}){
 const q={id:id(200),tenant_id:id(10),legacy_id:'REQ-TEMPLATE-001',owner_member_id:id(1),trial_id:id(100),status:'AWAITING_LAB_RECEIPT',product_code:'SYNTHETIC',customer_name:'Demo',quantity:1,sample_space_units:1,form_details:{testItems:[trial.name]},trial_snapshot:{name:trial.name},request_document_version_id:id(300),revision:1};
 const effects=await workspaceFixture(page,{snapshotPatch:snapshot?{requests:[q],workflow_versions:[{id:id(300),request_id:id(200),version:1,document_sha256:'a'.repeat(64)}],schedules:[{id:id(400),legacy_id:'SCH-TEMPLATE-001',request_id:id(200),executor_member_id:id(1),status:'AWAITING_RECEIPT',starts_at:'2026-12-01T00:00:00Z',ends_at:'2026-12-12T00:00:00Z',plan:{hours_per_batch:250},revision:1}]}:{}});
 const state={files:new Map(),bindings:new Map(),results:new Map(),queue:[],deliveries:new Map(),writes:[],lost,badHash};
 const trials=()=>defaultTrialCatalog().map((t,i)=>({id:id(100+i),legacy_id:t.id,name:t.name,aliases:t.aliases,file_id:state.bindings.get(id(100+i))?.file_id||null,revision:state.bindings.get(id(100+i))?.revision||0}));
 await page.route('**/api/business/trial-templates**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.replace('/api/business/trial-templates',''),b=req.postDataJSON(),send=data=>route.fulfill({json:{data}}),error=(code,status=409)=>route.fulfill({status,json:{error:{code}}});
  if(path===''&&req.method()==='GET')return send({trials:trials(),files:[...state.files.values()].map(({content,...meta})=>meta),can_manage:!readonly});
  if(path==='/inbox')return send({rows:state.queue.map(r=>({...r,dispatched:state.deliveries.get(r.document_id)?.state==='DISPATCHED',claimed:state.deliveries.get(r.document_id)?.state==='CLAIMED'}))});
  if(path.startsWith('/file/'))return send(state.files.get(path.slice(6)));
  if(path.startsWith('/result/'))return send(state.results.get(path.slice(8))||{state:'NOT_COMMITTED_OR_NOT_FOUND'});
  if(path.startsWith('/request/')){const row=state.queue.find(r=>r.document_id===path.slice(9));if(!row)return send({has_template:false});const file=state.files.get(row.file_id);return send({...file,has_template:true,document_id:row.document_id,request_code:row.request_code,...(state.badHash?{sha256:'f'.repeat(64)}:{})});}
  state.writes.push({path,...b});
  if(path==='/save'){
   if(readonly)return error('TRIAL_TEMPLATE_ADMIN_REQUIRED',403);const current=state.bindings.get(b.trial_id);if((current?.revision||0)!==b.expected_revision)return error('TRIAL_TEMPLATE_REVISION_CONFLICT');
   if(b.content!==null)state.files.set(b.file_id,{id:b.file_id,trial_id:b.trial_id,name:b.name,version:b.version,sha256:b.sha256,byteLength:Buffer.from(b.content,'base64').length,content:b.content});state.bindings.set(b.trial_id,{file_id:b.file_id,revision:(current?.revision||0)+1});const result={id:b.operation_id,state:'SAVED'};state.results.set(b.operation_id,result);if(state.lost){state.lost=false;return route.abort('failed');}return send(result);
  }
  if(path==='/claim'){const current=state.deliveries.get(b.document_id);if(current&&(current.state==='DISPATCHED'||!b.manual))return send({attempt:b.attempt,state:current.state==='DISPATCHED'?'DISPATCHED':'IN_PROGRESS'});state.deliveries.set(b.document_id,{attempt:b.attempt,state:'CLAIMED'});return send({attempt:b.attempt,state:'CLAIMED'});}
  if(path==='/ack'){const d=state.deliveries.get(b.document_id);if(d?.attempt!==b.attempt)return error('TRIAL_TEMPLATE_CLAIM_STALE');d.state='DISPATCHED';return send({attempt:b.attempt,state:'DISPATCHED'});}
  throw Error('Unknown trial template path '+path);
 });
 return {state,effects,submit(){const f=state.files.get(state.bindings.get(id(100))?.file_id);if(f)state.queue=[{request_id:id(200),request_code:'REQ-TEMPLATE-001',document_id:id(300),trial_name:trial.name,file_id:f.id,name:f.name,version:f.version,sha256:f.sha256}];}};
}
async function bind(page,label,bytes,version='V1'){
 const button=page.getByRole('button',{name:'綁定範本文件：'+trial.name,exact:true});await expect(button).toBeEnabled({timeout:30000});await button.click();const dialog=page.getByRole('dialog',{name:'綁定範本文件｜'+trial.name,exact:true});await dialog.getByLabel('試驗範本來源').selectOption('upload');await dialog.getByLabel('選擇試驗綁定範本').setInputFiles({name:label,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await dialog.getByLabel('綁定範本版本').fill(version);await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'儲存綁定',exact:true}).click();return dialog;
}
test('trial binding pins the original submitted version and automatically dispatches it only once to the executor',async({page},info)=>{
 const f=await fixture(page,{snapshot:true}),first=await workbook('舊版試驗原稿'),second=await workbook('新版試驗原稿');await page.goto('/lms/settings/parameters');await expect(await bind(page,'試驗原稿.xlsx',first)).toHaveCount(0);f.submit();await expect(await bind(page,'試驗原稿.xlsx',second,'V2')).toHaveCount(0);await page.getByRole('button',{name:'綁定範本文件：'+trial.name,exact:true}).click();const editor=page.getByRole('dialog',{name:'綁定範本文件｜'+trial.name,exact:true});await editor.getByLabel('試驗範本來源').selectOption('clear');await editor.getByRole('button',{name:'儲存綁定',exact:true}).click();await expect(editor).toHaveCount(0);
 const downloads=[];page.on('download',d=>downloads.push(d));const waiting=page.waitForEvent('download');await page.goto('/lab/dashboard');const downloaded=await waiting;expect(downloaded.suggestedFilename()).toBe('REQ-TEMPLATE-001_試驗原稿.xlsx');expect(await readFile(await downloaded.path())).toEqual(first);
 const panel=page.getByRole('region',{name:'本案綁定試驗範本',exact:true});await expect(panel).toContainText('V1');await expect(panel).toContainText('已送出下載要求');await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('executor-template.png')});
 await page.reload();await expect(panel).toContainText('已送出下載要求');expect(downloads).toHaveLength(1);const manual=page.waitForEvent('download');await panel.getByRole('button',{name:'下載綁定範本：REQ-TEMPLATE-001',exact:true}).click();expect(await readFile(await (await manual).path())).toEqual(first);expect(downloads).toHaveLength(2);expect(f.state.writes.filter(w=>w.path==='/ack')).toHaveLength(1);expect(f.effects.writes).toEqual([]);expect(f.effects.errors).toEqual([]);
});
test('binding acknowledgement loss is recovered without uploading a duplicate version and read-only accounts cannot bind',async({page})=>{
 const f=await fixture(page,{lost:true});await page.goto('/lms/settings/parameters');const dialog=await bind(page,'結果待確認.xlsx',await workbook('空白試驗範本'));await expect(dialog.getByRole('button',{name:'查詢綁定結果',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'儲存綁定',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'查詢綁定結果',exact:true}).click();await expect(dialog).toHaveCount(0);expect(f.state.writes.filter(w=>w.path==='/save')).toHaveLength(1);
 await page.route('**/api/business/trial-templates',route=>route.fulfill({json:{data:{trials:defaultTrialCatalog().map((t,i)=>({id:id(100+i),legacy_id:t.id,name:t.name,revision:0,file_id:null})),files:[],can_manage:false}}}));await page.reload();await expect(page.getByRole('button',{name:'綁定範本文件：'+trial.name,exact:true})).toBeDisabled();
});
test('corrupt bound originals never start a browser download',async({page})=>{
 const f=await fixture(page,{snapshot:true,badHash:true});await page.goto('/lms/settings/parameters');await expect(await bind(page,'雜湊核對.xlsx',await workbook('原稿'))).toHaveCount(0);f.submit();const downloads=[];page.on('download',d=>downloads.push(d));await page.goto('/lab/dashboard');const panel=page.getByRole('region',{name:'本案綁定試驗範本',exact:true});await expect(panel.getByRole('alert')).toContainText('完整性驗證失敗');expect(downloads).toHaveLength(0);expect(f.state.writes.filter(w=>w.path==='/ack')).toHaveLength(0);f.state.badHash=false;const waiting=page.waitForEvent('download');await panel.getByRole('button',{name:'下載綁定範本：REQ-TEMPLATE-001',exact:true}).click();expect((await readFile(await (await waiting).path())).length).toBeGreaterThan(0);await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('an existing uploaded blank form can be copied into a trial binding without changing the source library',async({page})=>{
 const f=await fixture(page),bytes=await workbook('已上傳的空白原稿'),blank={id:id(700),name:'既有空白原稿.xlsx',version:'V1',trialId:'BLANK',synthetic:true,createdAt:'2026-11-25T00:00:00Z',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length};
 await page.route('**/api/business/templates/blank',route=>route.fulfill({json:{data:{rows:[blank],builtin_visible:true,default_template_id:'BLANK',revision:0,can_manage:true}}}));await page.route('**/api/business/templates/blank/file/*',route=>route.fulfill({json:{data:{...blank,content:bytes.toString('base64')}}}));
 await page.goto('/lms/settings/parameters');await page.getByRole('button',{name:'綁定範本文件：'+trial.name,exact:true}).click();const dialog=page.getByRole('dialog',{name:'綁定範本文件｜'+trial.name,exact:true});await expect(dialog.getByLabel('試驗範本來源').locator('option[value="blank:'+blank.id+'"]')).toHaveCount(1);await dialog.getByLabel('試驗範本來源').selectOption('blank:'+blank.id);await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'儲存綁定',exact:true}).click();await expect(dialog).toHaveCount(0);expect(f.state.writes.filter(w=>w.path==='/save')).toHaveLength(1);const saved=f.state.writes[0];expect(saved.file_id).not.toBe(blank.id);expect(Buffer.from(saved.content,'base64')).toEqual(bytes);expect(f.effects.writes).toEqual([]);
});
