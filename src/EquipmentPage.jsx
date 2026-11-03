import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import HelpTip from './HelpTip.jsx';
import {returnBorrowEquipment} from './borrowApprovals.mjs';
import {PaginatedTable} from './Pagination.jsx';
import CategoryViews from './CategoryViews.jsx';
import EquipmentInfoModal from './EquipmentInfoModal.jsx';
import { changeEquipmentStatus } from './equipmentStatus.mjs';
import { useEffect, useState } from 'react';
import { DEMO_EQUIPMENT } from './demoEquipment.mjs';
import useDemoPersistence from './useDemoPersistence.js';
import './EquipmentPage.css';

const KEY = 'dqa-equipment-demo-v1';
const statuses = ['使用中','待機中','維護中','校驗中','暫停中','借用'];
function readEquipment() {
  try {
    const stored=JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return Array.isArray(stored) && stored.every(row => row?.id && row?.name) ? stored : DEMO_EQUIPMENT;
  } catch { return DEMO_EQUIPMENT; }
}

export default function EquipmentPage({ currentUser }) {
  const [equipment,setEquipment] = useState(readEquipment);
  const [status,setStatus] = useState('全部');
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('全部');
  const [selectedId,setSelectedId] = useState(null);
  const [form,setForm] = useState(null);
  const [formError,setFormError] = useState('');
  const [statusForm,setStatusForm] = useState(null);
  const [statusError,setStatusError] = useState('');
  const [notice,setNotice] = useState('');
  const statusEquipment=equipment.find(row=>row.id===statusForm?.id);
  const openStatusChange=(row)=>{setSelectedId(null);setForm(null);setStatusError('');setStatusForm({id:row?.id || '',expectedBorrowId:row?.activeBorrowId,status:row?.status==='維護中' || row?.status==='校驗中' || row?.status==='借用' ? '待機中' : '維護中',reason:''});};
  const submitStatusChange=event=>{
    event.preventDefault();
    try {
      const raw=window.localStorage.getItem(KEY);
      const current=raw ? JSON.parse(raw) : equipment;
      if (!Array.isArray(current)) throw Error('設備資料無法讀取，請重新載入後再試。');
      setEquipment(current);
      const borrowed=current.find(m=>m.id===statusForm.id)?.status==='借用';
      if(borrowed&&statusForm.status!=='待機中')throw Error('借用設備請先確認歸還。');
      const next=borrowed?returnBorrowEquipment({equipmentId:statusForm.id,expectedBorrowId:statusForm.expectedBorrowId,actorId:currentUser?.id,comment:statusForm.reason}):changeEquipmentStatus(current,{...statusForm,expectedStatus:statusEquipment?.status,actor:currentUser?.name,actorId:currentUser?.id});
      try {if(!borrowed)window.localStorage.setItem(KEY,JSON.stringify(next));}
      catch {throw Error('無法儲存設備狀態，請確認瀏覽器空間或權限後再試。');}
      setEquipment(next);
      setNotice((next.find(row=>row.id===statusForm.id)?.name || statusForm.id)+' 已變更為'+statusForm.status+(statusForm.status==='待機中'?'，完成紀錄已儲存。':'，已記錄開始時間。'));
      setStatusForm(null);
    } catch(error) {setStatusError(error.message || '狀態變更失敗，請重試。');}
  };
  const storage=useDemoPersistence(KEY,equipment);
  useEffect(()=>{
    const refresh=()=>setEquipment(readEquipment());
    const storage=event=>{if(event.key===KEY||event.key===null)refresh();};
    window.addEventListener('dqa:equipment-updated',refresh);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('dqa:equipment-updated',refresh);window.removeEventListener('storage',storage);};
  },[]);

  const selected=equipment.find(row=>row.id===selectedId);
  const categories=[...new Set(equipment.map(row=>row.category||'未分類'))];
  const visible=equipment.filter(row => (status==='全部' || row.status===status) && (category==='全部' || (row.category||'未分類')===category) && [row.id,row.name,row.category,row.model,row.serial,row.location,row.owner].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!selectedId && !form && !statusForm) return;
    const escape=event=>{if(event.key==='Escape'){setSelectedId(null);setForm(null);setStatusForm(null);}};
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[selectedId,form,statusForm]);
  const openEditor = row => {setFormError('');setSelectedId(null);setForm(row ? {...row} : {id:'',name:'',category:'溫度試驗',model:'',serial:'',location:'',owner:'',status:'待機中',specification:'',capacity:1,dailyHours:24,utilization:0,records:[]});};
  const save=event=>{
    event.preventDefault();
    if (![form.id,form.name,form.location,form.owner].every(value=>String(value||'').trim())) {setFormError('請填寫設備編號、名稱、位置及負責人。');return;}
    const id=form.id.trim();
    let latest;
    try { const raw=window.localStorage.getItem(KEY); latest=raw ? JSON.parse(raw) : equipment; if(!Array.isArray(latest)) throw Error('invalid'); } catch {setFormError('無法讀取設備資料，請重新載入後再試。');return;}
    const current=latest.find(row=>row.id===form.editingId);
    if(form.editingId && !current){setFormError('設備資料已更新，請重新開啟編輯。');return;}
    if (!form.editingId && latest.some(row=>row.id===id)) {setFormError('設備編號已存在，請使用獨立編號。');return;}
    const next={...current,...form,activeService:current?.activeService || null,currentRequest:current?.currentRequest || '',activeBorrowId:current?.activeBorrowId||null,borrower:current?.borrower||'',borrowReturnDate:current?.borrowReturnDate||'',status:form.editingId ? current.status : '待機中',records:current?.records || form.records,id,name:form.name.trim(),capacity:Number(form.capacity),usableVolumeLitres:form.usableVolumeLitres===null||form.usableVolumeLitres===undefined||String(form.usableVolumeLitres).trim()===''?null:Number(form.usableVolumeLitres),dailyHours:Number(form.dailyHours)};
    if(next.usableVolumeLitres!==null&&(!Number.isFinite(next.usableVolumeLitres)||next.usableVolumeLitres<=0)){setFormError('可用空間須為正數（L），未知時請留空。');return;}
    if (!Number.isInteger(next.capacity) || next.capacity<1 || next.dailyHours<=0 || next.dailyHours>24) {setFormError('樣品容量需為正整數，每日可用時數需大於 0 且不超過 24。');return;}
    delete next.editingId;
    const updated=form.editingId ? latest.map(row=>row.id===form.editingId ? next : row) : [...latest,next];
    try {window.localStorage.setItem(KEY,JSON.stringify(updated));} catch {setFormError('無法儲存設備資料，請確認瀏覽器空間或權限後再試。');return;}
    setEquipment(updated);
    setForm(null);setSelectedId(id);
  };
  const renderTable=items=>(<div className="template-table-wrap"><PaginatedTable resetKey={`${search}:${category}:${status}`} className="template-table"><thead><tr>{['設備編號','設備名稱／型號','分類','位置','負責人','狀態','下次校驗','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}><td><button type="button" className="request-id-link" onClick={()=>setSelectedId(row.id)}>{row.id}</button></td><td><strong>{row.name}</strong><small className="equipment-model">{row.model}</small></td><td>{row.category}</td><td>{row.location}</td><td>{row.owner}</td><td><span className={`equipment-status equipment-status-${statuses.indexOf(row.status)}`}>{row.status}</span></td><td>{row.nextCalibration || '—'}</td><td><button type="button" className="template-btn secondary" onClick={()=>setSelectedId(row.id)}>設備資訊</button></td></tr>)}</tbody></PaginatedTable>{!items.length && <div className="template-empty">沒有符合條件的設備</div>}</div>);
  return <section className="panel generic-page equipment-page"><div className="template-page">
    <header className="template-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="equipment"/>設備管理</h2><HelpTip>設備台帳、規格與校驗保養資訊</HelpTip></div></div><div className="equipment-header-actions"><button type="button" className="template-btn" onClick={()=>openEditor(null)}>＋ 新增設備</button><button type="button" className="template-btn secondary" onClick={openStatusChange}>＋ 狀態變更</button></div></header>
    {notice && <div role="status" className="template-notice">{notice}</div>}
    {storage.error && <div role="alert" className="template-notice">{storage.error}<button type="button" onClick={storage.retry}>重試儲存</button></div>}
    <div className="equipment-counts summary-tiles">{['全部',...statuses].map(value=><button type="button" key={value} className={`summary-tile ${status===value?'active':''}`} aria-pressed={status===value} onClick={()=>setStatus(value)}><i className="workspace-summary-icon" aria-hidden="true"><LmsSidebarIcon name="equipment"/></i><span>{value==='全部'?'設備總數':value}</span><strong>{value==='全部'?equipment.length:equipment.filter(row=>row.status===value).length}</strong></button>)}</div>
    <CategoryViews filterKey={`${search}:${category}:${status}`} rows={equipment} visibleRows={visible} renderTable={renderTable} kind="設備" toolbar={<div className="template-toolbar"><input className="template-input" type="search" aria-label="搜尋設備" placeholder="搜尋設備編號、名稱、型號、序號、位置或負責人…" value={search} onChange={event=>setSearch(event.target.value)}/><select className="template-select" aria-label="設備分類" value={category} onChange={event=>setCategory(event.target.value)}><option value="全部">全部分類</option>{categories.map(value=><option key={value}>{value}</option>)}</select><select className="template-select" aria-label="設備狀態" value={status} onChange={event=>setStatus(event.target.value)}><option>全部</option>{statuses.map(value=><option key={value}>{value}</option>)}</select></div>}/>
  </div>
  {selected && <EquipmentInfoModal key={selected.id} equipment={selected} onClose={()=>setSelectedId(null)} onEdit={()=>openEditor({...selected,editingId:selected.id})} onStatusChange={()=>openStatusChange(selected)} />}
  {form && <div className="request-modal-backdrop"><section className="request-modal equipment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-edit-title"><header className="request-modal-header"><h3 id="equipment-edit-title">{form.editingId?'編輯設備資料':'新增設備'}</h3><button type="button" className="request-modal-close" aria-label="關閉編輯" onClick={()=>setForm(null)}>×</button></header><form className="request-modal-body" onSubmit={save}><div className="equipment-form-grid">{[['設備編號','id'],['設備名稱','name'],['型號','model'],['設備序號','serial'],['位置','location'],['負責人','owner'],['製造商','manufacturer']].map(([label,key])=><label key={key}><span>{label}{['id','name','location','owner'].includes(key)&&<span className="required-mark" aria-hidden="true"> *</span>}</span><input className="template-input" value={form[key] || ''} required={['id','name','location','owner'].includes(key)} readOnly={key==='id' && Boolean(form.editingId)} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}<label>分類<input className="template-input" value={form.category} onChange={event=>setForm({...form,category:event.target.value})}/></label><label>狀態<input className="template-input" readOnly value={form.editingId ? form.status : "待機中"}/><small>請使用「狀態變更」調整設備狀態；新設備預設待機中。</small></label>{[['最大樣品數','capacity',1,999],['每日可用時數','dailyHours',0.5,24]].map(([label,key,min,max])=><label key={key}>{label}<input type="number" className="template-input" value={form[key]} min={min} max={max} step={key==='dailyHours'?0.5:1} required onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}<label>可用空間 L（選填）<input type="number" min="0.01" step="any" className="template-input" value={form.usableVolumeLitres??''} onChange={event=>setForm({...form,usableVolumeLitres:event.target.value})}/><small>Demo 容積限制，無法取代實際樣品尺寸與治具間距確認。</small></label>{[['下次校驗','nextCalibration'],['下次保養','nextMaintenance']].map(([label,key])=><label key={key}>{label}<input type="date" className="template-input" value={form[key] || ''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}</div>{[['技術規格','specification'],['保養檢查重點','maintenancePlan'],['操作注意事項／備註','notes']].map(([label,key])=><label className="equipment-text-field" key={key}>{label}<textarea rows={3} className="template-input" value={form[key] || ''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}{formError && <p role="alert">{formError}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" onClick={()=>setForm(null)}>取消</button><button type="submit" className="template-btn">儲存設備資料</button></div></form></section></div>}
  {statusForm && <div className="request-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setStatusForm(null);}}><section className="request-modal equipment-status-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-status-title">
    <header className="request-modal-header"><div><div className="help-title-row"><h3 id="equipment-status-title">設備狀態變更</h3><HelpTip>開始維護／校驗，完成後恢復待機</HelpTip></div></div><button type="button" className="request-modal-close" aria-label="關閉狀態變更" onClick={()=>setStatusForm(null)}>×</button></header>
    <form className="request-modal-body" onSubmit={submitStatusChange}>
      <p className="template-info">可選擇全部設備。開始維護或校驗時記錄起始時間，結束時請填寫處理結果，系統將保存完整紀錄。</p>
      <label className="equipment-text-field"><span>選擇設備 <span className="required-mark" aria-hidden="true">*</span></span><select className="template-select" required value={statusForm.id} onChange={event=>{setStatusError('');const row=equipment.find(item=>item.id===event.target.value);setStatusForm({...statusForm,id:event.target.value,expectedBorrowId:row?.activeBorrowId,status:row?.status==='維護中' || row?.status==='校驗中' || row?.status==='借用' ? '待機中' : '維護中'});}}><option value="">請選擇設備（{equipment.length} 台）</option>{equipment.map(row=><option key={row.id} value={row.id}>{row.id} · {row.name} · 【{row.status}】 · {row.location}</option>)}</select></label>
      {!equipment.length && <p role="status">目前沒有設備可供變更。</p>}
      {statusEquipment && <div className="equipment-transition-summary"><strong>{statusEquipment.name}</strong><p>負責人：{statusEquipment.owner} · 目前狀態：{statusEquipment.status}</p></div>}
      <label className="equipment-text-field"><span>變更為 <span className="required-mark" aria-hidden="true">*</span></span><select className="template-select" value={statusForm.status} onChange={event=>setStatusForm({...statusForm,status:event.target.value})}>{(statusEquipment?.status==='借用'?['待機中']:['待機中','維護中','校驗中']).filter(value=>value!==statusEquipment?.status).map(value=><option key={value} disabled={statusEquipment?.status==='使用中' && value==='校驗中'}>{value}{statusEquipment?.status==='使用中' && value==='校驗中' ? '（使用中不可校驗）' : ''}</option>)}</select></label>
      <label className="equipment-text-field"><span>{statusEquipment?.status==='維護中' || statusEquipment?.status==='校驗中' ? '完成處理結果／變更原因' : '變更原因'} <span className="required-mark" aria-hidden="true">*</span></span><textarea className="template-input" rows={3} required value={statusForm.reason} onChange={event=>setStatusForm({...statusForm,reason:event.target.value})} placeholder="例如：定期保養、異常檢查或年度校驗"/></label>
      <p className="equipment-result-count">操作者：{currentUser?.name || '未登入'} · 確認後自動記錄時間</p>
      {statusError && <p role="alert" className="equipment-status-error">{statusError}</p>}
      <div className="template-form-actions"><button type="button" className="template-btn secondary" onClick={()=>setStatusForm(null)}>取消</button><button type="submit" className="template-btn" disabled={!statusEquipment || statusEquipment.status===statusForm.status || !statusForm.reason.trim() || !currentUser?.id}>確認變更</button></div>
    </form>
  </section></div>}
  </section>;
}
