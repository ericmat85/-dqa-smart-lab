import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {accelerateTrial,setTrialPaused,trialAcceleratorAvailability} from '../src/trialControls.mjs';
import {scheduleProgress} from '../src/scheduleProgress.mjs';
import {reservationWindow} from '../src/scheduleResources.mjs';
import {syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
const now=Date.parse('2026-10-30T06:00:00Z'),sig='data:image/png;base64,AAAA';
const engineer=INITIAL_ACCOUNTS.find(a=>a.role==='實驗室工程師'),manager=INITIAL_ACCOUNTS.find(a=>a.role==='一階主管');
function fixture(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS)],['dqa-equipment-demo-v1',JSON.stringify(DEMO_EQUIPMENT)]]);for(const k of ['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lms-reviews-v1','dqa-lab-operations-v1'])data.set(k,'[]');const time=new Date(now+86400000).toISOString(),end=new Date(now+172800000).toISOString(),machine=DEMO_EQUIPMENT.find(r=>r.status==='待機中');data.set('dqa-request-demo-v2',JSON.stringify([{id:'EXISTING-TRIAL',ownerId:'DEMO-REQUESTER',supervisorId:'DEMO-SUPERVISOR',status:'待排程'}]));data.set('dqa-schedules-demo-v1',JSON.stringify([{id:'EXISTING-SCHEDULE',requestId:'EXISTING-TRIAL',reservationId:'EXISTING-RESERVATION',equipmentId:machine.id,eq:machine.name,ownerId:engineer.id,owner:engineer.name,time,end,status:'已排程'}]));data.set('dqa_lab_demo_requests_v1',JSON.stringify([{id:'EXISTING-TRIAL',scheduleId:'EXISTING-SCHEDULE',reservationId:'EXISTING-RESERVATION',status:'已排程',acceptedAt:new Date(now-60000).toISOString(),scheduledStart:time,scheduledEnd:end}]));return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const read=(s,k)=>JSON.parse(s.getItem(k));
test('accelerator starts at halfway, pause persists and extends the end without advancing progress, resume then complete',()=>{
 const s=fixture();const first=accelerateTrial({actorId:engineer.id,signature:sig,now},s);
 let row=read(s,'dqa-schedules-demo-v1')[0];assert.equal(first.stage,'running');assert.equal(scheduleProgress(row,now).fraction,.5);assert.equal(read(s,'dqa_lab_demo_requests_v1')[0].status,'試驗中');
 const baseline=scheduleProgress(row,now).end;
 setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now},s);
 syncScheduleLifecycle(s,now+3600000);row=read(s,'dqa-schedules-demo-v1')[0];
 const progress=scheduleProgress(row,now+3600000);assert.equal(progress.fraction,.5);assert.equal(progress.end,baseline+3600000);assert.equal(reservationWindow(row,now+3600000).end,Infinity);
 assert.equal(read(s,'dqa-equipment-demo-v1').find(e=>e.currentRequest===first.id).status,'暫停中');assert.equal(read(s,'dqa-request-demo-v2')[0].status,'執行中');
 assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,now:now+3600000},s),/暫停/);
 setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:false,now:now+3600000},s);row=read(s,'dqa-schedules-demo-v1')[0];assert.equal(scheduleProgress(row,now+3600000).fraction,.5);assert.equal(scheduleProgress(row,now+3600000).end,baseline+3600000);
 const second=accelerateTrial({actorId:engineer.id,signature:sig,now:now+3601000},s);assert.equal(second.stage,'completed');assert.equal(read(s,'dqa_lab_demo_requests_v1')[0].status,'已完成');assert.equal(read(s,'dqa-request-demo-v2')[0].status,'已完成');
});
test('pause rejects wrong roles, stale double pause, shared equipment and completed cases',()=>{
 const s=fixture();accelerateTrial({actorId:engineer.id,signature:sig,now},s);const row=read(s,'dqa-schedules-demo-v1')[0];
 assert.throws(()=>setTrialPaused({scheduleId:row.id,actorId:engineer.id,paused:true,now},s),/權限|lv1/);
 const rows=read(s,'dqa-schedules-demo-v1');s.setItem('dqa-schedules-demo-v1',JSON.stringify([...rows,{...row,id:'other',requestId:'OTHER'}]));assert.throws(()=>setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now},s),/共用/);s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));
 setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now},s);assert.throws(()=>setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now},s),/狀態/);
 setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:false,now:now+1000},s);accelerateTrial({actorId:engineer.id,signature:sig,now:now+2000},s);assert.throws(()=>setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now:now+3000},s),/狀態/);
});
test('paused reservation blocks resumed overlap and cancellation releases paused equipment',async()=>{
 const {stopRequestSchedules}=await import('../src/requestCancellation.mjs');
 const s=fixture(),first=accelerateTrial({actorId:engineer.id,signature:sig,now},s);const row=read(s,'dqa-schedules-demo-v1')[0];
 setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:true,now},s);
 const rows=read(s,'dqa-schedules-demo-v1');s.setItem('dqa-schedules-demo-v1',JSON.stringify([...rows,{...row,id:'future',requestId:'OTHER',status:'已排程'}]));
 assert.throws(()=>setTrialPaused({scheduleId:row.id,actorId:manager.id,paused:false,now:now+1000},s),/衝突/);assert.equal(read(s,'dqa-schedules-demo-v1')[0].status,'暫停中');s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));
 stopRequestSchedules({scheduleId:row.id,requestId:first.id,actor:manager.name,actorId:manager.id,reason:'Demo 測試',now:now+2000},s);
 assert.equal(read(s,'dqa-equipment-demo-v1').find(e=>e.id===row.equipmentId).status,'待機中');assert.equal(read(s,'dqa-schedules-demo-v1')[0].pauseStartedAt,null);
});
test('only enabled lv1 controls trial decisions, including custom lv1 with schedule access',async()=>{
 const {canControlTrial}=await import('../src/trialPermissions.mjs');const s=fixture();
 for(const role of ['系統管理員','二階主管','三階主管','實驗室工程師'])assert.equal(canControlTrial({...manager,role},s),false);
 assert.equal(canControlTrial({...manager,status:'停用中'},s),false);assert.equal(canControlTrial(manager,s),true);
 s.setItem('dqa-custom-roles-v1',JSON.stringify([{name:'自訂lv1',level:1,pages:['schedule']}]));assert.equal(canControlTrial({...manager,role:'自訂lv1'},s),true);
 s.setItem('dqa-custom-roles-v1',JSON.stringify([{name:'自訂lv1',level:1,pages:['dashboard']}]));assert.equal(canControlTrial({...manager,role:'自訂lv1'},s),false);
 const r=accelerateTrial({actorId:engineer.id,signature:sig,now},s);const row=read(s,'dqa-schedules-demo-v1')[0];const {stopRequestSchedules}=await import('../src/requestCancellation.mjs');assert.throws(()=>stopRequestSchedules({scheduleId:row.id,requestId:r.id,actor:engineer.name,actorId:engineer.id,reason:'不能中止',now},s),/lv1/);
});
test('pause control stays visible with an explicit reason before starting or without lv1 access',async()=>{
 const {trialPauseAvailability}=await import('../src/trialPermissions.mjs');const s=fixture();
 for(const status of ['未排程','有衝突','已完成','取消']){const state=trialPauseAvailability(manager,{status},now,s);assert.equal(state.enabled,false);assert.match(state.reason,new RegExp(status));}
 assert.equal(trialPauseAvailability(manager,{status:'已排程',time:'2026-11-01',end:'2026-11-02'},now,s).enabled,false);
 assert.equal(trialPauseAvailability(manager,{status:'試驗中',time:'2026-10-30',end:'2026-10-31'},now,s).enabled,true);
 assert.equal(trialPauseAvailability(manager,{status:'暫停中',pauseStartedAt:new Date(now).toISOString()},now,s).enabled,true);
 assert.match(trialPauseAvailability(engineer,{status:'試驗中'},now,s).reason,/lv1/);
});
test('accelerator never creates cases for orphaned or empty data',()=>{
 const s=fixture();s.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{id:'LEGACY',scheduleId:'OLD',acceptedAt:new Date(now).toISOString(),status:'已排程'}]));
 const before=[...s.data];assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,now},s),/不會建立新案件/);assert.deepEqual([...s.data],before);
 for(const key of ['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1'])s.setItem(key,'[]');const empty=[...s.data];assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,now},s),/等待開始/);assert.deepEqual([...s.data],empty);
});
test('only a current accepted reservation can start acceleration; excluded cases remain unchanged',()=>{
 const mutations=[
  s=>{const rows=read(s,'dqa_lab_demo_requests_v1');rows[0].status='待確認';delete rows[0].acceptedAt;s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(rows));},
  s=>{const rows=read(s,'dqa_lab_demo_requests_v1');rows[0].scheduledStart='CHANGED';s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(rows));},
  s=>{const rows=read(s,'dqa_lab_demo_requests_v1');rows[0].reservationId='OLD';s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(rows));},
  s=>s.setItem('dqa-lab-operations-v1',JSON.stringify([{requestId:'EXISTING-TRIAL',status:'待審核'}])),
  s=>{const rows=read(s,'dqa-schedules-demo-v1');rows[0].reportInfo={stage:'level2'};s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));},
  ...['已完成','取消','已結案','待審核','待查閱'].map(status=>s=>{const rows=read(s,'dqa-request-demo-v2');rows[0].status=status;s.setItem('dqa-request-demo-v2',JSON.stringify(rows));}),
 ];
 for(const mutate of mutations){const s=fixture();mutate(s);const before=[...s.data];assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,now},s));assert.deepEqual([...s.data],before);}
 const s=fixture(),ids=read(s,'dqa-request-demo-v2').map(r=>r.id),accountData=s.getItem('dqa-shared-demo-accounts-v1');assert.equal(accelerateTrial({actorId:engineer.id,signature:sig,now},s).id,'EXISTING-TRIAL');assert.deepEqual(read(s,'dqa-request-demo-v2').map(r=>r.id),ids);assert.equal(s.getItem('dqa-shared-demo-accounts-v1'),accountData);assert.equal(read(s,'dqa-schedules-demo-v1').length,1);
});
test('completed trial cannot be scheduled again even if an old editor calls validation',async()=>{
 const {validateSchedule}=await import('../src/scheduleEquipment.mjs');
 assert.throws(()=>validateSchedule({editing:{status:'已完成'},form:{},equipment:[],accounts:[],rows:[]}),/試驗已完成/);
});

test('a scoped accelerator cannot select or create a different request',()=>{const s=fixture(),before=[...s.data];assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,requestId:'OTHER-CASE',now},s));assert.deepEqual([...s.data],before);assert.equal(accelerateTrial({actorId:engineer.id,signature:sig,requestId:'EXISTING-TRIAL',now},s).id,'EXISTING-TRIAL');});

test('accepted legacy LMS trials accelerate both assigned machines without inventing an electronic request',()=>{
 const s=fixture(),machines=DEMO_EQUIPMENT.filter(m=>m.status==='待機中').slice(0,2),rows=read(s,'dqa-schedules-demo-v1');
 rows[0]={...rows[0],equipmentIds:machines.map(m=>m.id),equipmentId:machines[0].id,equipmentCount:2,eq:machines.map(m=>m.name).join('、'),allocations:machines.map((m,i)=>({equipmentId:m.id,quantity:i?2:3}))};
 s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));s.setItem('dqa-request-demo-v2','[]');
 s.setItem('dqa-lms-reviews-v1',JSON.stringify([{id:'EXISTING-TRIAL',status:'完成',approval:2,history:['兩階主管核准']}])) ;
 const review=s.getItem('dqa-lms-reviews-v1');
 assert.equal(accelerateTrial({actorId:engineer.id,signature:sig,now},s).stage,'running');
 for(const machine of machines){const current=read(s,'dqa-equipment-demo-v1').find(m=>m.id===machine.id);assert.equal(current.status,'使用中');assert.equal(current.currentRequest,'EXISTING-TRIAL');}
 assert.equal(read(s,'dqa_lab_demo_requests_v1')[0].status,'試驗中');assert.equal(read(s,'dqa-schedules-demo-v1')[0].allocations.length,2);
 assert.equal(accelerateTrial({actorId:engineer.id,signature:sig,now:now+1000},s).stage,'completed');
 assert.equal(read(s,'dqa-schedules-demo-v1')[0].status,'已完成');assert.equal(read(s,'dqa_lab_demo_requests_v1')[0].status,'已完成');for(const machine of machines)assert.equal(read(s,'dqa-equipment-demo-v1').find(m=>m.id===machine.id).status,'待機中');assert.deepEqual(read(s,'dqa-request-demo-v2'),[]);assert.equal(s.getItem('dqa-lms-reviews-v1'),review);
 syncScheduleLifecycle(s,now+13*3600000);for(const machine of machines)assert.equal(read(s,'dqa-equipment-demo-v1').find(m=>m.id===machine.id).status,'待機中');
});
test('legacy support still rejects unapproved, cancelled, stale and conflicted two-machine reservations',()=>{
 for(const state of ['unapproved','cancelled','unaccepted','stale','pending','conflict']){
  const s=fixture(),machines=DEMO_EQUIPMENT.filter(m=>m.status==='待機中').slice(0,2),rows=read(s,'dqa-schedules-demo-v1');rows[0]={...rows[0],equipmentId:machines[0].id,equipmentIds:machines.map(m=>m.id)};s.setItem('dqa-request-demo-v2','[]');s.setItem('dqa-lms-reviews-v1',JSON.stringify([{id:'EXISTING-TRIAL',status:state==='cancelled'?'取消':'完成',approval:state==='unapproved'?1:2}]));
  if(state==='unaccepted'||state==='stale'){const lab=read(s,'dqa_lab_demo_requests_v1');if(state==='unaccepted')delete lab[0].acceptedAt;else lab[0].reservationId='OLD';s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(lab));}
  if(state==='pending')s.setItem('dqa-lab-operations-v1',JSON.stringify([{requestId:'EXISTING-TRIAL',status:'待審核'}]));
  if(state==='conflict')rows.push({...rows[0],id:'OTHER',requestId:'OTHER',time:new Date(now-3600000).toISOString(),end:new Date(now+3600000).toISOString()});
  s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));const before=[...s.data];assert.throws(()=>accelerateTrial({actorId:engineer.id,signature:sig,now},s));assert.deepEqual([...s.data],before);
 }
});

test('accelerator orders existing trials by nearest start and advances one trial 50 then 100 before the next',()=>{
 const s=fixture(),request=read(s,'dqa-request-demo-v2')[0],schedule=read(s,'dqa-schedules-demo-v1')[0],receipt=read(s,'dqa_lab_demo_requests_v1')[0];
 const secondSchedule={...schedule,id:'LATER-SCHEDULE',requestId:'LATER-TRIAL',reservationId:'LATER-RESERVATION',time:new Date(now+5*86400000).toISOString(),end:new Date(now+6*86400000).toISOString()};
 s.setItem('dqa-request-demo-v2',JSON.stringify([{...request,id:'LATER-TRIAL'},request]));
 s.setItem('dqa-schedules-demo-v1',JSON.stringify([secondSchedule,schedule]));
 s.setItem('dqa_lab_demo_requests_v1',JSON.stringify([{...receipt,id:'LATER-TRIAL',scheduleId:secondSchedule.id,reservationId:secondSchedule.reservationId,scheduledStart:secondSchedule.time,scheduledEnd:secondSchedule.end},receipt]));
 const options={actorId:engineer.id,signature:sig,now};
 assert.equal(trialAcceleratorAvailability(options,s).id,'EXISTING-TRIAL');
 for(const [id,percent] of [['EXISTING-TRIAL',50],['EXISTING-TRIAL',100],['LATER-TRIAL',50],['LATER-TRIAL',100]]){
  const result=accelerateTrial(options,s);assert.equal(result.id,id);assert.equal(result.percent,percent);
  const row=read(s,'dqa-schedules-demo-v1').find(x=>x.requestId===id);assert.equal(scheduleProgress(row,now).fraction,percent/100);
  assert.equal(read(s,'dqa-request-demo-v2').length,2);assert.equal(read(s,'dqa-schedules-demo-v1').length,2);
 }
 assert.equal(trialAcceleratorAvailability(options,s).enabled,false);
 const before=[...s.data];assert.throws(()=>accelerateTrial(options,s),/不會建立新案件/);assert.deepEqual([...s.data],before);
});
test('availability is read-only, empty trials are disabled and an accepted running trial can enter the Demo half-step',()=>{
 const s=fixture(),options={actorId:engineer.id,signature:sig,now};const before=[...s.data];assert.equal(trialAcceleratorAvailability(options,s).enabled,true);assert.deepEqual([...s.data],before);
 const rows=read(s,'dqa-schedules-demo-v1'),lab=read(s,'dqa_lab_demo_requests_v1');rows[0].time=new Date(now-3600000).toISOString();rows[0].end=new Date(now+3*3600000).toISOString();rows[0].status='試驗中';lab[0]={...lab[0],status:'試驗中',scheduledStart:rows[0].time,scheduledEnd:rows[0].end};s.setItem('dqa-schedules-demo-v1',JSON.stringify(rows));s.setItem('dqa_lab_demo_requests_v1',JSON.stringify(lab));assert.equal(accelerateTrial(options,s).percent,50);assert.equal(accelerateTrial(options,s).percent,100);
 const finished=[...s.data];assert.equal(trialAcceleratorAvailability(options,s).enabled,false);assert.deepEqual([...s.data],finished);
});
