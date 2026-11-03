import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import {LoginSystemIcon} from './EnterpriseLoginLayout.jsx';
import './LmsDashboardPhase1.css';
import ScheduleStatusChart from './ScheduleStatusChart.jsx';
import DashboardMetricIcon from './DashboardMetricIcon.jsx';
import HelpTip from './HelpTip.jsx';
import useManagementPreferences from './useManagementPreferences.js';
import {equipmentActivity as calculateEquipmentActivity} from './equipmentActivity.mjs';
import {useState} from 'react';
import useLabView from './useLabView.js';
import {MetricCard,LabRecordTable,SourceNotes} from './LabPanels.jsx';
import {requestInformation} from './labData.mjs';
import RequestInfoModal from './RequestInfoModal.jsx';
import EquipmentInfoModal from './EquipmentInfoModal.jsx';

const requestColumns=[{key:'id',label:'委託編號'},{key:'title',label:'試驗項目'},{key:'priority',label:'優先度'},{key:'status',label:'審查狀態'},{key:'department',label:'委託部門'}];
const equipmentColumns=[{key:'id',label:'設備編號'},{key:'name',label:'設備名稱'},{key:'status',label:'狀態'},{key:'currentRequest',label:'目前委託'}];
export default function LiveDashboard({onNavigate,currentUser}) {
  const {snapshot,metrics,now}=useLabView();
  const activityPreferences=useManagementPreferences();
  const activity=calculateEquipmentActivity(metrics.schedules,snapshot.equipment,activityPreferences,now);
  const [request,setRequest]=useState(null),[equipmentId,setEquipmentId]=useState(null),[category,setCategory]=useState(null);
  const selected=snapshot.equipment.find(row=>row.id===equipmentId);
  const recent=snapshot.requests.filter(row=>snapshot.electronic.find(item=>item.id===row.id)?.status!=='已結案').sort((a,b)=>String(b.submitted||'').localeCompare(String(a.submitted||''))).slice(0,10).map(row=>({...row,status:snapshot.electronic.find(item=>item.id===row.id)?.reportInfo?.status||(row.status==='完成'?'審查完成':row.status)}));
  const equipmentActivity=row=>Math.max(0,...[row.updatedAt,row.activeService?.startedAt,...(row.records||[]).map(record=>record.date)].map(value=>Date.parse(value)||0));
  const recentEquipment=[...snapshot.equipment].sort((a,b)=>equipmentActivity(b)-equipmentActivity(a)).slice(0,10);
  return <div className="live-lab-page live-dashboard">
    <div className="live-metric-grid">
      <MetricCard label="待排程試驗" value={metrics.counts['未排程']} detail={`另有 ${metrics.counts['有衝突']} 筆排程衝突`} icon={<DashboardMetricIcon kind="pending"/>} onClick={()=>onNavigate('schedule','未排程')}/>
      <MetricCard label="排程衝突" value={metrics.counts['有衝突']} detail="查看既有排程衝突清單" icon={<LoginSystemIcon kind="flow"/>} onClick={()=>onNavigate('schedule','有衝突')}/>
      <MetricCard label="試驗中" value={metrics.counts['試驗中']} detail={`${metrics.counts['已排程']} 筆已預約、尚未開始`} icon={<DashboardMetricIcon kind="running"/>} color="teal" onClick={()=>onNavigate('schedule','試驗中')}/>
      <MetricCard label="本週完成" value={metrics.completedThisWeek} detail={`${metrics.week.from} — ${metrics.week.to}`} icon={<DashboardMetricIcon kind="completed"/>} color="orange" onClick={()=>onNavigate('schedule','已完成')}/>
      <MetricCard label="設備稼動率" value={`${activity.rate}%`} detail={`${activity.from} — ${activity.to} · 排程估算`} icon={<LmsSidebarIcon name="equipment"/>} color="slate" onClick={()=>onNavigate('settings','activity')}/>
    </div>
    <div className="live-dashboard-charts">
      <section className="live-panel"><header><div><div className="help-title-row"><h2>設備排程占用率</h2><HelpTip>本週 · 依設備分類 · {metrics.week.from} — {metrics.week.to}</HelpTip></div></div></header><div className="live-bar-chart"><div className="live-chart-ticks"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="live-bars">{metrics.categories.map(item=><button type="button" className="live-bar-column" key={item.category} onClick={()=>setCategory(item.category)} aria-label={`${item.category}，本週排程占用率 ${item.rate.toFixed(1)}%，${item.count} 台設備`}><span className="live-bar-value">{item.rate.toFixed(1)}%</span><span className="live-bar-slot"><span style={{height:`${item.rate}%`}}/></span><span className="live-bar-label">{item.category}</span><span className="live-bar-tooltip">{item.count} 台 · {(item.occupiedMs/3600000).toFixed(1)}／{(item.calendarMs/3600000).toFixed(0)} 小時<br/>點擊查看設備</span></button>)}{!metrics.categories.length&&<div className="live-empty">尚無設備資料</div>}</div></div></section>
      <section className="live-panel"><header><div><div className="help-title-row"><h2>試驗排程狀態分布</h2><HelpTip>依排程筆數統計</HelpTip></div></div><button type="button" onClick={()=>onNavigate('schedule')}>全部排程 ↗</button></header><ScheduleStatusChart counts={metrics.counts} onNavigate={onNavigate}/></section>
    </div>
    <div className="live-dashboard-tables"><section className="live-panel"><header><div><div className="help-title-row"><h2>近期試驗委託</h2><HelpTip>與試驗委託清單同步</HelpTip></div></div><button type="button" onClick={()=>onNavigate('requests')}>前往委託管理 ↗</button></header><LabRecordTable columns={requestColumns} rows={recent} onSelect={row=>{const original=snapshot.requests.find(item=>item.id===row.id);setRequest(requestInformation(original,snapshot));}}/></section><section className="live-panel"><header><div><div className="help-title-row"><h2>設備狀態</h2><HelpTip>設備台帳 · {snapshot.equipment.length} 台</HelpTip></div></div><button type="button" onClick={()=>onNavigate('settings','activity')}>設備管理 ↗</button></header><LabRecordTable columns={equipmentColumns} rows={recentEquipment.map(row=>({...row,currentRequest:row.currentRequest||'—'}))} onSelect={row=>setEquipmentId(row.id)}/></section></div>
    <div className="live-attention-strip"><button type="button" onClick={()=>onNavigate('requests')}>待審查委託 <b>{snapshot.requests.filter(row=>row.status==='待審查').length}</b><span>→</span></button><button type="button" onClick={()=>onNavigate('settings','activity')}>維護／校驗設備 <b>{snapshot.equipment.filter(row=>['維護中','校驗中'].includes(row.status)).length}</b><span>→</span></button><button type="button" onClick={()=>onNavigate('maintenance')}>物料低於安全庫存 <b>{metrics.lowStock.length}</b><span>→</span></button></div>
    <SourceNotes snapshot={snapshot}/>
    {request&&<RequestInfoModal account={currentUser} request={request} onClose={()=>setRequest(null)}/>}
    {selected&&<EquipmentInfoModal key={selected.id} equipment={selected} onClose={()=>setEquipmentId(null)} onEdit={()=>onNavigate('equipment')} onStatusChange={()=>onNavigate('equipment')}/>}
    {category&&<div className="request-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setCategory(null);}}><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-category-title"><header className="request-modal-header"><div><h3 id="dashboard-category-title">{category} · 本週排程占用</h3><p>{metrics.week.from} — {metrics.week.to}</p></div><button type="button" className="request-modal-close" aria-label="關閉設備分類" onClick={()=>setCategory(null)}>×</button></header><div className="request-modal-body"><LabRecordTable columns={[...equipmentColumns,{key:'occupancyText',label:'本週占用率'}]} rows={metrics.equipmentUsage.filter(row=>(row.category||'未分類')===category).map(row=>({...row,occupancyText:`${row.occupancy.toFixed(1)}%`}))}/></div></section></div>}
  </div>;
}
