import {PaginatedList} from './Pagination.jsx';
import { useEffect,useRef,useState } from 'react';
import './EquipmentInfoModal.css';
import './MaterialsPage.css';

const tabs=[['overview','基本資料'],['specification','規格與庫存'],['history','操作紀錄']];
const show=value=>value===undefined || value===null || value===''?'—':value;
export default function MaterialInfoModal({material,onClose,onEdit,onStatusChange}) {
  const [tab,setTab]=useState('overview');
  const ref=useRef(null),close=useRef(null);
  const records=material.records || [];
  useEffect(()=>{const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus?.();};},[]);
  const keyboard=event=>{
    if(event.key==='Escape'){event.stopPropagation();onClose();}
    if(event.key==='Tab'){
      const elements=[...ref.current.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
      if(event.shiftKey && document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}
      else if(!event.shiftKey && document.activeElement===elements.at(-1)){event.preventDefault();elements[0]?.focus();}
    }
  };
  const fields=tab==='overview' ? [['物料編號',material.id],['物料名稱',material.name],['分類',material.category],['型號／料號',material.model],['供應商',material.manufacturer],['序號／批號',material.serial],['購置日期',material.purchasedAt],['存放位置',material.location],['負責人',material.owner],['排程占用','不占用排程']] : [['總數量',`${material.quantity} ${material.unit}`],['可用數量',`${material.available} ${material.unit}`],['安全庫存',`${material.minStock} ${material.unit}`],['計量單位',material.unit]];
  return <div className="request-modal-backdrop" onKeyDown={keyboard} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={ref} className="eq-profile material-profile" role="dialog" aria-modal="true" aria-labelledby="material-info-title">
    <header className="eq-profile-header"><div className="eq-profile-identity"><span className="eq-profile-icon" aria-hidden="true">▧</span><div><div className="eq-profile-eyebrow">物料資訊 <span>/ {material.id}</span></div><h2 id="material-info-title">{material.name}</h2><p>{material.category}<span>·</span>{material.model || '未設定型號'}</p></div></div><button ref={close} type="button" className="eq-profile-close" aria-label="關閉物料資訊" onClick={onClose}>×</button></header>
    <div className="eq-profile-strip"><span className="material-status" data-status={material.status}>{material.status}</span><span>{material.location}</span><span>負責人：{material.owner}</span><span>不占用排程</span></div>
    <div className="eq-profile-tabs" role="tablist" aria-label="物料資訊分類">{tabs.map(([key,label],index)=><button type="button" key={key} id={`material-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`material-panel-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(next!==undefined){event.preventDefault();setTab(tabs[next][0]);document.getElementById(`material-tab-${tabs[next][0]}`)?.focus();}}}>{label}{key==='history'&&<span>{records.length}</span>}</button>)}</div>
    <div className="eq-profile-body" role="tabpanel" id={`material-panel-${tab}`} aria-labelledby={`material-tab-${tab}`} tabIndex={0}>
      {tab!=='history' && <><div className="eq-profile-metrics"><div><span>總數量</span><strong>{material.quantity}<small>{material.unit}</small></strong></div><div><span>可用數量</span><strong>{material.available}<small>{material.unit}</small></strong></div><div><span>安全庫存</span><strong>{material.minStock}<small>{material.unit}</small></strong></div></div><section className="eq-profile-section"><h3>{tab==='overview'?'物料基本資料':'庫存資訊'}</h3><dl className="eq-profile-fields">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}</dl></section>{tab==='specification' && <section className="eq-profile-section"><h3>規格說明</h3><p className="eq-profile-text">{show(material.specification)}</p></section>}<div className="eq-profile-note"><strong>{tab==='overview'?'使用備註':'庫存提示'}</strong><p>{tab==='overview'?show(material.notes):material.available<material.minStock?'可用數量低於安全庫存，請確認補料需求。':'可用數量未低於安全庫存。'}</p></div></>}
      {tab==='history' && <section className="eq-profile-section"><h3>物料操作紀錄</h3>{material.historyLimited&&<p>此處顯示最近異動，完整紀錄保留於資料庫。</p>}{records.length?<PaginatedList items={records} resetKey={material.id}>{page=><ol className="eq-profile-timeline">{page.map((record,index)=><li key={record.id||index}><div className="eq-profile-record-top"><strong>{record.type}</strong><time>{record.date}</time></div><p className="eq-profile-record-result">{record.result}</p><p>{record.detail}</p><small>操作者：{record.actor}</small></li>)}</ol>}</PaginatedList>:<p>尚無紀錄</p>}</section>}
    </div>
    <footer className="eq-profile-footer"><span>物料台帳 · {material.id}</span><div><button type="button" className="template-btn secondary" onClick={onClose}>關閉</button>{onStatusChange&&<button type="button" className="template-btn secondary" onClick={onStatusChange}>狀態變更</button>}{onEdit&&<button type="button" className="template-btn" onClick={onEdit}>編輯物料資料</button>}</div></footer>
  </section></div>;
}
