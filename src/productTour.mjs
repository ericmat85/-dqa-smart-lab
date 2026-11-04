import {SEED_ACCOUNTS,SEED_ACTORS,NINE_STAGES} from './nineStageSeed.mjs';
import {appendSignature} from './signatureHistory.mjs';
import {reviewRequesterDecision} from './requestWorkflow.mjs';
import {reviewElectronicRequest,reviewRevision} from './electronicReview.mjs';
import {validateSchedule} from './scheduleEquipment.mjs';
import {mergeLabSchedules} from './labScheduleBridge.mjs';
import {confirmLabReceipt,completeLabTrial} from './labReceipts.mjs';
import {syncScheduleLifecycle} from './scheduleLifecycle.mjs';
import {createReportTemplate} from './reportWorkbook.mjs';
import {submitReportWorkflow,approveReportWorkflow,confirmReportViewed} from './reportWorkflow.mjs';
import {reportMetadata} from './reportRules.mjs';
import {getRequestDate} from './requestDate.mjs';
export const TOUR_STEPS=NINE_STAGES.map((title,index)=>({title,...[
 {role:'委託者主管',system:'電子委託系統',focus:'需求簽核',text:'先確認需求、樣品與規範。指定主管核准後，案件才會進入實驗室審查；申請人不能自己簽核。',action:'示範主管核准'},
 {role:'一階、二階主管',system:'實驗室管理系統',focus:'試驗需求審查',text:'兩個不同角色依序審查試驗可行性、規範與資源需求。需要補正時可退回，簽核歷程會保留。',action:'示範兩階審查'},
 {role:'排程管理人員',system:'實驗室管理系統',focus:'設備與人力安排',text:'安排設備、執行人、樣品與時段，沿用既有容量及資源衝突檢查，讓每筆需求都有明確安排。',action:'示範安排排程'},
 {role:'實驗室工程師',system:'COLONG 實驗室',focus:'接收與開始',text:'工程師核對樣品及排程後確認接收。本導覽會模擬時間到達試驗開始，無需等待實際試驗時長。',action:'示範接收並開始'},
 {role:'實驗室工程師',system:'COLONG 實驗室',focus:'執行進度',text:'試驗中的案件連結設備、人員與日程。這裡模擬試驗完成，實際中斷、取消仍須走原有申請及核准規則。',action:'示範完成試驗'},
 {role:'實驗室工程師',system:'COLONG 實驗室',focus:'報告檢查與提交',text:'完成試驗後提交 Excel 報告。系統檢查委託編號、結果與簽名位置，通過後才送主管審核。',action:'示範檢查並提交報告'},
 {role:'二階、三階主管',system:'實驗室管理系統',focus:'報告審核',text:'二階及三階主管依序核准報告，沿用禁止自審與重複跨階簽核檢查。簽名會轉印到示範報告。',action:'示範兩階報告核准'},
 {role:'委託者主管',system:'電子委託系統',focus:'查閱與確認',text:'指定主管查閱已核准的報告。確認前不產生結案 PDF；若需補正，可退回並重新走報告審核流程。',action:'示範確認查閱並結案'},
 {role:'委託者與授權人員',system:'資料庫',focus:'結案與文件追溯',text:'九階流程已完成！委託單與含簽名報告已合併為示範 PDF，可預覽或下載。全部使用虛構資料與模擬簽名。',action:'完成導覽'},
][index]}));
// Private in-memory storage/repository: never touches business localStorage, IndexedDB or login sessions.
export function createProductTour({signature,now=Date.now(),fontBytes}={}){
 const data=new Map(),reports=new Map(),views=[];
 const storage={getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key)};
 const read=key=>JSON.parse(storage.getItem(key)||'[]'),write=(key,value)=>storage.setItem(key,JSON.stringify(value));
 const actors=SEED_ACTORS,account=id=>SEED_ACCOUNTS.find(a=>a.id===id),id='TOUR-DEMO-001';
 const machine={id:'TOUR-EQ-001',name:'導覽環境試驗箱',category:'溫度試驗',model:'DEMO-120',location:'虛構實驗室 A',capacity:10,usableVolumeLitres:120,dailyHours:24,status:'待機中',records:[]};
 const request={id,productCode:'TOUR-SAMPLE-A',product:'TOUR-SAMPLE-A',productType:'車用電子',project:'九階產品導覽',customer:'虛構導覽客戶',customerPartNo:'DEMO-PART-A',quantity:'1',purpose:['新產品'],sampleSource:['社內'],testItems:['高溫儲存試驗'],specification:'DEMO 模擬高溫儲存，非正式規範',judgementCriteria:'DEMO 外觀與功能確認',judgementRequired:'不作判定',notes:'產品導覽假資料；模擬簽名，無正式效力。',requester:account(actors.a).name,department:'虛構測試部門',ownerId:actors.a,ownerUser:account(actors.a).name,supervisorId:actors.manager,supervisorName:account(actors.manager).name,status:'待主管簽核',createdAt:new Date(now-3600000).toISOString(),dueDate:getRequestDate(new Date(now+7*86400000)),requesterSignature:signature,signatureRecords:[]};
 request.signatureRecords=appendSignature(request,{stage:'委託送出',actor:request.requester,actorId:actors.a,signature,decision:'送出',comment:'DEMO 導覽模擬簽名',at:new Date(now-60000).toISOString()});
 write('dqa-shared-demo-accounts-v1',SEED_ACCOUNTS);write('dqa-request-demo-v2',[request]);write('dqa-equipment-demo-v1',[machine]);
 const repository={get:async key=>reports.get(key)||null,list:async()=>[...reports.values()].map(reportMetadata),save:async(report,revision)=>{if((reports.get(report.requestId)?.revision??null)!==revision)throw Error('導覽報告版本已變更');reports.set(report.requestId,report);}};
 let stage=1,busy=false;const start=now+86400000,end=start+3600000;
 const source=()=>read('dqa-request-demo-v2')[0];
 const capture=()=>{const r=source(),schedule=read('dqa-schedules-demo-v1')[0];return {stage,request:structuredClone(r),schedule:structuredClone(schedule||null),lab:structuredClone(read('dqa_lab_demo_requests_v1')[0]||null),report:reportMetadata(reports.get(id)),signatures:r.signatureRecords||[]};};
 views.push(capture());
 return {storage,repository,get stage(){return stage;},get views(){return views;},get pdf(){return reports.get(id)?.pdf||null;},async next(){
  if(busy)throw Error('導覽正在執行，請稍候');if(stage>=9)return views[8];busy=true;
  // Roll back only private tour data on errors, so Retry cannot duplicate a signature or submission.
  const before=new Map(data),beforeReports=new Map(reports);
  try{
   if(stage===1)write('dqa-request-demo-v2',[reviewRequesterDecision(source(),account(actors.manager),{status:'已核准',signature,comment:'DEMO 導覽主管核准'})]);
   if(stage===2)for(const actorId of [actors.level1,actors.level2])reviewElectronicRequest({id,accountId:actorId,expectedRevision:reviewRevision(source()),signature,comment:'DEMO 導覽需求審查'},storage);
   if(stage===3){const r=source();const schedule=validateSchedule({editing:{id:'TOUR-SCH-001',requestId:id,title:r.testItems[0],productCode:r.productCode,quantity:1,status:'未排程'},form:{equipmentId:machine.id,ownerId:actors.labA,sampleCode:'SMP-TOUR-001',sampleVolumeLitres:1,time:getRequestDate(new Date(start)),end:getRequestDate(new Date(end)),note:'DEMO 導覽'},equipment:read('dqa-equipment-demo-v1'),accounts:SEED_ACCOUNTS,rows:[]});write('dqa-schedules-demo-v1',[{...schedule,time:new Date(start).toISOString(),end:new Date(end+3600000).toISOString()}]);write('dqa_lab_demo_requests_v1',mergeLabSchedules([],read('dqa-schedules-demo-v1'),now));}
   if(stage===4){confirmLabReceipt({requestId:id,actorId:actors.labA,now:start-60000},storage);syncScheduleLifecycle(storage,start+1000);write('dqa_lab_demo_requests_v1',mergeLabSchedules(read('dqa_lab_demo_requests_v1'),read('dqa-schedules-demo-v1'),start+1000));}
   if(stage===5)completeLabTrial({requestId:id,actorId:actors.labA,signature,now:end},storage);
   if(stage===6){const bytes=await createReportTemplate(source(),true);await submitReportWorkflow({requestId:id,file:new File([bytes],'TOUR-DEMO-001-模擬報告.xlsx'),signature,actorId:actors.labA,minimumMs:0},storage,repository);}
   if(stage===7)for(const actorId of [actors.level2,actors.level3])await approveReportWorkflow({requestId:id,actorId,signature,expectedRevision:reports.get(id).revision},storage,repository);
   if(stage===8){if(!fontBytes){const response=await fetch(`${import.meta.env?.BASE_URL||'/'}fonts/NotoSansCJKtc-Regular.otf`);if(!response.ok)throw Error('示範 PDF 字型載入失敗，請重試');fontBytes=await response.arrayBuffer();}await confirmReportViewed({requestId:id,actorId:actors.manager,expectedRevision:reports.get(id).revision,fontBytes},storage,repository);}
   stage++;views.push(capture());return views[stage-1];
  }catch(error){data.clear();before.forEach((v,k)=>data.set(k,v));reports.clear();beforeReports.forEach((v,k)=>reports.set(k,v));throw error;}finally{busy=false;}
 }};
}
