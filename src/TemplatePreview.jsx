import {useEffect,useRef,useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import {buildWorkbookView} from './reportWorkbookView.mjs';
import './TrialTemplateLibrary.css';
export function downloadTemplate(file){const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function TemplatePreview({title,read,onClose,invalidated=''}){
 const lifetime=useRef(0);
 const [view,setView]=useState(null),[sheetIndex,setSheetIndex]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const token=++lifetime.current;let cancelled=false;const urls=[];setView(null);setError('');
  if(invalidated){setError(invalidated);setBusy(false);return()=>{cancelled=true;if(lifetime.current===token)lifetime.current++;};}
  (async()=>{try{const file=await read(),model=await buildWorkbookView(file.bytes);await read();if(cancelled)return;for(const sheet of model.sheets)for(const image of sheet.images){image.url=URL.createObjectURL(new Blob([image.bytes],{type:image.type}));urls.push(image.url);}setView(model);}catch(e){if(!cancelled)setError(e.message);}})();
  return()=>{cancelled=true;if(lifetime.current===token)lifetime.current++;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[read,invalidated]);
 async function action(){if(busy)return;const token=lifetime.current;setBusy(true);setError('');try{const file=await read();if(token!==lifetime.current)return;downloadTemplate(file);}catch(e){if(token===lifetime.current)setError(e.message);}finally{if(token===lifetime.current)setBusy(false);}}
 const sheet=view?.sheets[sheetIndex];
 return <CompactDialog title={title.endsWith('｜試驗')?title+'範本預覽':title+'｜範本預覽'} onClose={onClose} className="trial-template-dialog"><div className="trial-template-preview-body"><p>範本工作表預覽；簽名區與量測欄位不預填。可切換工作表並下載 Excel 原檔。</p>{!view&&!error&&<p role="status">正在讀取 Excel、示範圖片與版面…</p>}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在產生預覽或檔案，請稍候…</p>}{view&&<><label>工作表<select aria-label="範本預覽工作表" value={sheetIndex} onChange={e=>{setSheetIndex(Number(e.target.value));}}>{view.sheets.map((s,i)=><option value={i} key={s.name}>{s.name}</option>)}</select></label><div className="trial-template-sheet" role="region" aria-label="試驗範本 Excel 預覽" tabIndex={0}><div className="template-preview-paper" style={{width:sheet.width,height:sheet.height}}><table aria-label={sheet.name} style={{width:sheet.width}}><colgroup>{sheet.widths.map((w,i)=><col style={{width:w}} key={i}/>)}</colgroup><tbody>{sheet.rows.map(r=><tr key={r.number} style={{height:r.height}}>{r.cells.map(c=><td key={c.address} data-cell={c.address} rowSpan={c.rowSpan} colSpan={c.colSpan} style={c.style}>{c.text}</td>)}</tr>)}</tbody></table>{sheet.images.map((image,i)=><img key={i} src={image.url} alt={`${sheet.name}：合成圖片或範本品牌圖 ${i+1}`} style={{left:image.left,top:image.top,width:image.width,height:image.height}}/>)}</div></div></>}</div><footer><button type="button" className="template-btn secondary" onClick={onClose}>關閉</button><button type="button" className="template-btn" disabled={busy||!view||!!invalidated} onClick={action}>下載此範本 Excel</button></footer></CompactDialog>;
}
