import {useEffect} from 'react';
import './AdminCenter.css';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import {ADMIN_GROUPS,ADMIN_MODULES} from './adminCenterData.mjs';
import {canViewAdmin} from './adminCenterStore.mjs';
export function AdminModuleNav({account,active,onOpen}){
 const tabs=[{id:'overview',title:'管理總覽'},...ADMIN_MODULES.filter(m=>canViewAdmin(account,m.id))];
 useEffect(()=>{document.getElementById(`admin-module-tab-${active||'overview'}`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 return <nav className="admin-module-nav" aria-label="管理模組導覽"><div className="workspace-primary-tabs" role="tablist" aria-label="系統管理功能">{tabs.map((m,index)=><button type="button" role="tab" key={m.id} id={`admin-module-tab-${m.id}`} aria-controls="admin-module-panel" aria-selected={(active||'overview')===m.id} tabIndex={(active||'overview')===m.id?0:-1} onClick={()=>onOpen(m.id==='overview'?null:m.id)} onKeyDown={event=>{const next=tabKeyIndex(event,index,tabs.length);if(next===null)return;event.currentTarget.parentElement.children[next].focus();onOpen(tabs[next].id==='overview'?null:tabs[next].id);requestAnimationFrame(()=>document.getElementById(`admin-module-tab-${tabs[next].id}`)?.focus());}}>{m.title}</button>)}</div></nav>;
}
function tabKeyIndex(event,index,count){const delta={ArrowRight:1,ArrowLeft:-1};if(!['Home','End',...Object.keys(delta)].includes(event.key))return null;event.preventDefault();return event.key==='Home'?0:event.key==='End'?count-1:(index+delta[event.key]+count)%count;}
export default function AdminCenterCards({account,onOpen}){
 return <section className="admin-center-index" aria-label="系統管理中心">{ADMIN_GROUPS.map((group,index)=><section className="admin-group" key={group} aria-label={group}><h3><span>0{index+1}</span>{group}</h3><div className="admin-card-grid">{ADMIN_MODULES.filter(m=>m.group===index).map(m=><article key={m.id} className={`admin-module-card admin-tone-${index}`}><span className="admin-card-icon"><LmsSidebarIcon name={m.icon}/></span><div className="admin-card-title"><h4>{m.title}</h4><span className="admin-badge">{m.status}</span></div><p>{m.description}</p><button type="button" className="admin-card-open" disabled={!canViewAdmin(account,m.id)} onClick={()=>onOpen(m.id)} aria-label={`開啟${m.title}`}>{canViewAdmin(account,m.id)?'開啟管理':'目前權限未開放'}<span aria-hidden="true">↗</span></button></article>)}</div></section>)}</section>;
}
