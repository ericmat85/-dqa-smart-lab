import './ResourceActions.css';
import {assetBytes} from './assetBytes.mjs';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {PaginatedTable} from './Pagination.jsx';
import TemplatePreview,{downloadTemplate} from './TemplatePreview.jsx';
import {assertTemplateAccess,readUploadedTemplate,readWorkspaceBlankTemplate} from './reportTemplateStore.mjs';
import {readTrialTemplateFile} from './trialTemplateWorkbook.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
import {correspondingTrialNames} from './trialTemplateMatching.mjs';
import './ReportTemplateBrowser.css';
import {trialTemplateFile} from './trialTemplateDeliveryClient.mjs';

const categories=[['all','全部範本'],['trial','試驗範本'],['general','通用文件'],['upload','上傳版本']];
const generalPath=`${import.meta.env.BASE_URL}templates/general-performance-v1.xlsx`;
function Icon({kind='file'}){
 const paths={file:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',download:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M12 10v7m-3-3 3 3 3-3',chevron:'m9 5 7 7-7 7'};
 return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.file}/></svg>;
}

export default function ReportTemplateBrowser({actorId,system,catalog,uploads,search,category,onCategoryChange,sourceError,builtinVisible=true,defaultTemplateId='BLANK',reportBindings}){
 const id=useId(),lifetime=useRef(null),pending=useRef(false);
 const [selected,setSelected]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[actorId,system]);
 const trialName=row=>catalog.rows.find(c=>c.id===row.trialId)?.name||({BLANK:'空白委託單',CUSTOM:'自訂報告範本'})[row.trialId]||'待核對試驗';
 const workspaceDefault=uploads.find(row=>row.id===defaultTemplateId&&row.trialId==='BLANK');
 const defaultError=defaultTemplateId!=='BLANK'&&!workspaceDefault?'工作區預設綁定無法讀取，請管理員重新設定。':'';
 const items=[
  ...(defaultTemplateId!=='BLANK'&&workspaceDefault?[{id:'WORKSPACE_DEFAULT',templateRef:workspaceDefault.id,kind:'general',name:'工作區預設委託單',sourceName:workspaceDefault.name,version:workspaceDefault.version,description:`綁定：${workspaceDefault.name}。使用此版本的原始Excel檔案。`,previewLabel:'預覽工作區預設委託單',downloadLabel:'下載工作區預設委託單'}]:[]),
  ...(builtinVisible?[{id:'BLANK',kind:'general',name:'空白電子委託單',version:'A4 · 中英欄位',description:'含試驗規範、判定基準及簽名欄位，適合建立新委託單。',previewLabel:'預覽空白委託單',downloadLabel:'下載空白委託單'}]:[]),
  {id:'GENERAL',kind:'general',name:'一般性能報告範本',version:'V1',description:'一般性能試驗報告的通用 Excel 原稿。',previewLabel:'預覽一般性能報告範本',downloadLabel:'下載範本'},
  ...catalog.rows.filter(row=>!reportBindings?.loading&&!reportBindings?.error&&row.profileId!=='COMPOUND_ENVIRONMENT'&&!(reportBindings?.hidden_builtin_template_ids||[]).includes(row.id)).map(row=>({...row,kind:'trial',aliases:correspondingTrialNames(row,catalog.rows),revision:catalog.revision,previewLabel:`預覽${row.name}範本`,downloadLabel:`下載${row.name}Excel範本`})),
  ...(reportBindings?.files||[]).map(row=>({...row,kind:'upload',cloudReport:true,trialName:reportBindings.trials.find(t=>t.id===row.trial_id)?.name||'原試驗已停用',previewLabel:`預覽${row.name}`,downloadLabel:`下載${row.name}Excel範本`})),
  ...uploads.map(row=>({...row,kind:'upload',trialName:trialName(row),previewLabel:`預覽${row.name}`,downloadLabel:`下載${row.name}Excel範本`}))
 ];
 const needle=search.trim().toLowerCase();
 const matching=items.filter(row=>[row.name,row.sourceName,row.version,row.equipment,row.specification,row.trialName,...row.aliases||[],row.kind==='trial'?'試驗範本':'',row.id==='BLANK'?'空白委託單 電子委託':'','xlsx'].join(' ').toLowerCase().includes(needle));
 const rows=matching.filter(row=>category==='all'||row.kind===category);
 const activeLabel=categories.find(([key])=>key===category)?.[1]||'全部範本';
 const readFile=useCallback(async row=>{
  const access={actorId,system};assertTemplateAccess(access);
  if(row.id==='WORKSPACE_DEFAULT')return readWorkspaceBlankTemplate(access,{expectedId:row.templateRef});
  if(row.cloudReport)return trialTemplateFile(row.id,actorId);
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
 const invalidated=selected?.id==='WORKSPACE_DEFAULT'&&selected.templateRef!==defaultTemplateId?'預設綁定已更新，請重新開啟預覽。':selected?.kind==='trial'?((reportBindings?.hidden_builtin_template_ids||[]).includes(selected.id)?'範本已刪除，請關閉預覽。':selected.revision!==catalog.revision?'範本資料已更新，請關閉後重新開啟預覽。':catalog.error||''):'';
 return <section className="report-template-browser" aria-label="委託單與報告範本管理">
  <header className="rtb-heading"><div><h3>報告範本庫</h3><p>依用途找範本，預覽確認後下載 Excel。</p></div><span className="rtb-format">XLSX</span></header>
  <div className="rtb-tabs" role="tablist" aria-label="範本用途分類">{categories.map(([key,label],index)=><button type="button" role="tab" key={key} id={`${id}-${key}`} aria-selected={category===key} aria-controls={`${id}-panel`} tabIndex={category===key?0:-1} onClick={()=>choose(key)} onKeyDown={event=>tabKeyDown(event,index)}>{label}<span>{matching.filter(row=>key==='all'||row.kind===key).length}</span></button>)}</div>
  <div className="rtb-results" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${category}`} tabIndex={0}>
   <div className="rtb-list-heading"><strong>{activeLabel}</strong><span role="status">{rows.length} 份{needle?'符合搜尋':''}</span></div>
   {(sourceError||catalog.error||error||defaultError||reportBindings?.error)&&<p role="alert">{error||catalog.error||sourceError||defaultError||reportBindings?.error}</p>}
   {busy&&<p className="rtb-busy" role="status">正在準備 Excel 範本…</p>}
   {rows.length?<div className="rtb-table-wrap"><PaginatedTable className="template-table rtb-table" resetKey={`${category}:${search}`}><thead><tr><th>範本名稱</th><th>分類</th><th>版本</th><th>試驗工時／對應項目</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.kind}-${row.id}`} className="rtb-table-row">
    <td><div className="rtb-document"><span className={`rtb-document-icon rtb-${row.kind}`}><Icon/></span><h4>{row.name}{row.kind==='upload'&&row.id===defaultTemplateId&&<small className="workspace-template-badge">工作區預設</small>}</h4></div><details className="rtb-details"><summary><Icon kind="chevron"/>範本內容與對應資料</summary><div>{row.kind==='trial'?<><p className="rtb-contents">包含委託單、報告首頁、試驗過程、結果與照片；量測結果、判定與簽名留白。</p><dl><div><dt>適用設備</dt><dd>{row.equipment||'尚未設定'}</dd></div>{row.aliases.length>0&&<div><dt>亦對應試驗</dt><dd>{row.aliases.join('、')}</dd></div>}<div><dt>試驗規範／手法</dt><dd>{row.specification||'尚未設定'}</dd></div></dl></>:row.kind==='upload'?<p>{row.cloudReport?'工作區空白試驗報告單；舊版本與案件保留獨立原稿。':row.trialBinding?.status==='VERIFIED'?'試驗對應已核對。':row.trialId==='CUSTOM'?'自訂版本，不自動套用案件。':row.trialId==='BLANK'?'空白委託單。':'既有版本，預覽／下載時核對試驗。'}此版本可於文件與報告設定管理。</p>:<p>{row.description}</p>}</div></details></td>
    <td><span className="rtb-category-label">{row.kind==='trial'?'試驗範本':row.kind==='upload'?'上傳版本':'通用文件'}</span></td><td>{row.version}</td><td>{row.kind==='trial'?`${row.durationHours} 小時`:row.kind==='upload'?row.trialName:'—'}</td>
    <td><div className="rtb-actions resource-row-actions"><button type="button" className="template-btn secondary icon-action" disabled={!!busy||row.kind==='trial'&&!!catalog.error} aria-label={row.previewLabel} title={row.previewLabel} onClick={()=>{setError('');setSelected(row);}}><Icon kind="eye"/></button>{row.id==='GENERAL'?<a className="template-btn secondary icon-action" href={generalPath} download="一般性能試驗報告範本.xlsx" aria-label="下載範本" title="下載一般性能報告範本"><Icon kind="download"/></a>:<button type="button" className="template-btn secondary icon-action" disabled={!!busy||row.kind==='trial'&&!!catalog.error} aria-label={row.downloadLabel} title={row.downloadLabel} onClick={()=>download(row)}><Icon kind="download"/></button>}</div></td>
   </tr>)}</tbody></PaginatedTable></div>:<div className="rtb-empty"><Icon/><strong>{needle?'沒有符合搜尋條件的報告範本':category==='upload'?'尚無上傳範本':'目前沒有這類範本'}</strong><p>{needle?'請調整關鍵字、切換分類，或清除篩選。':'上傳版本可在系統管理的「文件與報告設定」新增。'}</p></div>}

  </div>
  <p className="rtb-footnote">試驗範本與試驗參數共用最新資料；空白委託單的保存版本可於文件與報告設定管理。</p>
  {selected&&<TemplatePreview title={selected.name+(selected.kind==='trial'?'｜試驗':'')} read={readSelected} invalidated={invalidated} onClose={()=>setSelected(null)}/>}
 </section>;
}
