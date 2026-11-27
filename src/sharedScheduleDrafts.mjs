import {isCompoundRequest,compoundTimeline,compoundFormFromPlan} from './compoundSchedule.mjs';
import {dayBasedTrialExecution} from './dayBasedTrialExecution.mjs';
import {trialProfile,sequentialAllocations} from './trialProfiles.mjs';
import {explicitHours} from './trialSourceFacts.mjs';
// Shared drafts do not reserve equipment, change request state or activate AI.
const idPattern=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function scheduleDraftRows(snapshot,requests,equipment){
 const ref=id=>equipment.find(e=>e.databaseId===id),member=id=>(snapshot.schedule_executors||[]).find(m=>m.id===id)?.display_name||'';
 return requests.filter(r=>(r.databaseStatus==='AWAITING_SCHEDULING'||r.preapprovalWorkflow&&r.databaseStatus==='AWAITING_LMS_REVIEW'&&r.reviewLevel===0)&&!(snapshot.schedules||[]).some(s=>s.request_id===r.databaseId&&!['CANCELLED','DRAFT'].includes(s.status))).map(r=>{const draft=(snapshot.schedule_drafts||[]).find(d=>d.request_id===r.databaseId),p=draft?.plan,ids=(p?.allocations||[]).map(a=>ref(a.equipment_id)?.id).filter(Boolean);return {...r,id:'SCH-'+r.id,requestId:r.id,requestDatabaseId:r.databaseId,requestRevision:r.sourceRevision,draftId:draft?.id||null,draftRevision:draft?.revision||0,businessDatabase:true,hasSharedDraft:!!draft,staleSharedDraft:!!draft&&(draft.request_revision!==r.sourceRevision||draft.document_version_id!==r.documentVersionId),status:'未排程',title:r.testItems.join('、'),test:r.testItems.join('、'),eq:r.outsourced?'委外設備':(p?.allocations||[]).map(a=>ref(a.equipment_id)?.name||'未提供的設備').join('、'),equipmentId:ids[0]||'',equipmentIds:ids,equipmentCount:r.outsourced?0:ids.length||1,ownerId:p?.executor_id||'',owner:member(p?.executor_id)||p?.executor_label||'',executorId:p?.executor_id||'',time:p?.start_date||'',end:p?.end_date||'',sampleCode:r.preapprovalWorkflow?r.sampleCode||'':p?.sample_code||'',remarks:p?.note||r.notes||'',preparationMinutes:p?.preparation_minutes||0,cleanupMinutes:p?.cleanup_minutes||0,requestedDate:r.dueDate,requester:r.requester,customer:r.customer,testSpec:r.specification,judgment:r.judgementCriteria,intent:r.purpose.join('、'),sampleSpaceUnits:p?.sample_space_units??r.sampleSpaceUnits??'',durationHours:p?.hours_per_batch,plan:p,compound:compoundFormFromPlan(p,equipment)};});
}
export function scheduleDraftCommand(editing,form,references){
 if(!editing.businessDatabase||!idPattern.test(editing.requestDatabaseId||''))throw Error('請重新開啟資料庫委託的排程資訊。');
 if(isCompoundRequest(editing)){const c=form.compound;if(!c)throw Error('請完成複合排程資料。');const timeline=compoundTimeline(editing.compoundStages,c);if(!timeline.valid)throw Error(timeline.issues[0].message);const machines=c.stageEquipmentIds?.map(id=>references.equipment.find(e=>e.legacy_id===id));if(machines?.length!==editing.compoundStages.length||machines.some(m=>!m))throw Error('請逐階段指定設備。');const unique=[...new Map(machines.map(m=>[m.id,m])).values()],executor=references.executors.find(e=>e.id===form.ownerId),units=Number(form.sampleSpaceUnits);if(!executor||!Number.isSafeInteger(units)||units<1||units>100000)throw Error('請選擇執行人並填寫有效樣品空間。');return {request_id:editing.requestDatabaseId,expected_request_revision:editing.requestRevision,expected_draft_revision:editing.draftRevision,data:{equipment_ids:unique.map(m=>m.id),equipment_revisions:Object.fromEntries(unique.map(m=>[m.id,m.revision])),executor_id:executor.id,executor_revision:executor.revision,sample_space_units:units,start_date:c.startLocal.slice(0,10),end_date:form.end||c.startLocal.slice(0,10),sample_code:String(form.sampleCode||'').trim(),note:form.note||'',preparation_minutes:0,cleanup_minutes:0,compound:{start_local:c.startLocal,shift_start:c.shiftStart,shift_end:c.shiftEnd,preloaded_weekend:c.preloadedWeekend,stage_equipment_ids:machines.map(m=>m.id)}}};}
 const outsourced=editing.outsourced===true||editing.priority==='委外';
 const selected=outsourced?[]:[...new Set([form.equipmentId,...(form.equipmentIds||[])].filter(Boolean))];if(!outsourced&&selected.length!==Number(form.equipmentCount||1))throw Error('所選設備數量與需求台數不符。');
 const units=outsourced?1:Number(form.sampleSpaceUnits);if(!Number.isSafeInteger(units)||units<1||units>100000)throw Error('請填寫每件樣品使用空間 U（1～100000 的整數）。');
 const machines=selected.map(id=>references.equipment.find(e=>e.legacy_id===id)),executor=references.executors.find(e=>e.id===form.ownerId);
 if(!outsourced&&(!machines.length||machines.some(m=>!m))||!executor)throw Error('設備或執行人資料已變動，請重新開啟排程資訊。');
 return {request_id:editing.requestDatabaseId,expected_request_revision:editing.requestRevision,expected_draft_revision:editing.draftRevision,data:{sample_space_units:units,equipment_ids:machines.map(m=>m.id),equipment_revisions:Object.fromEntries(machines.map(m=>[m.id,m.revision])),executor_id:executor.id,executor_revision:executor.revision,start_date:form.time,end_date:form.end,sample_code:String(form.sampleCode||'').trim(),note:form.note||'',preparation_minutes:Number(form.preparationMinutes||0),cleanup_minutes:Number(form.cleanupMinutes||0)}};
}

export function prepareSharedDraftForm({editing,form,equipment,updateEnd=false}){
 if(isCompoundRequest(editing))return {...form,compound:form.compound||editing.compound||compoundFormFromPlan(editing.plan,equipment)};
 const profile=trialProfile(editing.title);if(!profile)throw Error('此試驗尚無可核對的排程規則。');
 const known=explicitHours(editing),hours=profile.fixed_duration?profile.hours:known;
 if(!hours||profile.fixed_duration&&known!==null&&known!==hours)throw Error('請先核對已簽核委託的試驗工時。');
 const result={...form,durationHours:hours,trialProfileId:profile.id};
 if(editing.outsourced===true||editing.priority==='委外')return {...result,sampleSpaceUnits:1,equipmentId:'',equipmentIds:[],equipmentCount:0};
 if(form.time&&(updateEnd||!form.end)){
  const ids=[...new Set([form.equipmentId,...(form.equipmentIds||[])].filter(Boolean))];if(!ids.length)return result;
  const quantity=Number(editing.quantity),units=Number(form.sampleSpaceUnits);if(!Number.isSafeInteger(units)||units<1||units>100000)throw Error('請填寫每件樣品使用空間 U（1～100000 的整數）。');let remaining=quantity;
  const allocations=profile.mode==='serial'?sequentialAllocations(ids,quantity,id=>Math.floor(Number(equipment.find(e=>e.id===id)?.spaceUnits)/units)):ids.map((id,i)=>{const capacity=Math.floor(Number(equipment.find(e=>e.id===id)?.spaceUnits)/units),quantity=Math.min(capacity,remaining-(ids.length-i-1));remaining-=quantity;return {equipment_id:id,quantity,capacity};});
  if(remaining>0&&profile.mode!=='serial')throw Error('設備可用空間 U 不足。');
  result.end=dayBasedTrialExecution(profile,form.time,allocations.map(a=>({...a,daily_hours:Number(equipment.find(e=>e.id===a.equipment_id)?.dailyHours??profile.daily_hours)})),hours).end_date;
 }
 return result;
}
