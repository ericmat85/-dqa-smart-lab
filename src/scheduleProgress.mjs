import {isVirtualRequest} from './requestExecutionKind.mjs';
import {profileById,trialExecution,executionFraction} from './trialProfiles.mjs';
function timestamp(value,end=false) {
  if(!value)return null;
  const text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    const midnight=Date.parse(`${text}T00:00:00Z`);
    if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==text)return null;
    return midnight-8*3600000+(end?86400000:0);
  }
  const parsed=Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)?text:`${text}+08:00`);
  return Number.isFinite(parsed)?parsed:null;
}
export function scheduleProgress(row,now) {
  if(!row.time||!row.end||!['已排程','試驗中','進行中','暫停中','已完成'].includes(row.status))return {phase:'unscheduled',label:'尚未排程'};
  let plan=null;
  if(row.trialProfileId&&!row.demoAccelerator){
   try{const profile=profileById(row.trialProfileId);plan=trialExecution(profile,String(row.time).slice(0,10),(row.allocations||[]).map(a=>({...a,capacity:profile.id==='VIBRATION_DURABILITY'?1:a.quantity})),profile.fixed_duration?profile.hours:Number(row.durationHours));}
   catch{return {phase:'invalid',label:'試驗資料待確認'};}
  }
  const start=plan?.start_ms??timestamp(row.time),baseEnd=plan?.end_ms??timestamp(row.end,true);
  const paused=Number.isFinite(Date.parse(row.pauseStartedAt));
  const held=paused?Math.max(0,now-Date.parse(row.pauseStartedAt)):0;
  const end=baseEnd===null?null:baseEnd+Number(row.pauseTotalMs||0)+held;
  if(start===null||end===null||end<=start)return {phase:'invalid',label:'日期待確認'};
  if(row.businessDatabase&&isVirtualRequest(row)){const percent=[0,50,100].includes(row.virtualPercent)?row.virtualPercent:0;return {phase:percent===100?'elapsed':percent===50?'running':'waiting',label:percent===100?'虛擬試驗已完成':percent===50?'虛擬試驗進行中':'等待加速虛擬試驗',fraction:percent/100,start,end};}
  const frozenEnd=baseEnd,clock=(paused?Date.parse(row.pauseStartedAt):now)-Number(row.pauseTotalMs||0);
  const fraction=plan?executionFraction(plan,clock):Math.max(0,Math.min(1,(clock-start)/(frozenEnd-start)));
  if(row.status==='已完成'){const actual=timestamp(row.completedAt);return {phase:'elapsed',label:'已完成',fraction:1,start,end:actual!==null&&actual>=start&&actual<=end?actual:end};}
  if(paused)return {phase:"paused",label:"暫停中（結束時間順延）",fraction,start,end};
  if(row.businessDatabase&&row.status==='已排程')return {phase:'waiting',label:now<start?'等待開始時間':'已到排程時間，等待伺服器自動開始',fraction:0,start,end};
  if(row.businessDatabase&&now>=end)return {phase:'elapsed',label:'時程已到，待執行人確認完成',fraction:1,start,end};
  return {phase:now<start?'waiting':now>=end?'elapsed':'running',label:now<start?'尚未開始':now>=end?'已完成':'試驗時程進行中',fraction,start,end};
}

export function effectiveScheduleStatus(row,now) {
  if(row.readOnly||row.businessDatabase)return row.status;
  if(!['已排程','試驗中','進行中'].includes(row.status))return row.status;
  const progress=scheduleProgress(row,now);
  if(progress.phase==='unscheduled'||progress.phase==='invalid')return '未排程';
  return progress.phase==='waiting'?'已排程':progress.phase==='elapsed'?'已完成':'試驗中';
}
