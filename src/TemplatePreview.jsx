import {useEffect,useId,useRef,useState} from 'react';
import ActionIcon from './ActionIcon.jsx';
import CompactDialog from './CompactDialog.jsx';
import {buildWorkbookView} from './reportWorkbookView.mjs';
import {printWorkbookSheet} from './printWorkbookSheet.mjs';
import './TrialTemplateLibrary.css';
export function downloadTemplate(file){const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function TemplatePreview({title,read,onClose,invalidated='',downloadable=true,printable=true,description='',onSelectCell,previewLabel='範本預覽'}){
 const previewId=useId(),lifetime=useRef(0),area=useRef(null),printJob=useRef({controller:null});
 const [view,setView]=useState(null),[sheetIndex,setSheetIndex]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [zoom,setZoom]=useState('width'),[viewport,setViewport]=useState({width:0,height:0});
 useEffect(()=>{const token=++lifetime.current,jobs=printJob.current;let cancelled=false;const urls=[];setView(null);setError('');setSheetIndex(0);setZoom('width');
  if(invalidated){setError(invalidated);setBusy(false);return()=>{cancelled=true;if(lifetime.current===token)lifetime.current++;};}
  (async()=>{try{const file=await read(),model=await buildWorkbookView(file.bytes);await read();if(cancelled)return;for(const sheet of model.sheets)for(const image of sheet.images){image.url=URL.createObjectURL(new Blob([image.bytes],{type:image.type}));urls.push(image.url);}setView(model);}catch(e){if(!cancelled)setError(e.message);}})();
  return()=>{cancelled=true;if(lifetime.current===token)lifetime.current++;jobs.controller?.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
 },[read,invalidated]);
 useEffect(()=>{
  if(!view||!area.current)return;
  const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setViewport({width,height});});
  observer.observe(area.current);return()=>observer.disconnect();
 },[view]);
 async function action(){if(busy)return;const token=lifetime.current;setBusy(true);setError('');try{const file=await read();if(token!==lifetime.current)return;downloadTemplate(file);}catch(e){if(token===lifetime.current)setError(e.message);}finally{if(token===lifetime.current)setBusy(false);}}
 async function print(){if(busy||!view||invalidated)return;const token=lifetime.current,paper=area.current?.querySelector('.template-preview-paper')?.cloneNode(true),selected=view.sheets[sheetIndex];setBusy(true);setError('');printJob.current.controller?.abort();const controller=new AbortController();printJob.current.controller=controller;try{await read();if(token!==lifetime.current)return;await printWorkbookSheet(paper,{title:title+'｜'+selected.name,width:selected.width,height:selected.height,signal:controller.signal});}catch(e){if(token===lifetime.current&&e.name!=='AbortError')setError('無法列印：'+e.message);}finally{if(token===lifetime.current)setBusy(false);}}
 const sheet=view?.sheets[sheetIndex];
 const fitPercent=sheet&&viewport.width>0&&viewport.height>0?Math.max(1,Math.min(200,Math.floor(Math.min((viewport.width-2)/sheet.width,(viewport.height-2)/sheet.height)*100))):100;
 const widthPercent=sheet&&viewport.width>0?Math.max(1,Math.min(300,Math.floor((viewport.width-2)/sheet.width*100))):100;
 const percent=zoom==='fit'?fitPercent:zoom==='width'?widthPercent:zoom,steps=[25,50,75,100,125,150,175,200,250,300];
 function zoomBy(direction){setZoom(Math.max(25,Math.min(300,(direction>0?Math.floor(percent/25)+1:Math.ceil(percent/25)-1)*25)));}
 return <CompactDialog title={title.endsWith('｜試驗')?title+'範本預覽':title+'｜'+previewLabel} onClose={onClose} className="trial-template-dialog">
  <div className="trial-template-preview-body">
   <p>{description||(downloadable?'可切換工作表、縮放、列印或下載目前文件；原稿與既有案件不會因預覽而改變。':'範本工作表預覽；可切換工作表及調整比例。下載原稿請至資料庫。')}</p>
   {!view&&!error&&<p role="status">正在讀取 Excel、示範圖片與版面…</p>}
   {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在產生預覽或檔案，請稍候…</p>}
   {view&&<>
    <div className="template-preview-toolbar">
     <label>工作表<select aria-label="範本預覽工作表" value={sheetIndex} onChange={e=>{setSheetIndex(Number(e.target.value));area.current?.scrollTo(0,0);}}>{view.sheets.map((s,i)=><option value={i} key={s.name}>{s.name}</option>)}</select></label>
     <div className="template-preview-actions">{downloadable&&<button type="button" className="template-btn secondary icon-action template-print-button" aria-label="下載目前文件" title="下載目前文件" disabled={busy||!view||!!invalidated} onClick={action}><ActionIcon name="download"/></button>}{printable&&<button type="button" className="template-btn icon-action template-print-button" aria-label="列印目前工作表" title="列印目前工作表" disabled={busy||!view||!!invalidated} onClick={print}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6zM17 12h1"/></svg></button>}
     <div className="template-preview-zoom" role="group" aria-label="Excel 縮放">
      <button type="button" className="template-btn secondary" aria-label="縮小 Excel" title="縮小" disabled={percent<=25} onClick={()=>zoomBy(-1)}>−</button>
      <select aria-label="Excel 縮放比例" value={zoom} onChange={e=>setZoom(['fit','width'].includes(e.target.value)?e.target.value:Number(e.target.value))}><option value="width">符合頁寬（{widthPercent}%）</option><option value="fit">適合視窗（{fitPercent}%）</option>{steps.map(step=><option key={step} value={step}>{step}%</option>)}</select>
      <button type="button" className="template-btn secondary" aria-label="放大 Excel" title="放大" disabled={percent>=300} onClick={()=>zoomBy(1)}>＋</button>
     </div></div>
    </div>
    <div className="preview-sheet-tabs" role="tablist" aria-label="預覽工作表頁籤">{view.sheets.map((s,i)=><button type="button" role="tab" key={s.name} id={`${previewId}-tab-${i}`} aria-controls={`${previewId}-panel`} aria-selected={i===sheetIndex} tabIndex={i===sheetIndex?0:-1} onClick={()=>{setSheetIndex(i);area.current?.scrollTo(0,0);}} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?view.sheets.length-1:(i+(e.key==='ArrowLeft'?-1:1)+view.sheets.length)%view.sheets.length;setSheetIndex(next);document.getElementById(`${previewId}-tab-${next}`)?.focus();area.current?.scrollTo(0,0);}}>{s.name}</button>)}</div>
    <div ref={area} className="trial-template-sheet" role="region" id={`${previewId}-panel`} aria-label="試驗範本 Excel 預覽" tabIndex={0}>
     <div className="template-preview-paper" style={{width:sheet.width,height:sheet.height,zoom:percent/100}}>
      <table aria-label={sheet.name} style={{width:sheet.width}}><colgroup>{sheet.widths.map((w,i)=><col style={{width:w}} key={i}/>)}</colgroup><tbody>{sheet.rows.map(r=><tr key={r.number} style={{height:r.height}}>{r.cells.map(c=><td key={c.address} data-cell={c.address} tabIndex={onSelectCell?0:undefined} onClick={()=>onSelectCell?.(sheet.name,c.address)} onKeyDown={e=>{if(onSelectCell&&['Enter',' '].includes(e.key)){e.preventDefault();onSelectCell(sheet.name,c.address);}}} rowSpan={c.rowSpan} colSpan={c.colSpan} style={c.style}>{c.text}</td>)}</tr>)}</tbody></table>
      {sheet.images.map((image,i)=><img key={i} src={image.url} alt={`${sheet.name}：合成圖片或範本品牌圖 ${i+1}`} style={{left:image.left,top:image.top,width:image.width,height:image.height}}/>)}
     </div>
    </div>
   </>}
  </div>

 </CompactDialog>;
}
