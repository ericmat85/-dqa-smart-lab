import { getRequestDate } from './requestDate.mjs';

const serviceStatuses=['維護中','校驗中'];
export function formatServiceDuration(milliseconds) {
  if (milliseconds===null || milliseconds===undefined) return '未記錄開始時間';
  const minutes=Math.floor(milliseconds/60000);
  if (minutes<1) return '不到 1 分鐘';
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),remaining=minutes%60;
  return [days?`${days} 天`:'',hours?`${hours} 小時`:'',remaining?`${remaining} 分鐘`:''].filter(Boolean).join(' ');
}

export function changeEquipmentStatus(equipment, { id, status, reason, actor, actorId, expectedStatus, at = new Date().toISOString() }) {
  const selected=equipment.find(row=>row.id===id);
  if (!selected) throw Error('請選擇要變更的設備。');
  if (expectedStatus && selected.status!==expectedStatus) throw Error('設備狀態已更新，請重新確認後再提交。');
  if (!['待機中',...serviceStatuses].includes(status)) throw Error('請選擇待機中、維護中或校驗中。');
  if (selected.status===status) throw Error('變更後的狀態不可與目前相同。');
  if (selected.status==='使用中' && status==='校驗中') throw Error('使用中的設備不可直接進行校驗，請先結束使用並恢復待機。');
  const detail=String(reason || '').trim();
  if (!detail) throw Error('請填寫變更原因或完成處理結果。');
  if (!actorId || !actor) throw Error('請重新登入後再操作。');
  if (!Number.isFinite(Date.parse(at))) throw Error('無法記錄操作時間。');
  const next={...selected,status,records:[...(selected.records || [])]};
  if (serviceStatuses.includes(selected.status)) {
    const active=selected.activeService?.status===selected.status ? selected.activeService : null;
    const legacy=next.records.find(record=>record.type==='狀態變更' && record.result?.endsWith(`→ ${selected.status}`));
    const startedAt=active?.startedAt || legacy?.date || null;
    const durationMs=startedAt && Number.isFinite(Date.parse(startedAt)) ? Date.parse(at)-Date.parse(startedAt) : null;
    if (durationMs!==null && durationMs<0) throw Error('結束時間不可早於開始時間。');
    next.records.unshift({id:globalThis.crypto.randomUUID(),date:at,type:selected.status==='維護中'?'維護完成':'校驗完成',actor,actorId,result:`${selected.status} → ${status}`,detail,startedAt,endedAt:at,durationMs,startReason:active?.reason || legacy?.detail || '',startedBy:active?.actor || legacy?.actor || '',requestId:active?.requestId || ''});
    if(selected.status==='維護中')next.lastMaintenance=getRequestDate(new Date(at));
    else next.lastCalibration=getRequestDate(new Date(at));
  }
  if (serviceStatuses.includes(status)) {
    next.activeService={status,startedAt:at,reason:detail,actor,actorId,requestId:selected.currentRequest || selected.activeService?.requestId || ''};
    next.currentRequest='';
  } else {
    next.activeService=null;
    if (!serviceStatuses.includes(selected.status)) next.records.unshift({id:globalThis.crypto.randomUUID(),date:at,type:'狀態變更',actor,actorId,result:`${selected.status} → ${status}`,detail});
    next.currentRequest='';
  }
  return equipment.map(row=>row.id===id ? next : row);
}
