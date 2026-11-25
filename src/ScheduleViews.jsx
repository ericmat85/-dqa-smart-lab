import {ActionTable} from './tableActionIcons.jsx';
import ActionIcon from './ActionIcon.jsx';
import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import HelpTip from './HelpTip.jsx';
import {PaginatedList} from './Pagination.jsx';
import ScheduleTimeline from './ScheduleTimeline.jsx';
import {useState} from 'react';
import {filterScheduleRows,groupSchedulesByExecutor} from './scheduleGroups.mjs';
import './ScheduleViews.css';
import {scheduleProgress} from './scheduleProgress.mjs';
import {groupSchedulesByEquipment} from './equipmentScheduleGroups.mjs';
import {categoryColorMap,categoryName} from './labColors.mjs';

function ScheduleTable({rows,onRequest,onEdit,resetKey,canEdit=true}) {
  return <div className="template-table-wrap schedule-table-region" role="region" aria-label="排程表格"><p className="schedule-mobile-table-hint">左右滑動查看完整排程與操作</p><PaginatedList items={rows} resetKey={resetKey}>{page=><div className="schedule-table-scroll" role="region" aria-label="排程明細" tabIndex={0}><ActionTable className="template-table schedule-table"><thead><tr>{['委託編號','產品代碼','試驗項目','設備','執行人','樣品編號','試驗日程','狀態','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{page.map(row=><tr key={row.id}><td><button type="button" className="request-id-link" onClick={()=>onRequest(row)}>{row.requestId||'未關聯委託'}</button></td><td>{row.productCode||'—'}</td><td>{row.title}</td><td>{row.eq||'—'}{row.equipmentCount>1&&<small>共 {row.equipmentCount} 台</small>}{Boolean(row.preparationMinutes||row.cleanupMinutes)&&<small>準備 {row.preparationMinutes||0}／清理 {row.cleanupMinutes||0} 分鐘</small>}</td><td>{row.owner||'尚未指派'}</td><td>{row.sampleCode||(row.preapprovalWorkflow?'尚未在一階簽核編號':`SMP-${String(row.requestId||row.id).replace(/[^A-Za-z0-9-]/g,'')}`)}</td><td><ScheduleTimeline row={row}/></td><td><span className={`template-status status-${row.status}`}>{row.status==='未排程'?'待排程':row.status==='有衝突'?'排程衝突':row.status}</span>{row.hasSharedDraft&&<small style={{display:'block'}}>草稿第 {row.draftRevision} 版 · 未預約</small>}{row.status==='未排程'&&(row.receiptReturn||row.labCancellationReturn)&&<small style={{display:'block',fontSize:10,marginTop:6,color:'#9a7790'}} title={(row.receiptReturn||row.labCancellationReturn).reason}>{row.labCancellationReturn?'取消原安排退回':'實驗室未接收退回'}</small>}</td><td>{["已完成","已結案"].includes(row.status)?<span className="rq-muted">試驗已結束</span>:<button type="button" aria-label="編輯排程" title="編輯排程" className="template-btn secondary schedule-edit-btn icon-action" disabled={!canEdit||Boolean(row.reportInfo?.stage)||['取消','待核准','已結案'].includes(row.status)} onClick={()=>onEdit(row)}><ActionIcon name="edit"/></button>}</td></tr>)}</tbody></ActionTable></div>}</PaginatedList>{!rows.length&&<div className="schedule-view-empty">目前沒有符合條件的排程</div>}</div>;
}
const colors=['#7c69cf','#4093b4','#d08c4b','#56a18c','#c57191','#6682bf'];
export default function ScheduleViews({rows,accounts,equipment=[],now,status,search,onSearch,onClear,onRequest,onEdit,canEdit=true}) {
  const [view,setView]=useState('all');
  const [collapsed,setCollapsed]=useState({});
  const visible=filterScheduleRows(rows,status,search);
  const groups=groupSchedulesByExecutor(rows,accounts);
  const categoryColors=categoryColorMap(equipment);
  const deviceGroups=groupSchedulesByEquipment(rows,equipment,now).map(group=>({...group,color:group.machine?categoryColors.get(categoryName(group.machine.category)):'#8b96ac'}));
  const tabs=[['all','全部排程',rows.length],['people','依執行人員',groups.length],['equipment','依設備排程',deviceGroups.filter(group=>group.rows.length).length]];
  const chooseTab=(event,index)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length][0];
    setView(next);document.getElementById(`schedule-view-tab-${next}`)?.focus();
  };
  return <section className="schedule-views" aria-label="排程檢視">
    <div className="schedule-view-top workspace-tab-toolbar"><div className="schedule-view-tabs workspace-primary-tabs" role="tablist" aria-label="排程檢視方式">{tabs.map(([key,label,count],index)=><button type="button" key={key} role="tab" id={`schedule-view-tab-${key}`} aria-selected={view===key} aria-controls={`schedule-view-panel-${key}`} tabIndex={view===key?0:-1} onClick={()=>setView(key)} onKeyDown={event=>chooseTab(event,index)}><strong>{label}</strong><span>{count}</span></button>)}</div>
    <CatalogSearchToolbar kind="排程" value={search} onChange={onSearch} onClear={onClear||(()=>onSearch(''))}/></div>
    <div role="tabpanel" id={`schedule-view-panel-${view}`} aria-labelledby={`schedule-view-tab-${view}`} tabIndex={0}>
      {view==='all'?<ScheduleTable canEdit={canEdit} resetKey={`${status}:${search}`} rows={visible} onRequest={onRequest} onEdit={onEdit}/>:view==='equipment'?<EquipmentScheduleBoard canEdit={canEdit} groups={deviceGroups} now={now} status={status} search={search} onRequest={onRequest} onEdit={onEdit}/>:<div className="schedule-people-board"><PaginatedList items={groups} resetKey={`${status}:${search}`}>{(pageGroups,offset)=>pageGroups.map((group,pageIndex)=>{const index=offset+pageIndex;
        const matchingName=search.trim()&&group.name.toLowerCase().includes(search.trim().toLowerCase());
        const items=filterScheduleRows(group.rows,status,matchingName?'':search);
        const closed=collapsed[group.key] ?? true;
        const panelId=`schedule-person-${index}`;
        return <section className="schedule-person-group" key={group.key} style={{'--group-color':colors[index%colors.length]}}><button type="button" className="schedule-person-header" aria-expanded={!closed} aria-controls={panelId} onClick={()=>setCollapsed(previous=>({...previous,[group.key]:!closed}))}><span className={`schedule-person-chevron ${closed?'closed':''}`} aria-hidden="true">⌄</span><span className="schedule-person-avatar" aria-hidden="true">{group.name.slice(0,1)}</span><span className="schedule-person-identity"><strong>{group.name}</strong><small>{group.person?`${group.person.role}${group.person.status!=='啟用中'?' · 已停用':''}`:group.key==='unassigned'?'等待分派執行人':'既有排程指派'}</small></span><span className="schedule-person-count">{items.length}／{group.rows.length} 筆</span><span className="schedule-person-summary"><span>待排程 {items.filter(row=>row.status==='未排程').length}</span><span>已排程 {items.filter(row=>row.status==='已排程').length}</span><span>試驗中 {items.filter(row=>row.status==='試驗中').length}</span><span>暫停中 {items.filter(row=>row.status==='暫停中').length}</span>{items.some(row=>row.status==='有衝突')&&<span className="schedule-person-conflict">衝突 {items.filter(row=>row.status==='有衝突').length}</span>}</span></button><div id={panelId} hidden={closed}>{items.length?<ScheduleTable canEdit={canEdit} resetKey={`${status}:${search}`} rows={items} onRequest={onRequest} onEdit={onEdit}/>:<div className="schedule-person-empty">{group.rows.length?'目前篩選條件下沒有排程':'尚未指派排程'}</div>}</div></section>;
      })}</PaginatedList>{!groups.length&&<div className="schedule-view-empty">目前沒有實驗室執行人員或排程資料。</div>}</div>}
    </div><p className="schedule-view-summary">{view==='all'?`顯示 ${visible.length}／${rows.length} 筆排程`:view==='equipment'?'設備與明細依進行中、即將開始、日期待確認排序；跨設備試驗會在各設備列出，請勿將各設備委託數相加。':'顯示所有實驗室執行人員，含尚未指派排程的人員；既有指派與未指派案件另列。'}</p>
  </section>;
}

function EquipmentScheduleBoard({groups,now,status,search,onRequest,onEdit,canEdit=true}){
 const [collapsed,setCollapsed]=useState({});
 const query=search.trim().toLowerCase();
 const visible=groups.map(group=>({...group,items:filterScheduleRows(group.rows,status,`${group.name} ${group.key}`.toLowerCase().includes(query)?'':search)})).filter(group=>group.items.length||!query&&status==='全部');
 const format=value=>new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 return <div className="equipment-schedule-board">
  <div className="equipment-schedule-intro"><div><div className="help-title-row"><h3>依設備掌握試驗安排</h3><HelpTip>進行中的試驗優先，其次為即將開始的安排；尚未設定時間的試驗置於最後。時間均為台灣時間。</HelpTip></div></div></div>
  <PaginatedList items={visible} resetKey={`${status}:${search}`}>{page=>page.map(group=>{
   const closed=collapsed[group.key]??true,id=`equipment-schedule-${encodeURIComponent(group.key)}`;
   const first=group.items[0],period=first?scheduleProgress({...first,status:'已排程'},now):null;
   const count=new Set(group.items.map(row=>row.requestId||row.id)).size;
   return <section key={group.key} className="equipment-schedule-card" style={{'--equipment-category-color':group.color}}><button type="button" className="equipment-schedule-header" aria-expanded={!closed} aria-controls={id} onClick={()=>setCollapsed(previous=>({...previous,[group.key]:!closed}))}><span aria-hidden="true">{closed?'▸':'▾'}</span><span className="equipment-schedule-name"><strong>{group.name}</strong><small>{group.machine?`${group.machine.id} · ${group.machine.category||'未分類'} · ${group.machine.status}`:'待確認設備台帳或指派'}</small></span><span className="equipment-schedule-count">{count} 件委託 · {group.items.length} 筆試驗</span><span className="equipment-schedule-next">{!first?'尚無試驗安排':period?.start===undefined||['未排程','待排程'].includes(first.status)?'待確認試驗時間':first.pauseStartedAt?'目前試驗暫停中':period.start<=now&&period.end>now?'目前有試驗進行中':`最近開始 ${format(period.start)}`}</span></button><div id={id} hidden={closed}>{group.items.length?<ScheduleTable canEdit={canEdit} rows={group.items} onRequest={onRequest} onEdit={onEdit} resetKey={`${status}:${search}`}/>:<p className="schedule-view-empty">此設備尚無試驗安排</p>}</div></section>;
  })}</PaginatedList>{!visible.length&&<div className="schedule-view-empty">沒有符合篩選條件的設備排程</div>}
 </div>;
}
