import {assetBytes} from './assetBytes.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {DEMO_MATERIALS} from './demoMaterials.mjs';
import {resetSystemCases} from './resetCases.mjs';
import {syncScheduleLifecycle} from './scheduleLifecycle.mjs';
import {reviewRequesterDecision} from './requestWorkflow.mjs';
import {appendSignature} from './signatureHistory.mjs';
import {reviewElectronicRequest,reviewRevision,readElectronicRequestsForLms} from './electronicReview.mjs';
import {validateSchedule} from './scheduleEquipment.mjs';
import {mergeLabSchedules} from './labScheduleBridge.mjs';
import {confirmLabReceipt,completeLabTrial} from './labReceipts.mjs';
import {getRequestDate} from './requestDate.mjs';
import {createReportTemplate,excelModule} from './reportWorkbook.mjs';
import {submitReportWorkflow,approveReportWorkflow,confirmReportViewed,returnReportWorkflow,returnViewedReport} from './reportWorkflow.mjs';
import {reportMetadata} from './reportRules.mjs';
export const NINE_SEED_KEY='dqa-nine-stage-seed-v1';
export const NINE_STAGES=['待簽核','待審查','待排程','待確認','試驗中','已完成','待審核','待查閱','已結案'];
export const SEED_ACTORS={a:'SEED-REQUESTER-A',b:'SEED-REQUESTER-B',manager:'SEED-MANAGER',level1:'SEED-LEVEL1',level2:'SEED-LEVEL2',level3:'SEED-LEVEL3',labA:'SEED-LAB-A',labB:'SEED-LAB-B'};
const roleRows=[['a','模擬委託者A','委託者'],['b','模擬委託者B','委託者'],['manager','模擬委託者主管','委託者主管'],['level1','模擬一階主管','一階主管'],['level2','模擬二階主管','二階主管'],['level3','模擬三階主管','三階主管'],['labA','模擬執行人A','實驗室工程師'],['labB','模擬執行人B','實驗室副工程師']];
export const SEED_ACCOUNTS=roleRows.map(([key,name,role])=>({id:SEED_ACTORS[key],name,role,email:`${key.toLowerCase()}@demo.example.invalid`,department:'虛構測試部門',status:'啟用中',lastLogin:'尚未登入',demoSeed:true,...(['a','b'].includes(key)?{supervisorId:SEED_ACTORS.manager}:{})}));
export const SEED_KEYS=['dqa-request-demo-v2','dqa-lms-reviews-v1','dqa-schedules-demo-v1','dqa_lab_demo_requests_v1','dqa_lab_demo_audit_v1','dqa-lab-operations-v1','dqa-borrow-requests-v1','dqa-cancelled-requests-v1','dqa-equipment-demo-v1','dqa-materials-demo-v1','dqa-shared-demo-accounts-v1','dqa-completed-flow-provisioned-v1','dqa-custom-roles-v1','dqa-builtin-role-overrides-v1'];
const read=(s,key,fallback=[])=>{const value=JSON.parse(s.getItem(key)||JSON.stringify(fallback));if(!Array.isArray(value))throw Error(`Demo資料格式錯誤：${key}`);return value;};
const write=(s,key,rows)=>s.setItem(key,JSON.stringify(rows));
const source=s=>read(s,'dqa-request-demo-v2');
const update=(s,row)=>write(s,'dqa-request-demo-v2',source(s).map(r=>r.id===row.id?row:r));
const iso=ms=>new Date(ms).toISOString();
export function nineStageOf(request,lab=[]){
 if(request.status==='待主管簽核')return 1;if(request.status==='已核准')return 2;
 if(request.status==='已結案')return 9;if(request.status==='待查閱')return 8;if(request.status==='待審核')return 7;
 if(request.status==='已完成')return 6;if(request.status==='執行中')return 5;
 if(lab.some(r=>r.id===request.id&&['待確認','已排程'].includes(r.status)))return 4;
 if(request.status==='待排程'||request.status==='已排程')return 3;return null;
}
export function nineStageCounts(storage){const lab=read(storage,'dqa_lab_demo_requests_v1');return NINE_STAGES.map((label,i)=>({stage:i+1,label,count:source(storage).filter(r=>nineStageOf(r,lab)===i+1).length}));}
export async function buildNineStageSeed({signature,now=Date.now(),fontBytes,onProgress=()=>{}},existing){
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('缺少明確標示為Demo的模擬圖片簽名。');
 const data=new Map(SEED_KEYS.map(key=>[key,existing.getItem(key)]));
 const storage={getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key)};
 // Perform cleanup and resource release in isolation before replacing any browser data.
 await resetSystemCases(storage,null);
 const currentAccounts=read(storage,'dqa-shared-demo-accounts-v1',INITIAL_ACCOUNTS);
 for(const account of SEED_ACCOUNTS){const old=currentAccounts.find(r=>r.id===account.id);if(old&&!old.demoSeed)throw Error('Demo帳號編號與既有帳號衝突，未清除資料。');}
 const accounts=[...currentAccounts.filter(r=>!SEED_ACCOUNTS.some(a=>a.id===r.id)),...SEED_ACCOUNTS];write(storage,'dqa-shared-demo-accounts-v1',accounts);
 const fixtures=Array.from({length:6},(_,i)=>({id:`SEED-EQ-${i+1}`,name:`模擬環境試驗箱 ${i+1}`,category:'溫度試驗',model:`FICTIONAL-${i+1}`,location:`虛構實驗室／${i+1}`,owner:'模擬設備負責人',capacity:10,spaceUnits:10,usableVolumeLitres:120,dailyHours:24,status:'待機中',currentRequest:'',specification:'DEMO -40°C~150°C，僅供假資料流程展示',nextCalibration:getRequestDate(new Date(now+365*86400000)),records:[],demoSeed:true}));
 const equipment=read(storage,'dqa-equipment-demo-v1',DEMO_EQUIPMENT);for(const machine of fixtures){const old=equipment.find(r=>r.id===machine.id);if(old&&!old.demoSeed)throw Error('Demo設備編號衝突，未清除資料。');}
 write(storage,'dqa-equipment-demo-v1',[...equipment.filter(r=>!fixtures.some(m=>m.id===r.id)),...fixtures]);
 if(!storage.getItem('dqa-materials-demo-v1'))write(storage,'dqa-materials-demo-v1',DEMO_MATERIALS);
 if(!fontBytes){fontBytes=await assetBytes(`${import.meta.env?.BASE_URL||'/'}fonts/NotoSansCJKtc-Regular.otf`,{message:'Demo PDF字型載入失敗，未清除原案件。'});}
 const records=new Map(),repository={get:async id=>records.get(id)||null,list:async()=>[...records.values()].map(reportMetadata),save:async(report,revision)=>{if((records.get(report.requestId)?.revision??null)!==revision)throw Error('Demo報告版本衝突');records.set(report.requestId,report);}};
 const account=id=>accounts.find(r=>r.id===id);
 for(let index=1;index<=18;index++){
  const stage=Math.ceil(index/2),odd=index%2===1,group=odd?'A':'B',id=`DEMO-${String(index).padStart(3,'0')}`,sampleCode=`SMP-${id}`;
  const requester=account(odd?SEED_ACTORS.a:SEED_ACTORS.b),operator=account(odd?SEED_ACTORS.labA:SEED_ACTORS.labB),manager=account(SEED_ACTORS.manager),machine=fixtures[(stage>=6?4:stage===3||stage===4?2:0)+(odd?0:1)];
  const created=now-(60-index)*86400000,steps=[];const step=(label,at)=>steps.push({id:`${id}-H${steps.length+1}`,label,at:iso(at)});
  const scenario=odd?'正常轉換流程':({1:'主管發現需求不清，示範退回補正',2:'審查發現規範不足，示範退回',3:'排程時示範設備／人力衝突檢查',4:'接收前示範取消原安排並送主管核准',5:'進行中示範中斷申請及權限規則',6:'提交報告時示範不合格檔案檢查',7:'示範三階主管退回報告',8:'示範委託者主管查閱退回',9:'曾退回補正後重新簽核封存'})[stage];
  let request={id,productCode:`FAKE-${group}-${index}`,product:`FAKE-${group}-${index}`,productType:'車用電子',project:`Demo ${group}組／${scenario}`,customer:`虛構客戶${group}`,customerPartNo:`FAKE-PART-${index}`,quantity:'1',productVersion:'Demo V1',pcbaVersion:'Demo A',softwareVersion:'Demo 1',manufactureDate:getRequestDate(new Date(created-86400000)),priority:odd?'一般':'急件',sampleDescription:`假樣品 ${sampleCode}`,purpose:['新產品'],sampleSource:['社內'],testItems:['高溫儲存試驗'],specification:'DEMO 模擬高溫儲存，非正式試驗規範',judgementCriteria:'DEMO 外觀及功能確認，非正式產品判定',judgementRequired:'不作判定',notes:`全為假資料／模擬圖片簽名，不具正式效力。${scenario}。樣品 ${sampleCode}；預定設備 ${machine.name}；負責人 ${operator.name}。`,requester:requester.name,department:requester.department,ownerId:requester.id,ownerUser:requester.name,supervisorId:manager.id,supervisorName:manager.name,status:'待主管簽核',createdAt:iso(created),updatedAt:iso(created+60000),dueDate:getRequestDate(new Date(now+10*86400000)),requesterSignature:signature,requesterSignatureAt:iso(created+60000),signatureRecords:[],demoSeed:{version:1,group,initialStage:stage,sampleCode,equipmentId:machine.id,equipment:machine.name,operatorId:operator.id,operator:operator.name,scenario,simulated:true}};
  request.signatureRecords=appendSignature(request,{stage:'委託送出',actor:requester.name,actorId:requester.id,signature,decision:'送出',comment:'Demo模擬送出',at:iso(created+60000)});step('委託者建立並送出（Demo）',created+60000);
  write(storage,'dqa-request-demo-v2',[...source(storage),request]);
  if(stage>=2){request=reviewRequesterDecision(request,manager,{status:'已核准',signature,comment:'Demo模擬主管核准',now:iso(created+120000)});update(storage,request);step('委託者主管核准',created+120000);}
  if(stage>=3){for(const [actorId,offset]of [[SEED_ACTORS.level1,180000],[SEED_ACTORS.level2,240000]]){request=reviewElectronicRequest({id,accountId:actorId,expectedRevision:reviewRevision(request),signature,comment:'Demo需求審查核准',now:created+offset},storage);step(`${account(actorId).name}需求審查核准`,created+offset);}
   const editing={id:`SCH-${id}`,requestId:id,title:request.testItems[0],quantity:1,productCode:request.productCode,department:request.department,requester:request.requester,priority:request.priority,status:'未排程',equipmentId:machine.id,eq:machine.name,ownerId:operator.id,owner:operator.name,sampleCode,time:'',end:''};
   if(stage===3)write(storage,'dqa-schedules-demo-v1',[...read(storage,'dqa-schedules-demo-v1'),editing]);
   else{
    const start=stage===4?now+3*86400000:stage===5?now-6*3600000:now-(stage*2+(odd?0:1))*86400000;
    const finish=stage===4?start+4*3600000:stage===5?now+18*3600000:start+2*3600000;
    const proposal=validateSchedule({editing,form:{equipmentId:machine.id,ownerId:operator.id,sampleCode,sampleVolumeLitres:1,time:getRequestDate(new Date(start)),end:getRequestDate(new Date(finish)),note:request.notes},equipment:read(storage,'dqa-equipment-demo-v1'),accounts,rows:read(storage,'dqa-schedules-demo-v1')});
    const schedule={...proposal,time:iso(start),end:iso(stage>=6?finish+3600000:finish),demoSeed:true};write(storage,'dqa-schedules-demo-v1',[...read(storage,'dqa-schedules-demo-v1'),schedule]);write(storage,'dqa_lab_demo_requests_v1',mergeLabSchedules(read(storage,'dqa_lab_demo_requests_v1'),[schedule],start-60000));step('安排樣品、設備、人員與日程',created+300000);
    if(stage>=5){confirmLabReceipt({requestId:id,actorId:operator.id,now:start-60000},storage);syncScheduleLifecycle(storage,start+1000);write(storage,'dqa_lab_demo_requests_v1',mergeLabSchedules(read(storage,'dqa_lab_demo_requests_v1'),read(storage,'dqa-schedules-demo-v1'),start+1000));step('實驗室接收並開始試驗',start+1000);if(stage>=6){completeLabTrial({requestId:id,actorId:operator.id,signature,now:finish},storage);step('實驗室完成試驗',finish);}}
   }
  }
  request=source(storage).find(r=>r.id===id);update(storage,{...request,demoFlow:{simulated:true,steps,provisionedAt:iso(now)}});
  if(stage>=7){
   const upload=async()=>{let bytes=await createReportTemplate(source(storage).find(r=>r.id===id),true);if(!odd){const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];sheet.getCell('C12').value='DEMO 異常';sheet.getCell('D12').value='DEMO 異常結果已記錄';sheet.getCell('F12').value='DEMO NG（非正式判定）';sheet.getCell('B16').value='DEMO：異常結果供報告退回／補正流程展示。';sheet.getCell('B17').value=`DEMO 異常場景：${scenario}`;bytes=new Uint8Array(await book.xlsx.writeBuffer());}return new File([bytes],`${id}-模擬報告-DEMO.xlsx`);};
   let meta=await submitReportWorkflow({requestId:id,file:await upload(),signature,actorId:operator.id,minimumMs:0},storage,repository);
   if(!odd){meta=await returnReportWorkflow({requestId:id,actorId:SEED_ACTORS.level2,comment:'DEMO補充異常結果說明後重新提交',expectedRevision:meta.revision},storage,repository);meta=await submitReportWorkflow({requestId:id,file:await upload(),signature,actorId:operator.id,minimumMs:0},storage,repository);}
   if(stage>=8||(!odd&&stage===7))meta=await approveReportWorkflow({requestId:id,actorId:SEED_ACTORS.level2,signature,expectedRevision:meta.revision},storage,repository);
   if(stage>=8)meta=await approveReportWorkflow({requestId:id,actorId:SEED_ACTORS.level3,signature,expectedRevision:meta.revision},storage,repository);
   if(stage===9){if(!odd){meta=await returnViewedReport({requestId:id,actorId:manager.id,comment:'DEMO查閱發現補件需求',expectedRevision:meta.revision},storage,repository);meta=await submitReportWorkflow({requestId:id,file:await upload(),signature,actorId:operator.id,minimumMs:0},storage,repository);for(const actorId of [SEED_ACTORS.level2,SEED_ACTORS.level3])meta=await approveReportWorkflow({requestId:id,actorId,signature,expectedRevision:meta.revision},storage,repository);}await confirmReportViewed({requestId:id,actorId:manager.id,expectedRevision:meta.revision,fontBytes},storage,repository);}
  }
  onProgress(index,18,`${id}／${NINE_STAGES[stage-1]}／${group}組`);
 }
 write(storage,'dqa_lab_demo_requests_v1',mergeLabSchedules(read(storage,'dqa_lab_demo_requests_v1'),read(storage,'dqa-schedules-demo-v1'),now));
 syncScheduleLifecycle(storage,now);
 write(storage,'dqa-lms-reviews-v1',readElectronicRequestsForLms(storage));
 write(storage,'dqa-completed-flow-provisioned-v1',{created:false,seed:'nine-stage',provisionedAt:iso(now)});
 const counts=nineStageCounts(storage);if(source(storage).length!==18||counts.some(r=>r.count!==2))throw Error('九階資料校驗失敗，未替換任何既有案件。');
 return {data,storage,reports:[...records.values()],counts,createdAt:iso(now)};
}
