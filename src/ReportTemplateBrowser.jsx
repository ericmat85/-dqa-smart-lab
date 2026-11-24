import {assetBytes} from './assetBytes.mjs';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {PaginatedList} from './Pagination.jsx';
import TemplatePreview,{downloadTemplate} from './TemplatePreview.jsx';
import {assertTemplateAccess,readUploadedTemplate} from './reportTemplateStore.mjs';
import {readTrialTemplateFile} from './trialTemplateWorkbook.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
import {correspondingTrialNames} from './trialTemplateMatching.mjs';
import './ReportTemplateBrowser.css';

const categories=[['all','全部範本'],['trial','試驗範本'],['general','通用文件'],['upload','上傳版本']];
const generalPath=`${import.meta.env.BASE_URL}templates/general-performance-v1.xlsx`;
function Icon({kind='file'}){
 const paths={file:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',download:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M12 10v7m-3-3 3 3 3-3',chevron:'m9 5 7 7-7 7'};
 return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.file}/></svg>;
}

export default function ReportTemplateBrowser({actorId,system,catalog,uploads,search,category,onCategoryChange,sourceError}){
 const id=useId(),lifetime=useRef(null),pending=useRef(false);
 const [selected,setSelected]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[actorId,system]);
 const trialName=row=>catalog.rows.find(c=>c.id===row.trialId)?.name||({BLANK:'空白委託單',CUSTOM:'自訂報告範本'})[row.trialId]||'待核對試驗';
 const items=[
  {id:'BLANK',kind:'general',name:'空白電子委託單',version:'A4 · 中英欄位',description:'含試驗規範、判定基準及簽名欄位，適合建立新委託單。',previewLabel:'預覽空白委託單',downloadLabel:'下載空白委託單'},
  {id:'GENERAL',kind:'general',name:'一般性能報告範本',version:'V1',description:'一般性能試驗報告的通用 Excel 原稿。',previewLabel:'預覽一般性能報告範本',downloadLabel:'下載範本'},
  ...catalog.rows.map(row=>({...row,kind:'trial',aliases:correspondingTrialNames(row,catalog.rows),revision:catalog.revision,previewLabel:`預覽${row.name}範本`,downloadLabel:`下載${row.name}Excel範本`})),
  ...uploads.map(row=>({...row,kind:'upload',trialName:trialName(row),previewLabel:`預覽${row.name}`,downloadLabel:`下載${row.name}Excel範本`}))
 ];
 const needle=search.trim().toLowerCase();
 const matching=items.filter(row=>[row.name,row.version,row.equipment,row.specification,row.trialName,...row.aliases||[],row.kind==='trial'?'試驗範本':'',row.id==='BLANK'?'空白委託單 電子委託':'','xlsx'].join(' ').toLowerCase().includes(needle));
 const rows=matching.filter(row=>category==='all'||row.kind===category);
 const activeLabel=categories.find(([key])=>key===category)?.[1]||'全部範本';
 const readFile=useCallback(async row=>{
  const access={actorId,system};assertTemplateAccess(access);
  if(row.kind==='trial')return readTrialTemplateFile({...access,templateId:row.id,expectedRevision:row.revision});
  if(row.kind==='upload')return readUploadedTemplate(row.id,access);
  if(row.id==='BLANK'){const bytes=await requestWorkbookBytes({});assertTemplateAccess(access);return {name:'空白電子委託單.xlsx',bytes};}
  const bytes=new Uint8Array(await assetBytes(generalPath,{signal:lifetime.current?.signal,message:'一般性能報告範本無法讀取，請稍後再試。'}));assertTemplateAccess(access);
  return {name:'一般性能試驗報告範本.xlsx',bytes};
 },[actorId,system]);
 const readSelected=useCallback(()=>readFile(selected),[readFile,selected]);
 async function download(row){
  if(pending.current)return;pending.current=true;setBusy(row.id);setError('');
  const controller=lifetime.current;
  try{const file=await readFile(row);if(!controller?.signal.aborted)downloadTemplate(file);}
  catch(e){if(!controller?.signal.aborted)setError(e.message);}
  finally{pending.current=false;if(!controller?.signal.aborted)setBusy('');}
 }
 function choose(key){onCategoryChange(key);}
 function tabKeyDown(event,index){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?categories.length-1:(index+(event.key==='ArrowRight'?1:-1)+categories.length)%categories.length;
  choose(categories[next][0]);const tab=document.getElementById(`${id}-${categories[next][0]}`);tab?.focus();tab?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 const invalidated=selected?.kind==='trial'?(selected.revision!==catalog.revision?'範本資料已更新，請關閉後重新開啟預覽。':catalog.error||''):'';
 return <section className="report-template-browser" aria-label="委託單與報告範本管理">
  <header className="rtb-heading"><div><h3>報告範本庫</h3><p>依用途找範本，預覽確認後下載 Excel。</p></div><span className="rtb-format">XLSX</span></header>
  <div className="rtb-tabs" role="tablist" aria-label="範本用途分類">{categories.map(([key,label],index)=><button type="button" role="tab" key={key} id={`${id}-${key}`} aria-selected={category===key} aria-controls={`${id}-panel`} tabIndex={category===key?0:-1} onClick={()=>choose(key)} onKeyDown={event=>tabKeyDown(event,index)}>{label}<span>{matching.filter(row=>key==='all'||row.kind===key).length}</span></button>)}</div>
  <div className="rtb-results" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${category}`} tabIndex={0}>
   <div className="rtb-list-heading"><strong>{activeLabel}</strong><span role="status">{rows.length} 份{needle?'符合搜尋':''}</span></div>
   {(sourceError||catalog.error||error)&&<p role="alert">{error||catalog.error||sourceError}</p>}
   {busy&&<p className="rtb-busy" role="status">正在準備 Excel 範本…</p>}
   {rows.length?<PaginatedList items={rows} resetKey={`${category}:${search}`}>{page=><ul className="rtb-list">{page.map(row=><li key={`${row.kind}-${row.id}`} className="rtb-row">
    <div className="rtb-document"><span className={`rtb-document-icon rtb-${row.kind}`}><Icon/></span><div><h4>{row.name}</h4><span className="rtb-kind">{row.kind==='trial'?'試驗範本':row.kind==='upload'?'上傳版本':'通用文件'}</span></div></div>
    <div className="rtb-metadata"><span><small>版本</small>{row.version}</span>{row.kind==='trial'?<span><small>試驗工時</small>{row.durationHours} 小時</span>:row.kind==='upload'?<span><small>對應項目</small>{row.trialName}</span>:null}</div>
    <div className="rtb-actions"><button type="button" disabled={!!busy||row.kind==='trial'&&!!catalog.error} aria-label={row.previewLabel} title={row.previewLabel} onClick={()=>{setError('');setSelected(row);}}><Icon kind="eye"/><span>預覽</span></button>{row.id==='GENERAL'?<a href={generalPath} download="一般性能試驗報告範本.xlsx" aria-label="下載範本" title="下載一般性能報告範本"><Icon kind="download"/><span>下載 Excel</span></a>:<button type="button" disabled={!!busy||row.kind==='trial'&&!!catalog.error} aria-label={row.downloadLabel} title={row.downloadLabel} onClick={()=>download(row)}><Icon kind="download"/><span>{busy===row.id?'準備中…':'下載 Excel'}</span></button>}</div>
    <details className="rtb-details"><summary><Icon kind="chevron"/>範本內容與對應資料</summary><div>{row.kind==='trial'?<><p className="rtb-contents">包含委託單、報告首頁、試驗過程、結果與照片；量測結果、判定與簽名留白。</p><dl><div><dt>適用設備</dt><dd>{row.equipment||'尚未設定'}</dd></div>{row.aliases.length>0&&<div><dt>亦對應試驗</dt><dd>{row.aliases.join('、')}</dd></div>}<div><dt>試驗規範／手法</dt><dd>{row.specification||'尚未設定'}</dd></div></dl></>:row.kind==='upload'?<p>{row.trialBinding?.status==='VERIFIED'?'試驗對應已核對。':row.trialId==='CUSTOM'?'自訂版本，不自動套用案件。':row.trialId==='BLANK'?'空白委託單。':'既有版本，預覽／下載時核對試驗。'}此版本保留在目前瀏覽器，可於文件與報告設定管理。</p>:<p>{row.description}</p>}</div></details>
   </li>)}</ul>}</PaginatedList>:<div className="rtb-empty"><Icon/><strong>{needle?'沒有符合搜尋條件的報告範本':category==='upload'?'尚無上傳範本':'目前沒有這類範本'}</strong><p>{needle?'請調整關鍵字、切換分類，或清除篩選。':'上傳版本可在系統管理的「文件與報告設定」新增。'}</p></div>}
  </div>
  <p className="rtb-footnote">試驗範本與試驗參數共用最新資料；上傳版本儲存在目前瀏覽器，不會覆蓋既有案件。</p>
  {selected&&<TemplatePreview title={selected.name+(selected.kind==='trial'?'｜試驗':'')} read={readSelected} invalidated={invalidated} onClose={()=>setSelected(null)}/>}
 </section>;
}
