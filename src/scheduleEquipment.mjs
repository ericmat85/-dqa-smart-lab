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
  return rows.find(row=>row.id!==proposal.id&&['已排程','試驗中','進行中','待核准'].includes(row.status)&&row.time&&dateOnly(proposal.time)<=dateOnly(row.end||row.time)&&dateOnly(row.time)<=dateOnly(proposal.end||proposal.time)&&(
    (row.equipmentId?row.equipmentId===proposal.equipmentId:row.eq===proposal.eq)||
    (row.ownerId&&proposal.ownerId?row.ownerId===proposal.ownerId:row.owner===proposal.owner)
  ));
}
export function validateSchedule({editing,form,equipment,accounts,rows,today}) {
 if(editing.reportInfo?.stage||editing.status==="已結案")throw Error("報告已提交，不可重新安排排程。");
 if(editing.status==='待核准')throw Error('此案件待核准，請先處理申請。');
  if(editing.status==='取消')throw Error('此委託已取消，無法重新安排排程。');
  const machine=equipment.find(row=>row.id===form.equipmentId);
  if(!machine)throw Error('請選擇設備台帳中的設備。');
  if(machine.status!=='待機中')throw Error(`${machine.name} 目前為${machine.status}，只有待機中的設備能加入排程。`);
  if(!equipmentMatches(editing.title,machine))throw Error('此設備類型不適用目前試驗，請改選適用設備。');
  const quantity=sampleQuantity(editing.quantity);
  if(!Number.isSafeInteger(Number(machine.capacity))||Number(machine.capacity)<1)throw Error('設備容量無效，請先修正設備台帳。');
  if(quantity>Number(machine.capacity))throw Error(`樣品數量超過設備容量（${machine.capacity} 件）。`);
  validateConditions(machine,form.conditions||editing.conditions);
  const executors=enabledExecutors(accounts);
  const executor=executors.find(row=>row.id===form.ownerId);
  if(!executor)throw Error('請選擇啟用中的實驗室工程師或副工程師。');
  if(!String(form.sampleCode||'').trim())throw Error('請填寫樣品編號。');
  const start=dateOnly(form.time),end=dateOnly(form.end);
  if(!start||!end||!Number.isFinite(day(start))||!Number.isFinite(day(end)))throw Error('請填寫有效的開始與完成日期。');
  if(end<start)throw Error('預計完成日期不可早於開始日期。');
  if(today&&start<=today)throw Error('請安排明日或之後的日期，讓實驗室能在開始前確認接收。');
  const proposal={...editing,...form,reservationId:crypto.randomUUID(),equipmentId:machine.id,eq:machine.name,ownerId:executor.id,owner:executor.name,time:start,end,status:'已排程',remarks:form.note,sampleCode:form.sampleCode.trim()};
  delete proposal.completedAt;
  delete proposal.equipmentReleaseHandledAt;
  const conflict=findScheduleConflict(rows,proposal);
  if(conflict)throw Error(`設備或執行人時段衝突：${conflict.requestId||conflict.id}（${dateOnly(conflict.time)} 至 ${dateOnly(conflict.end||conflict.time)}）。`);
  return proposal;
}
export function recommendSchedule({editing,form,equipment,accounts,rows,today=getRequestDate()}) {
  if(editing.status==='取消')throw Error('此委託已取消，無法重新安排排程。');
  if(editing.reportInfo?.stage||['已結案','待核准'].includes(editing.status))throw Error('此案件目前無法重新安排排程。');
  const quantity=sampleQuantity(editing.quantity);
  const candidates=equipment.filter(row=>{
    if(row.status!=='待機中'||!equipmentMatches(editing.title,row)||!Number.isSafeInteger(Number(row.capacity))||quantity>Number(row.capacity))return false;
    try { validateConditions(row,form.conditions||editing.conditions); return true; } catch { return false; }
  });
  if(!candidates.length)throw Error('沒有符合試驗類型、樣品容量與輸入條件的待機設備，請先確認設備台帳。');
  const executors=enabledExecutors(accounts);
  if(!executors.length)throw Error('目前沒有可指派的實驗室工程師或副工程師。');
  const duration=Number.isFinite(day(form.end))&&Number.isFinite(day(form.time))&&form.end>=form.time?Math.max(1,Math.round((day(form.end)-day(form.time))/86400000)+1):3;
  // Date-only reservations start at midnight in Taipei; tomorrow leaves time for lab receipt.
  const start=form.time&&Number.isFinite(day(form.time))&&form.time>today?form.time:addDays(today,1);
  for(let offset=0;offset<365;offset++){
    const time=addDays(start,offset),end=addDays(time,duration-1);
    for(const machine of candidates){
      for(const executor of executors){
        const proposal={id:editing.id,equipmentId:machine.id,eq:machine.name,ownerId:executor.id,owner:executor.name,time,end};
        if(!findScheduleConflict(rows,proposal))return {...proposal,duration};
      }
    }
  }
  throw Error('一年內未找到設備與執行人皆可用的時段，請手動調整試驗期間。');
}
