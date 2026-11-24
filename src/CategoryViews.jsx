import {PaginatedList} from './Pagination.jsx';
import {useId,useState} from 'react';
import './ScheduleViews.css';
import './CategoryViews.css';

import {categoryColorMap,categoryName} from './labColors.mjs';
export default function CategoryViews({rows,visibleRows,renderTable,kind,toolbar,filterKey=''}) {
  const [view,setView]=useState('all');
  const [collapsed,setCollapsed]=useState({});
  const id=useId();
  const visibleIds=new Set(visibleRows.map(row=>row.id));
  const categoryColors=categoryColorMap(rows);
  const categories=[...categoryColors.keys()];
  const groups=categories.map(name=>{
    const items=rows.filter(row=>categoryName(row.category)===name);
    return {name,total:items.length,items:items.filter(row=>visibleIds.has(row.id))};
  });
  const isClosed=name=>Object.hasOwn(collapsed,name)?collapsed[name]:true;
  const changeTab=(event,index)=>{
    let next;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')next=index===0?'category':'all';
    if(event.key==='Home')next='all';
    if(event.key==='End')next='category';
    if(next){event.preventDefault();setView(next);document.getElementById(`${id}-tab-${next}`)?.focus();}
  };
  return <section className="schedule-views catalog-category-views" aria-label={`${kind}分類檢視`}>
    <div className="schedule-view-top workspace-tab-toolbar"><div className="schedule-view-tabs" role="tablist" aria-label={`${kind}檢視方式`}>{[['all',`全部${kind}`,rows.length],['category','依分類',groups.length]].map(([key,label,count],index)=><button type="button" key={key} id={`${id}-tab-${key}`} role="tab" aria-selected={view===key} aria-controls={`${id}-panel-${key}`} tabIndex={view===key?0:-1} onClick={()=>setView(key)} onKeyDown={event=>changeTab(event,index)}><strong>{label}</strong><span>{count}</span></button>)}</div>{toolbar}</div>
    <div role="tabpanel" id={`${id}-panel-${view}`} aria-labelledby={`${id}-tab-${view}`} tabIndex={0}>
      {view==='all'?renderTable(visibleRows):<div className="schedule-people-board"><PaginatedList items={groups} resetKey={filterKey}>{(pageGroups,offset)=>pageGroups.map((group,pageIndex)=>{const index=offset+pageIndex;
        const closed=isClosed(group.name);
        const panel=`${id}-category-${index}`;
        const statuses=[...new Set(group.items.map(row=>row.status))];
        return <section key={group.name} className="schedule-person-group" style={{'--group-color':categoryColors.get(group.name)}}><button type="button" className="schedule-person-header" aria-expanded={!closed} aria-controls={panel} onClick={()=>setCollapsed(previous=>({...previous,[group.name]:!closed}))}><span className={`schedule-person-chevron ${closed?'closed':''}`} aria-hidden="true">⌄</span><span className="schedule-person-avatar" aria-hidden="true">▧</span><span className="schedule-person-identity"><strong>{group.name}</strong><small>{kind}分類</small></span><span className="schedule-person-count">{group.items.length}／{group.total} 筆</span><span className="schedule-person-summary catalog-category-summary">{statuses.map(status=><span key={status}>{status} {group.items.filter(row=>row.status===status).length}</span>)}</span></button><div id={panel} hidden={closed}>{group.items.length?renderTable(group.items):<div className="schedule-person-empty">目前篩選條件下沒有符合的{kind}</div>}</div></section>;
      })}</PaginatedList>{!groups.length&&<div className="schedule-view-empty">尚無{kind}分類資料</div>}</div>}
    </div><p className="schedule-view-summary">顯示 {visibleRows.length}／{rows.length} 筆{kind} · {groups.length} 個分類</p>
  </section>;
}
