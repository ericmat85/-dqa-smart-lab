import {IconAction} from './ActionIcon.jsx';
import ResourceDeleteDialog from './ResourceDeleteDialog.jsx';
import useResourceMutation from './useResourceMutation.js';
import ResourceOperationNotice from './ResourceOperationNotice.jsx';
import MaterialChangeDialog from './MaterialChangeDialog.jsx';
import ResourceStockDialog from './ResourceStockDialog.jsx';
import {resourceCommand,materialPayload,MATERIAL_STATES} from './resourceCommands.mjs';
import {originalBusinessEnabled,resourceCan,appStorage} from './originalBusiness.mjs';
import LmsHeaderActionLabel from './LmsHeaderActionLabel.jsx';
import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import InventorySummaryIcon from './InventorySummaryIcon.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import MaterialBorrowReturns from './MaterialBorrowReturns.jsx';
import useLabSnapshot,{refreshLabSnapshot} from './useLabSnapshot.js';
import HelpTip from './HelpTip.jsx';
import {PaginatedTable} from './Pagination.jsx';
import CategoryViews from './CategoryViews.jsx';
import {useEffect,useState} from 'react';
import {MATERIAL_KEY,MATERIAL_STATUSES,changeMaterialStatus} from './demoMaterials.mjs';
import MaterialInfoModal from './MaterialInfoModal.jsx';
import './EquipmentPage.css';
import './MaterialsPage.css';

export default function MaterialsPage({currentUser,system='lms'}) {
  const connected=originalBusinessEnabled(),operation=useResourceMutation(),canManage=!connected||resourceCan('materials.manage'),canAdjust=connected&&resourceCan('materials.adjust');
  const [stockOpen,setStockOpen]=useState(false),[changeRow,setChangeRow]=useState(undefined),[deleteRow,setDeleteRow]=useState(null);
  const snapshot=useLabSnapshot(),rows=snapshot.materials;
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('可用');
  const [selectedId,setSelectedId]=useState(null);
  const [form,setForm]=useState(null);
  const [statusForm,setStatusForm]=useState(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const selected=rows.find(row=>row.id===selectedId);
  const statusMaterial=rows.find(row=>row.id===statusForm?.id);
  const visible=rows.filter(row=>(status==='全部'||row.status===status)&&[row.id,row.name,row.category,row.model,row.serial,row.location,row.owner,row.status].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(()=>{if(!form&&!statusForm)return;const close=event=>{if(event.key==='Escape'&&!operation.busy){setForm(null);setStatusForm(null);}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[form,statusForm,operation.busy]);
  const latest=()=>{
    const data=appStorage().getItem(MATERIAL_KEY);
    const current=data?JSON.parse(data):rows;
    if(!Array.isArray(current))throw Error('物料資料無法讀取，請重新載入。');
    return current;
  };
  const persist=next=>{try{appStorage().setItem(MATERIAL_KEY,JSON.stringify(next));}catch{throw Error('儲存失敗，請確認瀏覽器儲存空間與權限後重試。');}refreshLabSnapshot();};
  const openEditor=row=>{if(!canManage||operation.locked)return;operation.resetMessages();setError('');setSelectedId(null);setStatusForm(null);setForm(row?{...row,reason:'',editingId:row.id,stockSnapshot:{quantity:row.quantity,available:row.available,unit:row.unit}}:{id:'',name:'',category:'物料耗材',model:'',serial:'',manufacturer:'',quantity:connected&&!canAdjust?0:1,available:connected&&!canAdjust?0:1,minStock:0,unit:'件',location:'',owner:currentUser?.name||'',status:'可用',specification:'',notes:'',records:[]});};
  const openStatus=row=>{if(!(canManage||canAdjust)||operation.locked)return;if(system==='lms'){operation.resetMessages();setSelectedId(null);setChangeRow(row||null);return;}operation.resetMessages();setError('');setSelectedId(null);setForm(null);setStatusForm({id:row?.id||'',sourceRevision:row?.sourceRevision,status:MATERIAL_STATUSES.find(value=>value!==row?.status)||'可用',reason:''});};
  const save=async event=>{
    event.preventDefault();
    try {
      if(!currentUser?.id)throw Error('請重新登入後再操作。');
      const current=latest(),original=current.find(row=>row.id===form.editingId);
      if(form.editingId&&!original)throw Error('此物料已更新，請重新開啟編輯。');
      if(original&&form.stockSnapshot&&(Number(form.stockSnapshot.quantity)!==Number(original.quantity)||Number(form.stockSnapshot.available)!==Number(original.available)||form.stockSnapshot.unit!==original.unit))throw Error('物料庫存已更新，請重新開啟編輯。');
      const id=form.id.trim();
      if(![id,form.name,form.location,form.owner,form.unit,form.category].every(value=>String(value||'').trim()))throw Error('請填寫編號、名稱、分類、位置、負責人與單位。');
      if(!form.editingId&&current.some(row=>row.id===id))throw Error('物料編號已存在，請使用獨立編號。');
      const quantity=Number(form.quantity),available=Number(form.available),minStock=Number(form.minStock);
      if(original?.activeBorrowIds?.length&&(quantity!==Number(original.quantity)||available!==Number(original.available)||form.unit!==original.unit))throw Error('此物料尚有借出紀錄，請先完成歸還；借出期間不可直接修改庫存數量或單位。');
      if(![quantity,available,minStock].every(value=>Number.isFinite(value)&&value>=0)||available>quantity)throw Error('數量需為非負數，可用數量不可超過總數量。');
      if(connected){if(await operation.submit(resourceCommand('material','save',form.editingId,materialPayload(form),{expectedRevision:form.sourceRevision||0}),'物料資料與庫存異動紀錄已儲存。')){setForm(null);setSelectedId(id);}return;}
      const date=new Date().toISOString();
      const next={...original,...form,id,name:form.name.trim(),quantity,available,minStock,status:original?.status||'可用',records:[{id:crypto.randomUUID(),date,type:original?'資料更新':'新增物料',actor:currentUser.name,actorId:currentUser.id,result:original?'物料資料已更新':'建立物料台帳',detail:`總數量 ${quantity} ${form.unit}；可用 ${available} ${form.unit}；安全庫存 ${minStock} ${form.unit}`},...(original?.records||[])]};
      delete next.editingId;delete next.stockSnapshot;if(original)next.activeBorrowIds=original.activeBorrowIds||[];
      persist(original?current.map(row=>row.id===original.id?next:row):[...current,next]);
      setForm(null);setSelectedId(id);setNotice('物料資料已儲存。');
    }catch(cause){setError(cause.message||'儲存失敗，請重試。');}
  };
  const saveStatus=async event=>{
    event.preventDefault();
    try {
      if(connected){if(await operation.submit(resourceCommand('material','status',statusForm.id,{status:MATERIAL_STATES[statusForm.status],reason:statusForm.reason},{expectedRevision:statusForm.sourceRevision}),'物料狀態已儲存。'))setStatusForm(null);return;}
      const current=latest();
      const next=changeMaterialStatus(current,{...statusForm,actor:currentUser?.name,actorId:currentUser?.id});
      persist(next);setNotice(`${statusForm.id} 已變更為${statusForm.status}，紀錄已儲存。`);setStatusForm(null);
    }catch(cause){setError(cause.message||'變更失敗，請重試。');}
  };
  const catalogToolbar=<CatalogSearchToolbar kind="物料" value={search} onChange={setSearch} onClear={()=>{setSearch('');setStatus('全部');}}/>;
  const renderTable=items=>(<div className="template-table-wrap"><PaginatedTable resetKey={`${search}:${status}`} className="template-table"><thead><tr>{['物料編號','物料名稱／料號','分類','可用／總數量',...(system==='lms'?['單位']:[]),'位置','負責人','狀態','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}><td><button type="button" className="request-id-link" onClick={()=>setSelectedId(row.id)}>{row.id}</button></td><td><strong>{row.name}</strong><small className="equipment-model">{row.model}</small></td><td>{row.category}</td><td><span className={row.available<row.minStock?'material-low-stock':''}>{row.available}／{row.quantity} {system!=='lms'&&row.unit}</span>{row.available<row.minStock&&<small className="equipment-model">低於安全庫存 {row.minStock} {row.unit}</small>}</td>{system==='lms'&&<td>{row.unit||'—'}</td>}<td>{row.location}</td><td>{row.owner}</td><td><span className="material-status" data-status={row.status}>{row.status}</span></td><td>{system==='lms'?<div className="resource-row-actions"><IconAction icon="info" label="物料資訊" onClick={()=>setSelectedId(row.id)}/>{canManage&&connected&&<IconAction icon="delete" label="刪除此物料" danger disabled={operation.locked} onClick={()=>{operation.resetMessages();setDeleteRow(row);}}/>}</div>:<button type="button" className="template-btn secondary" onClick={()=>setSelectedId(row.id)}>物料資訊</button>}</td></tr>)}</tbody></PaginatedTable>{!items.length&&<div className="template-empty">沒有符合條件的物料</div>}</div>);
  return <section className="panel generic-page equipment-page materials-page"><div className="template-page">
    <header className="template-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="maintenance"/>物料管理</h2><HelpTip>管理實驗室耗材、完檢機、工具與治具</HelpTip></div></div><div className="equipment-header-actions">{system!=='lms'&&canAdjust&&<button type="button" className="template-btn secondary" disabled={operation.locked} onClick={()=>{setStockOpen(true);operation.resetMessages();}}><LmsHeaderActionLabel icon="stock-adjust">庫存異動</LmsHeaderActionLabel></button>}<button type="button" className="template-btn" disabled={!canManage||operation.locked} onClick={()=>openEditor(null)}><LmsHeaderActionLabel icon="material-add">＋ 新增物料</LmsHeaderActionLabel></button><button type="button" className="template-btn secondary" disabled={!(canManage||canAdjust)||operation.locked} onClick={()=>openStatus(null)}><LmsHeaderActionLabel icon="status-change">{system==='lms'?'物料異動':'＋ 狀態變更'}</LmsHeaderActionLabel></button></div></header>
    {!form&&!statusForm&&!stockOpen&&<ResourceOperationNotice operation={operation}/>}
    {notice&&<div className="template-notice" role="status">{notice}</div>}
    <MaterialBorrowReturns currentUser={currentUser} onReturned={()=>{setNotice('物料已確認歸還，可用數量已補回。');}}/><div className="equipment-counts material-counts summary-tiles">{MATERIAL_STATUSES.map(value=><button type="button" key={value} className={`summary-tile ${status===value?'active':''}`} aria-pressed={status===value} onClick={()=>setStatus(current=>current===value?'全部':value)}><InventorySummaryIcon kind="materials" status={value}/><span>{value}</span><strong>{rows.filter(row=>row.status===value).length}</strong></button>)}</div>

    <CategoryViews filterKey={`${search}:${status}`} rows={rows} visibleRows={visible} renderTable={renderTable} kind="物料" toolbar={catalogToolbar}/>
  </div>
  {selected&&<MaterialInfoModal key={selected.id} material={selected} onClose={()=>setSelectedId(null)} onEdit={canManage?()=>openEditor(selected):undefined} statusActionLabel={system==='lms'?'物料異動':'狀態變更'} onStatusChange={canManage||system==='lms'&&canAdjust?()=>openStatus(selected):undefined}/>}
  {deleteRow&&<ResourceDeleteDialog kind="material" row={deleteRow} operation={operation} onClose={()=>setDeleteRow(null)}/>}
  {changeRow!==undefined&&<MaterialChangeDialog rows={rows} initialRow={changeRow} operation={operation} canManage={canManage} canAdjust={canAdjust} onClose={()=>setChangeRow(undefined)} onLocalChange={(selected,change)=>{persist(changeMaterialStatus(latest(),{id:selected.id,status:change.status,reason:change.reason,actor:currentUser?.name,actorId:currentUser?.id}));setNotice('物料異動已儲存。');}}/>}
  {stockOpen&&<ResourceStockDialog rows={rows} operation={operation} onClose={()=>setStockOpen(false)}/>}
  {form&&<div className="request-modal-backdrop"><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="material-edit-title"><header className="request-modal-header"><h3 id="material-edit-title">{form.editingId?'編輯物料資料':'新增物料'}</h3><button type="button" className="request-modal-close" aria-label="關閉物料編輯" disabled={operation.busy} onClick={()=>setForm(null)}>×</button></header><form className="request-modal-body" onSubmit={save}><div className="equipment-form-grid">{[['物料編號','id'],['物料名稱','name'],['分類','category'],['型號／料號','model'],['序號／批號','serial'],['供應商','manufacturer'],['位置','location'],['負責人','owner'],['單位','unit']].map(([label,key])=><label key={key}><span>{label}{['id','name','category','location','owner','unit'].includes(key)&&<span className="required-mark" aria-hidden="true"> *</span>}</span><input disabled={operation.locked} className="template-input" required={['id','name','category','location','owner','unit'].includes(key)} readOnly={(key==='id'&&Boolean(form.editingId))||(key==='unit'&&Boolean(form.activeBorrowIds?.length))} value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}{[['總數量','quantity'],['可用數量','available'],['安全庫存','minStock']].map(([label,key])=><label key={key}><span>{label} <span className="required-mark" aria-hidden="true">*</span></span><input disabled={operation.locked} className="template-input" type="number" step="any" min="0" required readOnly={connected&&!canAdjust&&key!=='minStock'||Boolean(form.activeBorrowIds?.length)&&key!=='minStock'} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}<label>狀態<input disabled={operation.locked} className="template-input" readOnly value={form.status}/><small>狀態可透過「物料異動」調整。</small></label><label>購置日期<input disabled={operation.locked} type="date" className="template-input" value={form.purchasedAt||''} onChange={event=>setForm({...form,purchasedAt:event.target.value})}/></label></div>{[['規格說明','specification'],['備註','notes']].map(([label,key])=><label className="equipment-text-field" key={key}>{label}<textarea disabled={operation.locked} rows={3} className="template-input" value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}{connected&&<label className="equipment-text-field">異動原因<textarea disabled={operation.locked} aria-label="物料異動原因" className="template-input" required rows={2} maxLength={1000} value={form.reason||''} onChange={e=>setForm({...form,reason:e.target.value})}/></label>}<ResourceOperationNotice operation={operation} onSaved={()=>setForm(null)}/>{error&&<p role="alert" className="equipment-status-error">{error}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" disabled={operation.busy} onClick={()=>setForm(null)}>取消</button><button type="submit" disabled={operation.locked} className="template-btn">儲存物料資料</button></div></form></section></div>}
  {statusForm&&<div className="request-modal-backdrop"><section className="request-modal equipment-status-modal" role="dialog" aria-modal="true" aria-labelledby="material-status-title"><header className="request-modal-header"><div><div className="help-title-row"><h3 id="material-status-title">物料狀態變更</h3><HelpTip>可從任何狀態切換，不影響設備排程</HelpTip></div></div><button type="button" className="request-modal-close" aria-label="關閉物料狀態變更" disabled={operation.busy} onClick={()=>setStatusForm(null)}>×</button></header><form className="request-modal-body" onSubmit={saveStatus}><label className="equipment-text-field"><span>選擇物料 <span className="required-mark" aria-hidden="true">*</span></span><select disabled={operation.locked} className="template-select" required value={statusForm.id} onChange={event=>{const row=rows.find(item=>item.id===event.target.value);setError('');setStatusForm({...statusForm,id:event.target.value,sourceRevision:row?.sourceRevision,status:MATERIAL_STATUSES.find(value=>value!==row?.status)||'可用'});}}><option value="">請選擇物料（{rows.length} 筆）</option>{rows.map(row=><option key={row.id} value={row.id}>{row.id} · {row.name} · 【{row.status}】</option>)}</select></label><label className="equipment-text-field"><span>變更為 <span className="required-mark" aria-hidden="true">*</span></span><select disabled={operation.locked} className="template-select" value={statusForm.status} onChange={event=>setStatusForm({...statusForm,status:event.target.value})}>{MATERIAL_STATUSES.filter(value=>value!==statusMaterial?.status&&(!connected||value!=='借出')).map(value=><option key={value}>{value}</option>)}</select></label><label className="equipment-text-field"><span>變更原因 <span className="required-mark" aria-hidden="true">*</span></span><textarea disabled={operation.locked} className="template-input" rows={3} required value={statusForm.reason} onChange={event=>setStatusForm({...statusForm,reason:event.target.value})}/></label><p className="equipment-result-count">操作者：{currentUser?.name||'未登入'} · 變更不會自動調整庫存數量</p><ResourceOperationNotice operation={operation} onSaved={()=>setStatusForm(null)}/>{error&&<p role="alert" className="equipment-status-error">{error}</p>}<div className="template-form-actions"><button type="button" className="template-btn secondary" disabled={operation.busy} onClick={()=>setStatusForm(null)}>取消</button><button type="submit" className="template-btn" disabled={operation.locked||!statusMaterial||!statusForm.reason.trim()||!currentUser?.id}>確認變更</button></div></form></section></div>}
  </section>;
}
