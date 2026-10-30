import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {INITIAL_ELECTRONIC_REQUESTS} from './demoElectronicRequests.mjs';
import {ALL_DEMO_REQUESTS} from './demoLmsRequests.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {canApproveRequestManager,canReview} from './demoPermissions.mjs';
import {appendSignature} from './signatureHistory.mjs';
import {reviewElectronicRequest,reviewRevision,readElectronicRequestsForLms} from './electronicReview.mjs';
import {validateSchedule,enabledExecutors} from './scheduleEquipment.mjs';
import {mergeLabSchedules} from './labScheduleBridge.mjs';
import {confirmLabReceipt,completeLabTrial} from './labReceipts.mjs';
import {syncScheduleLifecycle,commitLifecycleTransaction,recoverLifecycleTransaction} from './scheduleLifecycle.mjs';
import {getRequestDate} from './requestDate.mjs';
export const DEMO_FLOW_MARKER='dqa-completed-flow-provisioned-v1';
const read=(storage,key,fallback=[])=>{const rows=JSON.parse(storage.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(rows))throw Error('示範流程無法讀取現有資料，尚未建立案件。');return rows;};
export function createCompletedDemoFlow({signature,viewerId,now=Date.now(),newExample=false},storage=window.localStorage){
 recoverLifecycleTransaction(storage);
 const marker=storage.getItem(DEMO_FLOW_MARKER);if(marker&&!newExample)return {...JSON.parse(marker),created:false};
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('缺少 Demo 測試簽名。');
 const accounts=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS),viewer=accounts.find(row=>row.id===viewerId);
 const requester=accounts.find(row=>row.role==='委託者'&&row.status==='啟用中'&&(!viewer||viewer.role==='委託者'?(!viewer||row.id===viewer.id):viewer.role==='委託者主管'?row.supervisorId===viewer.id:true)&&accounts.some(actor=>actor.id===row.supervisorId&&actor.role==='委託者主管'&&actor.status==='啟用中'));
 if(!requester)throw Error('需要一組啟用中的委託者與指定主管，才能建立完整流程範例。');
 const supervisor=accounts.find(row=>row.id===requester.supervisorId),participants=[requester.id,supervisor.id];
 const level1=accounts.find(row=>canReview(row,{status:'待審查',approval:0,participantIds:participants}));
 const level2=accounts.find(row=>canReview(row,{status:'待審查',approval:1,participantIds:participants,approvals:level1?[{actorId:level1.id}]:[]}));
 if(!level1||!level2)throw Error('需要啟用中的第一階與第二階審查帳號。');
 const requests=read(storage,'dqa-request-demo-v2',INITIAL_ELECTRONIC_REQUESTS),schedules=read(storage,'dqa-schedules-demo-v1',DEMO_SCHEDULES),equipment=read(storage,'dqa-equipment-demo-v1',DEMO_EQUIPMENT);
 const id=requests.some(row=>row.id==='REQ-2026-FLOW-001')?`REQ-2026-FLOW-${crypto.randomUUID().slice(0,8)}`:'REQ-2026-FLOW-001';
 const scheduleId=`SCH-FLOW-${crypto.randomUUID().slice(0,8)}`;
 const editing={id:scheduleId,requestId:id,title:'高溫儲存試驗',productCode:'DEMO-E2E-001',productType:'車用電子',quantity:'1',department:requester.department,requester:requester.name,status:'未排程',priority:'一般',customer:'DEMO 內部測試',sampleSource:'社內'};
 let proposal,machine,operator,start,finish;
 outer:for(let offset=0;offset<15;offset++){
  const day=getRequestDate(new Date(now-offset*86400000)),startAt=Date.parse(`${day}T00:00:00+08:00`);if(now-startAt<60000)continue;
  for(const candidate of equipment.filter(row=>row.status==='待機中'))for(const executor of enabledExecutors(accounts)){
   try{const next=validateSchedule({editing,form:{equipmentId:candidate.id,ownerId:executor.id,sampleCode:'SAMPLE-DEMO-FLOW-001',time:day,end:day,note:'DEMO 完整流程測試；非正式試驗結果'},equipment,accounts,rows:schedules});proposal=next;machine=candidate;operator=executor;start=startAt;finish=Math.min(now,startAt+3600000);break outer;}catch{/* Find a compatible free resource and period without changing existing cases. */}
  }
 }
 if(!proposal)throw Error('找不到適用的待機設備與可用執行人，尚未建立範例。');
 const data=new Map([['dqa-shared-demo-accounts-v1',JSON.stringify(accounts)],['dqa-request-demo-v2','[]'],['dqa-schedules-demo-v1','[]'],['dqa-equipment-demo-v1',JSON.stringify([machine])],['dqa_lab_demo_requests_v1','[]'],['dqa_lab_demo_audit_v1','[]'],['dqa-lab-operations-v1','[]']]);
 const memory={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const steps=[];const step=(label,at)=>steps.push({id:crypto.randomUUID(),label,at:new Date(at).toISOString()});
 const created=start-1800000,submitted=start-1500000,supervised=start-1200000;
 let request={id,productCode:'DEMO-E2E-001',product:'DEMO-E2E-001',productType:'車用電子',project:'DEMO 委託到試驗完成流程',customer:'DEMO 內部測試',customerPartNo:'DEMO-PART-001',quantity:'1',productVersion:'V1.0',pcbaVersion:'A1',softwareVersion:'V1.0',manufactureDate:getRequestDate(new Date(start-2*86400000)),priority:'一般',sampleDescription:'DEMO 流程測試樣品',judgementCriteria:'僅驗證系統流程，不作正式產品判定',purpose:['新產品'],sampleSource:['社內'],testItems:['高溫儲存試驗'],specification:'DEMO：高溫儲存流程驗證，僅供系統展示',judgementRequired:'不作判定',notes:'系統模擬流程，簽名非本人簽署，不代表正式試驗結果。',requester:requester.name,department:requester.department,ownerId:requester.id,ownerUser:requester.name,supervisorId:supervisor.id,supervisorName:supervisor.name,status:'草稿',createdAt:getRequestDate(new Date(created)),dueDate:getRequestDate(new Date(finish)),signatureRecords:[]};
 memory.setItem('dqa-request-demo-v2',JSON.stringify([request]));step('委託者建立草稿',created);
 request={...request,status:'待主管簽核',requestDate:getRequestDate(new Date(submitted)),requesterSignature:signature,requesterSignatureAt:new Date(submitted).toISOString(),signatureRecords:appendSignature(request,{stage:'委託送出',actor:requester.name,actorId:requester.id,signature,decision:'送出',comment:'DEMO 系統模擬',at:new Date(submitted).toISOString()})};step('委託者送出主管簽核',submitted);
 if(!canApproveRequestManager(supervisor,request))throw Error('指定主管不符合簽核權限。');
 request={...request,status:'已核准',approver:supervisor.name,supervisorSignature:signature,supervisorSignatureAt:new Date(supervised).toISOString(),signatureRecords:appendSignature(request,{stage:'直屬主管簽核',actor:supervisor.name,actorId:supervisor.id,signature,decision:'核准',comment:'DEMO 系統模擬',at:new Date(supervised).toISOString()})};memory.setItem('dqa-request-demo-v2',JSON.stringify([request]));step('委託者主管核准',supervised);
 request=reviewElectronicRequest({id,accountId:level1.id,expectedRevision:reviewRevision(request),signature,comment:'DEMO 第一階審查核准',now:start-900000},memory);step('LMS 第一階審查核准',start-900000);
 request=reviewElectronicRequest({id,accountId:level2.id,expectedRevision:reviewRevision(request),signature,comment:'DEMO 第二階審查核准',now:start-600000},memory);step('LMS 第二階審查核准',start-600000);
 memory.setItem('dqa-schedules-demo-v1',JSON.stringify([proposal]));memory.setItem('dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules([],[proposal],start-300000)));step('安排設備、執行人及試驗日程',start-300000);
 confirmLabReceipt({requestId:id,actorId:operator.id,now:start-60000},memory);syncScheduleLifecycle(memory,start-60000);step('實驗室確認接收，顯示已排程',start-60000);
 syncScheduleLifecycle(memory,start+1000);memory.setItem('dqa_lab_demo_requests_v1',JSON.stringify(mergeLabSchedules(read(memory,'dqa_lab_demo_requests_v1'),read(memory,'dqa-schedules-demo-v1'),start+1000)));step('到達開始時間，試驗中',start+1000);
 completeLabTrial({requestId:id,actorId:operator.id,signature,now:finish},memory);step('試驗完成，結果可供委託者主管查閱',finish);
 request=read(memory,'dqa-request-demo-v2')[0];request.demoFlow={steps,simulated:true,provisionedAt:new Date(now).toISOString()};
 const result={id,productCode:request.productCode,supervisorId:supervisor.id,supervisor:supervisor.name,provisionedAt:new Date(now).toISOString(),created:true};
 const completedMachine=read(memory,'dqa-equipment-demo-v1')[0];
 commitLifecycleTransaction(storage,{requests:JSON.stringify([request,...requests]),reviews:JSON.stringify([...readElectronicRequestsForLms(memory),...read(storage,'dqa-lms-reviews-v1',ALL_DEMO_REQUESTS)]),schedules:JSON.stringify([...read(memory,'dqa-schedules-demo-v1'),...schedules]),equipment:JSON.stringify(equipment.map(row=>row.id===machine.id?completedMachine:row)),labRequests:JSON.stringify([...read(memory,'dqa_lab_demo_requests_v1'),...read(storage,'dqa_lab_demo_requests_v1')]),labAudit:JSON.stringify([...read(memory,'dqa_lab_demo_audit_v1'),...read(storage,'dqa_lab_demo_audit_v1')]),demoFlowMarker:JSON.stringify(result)});
 return result;
}
