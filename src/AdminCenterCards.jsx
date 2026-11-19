import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import {useEffect,useState} from 'react';
import './AdminCenter.css';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import {ADMIN_GROUPS,ADMIN_MODULES} from './adminCenterData.mjs';
import {canViewAdmin} from './adminCenterStore.mjs';
export function AdminModuleNav({account,active,onOpen}){
 const tabs=[{id:'overview',title:'管理總覽'},...ADMIN_MODULES.filter(m=>canViewAdmin(account,m.id))];
 useEffect(()=>{document.getElementById(`admin-module-tab-${active||'overview'}`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 return <nav className="admin-module-nav" aria-label="管理模組導覽"><div role="tablist" aria-label="系統管理功能">{tabs.map((m,index)=><button type="button" role="tab" key={m.id} id={`admin-module-tab-${m.id}`} aria-controls="admin-module-panel" aria-selected={(active||'overview')===m.id} tabIndex={(active||'overview')===m.id?0:-1} onClick={()=>onOpen(m.id==='overview'?null:m.id)} onKeyDown={event=>{const next=tabKeyIndex(event,index,tabs.length);if(next===null)return;event.currentTarget.parentElement.children[next].focus();onOpen(tabs[next].id==='overview'?null:tabs[next].id);requestAnimationFrame(()=>document.getElementById(`admin-module-tab-${tabs[next].id}`)?.focus());}}>{m.title}</button>)}</div></nav>;
}
function tabKeyIndex(event,index,count){const delta={ArrowRight:1,ArrowLeft:-1};if(!['Home','End',...Object.keys(delta)].includes(event.key))return null;event.preventDefault();return event.key==='Home'?0:event.key==='End'?count-1:(index+delta[event.key]+count)%count;}
export default function AdminCenterCards({account,onOpen}){
 const [search,setSearch]=useState(''),[group,setGroup]=useState('all');
 const groups=[['all','全部功能'],...ADMIN_GROUPS.map((g,i)=>[String(i),g])];
 const matches=ADMIN_MODULES.filter(m=>(group==='all'||m.group===Number(group))&&`${m.title}${m.description}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="admin-center-index" aria-label="系統管理中心"><CatalogSearchToolbar kind="管理功能" label="搜尋管理功能" placeholder="搜尋功能，例如：備份、試驗、提醒…" value={search} onChange={setSearch} onClear={()=>setSearch('')}/>
 <div className="admin-group-tabs" role="tablist" aria-label="管理分類">{groups.map(([id,label],index)=><button type="button" role="tab" id={`admin-category-${id}`} aria-controls="admin-category-panel" key={id} aria-selected={group===id} tabIndex={group===id?0:-1} onClick={()=>setGroup(id)} onKeyDown={event=>{const next=tabKeyIndex(event,index,groups.length);if(next===null)return;event.currentTarget.parentElement.children[next].focus();setGroup(groups[next][0]);}}>{label}</button>)}</div><div role="tabpanel" id="admin-category-panel" aria-labelledby={`admin-category-${group}`}>{ADMIN_GROUPS.map((g,i)=>{const rows=matches.filter(m=>m.group===i);return rows.length>0&&<section className="admin-group" key={g} aria-label={g}><h3><span>0{i+1}</span>{g}</h3><div className="admin-card-grid">{rows.map(m=><article key={m.id} className={`admin-module-card admin-tone-${i}`}><span className="admin-card-icon"><LmsSidebarIcon name={m.icon}/></span><div className="admin-card-title"><h4>{m.title}</h4><span className="admin-badge">{m.status}</span></div><p>{m.description}</p><button type="button" className="admin-card-open" disabled={!canViewAdmin(account,m.id)} onClick={()=>onOpen(m.id)} aria-label={`開啟${m.title}`}>{canViewAdmin(account,m.id)?'開啟管理':'目前權限未開放'}<span aria-hidden="true">↗</span></button></article>)}</div></section>;})}{!matches.length&&<div className="admin-empty"><h3>沒有符合的功能</h3><p>試試其他關鍵字，或切換到全部功能。</p><button type="button" className="template-btn" onClick={()=>{setSearch('');setGroup('all');}}>清除搜尋</button></div>}</div></section>;
}
