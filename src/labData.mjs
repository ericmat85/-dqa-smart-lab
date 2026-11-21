import {originalBusinessEnabled} from './originalBusiness.mjs';
import {usesEquipment} from './scheduleResources.mjs';
import {DEMO_SCHEDULES} from './demoSchedules.mjs';
import {ALL_DEMO_REQUESTS} from './demoLmsRequests.mjs';
import {INITIAL_ELECTRONIC_REQUESTS} from './demoElectronicRequests.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {DEMO_MATERIALS} from './demoMaterials.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {readElectronicRequestsForLms} from './electronicReview.mjs';
import {mergeImportedRequests} from './requestStorage.mjs';
import {applyCancelledRequests} from './requestCancellation.mjs';
import {effectiveScheduleStatus,scheduleProgress} from './scheduleProgress.mjs';
import {getRequestDate} from './requestDate.mjs';

export const LAB_SOURCES=[
  {id:'labWorkItems',label:'實驗室工作清單',key:'dqa_lab_demo_requests_v1',fallback:[]},
  {id:'labAudit',label:'實驗室操作歷程',key:'dqa_lab_demo_audit_v1',fallback:[]},
  {id:'borrows',label:'設備／物料借用申請',key:'dqa-borrow-requests-v1',fallback:[]},
  {id:'labOperations',label:'實驗室取消／中斷申請',key:'dqa-lab-operations-v1',fallback:[]},
  {id:'schedules',label:'試驗排程',key:'dqa-schedules-demo-v1',fallback:DEMO_SCHEDULES},
  {id:'equipment',label:'設備台帳',key:'dqa-equipment-demo-v1',fallback:DEMO_EQUIPMENT},
  {id:'materials',label:'物料台帳',key:'dqa-materials-demo-v1',fallback:DEMO_MATERIALS},
  {id:'reviews',label:'LMS 委託審查',key:'dqa-lms-reviews-v1',fallback:ALL_DEMO_REQUESTS},
  {id:'electronic',label:'電子委託',key:'dqa-request-demo-v2',fallback:INITIAL_ELECTRONIC_REQUESTS},
  {id:'accounts',label:'共用帳號',key:'dqa-shared-demo-accounts-v1',fallback:INITIAL_ACCOUNTS},
];
export function readLabSnapshot(storage,now=Date.now()) {
  const result={sources:[],issues:[],observedAt:now};
  for(const source of LAB_SOURCES){
    let raw=null,rows=[],error='';
    try{
      raw=storage.getItem(source.key);
      rows=raw===null?source.fallback:JSON.parse(raw);
      if(!Array.isArray(rows)||!rows.every(row=>row&&typeof row.id==='string'))throw Error('格式錯誤');
    }catch{rows=[];error='資料無法讀取或格式不符';}
    result[source.id]=rows;
    const bytes=raw===null?0:new TextEncoder().encode(raw).length;
    const duplicates=rows.length-new Set(rows.map(row=>row.id)).size;
    result.sources.push({id:source.id,label:source.label,key:source.key,count:rows.length,bytes,origin:error?'讀取異常':originalBusinessEnabled()?'共用資料庫':raw===null?'預設示範':'本機儲存',error});
    if(error)result.issues.push({id:`source-${source.id}`,type:'資料讀取',detail:`${source.label}：${error}`,target:source.id});
    if(duplicates)result.issues.push({id:`duplicate-${source.id}`,type:'重複編號',detail:`${source.label}有 ${duplicates} 筆重複編號`,target:source.id});
  }
  let cancellations={};
  try{cancellations=JSON.parse(storage.getItem('dqa-cancelled-requests-v1')||'{}');if(!cancellations||Array.isArray(cancellations)||typeof cancellations!=='object')throw Error('invalid');}
  catch{result.issues.push({id:'cancellations',type:'取消紀錄',detail:'取消紀錄格式不符',target:'schedules'});cancellations={};}
  result.requests=applyCancelledRequests(mergeImportedRequests(result.reviews,readElectronicRequestsForLms(storage)),cancellations);
  return result;
}
export function calendarWindow(now,kind='week') {
  const today=getRequestDate(new Date(now));
  const [year,month,day]=today.split('-').map(Number);
  const utc=Date.UTC(year,month-1,day);
  const start=kind==='month'?Date.UTC(year,month-1,1):utc-((new Date(utc).getUTCDay()+6)%7)*86400000;
  const end=kind==='month'?Date.UTC(year,month,1):start+7*86400000;
  return {start:start-28800000,end:end-28800000,from:new Date(start).toISOString().slice(0,10),to:new Date(end-86400000).toISOString().slice(0,10)};
}
function unionDuration(intervals) {
  let total=0,last=null;
  for(const [start,end] of intervals.sort((a,b)=>a[0]-b[0])){
    if(!last)last=[start,end];
    else if(start<=last[1])last[1]=Math.max(last[1],end);
    else{total+=last[1]-last[0];last=[start,end];}
  }
  return total+(last?last[1]-last[0]:0);
}
export function deriveLabMetrics(snapshot,now=Date.now()) {
  // Archived reports retain completed trial time in historical utilization and totals.
  const schedules=snapshot.schedules.map(row=>({...row,status:row.status==='已結案'?'已完成':effectiveScheduleStatus(row,now)}));
  const week=calendarWindow(now);
  const weekMs=week.end-week.start;
  const equipmentUsage=snapshot.equipment.map(machine=>{
    const intervals=schedules.filter(row=>usesEquipment(row,machine)&&['已排程','試驗中','進行中','暫停中','已完成'].includes(row.status)).flatMap(row=>{
      const bounds=scheduleProgress(row,now);
      return bounds.start!==undefined&&bounds.start<week.end&&bounds.end>week.start?[[Math.max(bounds.start,week.start),Math.min(bounds.end,week.end)]]:[];
    });
    const occupiedMs=unionDuration(intervals);
    return {...machine,occupiedMs,calendarMs:weekMs,occupancy:occupiedMs/weekMs*100};
  });
  const categories=[...new Set(equipmentUsage.map(row=>row.category||'未分類'))].map(category=>{
    const items=equipmentUsage.filter(row=>(row.category||'未分類')===category);
    const occupiedMs=items.reduce((sum,row)=>sum+row.occupiedMs,0),calendarMs=items.length*weekMs;
    return {category,count:items.length,occupiedMs,calendarMs,rate:calendarMs?occupiedMs/calendarMs*100:0};
  });
  const counts=Object.fromEntries(['未排程','已排程','試驗中','暫停中','已完成','有衝突','取消','待核准'].map(status=>[status,schedules.filter(row=>row.status===status).length]));
  const finished=schedules.filter(row=>row.status==='已完成').map(row=>({row,at:row.completedAt?Date.parse(row.completedAt):scheduleProgress(row,now).end}));
  const completedThisWeek=finished.filter(item=>item.at>=week.start&&item.at<Math.min(week.end,now+1)).length;
  const using=snapshot.equipment.filter(row=>row.status==='使用中').length;
  const issues=[...snapshot.issues];
  for(const row of schedules){
    if(!['取消','已完成'].includes(row.status)&&!snapshot.equipment.some(eq=>usesEquipment(row,eq)))issues.push({id:`equipment-${row.id}`,type:'排程設備',detail:`${row.requestId||row.id} 未關聯設備台帳中的機台`,target:'schedules'});
    if(row.status==='有衝突')issues.push({id:`conflict-${row.id}`,type:'排程衝突',detail:`${row.requestId||row.id}：${row.scheduleIssue||'排程待確認'}`,target:'schedules'});
  }
  const today=getRequestDate(new Date(now));
  for(const row of snapshot.equipment){if(row.nextCalibration&&row.nextCalibration<today)issues.push({id:`calibration-${row.id}`,type:'校驗到期',detail:`${row.id} ${row.name} 校驗日期 ${row.nextCalibration} 已到期`,target:'equipment'});}
  const lowStock=snapshot.materials.filter(row=>Number(row.available)<Number(row.minStock));
  for(const row of lowStock)issues.push({id:`stock-${row.id}`,type:'庫存不足',detail:`${row.id} ${row.name}：可用 ${row.available} ${row.unit}，安全庫存 ${row.minStock} ${row.unit}`,target:'materials'});
  return {schedules,week,equipmentUsage,categories,counts,completedThisWeek,using,equipmentRate:snapshot.equipment.length?using/snapshot.equipment.length*100:0,lowStock,issues};
}
export function requestInformation(row,snapshot) {
  const original=snapshot.electronic.find(item=>item.id===row.id);
  if(original)return original;
  return {id:row.id,productCode:row.productCode,productType:row.productType,customer:row.customerName,customerPartNo:row.customerPartNo,dueDate:row.requestedDate,quantity:row.quantity,department:row.department,requester:row.applicant,priority:row.priority,createdAt:row.submitted,purpose:row.intentions,sampleSource:row.sampleSource,productVersion:row.productVersion,pcbaVersion:row.pcbaVersion,softwareVersion:row.softwareVersion,manufactureDate:row.manufactureDate,testItems:[row.title],specification:row.specification,judgementCriteria:row.judgment,notes:row.remarks,status:row.status==='完成'?'待排程':row.status,signatureRecords:row.signatureRecords,cancellation:row.cancellation};
}
export function csvText(columns,rows) {
  const quote=value=>{
    let text=String(value??'');
    if(typeof value!=='number'&&/^[=+@\-\t\r]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\ufeff'+[columns.map(column=>quote(column.label)).join(','),...rows.map(row=>columns.map(column=>quote(row[column.key])).join(','))].join('\r\n');
}
