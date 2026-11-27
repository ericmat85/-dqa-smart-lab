import {businessAIEnabled} from './businessAIClient.mjs';
import BusinessAIMonitor from './BusinessAIMonitor.jsx';
import {useEffect} from 'react';
import {AI_ENGINE_PAGES} from './adminCenterData.mjs';
import {canAccessLmsPage} from './customRoles.mjs';
import {AdminInfo,AdminStats} from './AdminOperations.jsx';
import E2SchedulingManagement from './E2SchedulingManagement.jsx';
import E3ReportManagement from './E3ReportManagement.jsx';
import E4AssistantMonitor from './E4AssistantMonitor.jsx';

export default function AdminEngineWorkspace({engine,account,snapshot,onNavigate,onOpen}){
 const page=AI_ENGINE_PAGES.find(e=>e.code===engine),canReadRequests=canAccessLmsPage(account,'requests');
 useEffect(()=>{document.getElementById(`admin-engine-tab-${engine}`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[engine]);
 if(!page)return <p role="alert">找不到此 AI 引擎頁面。</p>;
 return <div className="admin-polished-engine-page" data-engine={engine}><div role="tablist" className="admin-engine-tabs" aria-label="AI 引擎頁面">{AI_ENGINE_PAGES.map((e,index)=><button type="button" role="tab" key={e.code} id={`admin-engine-tab-${e.code}`} aria-selected={engine===e.code} tabIndex={engine===e.code?0:-1} aria-controls="admin-engine-panel" onClick={()=>onOpen(`ai/${e.code}`)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;event.currentTarget.parentElement.children[next].focus();onOpen(`ai/${AI_ENGINE_PAGES[next].code}`);requestAnimationFrame(()=>document.getElementById(`admin-engine-tab-${AI_ENGINE_PAGES[next].code}`)?.focus());}}>{e.code} {e.name}</button>)}</div><div role="tabpanel" id="admin-engine-panel" aria-labelledby={`admin-engine-tab-${engine}`}>
 {businessAIEnabled()?<BusinessAIMonitor engine={engine} account={account} snapshot={snapshot} onNavigate={onNavigate}/>:<>{engine==='E1'&&<section aria-label="智能審查設定與來源"><header className="admin-section-top"><h3>審查規則與業務來源</h3><span className="admin-badge">規則檢查</span></header><AdminStats items={[["電子委託來源",!canReadRequests?'未授權':snapshot.sources.find(s=>s.id==='electronic')?.error?'讀取異常':snapshot.electronic.length,'目前瀏覽器的電子委託'],["委託審查來源",!canReadRequests?'未授權':snapshot.sources.find(s=>s.id==='reviews')?.error?'讀取異常':snapshot.reviews.length,'既有審查紀錄']]}/><section className="admin-surface"><h3>委託單、電子簽名與報告審查</h3><AdminInfo items={[["委託單","核對必要欄位、試驗條件與目前案件版本。"],["電子簽名","檢查簽名完整性；不驗證簽名真偽，不代替既有簽核。"],["報告","沿用報告來源、格式與必要欄位規則檢查；缺漏時顯示待補。"],["模型與設定","現有 E1 使用確定性規則，尚未啟用真實 Provider；本頁不變更審查規則。"]]}/><div className="admin-actions">{canAccessLmsPage(account,'requests')&&<button type="button" className="template-btn" onClick={()=>onNavigate('requests')}>前往委託與報告審查</button>}{canAccessLmsPage(account,'reports')&&<button type="button" className="template-btn" onClick={()=>onNavigate('reports')}>查看報表分析</button>}</div></section></section>}
 {engine==='E2'&&<E2SchedulingManagement account={account}/>}
 {engine==='E3'&&<E3ReportManagement account={account}/>}
 {engine==='E4'&&<E4AssistantMonitor account={account}/>}</> }
 </div></div>;
}
