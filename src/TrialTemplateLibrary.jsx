import {useEffect,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import {PaginatedTable} from './Pagination.jsx';
import useTrialCatalog from './useTrialCatalog.js';
import {readTrialTemplateFile,assertTrialTemplateAccess} from './trialTemplateWorkbook.mjs';
import {buildWorkbookView} from './reportWorkbookView.mjs';
import './TrialTemplateLibrary.css';
function download(file){const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function TrialTemplateLibrary({actorId,system,search=''}){
 const catalog=useTrialCatalog(),[selected,setSelected]=useState(null),[view,setView]=useState(null),[sheetIndex,setSheetIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const task=useRef(0);
 useEffect(()=>()=>{task.current++;},[]);
 const stale=!!selected&&selected.catalogRevision!==catalog.revision;
 useEffect(()=>{if(stale){task.current++;setBusy(false);setView(null);setError('範本資料已更新，請關閉後重新開啟預覽。');}},[stale]);
 const needle=search.trim().toLowerCase(),rows=catalog.rows.filter(r=>[r.name,r.version,r.equipment,r.specification,'xlsx','試驗範本'].join(' ').toLowerCase().includes(needle));
 function close(){task.current++;setSelected(null);setView(null);setBusy(false);setError('');}
 async function load(row,preview){if(busy)return;const token=++task.current;setBusy(true);setError('');if(preview){setSelected({...row,catalogRevision:catalog.revision});setView(null);setSheetIndex(0);}
  try{const file=await readTrialTemplateFile({actorId,system,templateId:row.id,expectedRevision:catalog.revision});if(token!==task.current)return;if(preview){const model=await buildWorkbookView(file.bytes);assertTrialTemplateAccess({actorId,system,templateId:row.id,expectedRevision:file.revision});if(token!==task.current)return;setView({...model,fileName:file.name});}else download(file);}
  catch(e){if(token===task.current)setError(e.message);}finally{if(token===task.current)setBusy(false);}
 }
 const sheet=view?.sheets[sheetIndex],general=!needle||'一般性能試驗報告範本 xlsx'.includes(needle);
 return <div className="trial-template-library">
  <h3>試驗範本 <small>{rows.length}／{catalog.rows.length} 項</small></h3><p>與「試驗與設備參數」共用最新目錄。預覽與 Excel 包含規範、版本及空白試驗紀錄；正式提交報告請使用案件內的 Excel 範本。新增或編輯內容仍保存於目前瀏覽器。</p>
  {(catalog.error||error&&!selected)&&<p role="alert">{catalog.error||error}</p>}
  <div className="archive-table-wrap"><PaginatedTable className={system==='lms'?'template-table':undefined} resetKey={search}><thead><tr><th>範本名稱</th><th>規範版本</th><th>試驗工時</th><th>操作</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.version}</td><td>{row.durationHours} 小時</td><td><div className="archive-actions"><button type="button" className="template-btn secondary" disabled={busy||!!catalog.error} aria-label={'預覽'+row.name+'範本'} onClick={()=>load(row,true)}>預覽</button><button type="button" className="template-btn secondary" disabled={busy||!!catalog.error} aria-label={'下載'+row.name+'Excel範本'} onClick={()=>load(row,false)}>下載 Excel</button></div></td></tr>):<tr><td colSpan="4">沒有符合搜尋條件的試驗範本。</td></tr>}</tbody></PaginatedTable></div>
  {general?<section className="trial-template-general" aria-label="一般性能報告範本"><h3>一般性能報告範本</h3><a className="archive-template-download" href={`${import.meta.env.BASE_URL}templates/general-performance-v1.xlsx`} download="一般性能試驗報告範本.xlsx">下載範本</a></section>:!rows.length&&<p>沒有符合搜尋條件的報告範本。</p>}
  {busy&&!selected&&<p role="status">正在準備 Excel 範本…</p>}
  {selected&&<CompactDialog title={selected.name+'｜試驗範本預覽'} onClose={close} className="trial-template-dialog"><div className="trial-template-preview-body"><p>{selected.version} · 合成 Demo 參考範本；量測結果、正式判定與簽核尚未填寫。</p>{busy&&<p role="status">正在讀取範本…</p>}{error&&<p role="alert">{error}</p>}{view&&<><label>工作表<select aria-label="範本預覽工作表" value={sheetIndex} onChange={e=>setSheetIndex(Number(e.target.value))}>{view.sheets.map((s,i)=><option value={i} key={s.name}>{s.name}</option>)}</select></label><div className="trial-template-sheet" role="region" aria-label="試驗範本 Excel 預覽" tabIndex={0}><table aria-label={sheet.name} style={{width:sheet.width}}><colgroup>{sheet.widths.map((w,i)=><col style={{width:w}} key={i}/>)}</colgroup><tbody>{sheet.rows.map(r=><tr key={r.number} style={{height:r.height}}>{r.cells.map(c=><td key={c.address} rowSpan={c.rowSpan} colSpan={c.colSpan} style={c.style}>{c.text}</td>)}</tr>)}</tbody></table></div></>}</div><footer><button type="button" className="template-btn secondary" onClick={close}>關閉</button><button type="button" className="template-btn" disabled={busy||!!catalog.error||stale} onClick={()=>load(selected,false)}>下載此範本 Excel</button></footer></CompactDialog>}
 </div>;
}
