import HelpTip from './HelpTip.jsx';
import {displayTaipei} from './requestWorkspace.mjs';
import RequestInfoModal from './RequestInfoModal.jsx';
import {useEffect,useState} from 'react';
import useReportSnapshot from './useReportSnapshot.js';
import useLabSnapshot from './useLabSnapshot.js';
import {PaginatedTable} from './Pagination.jsx';
import {canOpenReportArchive,canReadArchivedReport,readArchivedPdf} from './reportArchive.mjs';
import './ReportArchive.css';
export default function ReportArchive({actor,system}){
 const reports=useReportSnapshot(),snapshot=useLabSnapshot();
 const lms=system==='lms',pageClass=`archive-page${lms?' panel generic-page':''}`;
 const [detail,setDetail]=useState(null);
 const [search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const current=snapshot.accounts.find(row=>row.id===actor?.id);
 const allowed=canOpenReportArchive(current,system);
 const rows=reports.map(report=>({report,request:snapshot.electronic.find(row=>row.id===report.requestId)})).filter(({report,request})=>canReadArchivedReport(current,report,request,system)&&[report.requestId,request.productCode,report.documentKind,report.confirmedBy].join(' ').toLowerCase().includes(search.toLowerCase()));
 async function open(report,download){
  setError('');setBusy(true);
  try{
   const file=await readArchivedPdf({actorId:actor.id,requestId:report.requestId,system}),url=URL.createObjectURL(new Blob([file.bytes],{type:'application/pdf'}));
   if(download){const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
   else setPreview({url,name:file.name});
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 if(!allowed)return <section className={pageClass} data-system={system}><p role="alert">此帳號沒有資料庫權限。</p></section>;
 return <section className={pageClass} data-system={system}><div className="template-page"><header className="template-heading"><div><div className="help-title-row"><h2>資料庫</h2><HelpTip>本機 Demo 封存資料庫：只有委託者主管確認查閱、完成 PDF 封存的案件才會顯示。清除瀏覽器資料會移除檔案。</HelpTip></div></div></header><div className={lms?"template-toolbar archive-toolbar":"archive-toolbar"}><label><span className="archive-search-caption">搜尋已結案報告</span><input type="search" className={lms?"template-input":undefined} value={search} onChange={event=>setSearch(event.target.value)} placeholder="搜尋委託編號、產品代碼、報告類型或查閱主管…"/></label></div>{error&&<p role="alert">{error}</p>}<div className={`archive-table-wrap${lms?" template-table-wrap":""}`}><PaginatedTable className={lms?"template-table":undefined} resetKey={search}><thead><tr><th>委託編號</th><th>產品代碼</th><th>報告類型</th><th>查閱主管</th><th>封存時間</th><th>狀態</th><th>操作</th></tr></thead><tbody>{rows.length?rows.map(({report,request})=><tr key={report.requestId}><td><button className="archive-request-link" onClick={()=>setDetail(request)}>{report.requestId}</button></td><td>{request.productCode}</td><td>{report.documentKind}</td><td>{report.confirmedBy}</td><td>{displayTaipei(report.archivedAt)}</td><td>已結案／PDF 已封存</td><td><div className="archive-actions"><button className={lms?"template-btn secondary":undefined} disabled={busy} onClick={()=>open(report,false)}>查看 PDF</button><button className={lms?"template-btn secondary":undefined} disabled={busy} onClick={()=>open(report,true)}>下載 PDF</button></div></td></tr>):<tr><td colSpan="7">目前沒有您可查閱的已封存報告。</td></tr>}</tbody></PaginatedTable></div>{detail&&<RequestInfoModal request={detail} account={current} onClose={()=>setDetail(null)}/>}{preview&&<div className="archive-preview" role="dialog" aria-modal="true" aria-label="結案 PDF 預覽"><div><strong>{preview.name}</strong><button onClick={()=>setPreview(null)}>關閉預覽</button></div><iframe title="結案 PDF" src={preview.url}/></div>}</div></section>;
}
