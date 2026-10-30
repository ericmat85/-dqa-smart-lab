import {equipmentIds,reservationWindow,bufferMinutes} from './scheduleResources.mjs';
import {DEMO_EQUIPMENT} from './demoEquipment.mjs';
import {getRequestDate,isCalendarDate} from './requestDate.mjs';

export const EQUIPMENT_KEY='dqa-equipment-demo-v1';
export const SCHEDULE_KEY='dqa-schedules-demo-v1';
export function readScheduleEquipment(storage=window.localStorage) {
  const raw=storage.getItem(EQUIPMENT_KEY);
  if(raw===null)return DEMO_EQUIPMENT;
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||!rows.every(row=>row?.id&&row?.name&&row?.status))throw Error('設備台帳無法讀取，請確認設備管理資料。');
  return rows;
}
export const dateOnly=value=>value?String(value).slice(0,10):'';
const day=value=>isCalendarDate(dateOnly(value))?Date.parse(`${dateOnly(value)}T00:00:00Z`):NaN;
const addDays=(value,days)=>new Date(day(value)+days*86400000).toISOString().slice(0,10);
export function equipmentMatches(title,equipment) {
  const text=String(title||'');
  const rules=[[/機械衝擊/,/機械衝擊/],[/熱衝擊|冷熱衝擊/,/冷熱衝擊/],[/振動/,/振動/],[/鹽霧|腐蝕/,/鹽霧/],[/IPX|防水|淋雨/i,/防水/],[/ESD|靜電/i,/ESD/i],[/日曬|日照|耐候|光照/,/耐候/],[/防塵|粉塵/,/防塵/],[/拉力/,/拉力/],[/溫濕度|高溫高濕|恆溫恆濕/,/恆溫恆濕/],[/低溫|溫度循環|高低溫/,/環境試驗箱|恆溫恆濕/],[/高溫/,/環境試驗箱|恆溫恆濕|高溫爐/],[/顯微|量測觀察/,/顯微鏡/]];
  const rule=rules.find(([pattern])=>pattern.test(text));
  return Boolean(rule&&rule[1].test(equipment.name));
}
function sampleQuantity(value) {
  const quantity=Number(value);
  if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('樣品數量須為正整數，請先修正委託資料。');
  return quantity;
}
// Only explicit numeric requirements are checked; free-text specifications remain for human review.
export function validateConditions(machine,conditions={}) {
  const specification=String(machine.specification||'').replaceAll('−','-');
  const temperature=/室溫/.test(specification)?null:specification.match(/(-?\d+(?:\.\d+)?)\s*[～~]\s*(-?\d+(?:\.\d+)?)\s*°?C/i);
  const humidity=specification.match(/(\d+(?:\.\d+)?)\s*[～~]\s*(\d+(?:\.\d+)?)\s*%\s*RH/i);
  for(const [key,label,range] of [['temperature','溫度',temperature],['humidity','濕度',humidity]]) {
    const low=conditions[`${key}Min`],high=conditions[`${key}Max`];
    const absent=value=>value===undefined||value===null||String(value).trim()==='';
    if(absent(low)&&absent(high))continue;
    if(absent(low)||absent(high)||!Number.isFinite(Number(low))||!Number.isFinite(Number(high))||Number(low)>Number(high))throw Error(`${label}條件須填寫有效的上下限。`);
    if(!range)throw Error(`設備缺少可驗證的${label}範圍，請改選設備或確認台帳。`);
    if(Number(low)<Number(range[1])||Number(high)>Number(range[2]))throw Error(`試驗${label}超過設備規格範圍。`);
  }
}
export function enabledExecutors(accounts) {
  return accounts.filter(row=>row.status==='啟用中'&&['實驗室工程師','實驗室副工程師'].includes(row.role));
}
export function findScheduleConflict(rows,proposal) {
 const period=reservationWindow(proposal);if(!period)return undefined;
 return rows.find(row=>{
  if(row.id===proposal.id||!['已排程','試驗中','進行中','待核准','已完成','已結案'].includes(row.status))return false;
  const other=reservationWindow(row);if(!other||period.start>=other.end||other.start>=period.end)return false;
  const ids=equipmentIds(row),proposed=equipmentIds(proposal);
  return (ids.length&&proposed.length?ids.some(id=>proposed.includes(id)):row.eq===proposal.eq)||
   (row.ownerId&&proposal.ownerId?row.ownerId===proposal.ownerId:row.owner&&row.owner===proposal.owner);
 });
}
function deviceCount(form){const count=Number(form.equipmentCount||1);if(!Number.isInteger(count)||count<1||count>4)throw Error('Demo 設備台數須為 1～4 台。');return count;}
function effectiveCapacity(machine,form){
 const capacity=Number(machine.capacity);if(!Number.isSafeInteger(capacity)||capacity<1)throw Error('設備容量無效，請先修正設備台帳。');
 const volume=form.sampleVolumeLitres;
 if(volume===undefined||volume===null||String(volume).trim()==='')return capacity;
 if(!Number.isFinite(Number(volume))||Number(volume)<=0)throw Error('每件樣品使用空間須為正數（L）。');
 const available=Number(machine.usableVolumeLitres);
 if(!Number.isFinite(available)||available<=0)throw Error('設備缺少可驗證的使用空間，請確認設備台帳。');
 return Math.min(capacity,Math.floor(available/Number(volume)));
}
function allocateSamples(machines,form,quantity){
 let remaining=quantity;
 const allocations=machines.map((machine,index)=>{const count=Math.max(0,Math.min(remaining-(machines.length-index-1),effectiveCapacity(machine,form)));remaining-=count;return {equipmentId:machine.id,quantity:count};});
 if(allocations.some(row=>row.quantity<1))throw Error('每台設備至少須分配一件樣品，請減少台數或確認空間。');
 if(remaining>0)throw Error(machines.length===1&&!form.sampleVolumeLitres?`樣品數量超過設備容量（${machines[0].capacity} 件）。`:'樣品數量超過設備容量或使用空間，請增加設備或調整樣品需求。');
 return allocations;
}
export function validateSchedule({editing,form,equipment,accounts,rows,today}) {
 if(editing.reportInfo?.stage||editing.status==="已結案")throw Error("報告已提交，不可重新安排排程。");
 if(editing.status==='待核准')throw Error('此案件待核准，請先處理申請。');
  if(editing.status==='取消')throw Error('此委託已取消，無法重新安排排程。');
  const count=deviceCount(form),ids=equipmentIds(form);
  if(ids.length!==count)throw Error('所選設備數量與需求台數不符。');
  const machines=ids.map(id=>equipment.find(row=>row.id===id));
  for(const machine of machines){
   if(!machine)throw Error('請選擇設備台帳中的設備。');
   if(machine.status!=='待機中')throw Error(`${machine.name} 目前為${machine.status}，只有待機中的設備能加入排程。`);
   if(!equipmentMatches(editing.title,machine))throw Error('此設備類型不適用目前試驗，請改選適用設備。');
   validateConditions(machine,form.conditions||editing.conditions);
  }
  const quantity=sampleQuantity(editing.quantity);
  const allocations=allocateSamples(machines,form,quantity);
  const executors=enabledExecutors(accounts);
  const executor=executors.find(row=>row.id===form.ownerId);
  if(!executor)throw Error('請選擇啟用中的實驗室工程師或副工程師。');
  if(!String(form.sampleCode||'').trim())throw Error('請填寫樣品編號。');
  const start=dateOnly(form.time),end=dateOnly(form.end);
  if(!start||!end||!Number.isFinite(day(start))||!Number.isFinite(day(end)))throw Error('請填寫有效的開始與完成日期。');
  if(end<start)throw Error('預計完成日期不可早於開始日期。');
  if(today&&start<=today)throw Error('請安排明日或之後的日期，讓實驗室能在開始前確認接收。');
  const proposal={...editing,...form,reservationId:crypto.randomUUID(),equipmentId:machines[0].id,equipmentIds:ids,equipmentCount:count,allocations,preparationMinutes:bufferMinutes(form.preparationMinutes),cleanupMinutes:bufferMinutes(form.cleanupMinutes),eq:machines.map(machine=>machine.name).join("、"),ownerId:executor.id,owner:executor.name,time:start,end,status:'已排程',remarks:form.note,sampleCode:form.sampleCode.trim()};
  delete proposal.completedAt;
  delete proposal.equipmentReleaseHandledAt;
  const conflict=findScheduleConflict(rows,proposal);
  if(conflict)throw Error(`設備或執行人時段衝突：${conflict.requestId||conflict.id}（${dateOnly(conflict.time)} 至 ${dateOnly(conflict.end||conflict.time)}）。`);
  return proposal;
}
export function recommendSchedule({editing,form,equipment,accounts,rows,today=getRequestDate()}) {
  if(editing.status==='取消')throw Error('此委託已取消，無法重新安排排程。');
  if(editing.reportInfo?.stage||['已結案','待核准'].includes(editing.status))throw Error('此案件目前無法重新安排排程。');
  const quantity=sampleQuantity(editing.quantity),count=deviceCount(form);
  bufferMinutes(form.preparationMinutes);bufferMinutes(form.cleanupMinutes);
  const candidates=equipment.filter(row=>{
    if(row.status!=='待機中'||!equipmentMatches(editing.title,row))return false;
    try { validateConditions(row,form.conditions||editing.conditions);return effectiveCapacity(row,form)>0; } catch { return false; }
  });
  if(candidates.length<count)throw Error('沒有足夠符合試驗類型、容量與條件的待機設備。');
  const executors=enabledExecutors(accounts);
  if(!executors.length)throw Error('目前沒有可指派的實驗室工程師或副工程師。');
  const duration=Number.isFinite(day(form.end))&&Number.isFinite(day(form.time))&&form.end>=form.time?Math.max(1,Math.round((day(form.end)-day(form.time))/86400000)+1):3;
  // Date-only reservations start at midnight in Taipei; tomorrow leaves time for lab receipt.
  const start=form.time&&Number.isFinite(day(form.time))&&form.time>today?form.time:addDays(today,1);
  for(let offset=0;offset<365;offset++){
    const time=addDays(start,offset),end=addDays(time,duration-1);
    for(const executor of executors){
      const free=candidates.filter(machine=>!findScheduleConflict(rows,{...form,id:editing.id,equipmentId:machine.id,equipmentIds:[machine.id],eq:machine.name,ownerId:executor.id,owner:executor.name,time,end}));
      const selected=free.sort((a,b)=>effectiveCapacity(b,form)-effectiveCapacity(a,form)).slice(0,count);
      if(selected.length!==count)continue;
      try { allocateSamples(selected,form,quantity); } catch { continue; }
      return {equipmentId:selected[0].id,equipmentIds:selected.map(row=>row.id),equipmentCount:count,eq:selected.map(row=>row.name).join('、'),ownerId:executor.id,owner:executor.name,time,end,duration};
    }
  }
  throw Error('一年內未找到設備與執行人皆可用的時段，請手動調整試驗期間。');
}
