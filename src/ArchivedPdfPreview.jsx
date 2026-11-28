import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import ActionIcon from './ActionIcon.jsx';
import ArchivedPdfPages from './ArchivedPdfPages.jsx';
import './ArchivedPdfPreview.css';
import {printWorkbookSheet} from './printWorkbookSheet.mjs';

export default function ArchivedPdfPreview({preview,onClose}){
 const dialog=useRef(null),close=useRef(null),area=useRef(null),[zoom,setZoom]=useState(null),[fitPercent,setFitPercent]=useState(100);
 const printJob=useRef(null),[pageCount,setPageCount]=useState(0),[pageIndex,setPageIndex]=useState(0),[printError,setPrintError]=useState('');
 async function print(){setPrintError('');const canvas=area.current?.querySelector(`[data-page-index="${pageIndex}"] canvas[data-ready="true"]`);if(!canvas){setPrintError('請等候目前頁面顯示完成後再列印。');return;}const paper=document.createElement('div'),img=document.createElement('img'),height=794*canvas.height/canvas.width;paper.className='template-preview-paper';Object.assign(paper.style,{width:'794px',height:height+'px'});img.src=canvas.toDataURL('image/png');Object.assign(img.style,{width:'794px',height:height+'px',left:'0',top:'0'});paper.append(img);printJob.current?.abort();printJob.current=new AbortController();try{await printWorkbookSheet(paper,{title:preview.name+' 第'+(pageIndex+1)+'頁',width:794,height,signal:printJob.current.signal});}catch(e){if(e.name!=='AbortError')setPrintError(e.message);}}
 const percent=zoom??fitPercent,steps=[25,50,75,100,125,150,175,200],zoomBy=direction=>setZoom(Math.max(25,Math.min(200,(direction>0?Math.floor(percent/25)+1:Math.ceil(percent/25)-1)*25)));
 const canZoom=!preview.loading&&Boolean(preview.url||preview.guided);
 useEffect(()=>{if(!preview.guided||!area.current)return;const observer=new ResizeObserver(entries=>setFitPercent(Math.max(1,Math.round(Math.min(794,Math.max(1,entries[0].contentRect.width-32))/794*100))));observer.observe(area.current);return()=>observer.disconnect();},[preview.guided]);
 useEffect(()=>{
  const previous=preview.trigger||document.activeElement,element=dialog.current,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';element.showModal();close.current?.focus();
  return()=>{printJob.current?.abort();element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus?.({preventScroll:true});};
 },[preview.trigger]);
 return createPortal(<dialog ref={dialog} className="archived-pdf-viewer" aria-label="結案 PDF 預覽" onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="archived-pdf-toolbar"><div className="archived-pdf-title"><strong>{preview.name}</strong><span>A4 · 全螢幕預覽</span></div><div className="archived-pdf-zoom" role="group" aria-label="PDF 縮放"><button type="button" aria-label="縮小 PDF" title="縮小" disabled={!canZoom||percent<=25} onClick={()=>zoomBy(-1)}>−</button><select aria-label="PDF 縮放比例" disabled={!canZoom} value={zoom??'fit'} onChange={event=>setZoom(event.target.value==='fit'?null:Number(event.target.value))}><option value="fit">適合視窗（{fitPercent}%）</option>{steps.map(step=><option key={step} value={step}>{step}%</option>)}</select><button type="button" aria-label="放大 PDF" title="放大" disabled={!canZoom||percent>=200} onClick={()=>zoomBy(1)}>＋</button></div><div className="archived-pdf-page-tools"><label>頁面<select aria-label="PDF 頁面" disabled={!pageCount} value={pageIndex} onChange={e=>setPageIndex(Number(e.target.value))}>{Array.from({length:pageCount||1},(_,i)=><option key={i} value={i}>{i+1} / {pageCount||1}</option>)}</select></label></div><div className="archived-pdf-actions">{preview.url&&<button type="button" aria-label="列印目前 PDF 頁" title="列印目前 PDF 頁" disabled={!pageCount} onClick={print}><ActionIcon name="print"/></button>}{preview.url&&<a href={preview.url} download={preview.name} aria-label="下載 PDF" title="下載 PDF"><ActionIcon name="download"/></a>}<button ref={close} type="button" aria-label="關閉預覽" title="關閉預覽（Esc）" onClick={onClose}><span aria-hidden="true">×</span></button></div></header>
  {printError&&<p role="alert" className="archived-pdf-message">{printError}</p>}<div ref={area} className="archived-pdf-canvas">{preview.loading?<div className="archived-pdf-loading" role="status">正在讀取結案 PDF…</div>:preview.guided?<figure className="guided-report-preview"><figcaption>Demo 報告示意圖 · 非正式試驗結果；實際結案 PDF 可下載。</figcaption><img style={zoom?{width:794*zoom/100,maxWidth:'none'}:undefined} src="/images/tour-demo-report.svg" alt="導覽 Demo 試驗報告：設備、試驗條件、結果與簽核版面示意"/></figure>:<ArchivedPdfPages url={preview.url} zoom={zoom} onFitPercent={setFitPercent} onPageCount={setPageCount} pageIndex={pageIndex}/>}</div>
 </dialog>,document.body);
}
