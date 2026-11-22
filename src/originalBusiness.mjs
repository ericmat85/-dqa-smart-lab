// The existing UI reads a synchronous, in-memory projection of authenticated server data.
// Native business storage is preserved; mutations must use explicit server commands.
import {businessClient,businessErrorMessage} from './businessClient.mjs';
let enabled=false,me=null,native,raw={},cache=new Map(),loading=null,signatureDetails=new Map(),detailLoads=new Map();
const listeners=new Set();
const core=/^dqa[-_](?:request|lms|schedule|lab|equipment|material|borrow|cancelled|trial|report|signature|shared-demo|admin|role|custom-role|builtin-role|case-reset|lifecycle)/;
const preference=/^dqa-(?:ui-preferences-v\d+|theme(?:-|$)|remember(?:ed)?(?:-|$)|management-preferences-v\d+)/;
const collections={electronic:'dqa-request-demo-v2',reviews:'dqa-lms-reviews-v1',schedules:'dqa-schedules-demo-v1',equipment:'dqa-equipment-demo-v1',materials:'dqa-materials-demo-v1',borrows:'dqa-borrow-requests-v1',labOperations:'dqa-lab-operations-v1',labWorkItems:'dqa_lab_demo_requests_v1',labAudit:'dqa_lab_demo_audit_v1',accounts:'dqa-shared-demo-accounts-v1'};
const currentSystem=()=>typeof location==='undefined'?'lms':location.pathname.split('/')[1];
export const originalBusinessEnabled=()=>enabled;
export const businessIdentity=()=>me;
export const originalImportNotice=()=>me?.member.is_admin&&raw.legacy_import&&['reviews','schedules','labAudit'].some(k=>raw.legacy_import[k]?.length)?'已載入舊站資料；委託、排程及操作紀錄以唯讀方式保留原狀態，正式簽核與試驗執行尚未啟用。':'';
export function originalBusinessAccount(system=currentSystem()){
 if(!me)return null;
 const own=(raw.members||[]).find(r=>r.id===me.member.id),dept=(raw.departments||[]).find(r=>r.id===own?.department_id);
 const role=system==='request'?'委託者':me.member.is_admin?'系統管理員':me.member.role_name;
 return {id:me.member.id,name:me.member.display_name,email:me.user.email,role,department:dept?.name||'',status:'啟用中',businessIdentity:true,businessAdmin:me.member.is_admin,businessPermissions:me.member.permissions,lastLogin:'已登入'};
}
function accounts(){const system=currentSystem();return (raw.members||[]).map(m=>{if(m.id===me?.member.id)return originalBusinessAccount(system);const role=(raw.roles||[]).find(r=>r.id===m.role_id);return {id:m.id,name:m.display_name,email:'',role:role?.name||'檢視者',department:(raw.departments||[]).find(d=>d.id===m.department_id)?.name||'',status:m.enabled?'啟用中':'已停用'};});}
const nativeStorage=()=>native||globalThis.localStorage;
const blocked=()=>{throw Object.assign(Error('此操作尚未開放共用後端寫入；原資料未變更。'),{code:'RULE_NOT_APPROVED'});};
const facade={
 getItem(key){if(key===collections.accounts)return JSON.stringify(accounts());if(cache.has(key))return cache.get(key);if(core.test(key)&&!preference.test(key))return key.includes('migration')?'1':null;return nativeStorage()?.getItem(key)??null;},
 setItem(key,value){if(core.test(key)&&!preference.test(key)){if(facade.getItem(key)===String(value))return;blocked();}return nativeStorage()?.setItem(key,value);},
 removeItem(key){if(core.test(key)&&!preference.test(key))blocked();return nativeStorage()?.removeItem(key);},
 clear:blocked,
 key(index){return [...new Set([...cache.keys(),...Array.from({length:nativeStorage()?.length||0},(_,i)=>nativeStorage().key(i)).filter(k=>!core.test(k)||preference.test(k))])][index]??null;},
 get length(){return new Set([...cache.keys(),...Array.from({length:nativeStorage()?.length||0},(_,i)=>nativeStorage().key(i)).filter(k=>!core.test(k)||preference.test(k))]).size;},
};
export function appStorage(){return enabled?facade:globalThis.localStorage;}
function emit(){listeners.forEach(fn=>fn());if(typeof window!=='undefined')for(const name of ['dqa:request-updated','dqa:review-updated','dqa:schedules-updated','dqa:equipment-updated','dqa:roles-updated','dqa:trial-catalog-updated','dqa:business-change'])window.dispatchEvent(new Event(name));}
export function subscribeOriginalBusiness(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function requestRow(r){
 const details=r.form_details||{},owner=(raw.members||[]).find(m=>m.id===r.owner_member_id),dept=(raw.departments||[]).find(d=>d.id===owner?.department_id),trial=(raw.trials||[]).find(t=>t.id===r.trial_id),full=signatureDetails.get(r.id);
 return {...details,id:r.legacy_id,databaseId:r.id,sourceRevision:r.revision,ownerId:r.owner_member_id,requester:owner?.display_name||'',department:dept?.name||'',product:details.product??r.product_code??'',productCode:r.product_code||'',customer:r.customer_name||'',quantity:r.quantity===null?'':String(r.quantity),dueDate:r.requested_date||'',sampleSpaceUnits:r.sample_space_units??'',purpose:Array.isArray(details.purpose)?details.purpose:r.purpose?[r.purpose]:[],testItems:Array.isArray(details.testItems)&&details.testItems.length?details.testItems:trial?[trial.name]:[],specification:r.specification||'',judgementCriteria:r.acceptance||'',draftSignature:full&&full.revision===r.revision?full.draft_signature_data||'':'',status:r.status==='DRAFT'?'草稿':r.status,createdAt:r.created_at?.slice(0,10)||'',updatedAt:r.updated_at?.slice(0,10)||'',supervisorId:r.supervisor_member_id||'',signatureRecords:[],history:[],approvalNote:'',approver:''};
}
function project(){
 cache=new Map();for(const key of Object.values(collections))cache.set(key,'[]');
 const archive=me?.member.is_admin&&raw.legacy_import?.metadata?.mode==='READ_ONLY_ARCHIVE'?raw.legacy_import:{};
 const archived=row=>({...row,readOnly:true,sourceKind:'LEGACY_BROWSER_ARCHIVE',sourceBatchId:archive.metadata?.batch_id});
 const merge=(current,legacy)=>{const ids=new Set(current.map(r=>r.id));return [...current,...(legacy||[]).filter(r=>!ids.has(r.id)).map(archived)];};
 const details=id=>(archive.equipment_details||[]).find(r=>r.id===id)||{};
 const rows=(raw.requests||[]).map(requestRow);cache.set(collections.electronic,JSON.stringify(rows));
 const reviews=rows.map(r=>({...r,source:'electronic-request',title:r.testItems.join('、'),productCode:r.productCode,customerName:r.customer,requestedDate:r.dueDate,applicant:r.requester,submitted:r.createdAt,intentions:r.purpose,judgment:r.judgementCriteria,remarks:r.notes||'',approval:0,approvalRecords:[]}));cache.set(collections.reviews,JSON.stringify(merge(reviews,(archive.reviews||[]).map(r=>({...r,source:'legacy-browser-import'})))));
 const equipment=(raw.equipment||[]).map(r=>({ ...Object.fromEntries(['manufacturer','purchasedAt','lastCalibration','lastMaintenance','maintenancePlan','notes','records','currentRequest','usableVolumeLitres'].filter(k=>Object.hasOwn(details(r.legacy_id),k)).map(k=>[k,details(r.legacy_id)[k]])),id:r.legacy_id,databaseId:r.id,name:r.name,category:r.category,model:r.model||'',serial:r.serial_number||'',serialNumber:r.serial_number||'',location:(raw.sites||[]).find(s=>s.id===r.site_id)?.name||'',owner:(raw.members||[]).find(m=>m.id===r.owner_member_id)?.display_name||details(r.legacy_id).owner||'',capacity:r.space_units,spaceUnits:r.space_units,dailyHours:Number(r.daily_hours),status:({IDLE:'待機中',IN_USE:'使用中',MAINTENANCE:'維護中',CALIBRATION:'校驗中',ON_LOAN:'借用中',PAUSED:'暫停中',RETIRED:'停用'})[r.operational_status]||r.operational_status,spec:r.specification||'',specification:r.specification||'',nextCalibration:r.next_calibration||'',nextMaintenance:r.next_maintenance||''}));cache.set(collections.equipment,JSON.stringify(equipment));
 cache.set(collections.materials,JSON.stringify((raw.materials||[]).map(r=>({id:r.legacy_id,databaseId:r.id,name:r.name,category:r.category,unit:r.unit,quantity:Number(r.total_quantity),available:Number(r.available_quantity),minStock:Number(r.min_stock),status:r.status==='AVAILABLE'?'可用':r.status,location:(raw.sites||[]).find(s=>s.id===r.site_id)?.name||'',owner:(raw.members||[]).find(m=>m.id===r.owner_member_id)?.display_name||''}))));
 const ref=(kind,id)=>(raw[kind]||[]).find(row=>row.id===id)?.legacy_id||'';
 const member=id=>(raw.members||[]).find(row=>row.id===id)?.display_name||'';
 const schedules=(raw.schedules||[]).map(r=>{const request=rows.find(q=>q.databaseId===r.request_id),allocations=(raw.allocations||[]).filter(a=>a.schedule_id===r.id&&!a.released_at);return {id:r.legacy_id,databaseId:r.id,requestId:request?.id||'',test:request?.testItems.join('、')||'',project:request?.productCode||'',quantity:request?.quantity||'',owner:member(r.executor_member_id),executorId:r.executor_member_id,time:r.starts_at||'',end:r.ends_at||'',equipmentId:ref('equipment',allocations[0]?.equipment_id),equipment:equipment.find(e=>e.databaseId===allocations[0]?.equipment_id)?.name||'',equipmentIds:allocations.map(a=>ref('equipment',a.equipment_id)),sampleSpaceUnits:request?.sampleSpaceUnits??'',equipmentAllocations:allocations.map(a=>({equipmentId:ref('equipment',a.equipment_id),sampleQuantity:a.sample_quantity,spaceUnits:a.allocated_units})),preparationMinutes:r.preparation_minutes,cleanupMinutes:r.cleanup_minutes,status:({DRAFT:'未排程',BOOKED:'已排程',RUNNING:'試驗中',COMPLETED:'已完成',CANCELLED:'取消',PAUSED:'暫停中'})[r.status]||r.status};});
 cache.set(collections.schedules,JSON.stringify(merge(schedules,archive.schedules)));
 cache.set(collections.borrows,JSON.stringify((raw.borrows||[]).map(b=>({id:b.legacy_id,databaseId:b.id,actorId:b.borrower_member_id,requester:member(b.borrower_member_id),resourceType:b.equipment_id?'equipment':'material',equipmentId:ref('equipment',b.equipment_id),materialId:ref('materials',b.material_id),quantity:b.quantity,purpose:b.purpose,borrowDate:b.starts_at,returnDate:b.due_at,status:({DRAFT:'草稿',REQUESTED:'待核准',APPROVED:'已核准',REJECTED:'退件',RETURNED:'已歸還',CANCELLED:'取消'})[b.status]||b.status}))));
 const operations=(raw.operations||[]).map(o=>({id:o.id,requestId:ref('requests',o.request_id),actorId:o.actor_member_id,actor:member(o.actor_member_id),action:o.action,reason:o.reason,status:o.status,createdAt:o.created_at}));
 cache.set(collections.labOperations,JSON.stringify(operations));cache.set(collections.labAudit,JSON.stringify(merge(operations,archive.labAudit)));

 const trials=(raw.trials||[]).filter(t=>t.enabled).map(t=>({id:/^TRIAL-(?:\d{3}|[a-f0-9]{32})$/.test(t.legacy_id)?t.legacy_id:'TRIAL-'+t.id.replaceAll('-',''),name:t.name,aliases:t.aliases||[],profileId:t.profile_code||'UNVERIFIED',specification:t.specification,acceptance:t.acceptance,equipment:t.equipment_reference,version:t.specification_version,durationHours:Number(t.duration_hours),builtin:t.source_kind==='SYNTHETIC',synthetic:t.source_kind==='SYNTHETIC'}));cache.set('dqa-trial-catalog-v1',JSON.stringify({version:1,revision:0,rows:trials}));cache.set('dqa-cancelled-requests-v1','{}');
 cache.set('dqa-admin-operations-v1',JSON.stringify({version:1,revision:0,quality:[],qualifications:[],events:[]}));
}
export function configureOriginalBusiness({identity=null,snapshot={},storage=globalThis.localStorage}={}){enabled=true;me=identity;native=storage;raw=structuredClone(snapshot);signatureDetails.clear();project();}
export async function refreshOriginalBusiness(){
 if(!enabled||!me)return;
 if(loading?.identity===me)return loading.promise;
 const identity=me,task={identity};task.promise=businessClient.request('/snapshot').then(packet=>{if(me!==identity)return;raw=packet.data;project();emit();}).finally(()=>{if(loading===task)loading=null;});loading=task;return task.promise;
}
export async function initializeOriginalBusiness(){configureOriginalBusiness();try{me=await businessClient.request('/me');await refreshOriginalBusiness();}catch(error){if(error.status!==401)throw error;clearOriginalIdentity();}}
export async function loginOriginalBusiness(email,password){await businessClient.request('/login',{method:'POST',body:{email,password}});me=await businessClient.request('/me');await refreshOriginalBusiness();emit();return originalBusinessAccount();}
export function clearOriginalIdentity(){me=null;raw={};signatureDetails.clear();detailLoads.clear();project();emit();}
export async function logoutOriginalBusiness(){const result=businessClient.request('/logout',{method:'POST',body:{}});clearOriginalIdentity();return result;}
export function startOriginalBusinessSync(){if(!enabled)return()=>{};let stopped=false;const update=()=>{if(stopped||!me||globalThis.document?.visibilityState==='hidden')return;refreshOriginalBusiness().catch(error=>{if(error.status===401)clearOriginalIdentity();});};const timer=setInterval(update,15000);globalThis.addEventListener?.('focus',update);return()=>{stopped=true;clearInterval(timer);globalThis.removeEventListener?.('focus',update);};}

export function hasOriginalDraftDetails(id){const row=(raw.requests||[]).find(r=>r.legacy_id===id);return !!row&&signatureDetails.get(row.id)?.revision===row.revision;}
async function fetchOriginalDraft(id){const identity=me;const row=(raw.requests||[]).find(r=>r.legacy_id===id);if(!row)throw Error('委託草稿不存在或沒有權限。');const result=await businessClient.request('/data/requests/'+row.id);if(!result.data.length)throw Error('委託草稿不存在或沒有權限。');if(me!==identity)throw Object.assign(Error('SESSION_REVOKED'),{code:'SESSION_REVOKED'});const full=result.data[0];signatureDetails.set(full.id,full);raw.requests=raw.requests.map(r=>r.id===full.id?full:r);project();emit();return requestRow(full);}
export function loadOriginalDraft(id){if(!detailLoads.has(id))detailLoads.set(id,fetchOriginalDraft(id).finally(()=>detailLoads.delete(id)));return detailLoads.get(id);}
export async function saveOriginalDraft({id,form,signature='',existingId=null,expectedRevision}){
 const source=existingId?(raw.requests||[]).find(r=>r.legacy_id===existingId):null;if(existingId&&!source)throw Error('委託草稿不存在或沒有權限。');
 const trial=(raw.trials||[]).find(t=>[t.name,...(t.aliases||[])].includes(form.testItems?.[0]));
 const details=Object.fromEntries(['product','productType','project','customerPartNo','priority','testItems','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','judgementRequired','notes'].map(k=>[k,form[k]??(['testItems','purpose','sampleSource'].includes(k)?[]:'')]));
 const data={trial_id:trial?.id||null,product_code:form.productCode||form.product||'',customer_name:form.customer||'',purpose:(form.purpose||[]).join('、'),quantity:String(form.quantity??'').trim()===''?null:Number(form.quantity),requested_date:form.dueDate||null,sample_space_units:String(form.sampleSpaceUnits??'').trim()===''?null:Number(form.sampleSpaceUnits),specification:form.specification||'',acceptance:form.judgementCriteria||'',form_details:details,draft_signature_data:signature};
 const identity=me;
 const result=await businessClient.request('/data/requests'+(source?'/'+source.id:''),{method:source?'PATCH':'POST',body:source?{expected_revision:expectedRevision??source.revision,data}:{id,data}});
 if(me!==identity)throw Object.assign(Error('SESSION_REVOKED'),{code:'SESSION_REVOKED'});signatureDetails.set(result.data.id,result.data);raw.requests=[...(raw.requests||[]).filter(r=>r.id!==result.data.id),result.data];project();emit();return requestRow(result.data);
}
export const originalBusinessError=businessErrorMessage;
