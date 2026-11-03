import {LoginSystemIcon} from './EnterpriseLoginLayout.jsx';
import './LaboratoryReports.css';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import ReportPreferences from './ReportPreferences.jsx';
import HelpTip from './HelpTip.jsx';
import './ManagementPages.css';
import {useState} from 'react';
import useLabView from './useLabView.js';
import {LabRecordTable,SourceNotes} from './LabPanels.jsx';
import {calendarWindow} from './labData.mjs';
import {readManagementPreferences} from './managementPreferences.mjs';
import {buildManagementExport,downloadManagementExport,managementExportTime} from './managementExport.mjs';

const fields={schedules:[['requestId','委託編號'],['eq','設備'],['owner','執行人'],['time','開始日期'],['end','預計完成'],['status','狀態']],equipment:[['id','設備編號'],['name','設備名稱'],['category','分類'],['status','狀態'],['nextCalibration','下次校驗']],materials:[['id','物料編號'],['name','物料名稱'],['category','分類'],['available','可用數量'],['minStock','安全庫存'],['unit','單位'],['status','狀態']],requests:[['id','委託編號'],['title','試驗項目'],['applicant','申請人'],['submitted','送出日期'],['status','審查狀態']]};
fields.requests.push(['scheduleState','排程狀態']);
fields.anomalies=[['requestId','委託編號'],['title','試驗項目'],['owner','執行人'],['time','開始日期'],['end','預計完成'],['status','狀態'],['detail','異常／延遲說明']];
fields.results=[['requestId','委託編號'],['title','試驗項目'],['productCode','產品代碼'],['owner','執行人'],['end','預計完成'],['status','執行狀態'],['verdict','試驗判定']];
const labels={requests:'委託收件與排程',schedules:'試驗執行統計',anomalies:'異常與延遲追蹤',results:'試驗結果明細',equipment:'設備概況',materials:'物料庫存'};

const reportDomains=[['laboratory','實驗室','lab'],['measurement','量測移校','equipment'],['analysis','解析','reports'],['verification','驗證計畫','requests'],['certification','法規認證','review']];
export default function LabReports(){
 const {snapshot,metrics,now}=useLabView();const [tab,setTab]=useState('schedules'),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[period,setPeriod]=useState(()=>readManagementPreferences().reportPeriod),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [exporting,setExporting]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[hiddenColumns,setHiddenColumns]=useState({});
 const today=new Date(now+8*3600000).toISOString().slice(0,10);
 const anomalies=metrics.schedules.filter(row=>['有衝突','暫停中'].includes(row.status)||(!['已完成','取消','已取消','已結案'].includes(row.status)&&row.end&&String(row.end).slice(0,10)<today)).map(row=>({...row,detail:row.scheduleIssue||(['有衝突','暫停中'].includes(row.status)?row.status:'預計完成日已過，尚未完成')}));
 const results=metrics.schedules.filter(row=>row.status==='已完成').map(row=>({...row,verdict:'未登錄'}));
 const sources={schedules:metrics.schedules,requests:snapshot.requests.map(row=>({...row,status:row.status==='完成'?'審查完成':row.status,scheduleState:[...new Set(metrics.schedules.filter(item=>item.requestId===row.id).map(item=>item.status))].join('、')||'尚無排程'})),anomalies,results,equipment:snapshot.equipment,materials:snapshot.materials};
 const reportTotals=Object.fromEntries(Object.entries(sources).map(([key,rows])=>[key,rows.length]));
 const dated=['schedules','requests','anomalies','results'].includes(tab);const columns=fields[tab].map(([key,label])=>({key,label}));
 const source=sources[tab];
 const window=period==='custom'?{from,to}:calendarWindow(now,period);
 const rows=source.filter(row=>{const date=String(tab==='requests'?row.submitted||'':row.time||'').slice(0,10);return (!query||Object.values(row).some(value=>String(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())))&&(!status||row.status===status)&&(!dated||period==='all'||(date&&(!window.from||date>=window.from)&&(!window.to||date<=window.to)));});

 const selectedColumns=columns.filter(column=>!hiddenColumns[`${tab}:${column.key}`]);
 const invalidRange=dated&&period==='custom'&&from&&to&&from>to;
 async function exportFile(type){
  setExporting(type);setError('');setNotice('');
  try{
   if(invalidRange)throw Error('開始日期不可晚於結束日期。');
   const {stamp,date}=managementExportTime();
   const scope=`${status||'全部狀態'} · ${dated?(period==='custom'?`${from||'不限'} 至 ${to||'不限'}`:({all:'全部日期',week:'本週',month:'本月'}[period])):'目前台帳'} · 搜尋：${query||'無'} · 匯出於 ${stamp}（台灣時間）`;
   const bytes=await buildManagementExport({type,title:labels[tab],columns:selectedColumns,rows:rows.map(row=>({...row})),summary:readManagementPreferences().exportSummary?scope:''});
   downloadManagementExport(bytes,`${labels[tab]}-${date}.${type}`,type);setNotice(`已匯出 ${rows.length} 筆${labels[tab]}（${type==='pdf'?'PDF':'Excel'}），包含所有符合篩選條件的資料。`);
  }catch(err){setError(err.message||'匯出失敗，請稍後重試。');}finally{setExporting('');}
 }
 const choose=(key)=>{setTab(key);setStatus('');setQuery('');setError('');setNotice('');};
 return <section className="panel generic-page management-page reports-management"><div className="template-page">
  <div className="template-heading management-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="reports"/>報表分析</h2><HelpTip>從排程、設備、物料與委託資料掌握現況，匯出完整篩選結果。</HelpTip></div></div><details className="management-export-menu"><summary className="management-primary"><svg className="report-export-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M14 3v6h6M14 3l6 6M12 11v6m-3-3 3 3 3-3"/></svg><span>{exporting?'正在產生檔案…':'匯出報表'}</span><svg className="report-export-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div className="management-export-options"><p>匯出目前篩選結果 · {rows.length} 筆</p>{[['pdf','PDF 文件'],['xlsx','Excel 活頁簿']].map(([type,label])=><button type="button" key={type} disabled={Boolean(exporting)||!rows.length||!selectedColumns.length||Boolean(invalidRange)} onClick={event=>{event.currentTarget.closest('details').open=false;exportFile(type);}}><strong>{label}</strong><small>{type==='pdf'?'適合閱讀、列印與分享':'適合資料整理、篩選與後續分析'}</small></button>)}</div></details></div>
  {notice&&<p className="management-notice" role="status">{notice}</p>}{error&&<p className="management-error" role="alert">{error}</p>}{exporting&&<p role="status">正在產生 {exporting==='pdf'?'PDF':'Excel'}，請稍候…</p>}
  <div className="report-domain-grid summary-tiles" role="group" aria-label="報表領域">{reportDomains.map(([key,label,icon])=>{const available=key==='laboratory';return <button type="button" key={key} className="summary-tile report-domain-card" aria-label={label} aria-pressed={available} disabled={!available} aria-controls={available?'laboratory-reports':undefined} onClick={()=>document.getElementById('laboratory-reports-title')?.focus({preventScroll:true})}><i className="workspace-summary-icon" aria-hidden="true">{available?<LoginSystemIcon kind="lab"/>:<LmsSidebarIcon name={icon}/>}</i><span>{label}</span><strong>{available?'6 類報表':'待建置'}</strong></button>;})}</div>
  <section id="laboratory-reports" className="laboratory-report-workspace" aria-labelledby="laboratory-reports-title"><header className="laboratory-report-heading"><div><h3 id="laboratory-reports-title" tabIndex={-1}><LoginSystemIcon kind="lab"/>實驗室報表</h3><p>依實驗室週報分類：委託收件、試驗執行、異常追蹤與結果明細；另保留設備及物料輔助報表。</p></div><span className="laboratory-report-sync">資料與管理頁同步</span></header>
  <div className="schedule-view-tabs" role="tablist" aria-label="報表分類">{Object.entries(labels).map(([key,label],index)=><button type="button" role="tab" id={`report-tab-${key}`} aria-controls="management-report-panel" aria-selected={tab===key} tabIndex={tab===key?0:-1} key={key} aria-label={label} onClick={()=>choose(key)} onKeyDown={event=>{const keys=Object.keys(labels);let target;if(event.key==='Home')target=0;if(event.key==='End')target=keys.length-1;if(event.key==='ArrowRight')target=(index+1)%keys.length;if(event.key==='ArrowLeft')target=(index-1+keys.length)%keys.length;if(target!==undefined){event.preventDefault();choose(keys[target]);document.getElementById(`report-tab-${keys[target]}`)?.focus();}}}><strong>{label}</strong><span className="report-tab-count">{reportTotals[key]} {key==='equipment'?'台':'筆'}</span></button>)}</div>
  <section role="tabpanel" id="management-report-panel" aria-labelledby={`report-tab-${tab}`}>
   <div className="lab-report-controls"><input type="search" aria-label="搜尋報表" placeholder="搜尋編號、名稱、執行人或其他欄位…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="狀態" value={status} onChange={event=>setStatus(event.target.value)}><option value="">全部狀態</option>{[...new Set(source.map(row=>row.status))].filter(Boolean).map(value=><option key={value}>{value}</option>)}</select>{dated&&<select aria-label="日期範圍" value={period} onChange={event=>setPeriod(event.target.value)}><option value="all">全部日期</option><option value="week">本週</option><option value="month">本月</option><option value="custom">自訂日期</option></select>}{dated&&period==='custom'&&<><input type="date" aria-label="範圍開始" value={from} onChange={event=>setFrom(event.target.value)}/><input type="date" aria-label="範圍結束" min={from} value={to} onChange={event=>setTo(event.target.value)}/></>}<button type="button" className="template-btn secondary" onClick={()=>{setQuery('');setStatus('');setPeriod('all');setFrom('');setTo('');}}>清除篩選</button></div>
   {invalidRange&&<p role="alert" className="management-error">開始日期不可晚於結束日期。</p>}
   <details className="management-fold report-config"><summary><span className="report-config-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg><strong>報表顯示與匯出設定</strong></span><span className="report-config-meta">{selectedColumns.length}／{columns.length} 欄<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span></summary><ReportPreferences onSaved={(next,previous)=>{if(next.reportPeriod!==previous.reportPeriod)setPeriod(next.reportPeriod);}}/><h3 className="report-columns-title">顯示及匯出欄位</h3><div className="management-column-options">{columns.map(column=><label key={column.key}><input type="checkbox" checked={!hiddenColumns[`${tab}:${column.key}`]} disabled={selectedColumns.length===1&&!hiddenColumns[`${tab}:${column.key}`]} onChange={event=>setHiddenColumns(previous=>({...previous,[`${tab}:${column.key}`]:!event.target.checked}))}/>{column.label}</label>)}</div></details>
   <p className="lab-report-scope">{dated?(tab!=='requests'?'依排程開始日期篩選；未設定日期的項目只列於全部日期。':'依委託送出日期篩選；審查完成與試驗完成分別統計。'):'目前台帳快照，會隨管理頁面同步。'} 顯示 {rows.length}／{source.length} 筆；匯出包含全部篩選結果，不限目前頁碼。</p>
   <LabRecordTable columns={selectedColumns} rows={invalidRange?[]:rows} resetKey={`${tab}|${query}|${status}|${period}|${from}|${to}`}/>
  </section></section><SourceNotes snapshot={snapshot}/>
 </div></section>;
}
