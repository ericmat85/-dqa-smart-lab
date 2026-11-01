import HelpTip from './HelpTip.jsx';
import {PaginatedTable} from './Pagination.jsx';
import CategoryViews from './CategoryViews.jsx';
import {useEffect,useState} from 'react';
import {DEMO_MATERIALS,MATERIAL_KEY,MATERIAL_STATUSES,changeMaterialStatus} from './demoMaterials.mjs';
import MaterialInfoModal from './MaterialInfoModal.jsx';
import './EquipmentPage.css';
import './MaterialsPage.css';

function readInitial() {
  try {const rows=JSON.parse(window.localStorage.getItem(MATERIAL_KEY)||'null');return Array.isArray(rows)&&rows.every(row=>row?.id&&row?.name)?rows:DEMO_MATERIALS;}catch{return DEMO_MATERIALS;}
}
export default function MaterialsPage({currentUser}) {
  const [rows,setRows]=useState(readInitial);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('全部');
  const [category,setCategory]=useState('全部');
  const [selectedId,setSelectedId]=useState(null);
  const [form,setForm]=useState(null);
  const [statusForm,setStatusForm]=useState(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const selected=rows.find(row=>row.id===selectedId);
  const statusMaterial=rows.find(row=>row.id===statusForm?.id);
  const categories=[...new Set(rows.map(row=>row.category))];
  const visible=rows.filter(row=>(status==='全部'||row.status===status)&&(category==='全部'||row.category===category)&&[row.id,row.name,row.model,row.serial,row.location,row.owner].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(()=>{if(!form&&!statusForm)return;const close=event=>{if(event.key==='Escape'){setForm(null);setStatusForm(null);}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[form,statusForm]);
  const latest=()=>{
    const data=window.localStorage.getItem(MATERIAL_KEY);
    const current=data?JSON.parse(data):rows;
    if(!Array.isArray(current))throw Error('物料資料無法讀取，請重新載入。');
    return current;
  };
  const persist=next=>{try{window.localStorage.setItem(MATERIAL_KEY,JSON.stringify(next));}catch{throw Error('儲存失敗，請確認瀏覽器儲存空間與權限後重試。');}setRows(next);};
  const openEditor=row=>{setError('');setSelectedId(null);setStatusForm(null);setForm(row?{...row,editingId:row.id}:{id:'',name:'',category:'物料耗材',model:'',serial:'',manufacturer:'',quantity:1,available:1,minStock:0,unit:'件',location:'',owner:currentUser?.name||'',status:'可用',specification:'',notes:'',records:[]});};
  const openStatus=row=>{setError('');setSelectedId(null);setForm(null);setStatusForm({id:row?.id||'',status:MATERIAL_STATUSES.find(value=>value!==row?.status)||'可用',reason:''});};
  const save=event=>{
    event.preventDefault();
    try {
      if(!currentUser?.id)throw Error('請重新登入後再操作。');
      const current=latest(),original=current.find(row=>row.id===form.editingId);
      if(form.editingId&&!original)throw Error('此物料已更新，請重新開啟編輯。');
      const id=form.id.trim();
      if(![id,form.name,form.location,form.owner,form.unit,form.category].every(value=>String(value||'').trim()))throw Error('請填寫編號、名稱、分類、位置、負責人與單位。');
      if(!form.editingId&&current.some(row=>row.id===id))throw Error('物料編號已存在，請使用獨立編號。');
      const quantity=Number(form.quantity),available=Number(form.available),minStock=Number(form.minStock);
      if(![quantity,available,minStock].every(value=>Number.isFinite(value)&&value>=0)||available>quantity)throw Error('數量需為非負數，可用數量不可超過總數量。');
      const date=new Date().toISOString();
      const next={...original,...form,id,name:form.name.trim(),quantity,available,minStock,status:original?.status||'可用',records:[{id:crypto.randomUUID(),date,type:original?'資料更新':'新增物料',actor:currentUser.name,actorId:currentUser.id,result:original?'物料資料已更新':'建立物料台帳',detail:`總數量 ${quantity} ${form.unit}；可用 ${available} ${form.unit}；安全庫存 ${minStock} ${form.unit}`},...(original?.records||[])]};
      delete next.editingId;
      persist(original?current.map(row=>row.id===original.id?next:row):[...current,next]);
      setForm(null);setSelectedId(id);setNotice('物料資料已儲存。');
    }catch(cause){setError(cause.message||'儲存失敗，請重試。');}
  };
  const saveStatus=event=>{
    event.preventDefault();
    try {
      const current=latest();setRows(current);
      const next=changeMaterialStatus(current,{...statusForm,actor:currentUser?.name,actorId:currentUser?.id});
      persist(next);setNotice(`${statusForm.id} 已變更為${statusForm.status}，紀錄已儲存。`);setStatusForm(null);
    }catch(cause){setError(cause.message||'變更失敗，請重試。');}
  };
  const catalogToolbar=(<div className="template-toolbar"><input className="template-input" type="search" aria-label="搜尋物料" placeholder="搜尋物料編號、名稱、料號、序號、位置或負責人…" value={search} onChange={event=>setSearch(event.target.value)}/><select className="template-select" aria-label="物料分類" value={category} onChange={event=>setCategory(event.target.value)}><option value="全部">全部分類</option>{categories.map(value=><option key={value}>{value}</option>)}</select><select className="template-select" aria-label="物料狀態" value={status} onChange={event=>setStatus(event.target.value)}><option>全部</option>{MATERIAL_STATUSES.map(value=><option key={value}>{value}</option>)}</select></div>);
  const renderTable=items=>(<div className="template-table-wrap"><PaginatedTable resetKey={`${search}:${category}:${status}`} className="template-table"><thead><tr>{['物料編號','物料名稱／料號','分類','可用／總數量','位置','負責人','狀態','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}><td><button type="button" className="request-id-link" onClick={()=>setSelectedId(row.id)}>{row.id}</button></td><td><strong>{row.name}</strong><small className="equipment-model">{row.model}</small></td><td>{row.category}</td><td><span className={row.available<row.minStock?'material-low-stock':''}>{row.available}／{row.quantity} {row.unit}</span>{row.available<row.minStock&&<small className="equipment-model">低於安全庫存 {row.minStock} {row.unit}</small>}</td><td>{row.location}</td><td>{row.owner}</td><td><span className="material-status" data-status={row.status}>{row.status}</span></td><td><button type="button" className="template-btn secondary" onClick={()=>setSelectedId(row.id)}>物料資訊</button></td></tr>)}</tbody></PaginatedTable>{!items.length&&<div className="template-empty">沒有符合條件的物料</div>}</div>);
  return <section className="panel generic-page equipment-page materials-page"><div className="template-page">
    <header className="template-heading"><div><div className="help-title-row"><h2>物料管理</h2><HelpTip>管理實驗室耗材、完檢機、工具與治具</HelpTip></div></div><div className="equipment-header-actions"><button type="button" className="template-btn" onClick={()=>openEditor(null)}>＋ 新增物料</button><button type="button" className="template-btn secondary" onClick={()=>openStatus(null)}>＋ 狀態變更</button></div></header>
    {notice&&<div className="template-notice" role="status">{notice}</div>}
    <div className="equipment-counts material-counts summary-tiles">{['全部',...MATERIAL_STATUSES].map(value=><button type="button" key={value} className={`summary-tile ${status===value?'active':''}`} aria-pressed={status===value} onClick={()=>setStatus(value)}><span>{value==='全部'?'物料品項':value}</span><strong>{value==='全部'?rows.length:rows.filter(row=>row.status===value).length}</strong></button>)}</div>

    <CategoryViews filterKey={`${search}:${category}:${status}`} rows={rows} visibleRows={visible} renderTable={renderTable} kind="物料" toolbar={catalogToolbar}/>
  </div>
  {selected&&<MaterialInfoModal key={selected.id} material={selected} onClose={()=>setSelectedId(null)} onEdit={()=>openEditor(selected)} onStatusChange={()=>openStatus(selected)}/>}
  {form&&<div className="request-modal-backdrop"><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="material-edit-title"><header className="request-modal-header"><h3 id="material-edit-title">{form.editingId?'編輯物料資料':'新增物料'}</h3><button type="button" className="request-modal-close" aria-label="關閉物料編輯" onClick={()=>setForm(null)}>×</button></header><form className="request-modal-body" onSubmit={save}><div className="equipment-form-grid">{[['物料編號','id'],['物料名稱','name'],['分類','category'],['型號／料號','model'],['序號／批號','serial'],['供應商','manufacturer'],['位置','location'],['負責人','owner'],['單位','unit']].map(([label,key])=><label key={key}><span>{label}{['id','name','category','location','owner','unit'].includes(key)&&<span className="required-mark" aria-hidden="true"> *</span>}</span><input className="template-input" required={['id','name','category','location','owner','unit'].includes(key)} readOnly={key==='id'&&Boolean(form.editingId)} value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}{[['總數量','quantity'],['可用數量','available'],['安全庫存','minStock']].map(([label,key])=><label key={key}><span>{label} <span className="required-mark" aria-hidden="true">*</span></span><input className="template-input" type="number" step="any" min="0" required value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}<label>狀態<input className="template-input" readOnly value={form.status}/><small>狀態可透過「狀態變更」自由切換。</small></label><label>購置日期<input type="date" className="template-input" value={form.purchasedAt||''} onChange={event=>setForm({...form,purchasedAt:event.target.value})}/></label></div>{[['規格說明','specification'],['備註','notes']].map(([label,key])=><label className="equipment-text-field" key={key}>{label}<textarea rows={3} className="template-input" value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}{error&&<p role="alert" className="equipment-status-error">{error}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" onClick={()=>setForm(null)}>取消</button><button type="submit" className="template-btn">儲存物料資料</button></div></form></section></div>}
  {statusForm&&<div className="request-modal-backdrop"><section className="request-modal equipment-status-modal" role="dialog" aria-modal="true" aria-labelledby="material-status-title"><header className="request-modal-header"><div><div className="help-title-row"><h3 id="material-status-title">物料狀態變更</h3><HelpTip>可從任何狀態切換，不影響設備排程</HelpTip></div></div><button type="button" className="request-modal-close" aria-label="關閉物料狀態變更" onClick={()=>setStatusForm(null)}>×</button></header><form className="request-modal-body" onSubmit={saveStatus}><label className="equipment-text-field"><span>選擇物料 <span className="required-mark" aria-hidden="true">*</span></span><select className="template-select" required value={statusForm.id} onChange={event=>{const row=rows.find(item=>item.id===event.target.value);setError('');setStatusForm({...statusForm,id:event.target.value,status:MATERIAL_STATUSES.find(value=>value!==row?.status)||'可用'});}}><option value="">請選擇物料（{rows.length} 筆）</option>{rows.map(row=><option key={row.id} value={row.id}>{row.id} · {row.name} · 【{row.status}】</option>)}</select></label><label className="equipment-text-field"><span>變更為 <span className="required-mark" aria-hidden="true">*</span></span><select className="template-select" value={statusForm.status} onChange={event=>setStatusForm({...statusForm,status:event.target.value})}>{MATERIAL_STATUSES.filter(value=>value!==statusMaterial?.status).map(value=><option key={value}>{value}</option>)}</select></label><label className="equipment-text-field"><span>變更原因 <span className="required-mark" aria-hidden="true">*</span></span><textarea className="template-input" rows={3} required value={statusForm.reason} onChange={event=>setStatusForm({...statusForm,reason:event.target.value})}/></label><p className="equipment-result-count">操作者：{currentUser?.name||'未登入'} · 變更不會自動調整庫存數量</p>{error&&<p role="alert" className="equipment-status-error">{error}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" onClick={()=>setStatusForm(null)}>取消</button><button type="submit" className="template-btn" disabled={!statusMaterial||!statusForm.reason.trim()||!currentUser?.id}>確認變更</button></div></form></section></div>}
  </section>;
}
