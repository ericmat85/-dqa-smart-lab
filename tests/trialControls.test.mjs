import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {DEMO_EQUIPMENT} from '../src/demoEquipment.mjs';
import {accelerateTrial,setTrialPaused} from '../src/trialControls.mjs';
import {scheduleProgress} from '../src/scheduleProgress.mjs';
import {reservationWindow} from '../src/scheduleResources.mjs';
import {syncScheduleLifecycle} from '../src/scheduleLifecycle.mjs';
const now=Date.parse('2026-10-30T06:00:00Z'),sig='data:image/png;base64,AAAA';
const engineer=INITIAL_ACCOUNTS.find(a=>a.role==='實驗室工程師'),manager=INITIAL_ACCOUNTS.find(a=>a.role==='一階主管');
function fixture(){const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(INITIAL_ACCOUNTS)],['dqa-equipment-demo-v1',JSON.stringify(DEMO_EQUIPMENT)]]);for(const k of ['dqa-request-demo-v2','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lms-reviews-v1','dqa-lab-operations-v1'])data.set(k,'[]');return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
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
