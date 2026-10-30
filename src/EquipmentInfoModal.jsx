import {PaginatedList} from './Pagination.jsx';
import { formatServiceDuration } from './equipmentStatus.mjs';
import { useEffect, useRef, useState } from 'react';
import './EquipmentInfoModal.css';

const tabs=[['overview','基本資料'],['specification','技術規格'],['service','校驗保養'],['history','操作紀錄']];
const statusList=['使用中','待機中','維護中','校驗中','暫停中','借用'];
const show=value=>value===undefined || value===null || value==='' ? '—' : value;
function Fields({ rows }) {
  return <dl className="eq-profile-fields">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}</dl>;
}
function EquipmentIcon() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="10" y="5" width="28" height="37" rx="4"/><rect x="15" y="11" width="18" height="17" rx="2"/><path d="M18 34h8M14 43v2M34 43v2"/><circle cx="32" cy="34" r="1.5"/></svg>;
}
export default function EquipmentInfoModal({ equipment, onClose, onEdit, onStatusChange }) {
  const [tab,setTab]=useState('overview');
  const dialogRef=useRef(null);
  const closeRef=useRef(null);
  const eq=equipment;
  const records=eq.records || [];
  const utilization=Math.max(0,Math.min(100,Number(eq.utilization)||0));
  const prefix=`equipment-${eq.id.replace(/[^a-zA-Z0-9-]/g,'')}`;
  useEffect(()=>{
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus?.();};
  },[]);
  const keyboard=event=>{
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab'){
      const items=[...dialogRef.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')];
      const first=items[0],last=items.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
  };
  const tabKeys=(event,index)=>{
    let target;
    if(event.key==='ArrowRight')target=(index+1)%tabs.length;
    if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;
    if(event.key==='Home')target=0;
    if(event.key==='End')target=tabs.length-1;
    if(target!==undefined){event.preventDefault();setTab(tabs[target][0]);document.getElementById(`${prefix}-tab-${tabs[target][0]}`)?.focus();}
  };
  return <div className="request-modal-backdrop eq-profile-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}} onKeyDown={keyboard}>
    <section ref={dialogRef} className="eq-profile" role="dialog" aria-modal="true" aria-labelledby={`${prefix}-title`}>
      <header className="eq-profile-header"><div className="eq-profile-identity"><span className="eq-profile-icon"><EquipmentIcon /></span><div><div className="eq-profile-eyebrow">設備資訊 <span>/ {eq.id}</span></div><h2 id={`${prefix}-title`}>{eq.name}</h2><p>{show(eq.category)}<span>·</span>{show(eq.model)}</p></div></div><button ref={closeRef} type="button" className="eq-profile-close" aria-label="關閉設備資訊" onClick={onClose}>×</button></header>
      <div className="eq-profile-strip"><span className={`equipment-status equipment-status-${statusList.indexOf(eq.status)}`}>{eq.status}</span><span><i aria-hidden="true">⌖</i>{show(eq.location)}</span><span><i aria-hidden="true">◎</i>負責人：{show(eq.owner)}</span></div>
      <div className="eq-profile-tabs" role="tablist" aria-label="設備資訊分類">{tabs.map(([key,label],index)=><button type="button" key={key} id={`${prefix}-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`${prefix}-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={event=>tabKeys(event,index)}>{label}{key==='history' && <span>{records.length}</span>}</button>)}</div>
      <div className="eq-profile-body" role="tabpanel" id={`${prefix}-panel-${tab}`} aria-labelledby={`${prefix}-tab-${tab}`} tabIndex={0}>
        {tab==='overview' && <>
          <div className="eq-profile-metrics"><div><span>最大樣品數</span><strong>{show(eq.capacity)}<small>件</small></strong></div><div><span>每日可用時間</span><strong>{show(eq.dailyHours)}<small>小時</small></strong></div><div><span>本月使用率 <small>DEMO</small></span><strong>{utilization}<small>%</small></strong><div className="eq-profile-meter" role="meter" aria-label="本月使用率（示範）" aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization}><span style={{width:`${utilization}%`}} /></div></div></div>
          <section className="eq-profile-section"><div className="eq-profile-section-title"><h3>設備基本資料</h3><span>獨立設備台帳</span></div><Fields rows={[
            ['設備編號',eq.id],['設備名稱',eq.name],['設備分類',eq.category],['型號',eq.model],['製造商',eq.manufacturer],['設備序號',eq.serial],['購置日期',eq.purchasedAt],['目前委託',eq.currentRequest],['借用單號',eq.activeBorrowId],['借用人',eq.borrower],['預計歸還',eq.borrowReturnDate],['預估結束時間',eq.estimatedEnd?new Date(eq.estimatedEnd).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—'],
          ]}/></section>
          <div className="eq-profile-note"><strong>操作注意事項</strong><p>{show(eq.notes)}</p></div>
        </>}
        {tab==='specification' && <><section className="eq-profile-section"><div className="eq-profile-section-title"><h3>技術規格</h3><span>{eq.model || '設備規格'}</span></div><div className="eq-profile-specs">{String(eq.specification || '尚未填寫規格').split('；').map((value,index)=><div key={`${index}-${value}`}><span>{String(index+1).padStart(2,'0')}</span><p>{value}</p></div>)}</div></section><section className="eq-profile-section"><h3>使用配置</h3><Fields rows={[[ '最大樣品數',eq.capacity ? `${eq.capacity} 件` : '—'],['每日可用時數',eq.dailyHours ? `${eq.dailyHours} 小時` : '—'],['放置位置',eq.location],['設備負責人',eq.owner]]}/></section><p className="eq-profile-disclaimer">規格為 Demo 示範資料，正式使用請依設備原廠文件確認。</p></>}
        {tab==='service' && <>{eq.activeService && <div className="eq-profile-note"><strong>{eq.activeService.status} · 尚未結束</strong><p>開始時間：{eq.activeService.startedAt}</p><p>原因：{eq.activeService.reason}</p><p>開始操作人：{eq.activeService.actor}</p></div>}<div className="eq-profile-service-grid">{[['校驗管理','上次校驗',eq.lastCalibration,'下次校驗',eq.nextCalibration],['保養管理','上次保養',eq.lastMaintenance,'下次保養',eq.nextMaintenance]].map(([title,lastLabel,last,nextLabel,next])=><section className="eq-profile-service-card" key={title}><h3>{title}</h3><label>{nextLabel}</label><strong>{show(next)}</strong><p>{lastLabel}<span>{show(last)}</span></p></section>)}</div><section className="eq-profile-section"><h3>保養檢查重點</h3><p className="eq-profile-text">{show(eq.maintenancePlan)}</p></section><div className="eq-profile-note"><strong>目前狀態：{eq.status}</strong><p>{eq.status==='維護中'?'設備維護期間暫停使用。':eq.status==='校驗中'?'校驗完成並確認合格後才可使用。':'校驗與保養完成紀錄可於「操作紀錄」查看。'}</p></div></>}
        {tab==='history' && <section className="eq-profile-section"><div className="eq-profile-section-title"><h3>操作與維護紀錄</h3><span>{records.length} 筆紀錄</span></div>{eq.activeService && <div className="eq-profile-note"><strong>{eq.activeService.status} · 尚未結束</strong><p>開始時間：{eq.activeService.startedAt}</p><p>原因：{eq.activeService.reason}</p><p>開始操作人：{eq.activeService.actor}</p></div>}{records.length ? <PaginatedList items={records} resetKey={eq.id}>{page=><ol className="eq-profile-timeline">{page.map((record,index)=><li key={record.id || `${record.date}-${index}`}><div className="eq-profile-record-top"><strong>{record.type}</strong><time>{record.date}</time></div><p className="eq-profile-record-result">{record.result}</p><p>{record.detail}</p>{record.endedAt && <div className="eq-profile-service-period"><p>開始：{record.startedAt || '舊資料未記錄'}</p><p>結束：{record.endedAt}</p><p>持續時間：{formatServiceDuration(record.durationMs)}</p>{record.startReason && <p>開始原因：{record.startReason}</p>}{record.startedBy && <p>開始操作人：{record.startedBy}</p>}{record.requestId && <p>關聯委託：{record.requestId}</p>}</div>}<small>執行人：{show(record.actor)}</small></li>)}</ol>}</PaginatedList> : <div className="eq-profile-empty">目前尚無操作或維護紀錄。</div>}</section>}
      </div>
      <footer className="eq-profile-footer"><span>Demo 設備台帳 · {eq.id}</span><div><button type="button" className="template-btn secondary" onClick={onClose}>關閉</button>{onStatusChange&&<button type="button" className="template-btn secondary" onClick={onStatusChange}>狀態變更</button>}{onEdit&&<button type="button" className="template-btn" onClick={onEdit}>編輯設備資料</button>}</div></footer>
    </section>
  </div>;
}
