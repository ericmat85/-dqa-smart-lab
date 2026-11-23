import {test,expect} from '@playwright/test';
import {defaultTrialCatalog} from '../src/trialCatalogStore.mjs';
const id=n=>'fc000000-0000-4000-8000-'+String(n).padStart(12,'0');
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);let start=Date.now()+7*86400000;while(new Date(day(start)+'T00:00:00Z').getUTCDay()!==5)start+=86400000;const START=day(start),END=day(start+10*86400000);
function state(){const trial=defaultTrialCatalog().find(t=>t.profileId==='HIGH_HUMIDITY');return {trial:{id:id(10),legacy_id:trial.id,name:trial.name,aliases:trial.aliases,profile_code:trial.profileId,specification:trial.specification,acceptance:trial.acceptance,equipment_reference:trial.equipment,specification_version:trial.version,duration_hours:250,enabled:true,source_kind:'SYNTHETIC',revision:1},request:{id:id(11),legacy_id:'REQ-SHARED-SYNTHETIC',owner_member_id:id(1),status:'AWAITING_SCHEDULING',revision:7,request_review_level:2,request_document_version_id:id(20),trial_id:id(10),quantity:3,sample_space_units:1,product_code:'SYNTHETIC',customer_name:'合成客戶',requested_date:END,specification:'試驗時間：250 小時。',acceptance:'合成判定',form_details:{testItems:[trial.name],purpose:['合成驗證']}},drafts:[],writes:[],receipts:new Map(),errors:[],unknown:false,conflict:false,delay:false};}
async function install(page,s,{admin=true}={}){
 page.on('pageerror',e=>s.errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('dqa-schedules-demo-v1','KEEP_NATIVE_SCHEDULE'));
 await page.route('**/api/**',async route=>{const q=route.request(),p=new URL(q.url()).pathname,b=q.postDataJSON(),send=(v,status=200)=>route.fulfill({status,json:{...v,trace_id:'I-SYNTHETIC'}}),bad=(code,status=403)=>send({error:{code}},status);
 if(!p.startsWith('/api/business'))return bad('LIVE_PROVIDER_DISABLED');const path=p.slice('/api/business'.length);
 if(path==='/me')return send({user:{id:id(1),email:'synthetic@example.invalid'},member:{id:id(1),display_name:'合成管理者',role_name:admin?'系統管理員':'檢視者',is_admin:admin,permissions:admin?[]:['requests.read_all','equipment.read','catalog.read','schedules.read_all'],systems:['lms','lab','request'],pages:['dashboard','requests','schedule','equipment','maintenance','reports','settings','archive']}});
 if(path==='/snapshot')return send({data:{requests:[s.request],trials:defaultTrialCatalog().map((t,i)=>({...s.trial,id:t.profileId===s.trial.profile_code?s.trial.id:id(100+i),legacy_id:t.id,name:t.name,aliases:t.aliases,profile_code:t.profileId,specification:t.specification,acceptance:t.acceptance,equipment_reference:t.equipment,specification_version:t.version,duration_hours:t.durationHours})),members:[{id:id(1),display_name:'合成管理者',enabled:true},{id:id(2),display_name:'合成執行人',enabled:true}],roles:[],sites:[],departments:[],equipment:[{id:id(12),legacy_id:'EQ-SYNTHETIC',name:s.equipmentName||'恆溫恆濕機 合成',category:s.category||'溫濕度',space_units:s.capacity??6,daily_hours:24,operational_status:'IDLE',revision:2,specification:'-40~150°C；10~98%RH'}],materials:[],schedules:[],allocations:[],borrows:[],operations:[],reports:[],quality:[],qualifications:[],resource_events:[],workflow_versions:[{id:id(20),request_id:id(11),version:1,document_sha256:'a'.repeat(64)}],workflow_events:[],workflow_signatures:[],schedule_drafts:s.drafts,schedule_executors:[{id:id(2),display_name:'合成執行人',revision:3}],formal_booking_enabled:false,human_workflow_enabled:s.human===true}});
 if(path==='/planning/preview'){
  (s.previews??=[]).push(b);if(s.previewError)return bad('PLANNING_RESOURCE_CONFLICT',409);
  const c=b.command,date=s.dayCase?(c.data.sample_space_units===2?day(start+3*86400000):START):s.previewEnd||END;if(s.previewDelay)await new Promise(resolve=>{s.releasePreview=resolve;});
  return send({data:{scheduling_unit:'DAY',scheduling_days:s.dayCase?(c.data.sample_space_units===2?2:1):11,calendar_days:s.dayCase?(c.data.sample_space_units===2?4:1):11,calendar:s.dayCase?'weekdays':'continuous',scope:'DRAFT_ONLY',reserved:false,start_date:c.data.start_date,end_date:date,sample_space_units:c.data.sample_space_units,hours_per_batch:s.dayCase?1:250}});
 }
 if(path.startsWith('/execution/')){(s.executions??=[]).push(b);return bad('HUMAN_ACCESS_DENIED');}
 if(path==='/planning/prepare'){if(!admin)return bad('PLANNING_ACCESS_DENIED');return send({data:{state:'PLANNED',id:b.operation_id}});}
 if(path==='/planning/execute'){
  if(!admin)return bad('PLANNING_ACCESS_DENIED');s.writes.push(b);const c=b.command;if(c.expected_request_revision!==s.request.revision)return bad('REVISION_CONFLICT',409);if(s.conflict)return bad('PLANNING_RESOURCE_CONFLICT',409);
  const revision=(s.drafts[0]?.revision||0)+1;if(c.expected_draft_revision!==revision-1)return bad('REVISION_CONFLICT',409);
  s.drafts=[{id:id(30),request_id:s.request.id,request_revision:s.request.revision,document_version_id:id(20),revision,plan:{sample_space_units:c.data.sample_space_units,executor_id:c.data.executor_id,executor_label:'合成執行人',allocations:[{equipment_id:id(12),quantity:3,space_units:3*c.data.sample_space_units}],start_date:c.data.start_date,end_date:c.data.end_date,hours_per_batch:250,sample_code:c.data.sample_code,note:c.data.note,preparation_minutes:0,cleanup_minutes:0}}];s.receipts.set(b.operation_id,{state:'SAVED',revision,reserved:false});if(s.delay)await new Promise(resolve=>s.release=resolve);if(s.unknown)return send({error:{code:'WRITE_OUTCOME_UNKNOWN'},outcome_unknown:true},503);return send({data:s.receipts.get(b.operation_id)});
 }
 if(path.startsWith('/planning/result/'))return send({data:s.receipts.get(path.split('/').at(-1))||{state:'PLANNED'}});return bad('ROUTE_NOT_FOUND',404);
 });
}
async function editor(page){await page.goto('/lms/schedule');await page.getByRole('button',{name:'編輯排程',exact:true}).click();return page.getByRole('dialog',{name:'編輯試驗排程｜REQ-SHARED-SYNTHETIC'});}
async function fill(d){await d.getByLabel('設備選擇').selectOption('EQ-SYNTHETIC');await d.getByLabel(/^執行人/).selectOption(id(2));await d.getByLabel(/每件樣品使用空間/).fill('2');await d.getByLabel(/^開始日期/).fill(START);await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(END);}
test('approved requests appear immediately; shared draft form keeps original UI and planner U remains editable',async({page},info)=>{const s=state();await install(page,s);const d=await editor(page);await expect(d.getByRole('button',{name:'AI 自動化排程'})).toBeDisabled();await expect(d.getByLabel(/每件樣品使用空間/)).toHaveJSProperty('readOnly',false);await fill(d);await page.screenshot({path:info.outputPath('shared-schedule.png'),fullPage:true});expect(s.errors).toEqual([]);});
test('draft save persists across independent browser contexts without booking or native storage writes',async({page,browser,baseURL})=>{const s=state();await install(page,s);const d=await editor(page);await fill(d);await d.getByRole('button',{name:'儲存排程草稿',exact:true}).click();await expect(d).toHaveCount(0);await expect(page.getByText('草稿第 1 版 · 未預約')).toBeVisible();expect(s.request.status).toBe('AWAITING_SCHEDULING');expect(await page.evaluate(()=>localStorage.getItem('dqa-schedules-demo-v1'))).toBe('KEEP_NATIVE_SCHEDULE');const context=await browser.newContext({baseURL}),other=await context.newPage();try{await install(other,s);const second=await editor(other);await expect(second.getByLabel(/^開始日期/)).toHaveValue(START);await expect(second.getByLabel(/^執行人/)).toHaveValue(id(2));expect(s.writes).toHaveLength(1);expect(s.writes[0].command.data.sample_space_units).toBe(2);await expect(second.getByLabel(/每件樣品使用空間/)).toHaveValue('2');}finally{await context.close();}expect(s.errors).toEqual([]);});
test('resource conflict preserves form and never automatically retries',async({page})=>{const s=state();s.conflict=true;await install(page,s);const d=await editor(page);await fill(d);await d.getByRole('button',{name:'儲存排程草稿'}).click();await expect(d.getByRole('alert')).toContainText('正式占用');await expect(d.getByLabel(/^開始日期/)).toHaveValue(START);expect(s.writes).toHaveLength(1);});
test('stale request revision remains captured after background sync',async({page})=>{const s=state();await install(page,s);const d=await editor(page);await fill(d);s.request.revision=8;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(200);await d.getByRole('button',{name:'儲存排程草稿'}).click();await expect(d.getByRole('alert')).toContainText('其他使用者更新');expect(s.writes[0].command.expected_request_revision).toBe(7);});
test('lost acknowledgement survives reload and uses lookup without another execute',async({page})=>{const s=state();s.unknown=true;await install(page,s);const d=await editor(page);await fill(d);await d.getByRole('button',{name:'儲存排程草稿'}).click();await expect(d.getByRole('button',{name:'查詢處理結果'})).toBeVisible();await expect(d.getByRole('button',{name:'儲存排程草稿'})).toBeDisabled();await page.reload();await page.getByRole('button',{name:'查詢處理結果'}).click();await expect(page.getByText('資料庫已確認儲存完成。')).toBeVisible();expect(s.writes).toHaveLength(1);});
test('read-only role cannot edit a shared schedule draft',async({page})=>{const s=state();await install(page,s,{admin:false});await page.goto('/lms/schedule');await expect(page.getByRole('button',{name:'編輯排程',exact:true})).toBeDisabled();expect(s.writes).toHaveLength(0);});
test('waiting execute prevents duplicate submission and trial controls stay disabled',async({page})=>{const s=state();s.delay=true;await install(page,s);const d=await editor(page);await fill(d);await expect(d.getByRole('button',{name:'中止排程'})).toBeDisabled();await d.getByRole('button',{name:'儲存排程草稿'}).click();await expect.poll(()=>typeof s.release).toBe('function');await expect(d.getByRole('button',{name:'儲存排程草稿'})).toBeDisabled();await expect(d.getByRole('button',{name:'關閉',exact:true})).toBeDisabled();s.release();await expect(d).toHaveCount(0);expect(s.writes).toHaveLength(1);expect(s.errors).toEqual([]);});


test('completion date is backend-controlled and an old date is never sent to save',async({page},info)=>{
 const s=state();s.previewEnd=day(start+11*86400000);await install(page,s);const d=await editor(page);
 await d.getByLabel('設備選擇').selectOption('EQ-SYNTHETIC');await d.getByLabel(/^執行人/).selectOption(id(2));await d.getByLabel(/每件樣品使用空間/).fill('2');await d.getByLabel(/^開始日期/).fill(START);
 await expect(d.getByLabel(/^預計完成日期/)).toHaveJSProperty('readOnly',true);await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(s.previewEnd);
 await page.screenshot({path:info.outputPath('authoritative-completion.png'),fullPage:true});await d.getByRole('button',{name:'儲存排程草稿',exact:true}).click();await expect(d).toHaveCount(0);
 expect(s.writes[0].command.data.end_date).toBe(s.previewEnd);expect(s.previews[0].command.data.end_date).toBe(START);expect(s.errors).toEqual([]);
});

test('editing sample space rechecks completion and blocks save while calculation waits',async({page})=>{
 const s=state();await install(page,s);const d=await editor(page);await fill(d);s.previewDelay=true;s.previewEnd=day(start+11*86400000);
 await d.getByLabel(/每件樣品使用空間/).fill('1');await expect.poll(()=>typeof s.releasePreview).toBe('function');await expect(d.getByRole('button',{name:'儲存排程草稿',exact:true})).toBeDisabled();await expect(d.getByLabel(/^預計完成日期/)).toHaveValue('');
 s.releasePreview();await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(s.previewEnd);await expect(d.getByRole('button',{name:'儲存排程草稿',exact:true})).toBeEnabled();expect(s.previews.at(-1).command.data.sample_space_units).toBe(1);expect(s.writes).toHaveLength(0);
});

test('preview resource conflict preserves inputs without creating a draft',async({page})=>{
 const s=state();await install(page,s);const d=await editor(page);await fill(d);s.previewError=true;
 await d.getByLabel(/每件樣品使用空間/).fill('1');await expect(d.getByRole('alert')).toContainText('正式占用');await expect(d.getByLabel(/^開始日期/)).toHaveValue(START);await expect(d.getByLabel(/每件樣品使用空間/)).toHaveValue('1');await expect(d.getByRole('button',{name:'儲存排程草稿',exact:true})).toBeDisabled();expect(s.writes).toHaveLength(0);expect(s.errors).toEqual([]);
});


test('a late calculation cannot overwrite a newer form result',async({page})=>{
 const s=state();await install(page,s);const d=await editor(page);await fill(d);s.previewDelay=true;
 await d.getByLabel(/每件樣品使用空間/).fill('1');await expect.poll(()=>typeof s.releasePreview).toBe('function');const releaseOld=s.releasePreview;
 s.previewDelay=false;s.previewEnd=day(start+11*86400000);await d.getByLabel(/^樣品編號/).fill('SMP-NEWER');await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(s.previewEnd);
 releaseOld();await page.waitForTimeout(500);await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(s.previewEnd);await d.getByRole('button',{name:'儲存排程草稿',exact:true}).click();await expect(d).toHaveCount(0);expect(s.writes[0].command.data.end_date).toBe(s.previewEnd);expect(s.writes[0].command.data.sample_code).toBe('SMP-NEWER');expect(s.errors).toEqual([]);
});


test('formal booking requires saving a changed sample-space value even if the finish date stays the same',async({page})=>{
 const s=state();s.human=true;await install(page,s);let d=await editor(page);await fill(d);await d.getByRole('button',{name:'儲存排程草稿',exact:true}).click();await expect(d).toHaveCount(0);
 await page.getByRole('button',{name:'編輯排程',exact:true}).click();d=page.getByRole('dialog',{name:'編輯試驗排程｜REQ-SHARED-SYNTHETIC'});await d.getByLabel(/每件樣品使用空間/).fill('1');await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(END);await expect(d.getByRole('button',{name:'確認正式預約',exact:true})).toBeEnabled();
 page.on('dialog',dialog=>dialog.accept());await d.getByRole('button',{name:'確認正式預約',exact:true}).click();await expect(d.getByRole('alert')).toContainText('表單尚有變更');expect(s.executions||[]).toHaveLength(0);expect(s.writes).toHaveLength(1);expect(s.errors).toEqual([]);
});


test('one-hour test shows whole-day planning; a second batch moves to the next working day',async({page},info)=>{
 const s=state(),trial=defaultTrialCatalog().find(t=>t.profileId==='WATER_INGRESS');s.trial={...s.trial,name:trial.name,aliases:trial.aliases,profile_code:trial.profileId,duration_hours:1};s.request={...s.request,quantity:2,specification:'試驗時間：1 小時。',form_details:{testItems:[trial.name],purpose:['合成驗證']}};s.equipmentName='防水試驗機 合成';s.category='防水';s.capacity=2;s.dayCase=true;
 await install(page,s);const d=await editor(page);await d.getByLabel('設備選擇').selectOption('EQ-SYNTHETIC');await d.getByLabel(/^執行人/).selectOption(id(2));await d.getByLabel(/每件樣品使用空間/).fill('1');await d.getByLabel(/^開始日期/).fill(START);
 await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(START);await expect(d.getByText('預計需 1 作業日；設備與執行人整天保留。',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('one-hour-one-day.png'),fullPage:true});
 await d.getByLabel(/每件樣品使用空間/).fill('2');await expect(d.getByLabel(/^預計完成日期/)).toHaveValue(day(start+3*86400000));await expect(d.getByText('預計需 2 作業日；設備與執行人整天保留。',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('one-hour-two-batches.png'),fullPage:true});
 await d.getByRole('button',{name:'儲存排程草稿',exact:true}).click();await expect(d).toHaveCount(0);expect(s.writes[0].command.data.end_date).toBe(day(start+3*86400000));expect(s.writes[0].command.data.sample_space_units).toBe(2);expect(s.request.quantity).toBe(2);expect(s.errors).toEqual([]);
});
