import ActionIcon from './ActionIcon.jsx';
import ArchivedPdfPreview from './ArchivedPdfPreview.jsx';
import ReportTemplateCenter from './ReportTemplateCenter.jsx';
import CatalogSearchToolbar from './CatalogSearchToolbar.jsx';
import LmsSidebarIcon from './LmsSidebarIcon.jsx';
import HelpTip from './HelpTip.jsx';
import {displayTaipei} from './requestWorkspace.mjs';
import RequestInfoModal from './RequestInfoModal.jsx';
import {useEffect,useId,useRef,useState} from 'react';
import useReportSnapshot from './useReportSnapshot.js';
import useLabSnapshot from './useLabSnapshot.js';
import {PaginatedTable} from './Pagination.jsx';
import {canOpenReportArchive,canReadArchivedReport,readArchivedPdf} from './reportArchive.mjs';
import './ReportArchive.css';
export default function ReportArchive({actor,system,showHeading=true}){
 const reports=useReportSnapshot(),snapshot=useLabSnapshot();
 const pageClass='archive-page panel generic-page';
 const operation=useRef(0),mounted=useRef(false);
 const [detail,setDetail]=useState(null);
 const [tab,setTab]=useState('reports'),tabId=useId();
 const [templateCategory,setTemplateCategory]=useState('all');
 const tabs=[['reports','試驗報告'],['specifications','試驗規範'],['manuals','試驗手冊'],['templates','報告範本']];
 const activeLabel=tabs.find(([key])=>key===tab)[1];
 function clearSearch(){setSearch('');setTemplateCategory('all');}
 function closePreview(){operation.current++;setPreview(null);setBusy(false);}
 function chooseTab(key){setTab(key);clearSearch();setError('');closePreview();setDetail(null);}
 function tabKeyDown(event,index){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  chooseTab(tabs[next][0]);document.getElementById(`${tabId}-tab-${tabs[next][0]}`)?.focus();
 }
 const [search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current++;};},[]);
 useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview]);
 const current=snapshot.accounts.find(row=>row.id===actor?.id);
 const allowed=canOpenReportArchive(current,system);
 const rows=reports.map(report=>({report,request:snapshot.electronic.find(row=>row.id===report.requestId)})).filter(({report,request})=>canReadArchivedReport(current,report,request,system)&&[report.requestId,request.productCode,report.documentKind,report.confirmedBy].join(' ').toLowerCase().includes(search.toLowerCase()));
 async function open(report,download,trigger){
  const order=++operation.current;setError('');setBusy(true);
  if(!download)setPreview({name:report.pdfName||'結案報告.pdf',loading:true,trigger});
  try{
   const file=await readArchivedPdf({actorId:actor.id,requestId:report.requestId,system});
   if(!mounted.current||operation.current!==order)return;
   const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/pdf'}));
   if(download){const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
   else setPreview({url,name:file.name,trigger,guided:globalThis.__DQA_GUIDED_CASE_ID__===report.requestId});
  }catch(err){if(mounted.current&&operation.current===order){setError(err.message);setPreview(null);}}finally{if(mounted.current&&operation.current===order)setBusy(false);}
 }
 if(!allowed)return <section className={pageClass} data-system={system}><p role="alert">此帳號沒有資料庫權限。</p></section>;
 return <section className={pageClass} data-system={system} data-show-heading={showHeading} style={{'--tab-accent':'inherit','--tab-tint':'inherit'}}><div className="template-page">
  {showHeading&&<header className="template-heading"><div><div className="help-title-row"><h2><LmsSidebarIcon name="archive"/>資料庫</h2><HelpTip>依類別查閱試驗報告、試驗規範、試驗手冊與報告範本。試驗報告僅顯示主管確認查閱並完成 PDF 封存的案件；清除瀏覽器資料會移除本機封存檔案。</HelpTip></div></div></header>}
  <div className="workspace-tab-toolbar archive-tab-toolbar"><div className="archive-tabs workspace-primary-tabs" role="tablist" aria-label="資料庫分類">{tabs.map(([key,label],index)=><button type="button" key={key} id={`${tabId}-tab-${key}`} role="tab" aria-selected={tab===key} aria-controls={`${tabId}-panel`} tabIndex={tab===key?0:-1} onClick={()=>chooseTab(key)} onKeyDown={event=>tabKeyDown(event,index)}>{label}</button>)}</div>
   <CatalogSearchToolbar key={tab} kind={activeLabel} label={tab==='reports'?'搜尋已結案報告':`搜尋${activeLabel}`} placeholder={tab==='reports'?'搜尋委託編號、產品代碼、報告類型或查閱主管…':`搜尋${activeLabel}名稱…`} value={search} onChange={setSearch} onClear={clearSearch}/>
  </div>
  <section role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-tab-${tab}`} tabIndex={0}>
   {error&&<p role="alert">{error}</p>}
   {tab==='reports'?<div className="archive-table-wrap template-table-wrap"><PaginatedTable className="template-table" resetKey={search}><thead><tr><th>委託編號</th><th>產品代碼</th><th>報告類型</th><th>查閱主管</th><th>封存時間</th><th>狀態</th><th>操作</th></tr></thead><tbody>{rows.length?rows.map(({report,request})=><tr key={report.requestId}><td><button className="archive-request-link" onClick={()=>setDetail(request)}>{report.requestId}</button></td><td>{request.productCode}</td><td>{report.documentKind}</td><td>{report.confirmedBy}</td><td>{displayTaipei(report.archivedAt)}</td><td>已結案／PDF 已封存</td><td><div className="archive-actions"><button aria-label="查看 PDF" title="查看 PDF" className="template-btn secondary icon-action" disabled={busy} onClick={event=>open(report,false,event.currentTarget)}><ActionIcon name="preview"/></button><button aria-label="下載 PDF" title="下載 PDF" className="template-btn secondary icon-action" disabled={busy} onClick={()=>open(report,true)}><ActionIcon name="download"/></button></div></td></tr>):<tr><td colSpan="7">目前沒有您可查閱的已封存報告。</td></tr>}</tbody></PaginatedTable></div>:tab==='templates'?<ReportTemplateCenter actorId={actor.id} system={system} search={search} browse category={templateCategory} onCategoryChange={setTemplateCategory}/>:<div className="archive-empty" role="status">目前沒有可查閱的{activeLabel}。</div>}
  </section>
  {detail&&<RequestInfoModal request={detail} account={current} onClose={()=>setDetail(null)}/>}
  {preview&&<ArchivedPdfPreview preview={preview} onClose={closePreview}/>}
 </div></section>;
}
