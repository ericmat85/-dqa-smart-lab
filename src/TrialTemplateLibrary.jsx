import {useCallback,useEffect,useRef,useState} from 'react';
import {PaginatedTable} from './Pagination.jsx';
import useTrialCatalog from './useTrialCatalog.js';
import {readTrialTemplateFile} from './trialTemplateWorkbook.mjs';
import TemplatePreview,{downloadTemplate} from './TemplatePreview.jsx';
import './TrialTemplateLibrary.css';
export default function TrialTemplateLibrary({actorId,system,search=''}){
 const lifetime=useRef(null);useEffect(()=>{const c=new AbortController();lifetime.current=c;return()=>c.abort();},[actorId,system]);
 const catalog=useTrialCatalog(),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const needle=search.trim().toLowerCase(),rows=catalog.rows.filter(r=>[r.name,r.version,r.equipment,r.specification,'xlsx','試驗範本'].join(' ').toLowerCase().includes(needle));
 const read=useCallback(()=>readTrialTemplateFile({actorId,system,templateId:selected?.id,expectedRevision:selected?.revision}),[actorId,system,selected?.id,selected?.revision]);
 async function load(row,preview){if(busy)return;if(preview){setSelected({...row,revision:catalog.revision});return;}setBusy(true);setError('');try{const signal=lifetime.current?.signal,file=await readTrialTemplateFile({actorId,system,templateId:row.id,expectedRevision:catalog.revision});if(!signal?.aborted)downloadTemplate(file);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="trial-template-library"><h3>試驗範本 <small>{rows.length}／{catalog.rows.length} 項</small></h3><p>每份包含委託單、報告首頁、試驗過程、結果與照片，以及完整規範來源。量測結果、判定與簽名留白；與試驗參數共用最新版本。</p>{(catalog.error||error)&&<p role="alert">{catalog.error||error}</p>}
 <div className="archive-table-wrap"><PaginatedTable className={system==='lms'?'template-table':undefined} resetKey={search}><thead><tr><th>範本名稱</th><th>規範版本</th><th>試驗工時</th><th>操作</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.version}</td><td>{row.durationHours} 小時</td><td><div className="archive-actions"><button type="button" className="template-btn secondary" disabled={busy||!!catalog.error} aria-label={'預覽'+row.name+'範本'} onClick={()=>load(row,true)}>預覽</button><button type="button" className="template-btn secondary" disabled={busy||!!catalog.error} aria-label={'下載'+row.name+'Excel範本'} onClick={()=>load(row,false)}>下載 Excel</button></div></td></tr>):<tr><td colSpan="4">沒有符合搜尋條件的試驗範本。</td></tr>}</tbody></PaginatedTable></div>
 {(!needle||'一般性能試驗報告範本 xlsx'.includes(needle))&&<section className="trial-template-general" aria-label="一般性能報告範本"><h3>一般性能報告範本</h3><a className="archive-template-download" href={`${import.meta.env.BASE_URL}templates/general-performance-v1.xlsx`} download="一般性能試驗報告範本.xlsx">下載範本</a></section>}
 {busy&&<p role="status">正在準備 Excel 範本…</p>}{selected&&<TemplatePreview title={selected.name+'｜試驗'} read={read} invalidated={selected.revision!==catalog.revision?'範本資料已更新，請關閉後重新開啟預覽。':catalog.error||''} onClose={()=>setSelected(null)}/>}
 </div>;
}
