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
  const start=timestamp(row.time),baseEnd=timestamp(row.end,true);
  const paused=Number.isFinite(Date.parse(row.pauseStartedAt));
  const held=paused?Math.max(0,now-Date.parse(row.pauseStartedAt)):0;
  const end=baseEnd===null?null:baseEnd+Number(row.pauseTotalMs||0)+held;
  if(start===null||end===null||end<=start)return {phase:'invalid',label:'日期待確認'};
  const frozenEnd=baseEnd,clock=(paused?Date.parse(row.pauseStartedAt):now)-Number(row.pauseTotalMs||0);
  const fraction=Math.max(0,Math.min(1,(clock-start)/(frozenEnd-start)));
  if(row.status==='已完成'){const actual=timestamp(row.completedAt);return {phase:'elapsed',label:'已完成',fraction:1,start,end:actual!==null&&actual>=start&&actual<=end?actual:end};}
  if(paused)return {phase:"paused",label:"暫停中（結束時間順延）",fraction,start,end};
  return {phase:now<start?'waiting':now>=end?'elapsed':'running',label:now<start?'尚未開始':now>=end?'已完成':'試驗時程進行中',fraction,start,end};
}

export function effectiveScheduleStatus(row,now) {
  if(!['已排程','試驗中','進行中'].includes(row.status))return row.status;
  const progress=scheduleProgress(row,now);
  if(progress.phase==='unscheduled'||progress.phase==='invalid')return '未排程';
  return progress.phase==='waiting'?'已排程':progress.phase==='elapsed'?'已完成':'試驗中';
}
