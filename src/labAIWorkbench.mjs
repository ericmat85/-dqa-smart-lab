import {isCalendarDate,getRequestDate} from './requestDate.mjs';
import {compoundTimeline,compoundStartSuggestions} from './compoundSchedule.mjs';
import {equipmentIds,reservationWindow} from './scheduleResources.mjs';
import {isVirtualRequest} from './requestExecutionKind.mjs';
export const ENGINE_CAPABILITIES={
 E1:{title:'委託與報告審查',current:['核對單筆委託與試驗規範','參考簽名紀錄及報告關鍵欄位','回傳缺漏、需人工確認事項與 Trace'],added:['委託缺漏預檢','依缺漏排序與單筆 AI 複核'],limits:'簽名紀錄不等於真偽驗證；報告只讀已提供的關鍵欄位，無法代替整份報告審閱或正式簽核。'},
 E2:{title:'排程與試驗接續',current:['由既有規則產生並驗證候選方案','AI 從有效候選比較與推薦','帶入草稿後由人員核對儲存'],added:['排程衝突、逾時及校驗巡檢','複合試驗切換／收尾檢查與起點試算'],limits:'起點試算只檢查平日作業時段；設備占用、容量、資格與國定假日仍須在原排程確認，不代表已預約。'},
 E3:{title:'實驗室報告草稿',current:['依所選授權來源產生客製敘述','設定用途與額外章節','預覽並匯出 Excel／PDF 草稿'],added:['交班、進度、缺漏追蹤三種任務範本','選取委託來源並預填報告用途與章節'],limits:'量測數據、合格判定及簽名只能引用來源，不會憑空補齊；草稿不等於正式簽核報告。'},
 E4:{title:'實驗室作業助理',current:['回答授權範圍內的實驗室問題','依問句選讀排程、設備、物料等來源','提供引用、Trace 與可核對的用量'],added:['交班、校驗保養、庫存、試驗方法四種捷徑','可指定設備，並編輯問題後詢問'],limits:'每次問答依問句選讀一類來源；跨類別請分次確認。來源缺漏會保留待確認，不會自動操作設備或送出通知。'},
};
export const LAB_REPORT_TEMPLATES=[
 {id:'handover',name:'交班摘要',title:'實驗室交班摘要',purpose:'依所選委託的已提供資料整理交班摘要，區分待審查、待排程、執行中及待報告，列出下一班應確認的事項。不可假設試驗已完成，不生成量測、判定或簽名。',headings:['目前狀態與資料範圍','下一班待辦','待補證據與風險']},
 {id:'progress',name:'試驗進度',title:'試驗進度追蹤草稿',purpose:'依所選委託的狀態、需求日期與樣品數量整理進度草稿，列出需追蹤的案件與缺漏。需求日期不是完成日期；沒有執行紀錄時不得聲稱已完成試驗。',headings:['委託狀態分佈','需求日期與追蹤重點','待人工確認事項']},
 {id:'missing',name:'缺漏追蹤',title:'委託缺漏追蹤草稿',purpose:'依所選委託已提供欄位整理缺漏與補件追蹤草稿，分辨未提供資料與已確認問題；不可推定簽名真偽、量測值或合格結論。',headings:['資料範圍','缺漏與確認清單','建議補件順序']},
];
export const LAB_QUESTION_TASKS=[
 {id:'handover',name:'排程交班',page:'schedule',question:'請依目前授權的試驗排程整理交班待辦，分成正在執行、即將開始、超過預定結束及需人工確認。只使用來源日期與狀態，不推定試驗已完成，註明資料範圍並附引用。'},
 {id:'equipment',name:'校驗／保養',page:'equipment',question:'請依{target}設備台帳的已提供校驗與保養日期、目前狀態，整理應先確認的事項與準備清單。沒有日期或規範時明示待確認，不推定設備可用，不代為操作或安排保養。'},
 {id:'stock',name:'物料庫存',page:'materials',question:'請依目前授權的物料庫存，比較可用數量與安全庫存，整理優先確認或補充的清單。不要假設已採購或變更庫存；缺少資料時明示待確認，附來源引用。'},
 {id:'method',name:'試驗方法',page:'requests',question:'請依目前授權的試驗目錄，整理高溫、高溫高濕、振動及防水試驗的已提供條件與需人工確認事項。來源未提供的條件不可推測，目錄參考不等於案件已核准規範，請附引用。'},
];
export function sourceReady(snapshot,id){return !!snapshot?.sources?.some(s=>s.id===id&&!s.error);}
const present=value=>typeof value==='string'?!!value.trim():value!==undefined&&value!==null;
export function requestPreflight(row){
 const checks=[['product','產品代碼',present(row.productCode||row.product)],['trial','試驗項目',Array.isArray(row.testItems)&&row.testItems.some(present)],['quantity','樣品數量',Number.isInteger(Number(row.quantity))&&Number(row.quantity)>0],['due','需求日期',isCalendarDate(row.dueDate)],['spec','試驗規範／手法',present(row.specification)],['acceptance','判定基準',row.judgementRequired==='不作判定'||present(row.judgementCriteria)]];
 return checks.map(([id,label,ok])=>({id,label,state:ok?'provided':'missing',detail:ok?'已有欄位值，仍需核對內容。':'尚未提供有效欄位值，請到委託資訊補齊。'})).concat([{id:'signature',label:'簽名與正式版本',state:'confirm',detail:row.documentVersion?'第 '+row.documentVersion+' 版；請由原委託頁核對簽名與各階簽核紀錄。':'請由原委託頁核對目前正式版本與簽名紀錄，預檢不驗證簽名真偽。'}]);
}
export function intakeQueue(rows){return rows.filter(r=>!['取消','已結案'].includes(r.status)).map(row=>({row,checks:requestPreflight(row),missing:requestPreflight(row).filter(c=>c.state==='missing').length})).sort((a,b)=>b.missing-a.missing||a.row.id.localeCompare(b.row.id));}
export function requestTaskStamp(row){return row?JSON.stringify([row.id,row.databaseId,row.sourceRevision,row.status,row.quantity,row.productCode,row.dueDate,row.testItems,row.specification,row.judgementCriteria,row.documentVersionId]):'';}
const active=s=>!['取消','已完成','已結案','未排程'].includes(s.status);
export function scheduleWatch(snapshot,now=Date.now()){
 const rows=snapshot.schedules||[],equipment=snapshot.equipment||[],issues=[],today=getRequestDate(new Date(now));
 for(const row of rows.filter(active)){
  const add=(code,label,detail)=>issues.push({id:row.id+':'+code,requestId:row.requestId||row.id,label,detail,target:'schedule'});
  if(isVirtualRequest(row)){add('virtual','虛擬排程','此筆為虛擬試驗，不納入實體資源衝突檢查。');continue;}
  const end=Date.parse(row.plannedExecutionEnd||row.end);if(Number.isFinite(end)&&end<now)add('late','超過預定結束','目前狀態為「'+row.status+'」，請確認執行紀錄；不會自動判定完成。');
  if(!row.sampleCode)add('sample','樣品編號待確認','尚未看到樣品編號，請由原排程及簽核頁核對。');
  const ids=equipmentIds(row);if(!ids.length&&!row.plan?.outsourced)add('equipment','設備關聯待確認','目前來源未提供設備關聯。');
  for(const id of ids){const eq=equipment.find(e=>[e.id,e.databaseId].includes(id));if(!eq){add('unknown-'+id,'設備資料不足','關聯設備不在目前可讀台帳內，無法確認狀態與校驗。');continue;}
   const start=Date.parse(row.time),day=Number.isFinite(start)?getRequestDate(new Date(start)):today;
   if(!isCalendarDate(eq.nextCalibration))add('date-'+id,'校驗日期待確認',eq.id+' '+eq.name+' 未提供有效的下次校驗日期。');
   else if(eq.nextCalibration<=day)add('cal-'+id,'校驗日期需核對',eq.id+' '+eq.name+' 的校驗日期 '+eq.nextCalibration+' 不晚於試驗起日 '+day+'。');
   if(['維護中','校驗中','停用','借用中'].includes(eq.status))add('state-'+id,'設備狀態需確認',eq.id+' '+eq.name+' 目前為「'+eq.status+'」。');
  }
 }
 const windows=rows.filter(r=>active(r)&&!isVirtualRequest(r)).map(row=>{try{return {row,window:reservationWindow(row,now)};}catch{return {row,window:null};}});
 for(const {row,window} of windows)if(!window)issues.push({id:row.id+':window',requestId:row.requestId||row.id,label:'預約時段待確認',detail:'來源時間或準備／清理資訊不足，未作衝突判斷。',target:'schedule'});
 for(let i=0;i<windows.length;i++)for(let j=i+1;j<windows.length;j++){const a=windows[i],b=windows[j];if(!a.window||!b.window||a.window.start>=b.window.end||b.window.start>=a.window.end)continue;const shared=equipmentIds(a.row).filter(id=>equipmentIds(b.row).includes(id)),sameExecutor=a.row.executorId&&a.row.executorId===b.row.executorId;if(shared.length||sameExecutor)issues.push({id:a.row.id+':'+b.row.id,requestId:a.row.requestId||a.row.id,label:'重疊時段需核對',detail:(b.row.requestId||b.row.id)+' 與此筆的預約時段重疊，涉及'+(shared.length?'共用設備 '+shared.join('、'):'同一執行人')+'；請回原排程確認。',target:'schedule'});}
 return issues;
}
export function simulateCompound(row,options){const stages=row?.compoundStages;if(!Array.isArray(stages)||!stages.every(s=>Number.isInteger(s.duration_minutes)&&s.duration_minutes>0&&['continuous','operator'].includes(s.operation)&&typeof s.profile_id==='string'))throw Error('缺少可核對的複合試驗階段，請先在原委託建立完整規範。');const timeline=compoundTimeline(stages,options);return {...timeline,suggestions:timeline.valid?[]:compoundStartSuggestions(stages,options,{days:21,limit:3})};}
export const LAB_REPORT_COLUMNS=[{key:'id',label:'委託編號'},{key:'productCode',label:'產品代碼'},{key:'trial',label:'試驗項目'},{key:'quantity',label:'樣品數量'},{key:'dueDate',label:'需求日期'},{key:'status',label:'目前狀態'},{key:'sourceRevision',label:'來源修訂'}];
export function reportTaskRows(rows,ids){if(!Array.isArray(ids)||ids.length<1||ids.length>100||new Set(ids).size!==ids.length)throw Error('請選擇 1～100 筆不同委託作為報告來源。');return ids.map(id=>{const row=rows.find(r=>r.id===id);if(!row)throw Error('所選來源已移除或目前無權讀取，請重新選取。');return {id:row.id,productCode:row.productCode||row.product||'',trial:Array.isArray(row.testItems)?row.testItems.join('、'):'',quantity:String(row.quantity??''),dueDate:row.dueDate||'',status:row.status||'',sourceRevision:row.sourceRevision??''};});}
export function questionForTask(id,target=''){const task=LAB_QUESTION_TASKS.find(t=>t.id===id);if(!task)throw Error('請選擇有效的實驗室任務。');if(target&&!/^(?:EQ-[A-Za-z0-9-]{1,80}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(target))throw Error('設備編號格式無法核對。');return task.question.replace('{target}',target?target+' ':'目前授權的');}
