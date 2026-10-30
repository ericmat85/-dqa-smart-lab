import {PaginatedTable,PaginatedList} from './Pagination.jsx';
import ScheduleTimeline from './ScheduleTimeline.jsx';
import {useState} from 'react';
import {filterScheduleRows,groupSchedulesByExecutor} from './scheduleGroups.mjs';
import './ScheduleViews.css';

function ScheduleTable({rows,onRequest,onEdit,resetKey}) {
  return <div className="template-table-wrap schedule-table-scroll" role="region" aria-label="排程表格，可水平捲動" tabIndex={0}><PaginatedTable resetKey={resetKey} className="template-table schedule-table"><thead><tr>{['委託編號','產品代碼','試驗項目','設備','執行人','樣品編號','試驗日程','狀態','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><button type="button" className="request-id-link" onClick={()=>onRequest(row)}>{row.requestId||'未關聯委託'}</button></td><td>{row.productCode||'—'}</td><td>{row.title}</td><td>{row.eq||'—'}{row.equipmentCount>1&&<small>共 {row.equipmentCount} 台</small>}{Boolean(row.preparationMinutes||row.cleanupMinutes)&&<small>準備 {row.preparationMinutes||0}／清理 {row.cleanupMinutes||0} 分鐘</small>}</td><td>{row.owner||'尚未指派'}</td><td>{row.sampleCode||`SMP-${String(row.requestId||row.id).replace(/[^A-Za-z0-9-]/g,'')}`}</td><td><ScheduleTimeline row={row}/></td><td><span className={`template-status status-${row.status}`}>{row.status==='未排程'?'待排程':row.status==='有衝突'?'排程衝突':row.status}</span>{row.status==='未排程'&&(row.receiptReturn||row.labCancellationReturn)&&<small style={{display:'block',fontSize:10,marginTop:6,color:'#9a7790'}} title={(row.receiptReturn||row.labCancellationReturn).reason}>{row.labCancellationReturn?'取消原安排退回':'實驗室未接收退回'}</small>}</td><td><button type="button" className="template-btn secondary schedule-edit-btn" disabled={Boolean(row.reportInfo?.stage)||['取消','待核准','已結案'].includes(row.status)} onClick={()=>onEdit(row)}>編輯排程</button></td></tr>)}</tbody></PaginatedTable>{!rows.length&&<div className="schedule-view-empty">目前沒有符合條件的排程</div>}</div>;
}
const colors=['#7c69cf','#4093b4','#d08c4b','#56a18c','#c57191','#6682bf'];
export default function ScheduleViews({rows,accounts,status,search,onSearch,onRequest,onEdit}) {
  const [view,setView]=useState('all');
  const [collapsed,setCollapsed]=useState({});
  const visible=filterScheduleRows(rows,status,search);
  const groups=groupSchedulesByExecutor(rows,accounts);
  const allCollapsed=groups.length>0&&groups.every(group=>collapsed[group.key] ?? true);
  const chooseTab=(event,index)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?'all':event.key==='End'?'people':index===0?'people':'all';
    setView(next);document.getElementById(`schedule-view-tab-${next}`)?.focus();
  };
  return <section className="schedule-views" aria-label="排程檢視">
    <div className="schedule-view-top"><div className="schedule-view-tabs" role="tablist" aria-label="排程檢視方式">{[['all','全部排程',rows.length],['people','依執行人員',groups.length]].map(([key,label,count],index)=><button type="button" key={key} role="tab" id={`schedule-view-tab-${key}`} aria-selected={view===key} aria-controls={`schedule-view-panel-${key}`} tabIndex={view===key?0:-1} onClick={()=>setView(key)} onKeyDown={event=>chooseTab(event,index)}>{key==='all'?'▤':'◉'}<strong>{label}</strong><span>{count}</span></button>)}</div>{view==='people'&&<div className="schedule-group-controls"><button type="button" onClick={()=>setCollapsed(Object.fromEntries(groups.map(group=>[group.key,false])))}>全部展開</button><button type="button" disabled={allCollapsed} onClick={()=>setCollapsed(Object.fromEntries(groups.map(group=>[group.key,true])))}>全部收合</button></div>}</div>
    <div className="template-toolbar schedule-search-toolbar"><label className="schedule-search-wrap"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={event=>onSearch(event.target.value)} placeholder="搜尋委託編號、產品代碼、樣品編號、試驗項目、設備或執行人…" aria-label="搜尋排程"/></label></div>
    <div role="tabpanel" id={`schedule-view-panel-${view}`} aria-labelledby={`schedule-view-tab-${view}`} tabIndex={0}>
      {view==='all'?<ScheduleTable resetKey={`${status}:${search}`} rows={visible} onRequest={onRequest} onEdit={onEdit}/>:<div className="schedule-people-board"><PaginatedList items={groups} resetKey={`${status}:${search}`}>{(pageGroups,offset)=>pageGroups.map((group,pageIndex)=>{const index=offset+pageIndex;
        const matchingName=search.trim()&&group.name.toLowerCase().includes(search.trim().toLowerCase());
        const items=filterScheduleRows(group.rows,status,matchingName?'':search);
        const closed=collapsed[group.key] ?? true;
        const panelId=`schedule-person-${index}`;
        return <section className="schedule-person-group" key={group.key} style={{'--group-color':colors[index%colors.length]}}><button type="button" className="schedule-person-header" aria-expanded={!closed} aria-controls={panelId} onClick={()=>setCollapsed(previous=>({...previous,[group.key]:!closed}))}><span className={`schedule-person-chevron ${closed?'closed':''}`} aria-hidden="true">⌄</span><span className="schedule-person-avatar" aria-hidden="true">{group.name.slice(0,1)}</span><span className="schedule-person-identity"><strong>{group.name}</strong><small>{group.person?`${group.person.role}${group.person.status!=='啟用中'?' · 已停用':''}`:group.key==='unassigned'?'等待分派執行人':'既有排程指派'}</small></span><span className="schedule-person-count">{items.length}／{group.rows.length} 筆</span><span className="schedule-person-summary"><span>待排程 {items.filter(row=>row.status==='未排程').length}</span><span>已排程 {items.filter(row=>row.status==='已排程').length}</span><span>試驗中 {items.filter(row=>row.status==='試驗中').length}</span><span>已完成 {items.filter(row=>row.status==='已完成').length}</span>{items.some(row=>row.status==='有衝突')&&<span className="schedule-person-conflict">衝突 {items.filter(row=>row.status==='有衝突').length}</span>}</span></button><div id={panelId} hidden={closed}>{items.length?<ScheduleTable resetKey={`${status}:${search}`} rows={items} onRequest={onRequest} onEdit={onEdit}/>:<div className="schedule-person-empty">{group.rows.length?'目前篩選條件下沒有排程':'尚未指派排程'}</div>}</div></section>;
      })}</PaginatedList>{!groups.length&&<div className="schedule-view-empty">目前沒有實驗室執行人員或排程資料。</div>}</div>}
    </div><p className="schedule-view-summary">{view==='all'?`顯示 ${visible.length}／${rows.length} 筆排程`:'顯示所有實驗室執行人員，含尚未指派排程的人員；既有指派與未指派案件另列。'}</p>
  </section>;
}
