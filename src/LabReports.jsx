import './ManagementPages.css';
import {useState} from 'react';
import useLabView from './useLabView.js';
import {LabRecordTable,SourceNotes} from './LabPanels.jsx';
import {calendarWindow} from './labData.mjs';
import {readManagementPreferences} from './managementPreferences.mjs';
import {buildManagementExport,downloadManagementExport,managementExportTime} from './managementExport.mjs';

const fields={schedules:[['requestId','委託編號'],['eq','設備'],['owner','執行人'],['time','開始日期'],['end','預計完成'],['status','狀態']],equipment:[['id','設備編號'],['name','設備名稱'],['category','分類'],['status','狀態'],['nextCalibration','下次校驗']],materials:[['id','物料編號'],['name','物料名稱'],['category','分類'],['available','可用數量'],['minStock','安全庫存'],['unit','單位'],['status','狀態']],requests:[['id','委託編號'],['title','試驗項目'],['applicant','申請人'],['submitted','送出日期'],['status','審查狀態']]};
const labels={schedules:'試驗排程',equipment:'設備概況',materials:'物料庫存',requests:'委託審查'};
export default function LabReports(){
 const {snapshot,metrics,now}=useLabView();const [tab,setTab]=useState('schedules'),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[period,setPeriod]=useState(()=>readManagementPreferences().reportPeriod),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [exporting,setExporting]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[hiddenColumns,setHiddenColumns]=useState({});
 const dated=['schedules','requests'].includes(tab);const columns=fields[tab].map(([key,label])=>({key,label}));
 const source=tab==='schedules'?metrics.schedules:tab==='requests'?snapshot.requests.map(row=>({...row,status:row.status==='完成'?'審查完成':row.status})):snapshot[tab];
 const window=period==='custom'?{from,to}:calendarWindow(now,period);
 const rows=source.filter(row=>{const date=String(tab==='schedules'?row.time||'':row.submitted||'').slice(0,10);return (!query||Object.values(row).some(value=>String(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())))&&(!status||row.status===status)&&(!dated||period==='all'||(date&&(!window.from||date>=window.from)&&(!window.to||date<=window.to)));});

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
  <div className="template-heading management-heading"><div><h2>報表分析</h2><p>從排程、設備、物料與委託資料掌握現況，匯出完整篩選結果。</p></div><details className="management-export-menu"><summary className="management-primary">{exporting?'正在產生檔案…':'匯出報表'} <span aria-hidden="true">⌄</span></summary><div className="management-export-options"><p>匯出目前篩選結果 · {rows.length} 筆</p>{[['pdf','PDF 文件'],['xlsx','Excel 活頁簿']].map(([type,label])=><button type="button" key={type} disabled={Boolean(exporting)||!rows.length||!selectedColumns.length||Boolean(invalidRange)} onClick={event=>{event.currentTarget.closest('details').open=false;exportFile(type);}}><strong>{label}</strong><small>{type==='pdf'?'適合閱讀、列印與分享':'適合資料整理、篩選與後續分析'}</small></button>)}</div></details></div>
  {notice&&<p className="management-notice" role="status">{notice}</p>}{error&&<p className="management-error" role="alert">{error}</p>}{exporting&&<p role="status">正在產生 {exporting==='pdf'?'PDF':'Excel'}，請稍候…</p>}
  <div className="management-summary">{Object.entries(labels).map(([key,label])=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>choose(key)}><span>{label}</span><strong>{key==='schedules'?metrics.schedules.length:key==='requests'?snapshot.requests.length:snapshot[key].length}</strong><small>{key==='equipment'?'台':'筆'}</small></button>)}</div>
  <div className="schedule-view-tabs" role="tablist" aria-label="報表分類">{Object.entries(labels).map(([key,label],index)=><button type="button" role="tab" id={`report-tab-${key}`} aria-controls="management-report-panel" aria-selected={tab===key} tabIndex={tab===key?0:-1} key={key} onClick={()=>choose(key)} onKeyDown={event=>{const keys=Object.keys(labels);let target;if(event.key==='Home')target=0;if(event.key==='End')target=keys.length-1;if(event.key==='ArrowRight')target=(index+1)%keys.length;if(event.key==='ArrowLeft')target=(index-1+keys.length)%keys.length;if(target!==undefined){event.preventDefault();choose(keys[target]);document.getElementById(`report-tab-${keys[target]}`)?.focus();}}}>{label}</button>)}</div>
  <section role="tabpanel" id="management-report-panel" aria-labelledby={`report-tab-${tab}`}>
   <div className="lab-report-controls"><input type="search" aria-label="搜尋報表" placeholder="搜尋編號、名稱、執行人或其他欄位…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="狀態" value={status} onChange={event=>setStatus(event.target.value)}><option value="">全部狀態</option>{[...new Set(source.map(row=>row.status))].filter(Boolean).map(value=><option key={value}>{value}</option>)}</select>{dated&&<select aria-label="日期範圍" value={period} onChange={event=>setPeriod(event.target.value)}><option value="all">全部日期</option><option value="week">本週</option><option value="month">本月</option><option value="custom">自訂日期</option></select>}{dated&&period==='custom'&&<><input type="date" aria-label="範圍開始" value={from} onChange={event=>setFrom(event.target.value)}/><input type="date" aria-label="範圍結束" min={from} value={to} onChange={event=>setTo(event.target.value)}/></>}<button type="button" className="template-btn secondary" onClick={()=>{setQuery('');setStatus('');setPeriod('all');setFrom('');setTo('');}}>清除篩選</button></div>
   {invalidRange&&<p role="alert" className="management-error">開始日期不可晚於結束日期。</p>}
   <details className="management-fold"><summary>顯示與匯出欄位 <span>{selectedColumns.length}／{columns.length} 欄</span></summary><div className="management-column-options">{columns.map(column=><label key={column.key}><input type="checkbox" checked={!hiddenColumns[`${tab}:${column.key}`]} disabled={selectedColumns.length===1&&!hiddenColumns[`${tab}:${column.key}`]} onChange={event=>setHiddenColumns(previous=>({...previous,[`${tab}:${column.key}`]:!event.target.checked}))}/>{column.label}</label>)}</div></details>
   <p className="lab-report-scope">{dated?(tab==='schedules'?'依排程開始日期篩選；未設定日期的項目只列於全部日期。':'依委託送出日期篩選；審查完成與試驗完成分別統計。'):'目前台帳快照，會隨管理頁面同步。'} 顯示 {rows.length}／{source.length} 筆；匯出包含全部篩選結果，不限目前頁碼。</p>
   <LabRecordTable columns={selectedColumns} rows={invalidRange?[]:rows} resetKey={`${tab}|${query}|${status}|${period}|${from}|${to}`}/>
  </section><SourceNotes snapshot={snapshot}/>
 </div></section>;
}
