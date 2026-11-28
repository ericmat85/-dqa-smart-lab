import TemplatePreview from './TemplatePreview.jsx';
import ActionIcon from './ActionIcon.jsx';
import {useCallback,useEffect,useId,useState} from 'react';
import {buildWorkbookView,readReportWorkbook} from './reportWorkbookView.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
import './ReportWorkbookView.css';
export default function ReportWorkbookView({requestId,actorId,revision,onReady,documentKind='report'}){
 const viewId=useId(),isRequest=documentKind==='request';
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[sheetIndex,setSheetIndex]=useState(0),[zoom,setZoom]=useState(.75),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let cancelled=false;const urls=[];
  async function load(){
   setLoading(true);setError('');setResult(null);setSheetIndex(0);onReady?.(null);
   try{
    const file=await readReportWorkbook({requestId,actorId,expectedRevision:revision}),model=await buildWorkbookView(isRequest?await requestWorkbookBytes(file.request):file.bytes);
    if(cancelled)return;
    for(const sheet of model.sheets)for(const picture of sheet.images){picture.url=URL.createObjectURL(new Blob([picture.bytes],{type:picture.type}));urls.push(picture.url);}
    setResult({...model,fileName:isRequest?`${requestId}｜委託單`:file.fileName});onReady?.(file.revision);
   }catch(err){if(!cancelled)setError(err.message);}finally{if(!cancelled)setLoading(false);}
  }
  load();return()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[requestId,actorId,revision,attempt,onReady,isRequest]);
 const [full,setFull]=useState(false);
 const readFull=useCallback(async()=>{const f=await readReportWorkbook({requestId,actorId,expectedRevision:revision});return {name:isRequest?requestId+'-委託單.xlsx':f.fileName,bytes:isRequest?await requestWorkbookBytes(f.request):f.bytes};},[requestId,actorId,revision,isRequest]);
 const sheet=result?.sheets[sheetIndex];
 return <section className="workbook-view" aria-label={isRequest?'委託單版面唯讀檢視':'Excel 報告唯讀檢視'}><header><div><h4>{isRequest?'委託單版面檢視':'Excel 報告檢視'}</h4><small>{result?.fileName||'讀取目前簽核版本'} · 唯讀檢視，不會產生 PDF</small></div><button type="button" className="template-btn secondary icon-action" title="全螢幕預覽" aria-label="全螢幕預覽" disabled={!result||loading} onClick={()=>setFull(true)}><ActionIcon name="expand"/></button><label>顯示比例<select value={zoom} onChange={event=>setZoom(Number(event.target.value))}>{[.5,.75,1,1.25].map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</select></label></header>{loading&&<p role="status">正在讀取完整 Excel、圖片與簽名…</p>}{error&&<p role="alert">{error}<button onClick={()=>setAttempt(value=>value+1)}>重新載入 Excel</button></p>}{result&&<><div className="workbook-sheets" role="tablist" aria-label={isRequest?'委託單工作表':'報告工作表'}>{result.sheets.map((item,index)=><button key={item.name} role="tab" id={`${viewId}-sheet-tab-${index}`} aria-selected={index===sheetIndex} aria-controls={`${viewId}-sheet-panel`} onClick={()=>setSheetIndex(index)}>{item.name}</button>)}</div><p className="workbook-sheet-meta">{sheet.rows.length} 列 × {sheet.widths.length} 欄 · 可在檢視區上下及左右捲動，查看全部欄位。</p><div className="workbook-scroll" role="tabpanel" id={`${viewId}-sheet-panel`} aria-labelledby={`${viewId}-sheet-tab-${sheetIndex}`} tabIndex={0}><div style={{width:sheet.width*zoom,height:sheet.height*zoom}}><div className="workbook-sheet" style={{width:sheet.width,height:sheet.height,zoom}}><table aria-label={sheet.name} style={{width:sheet.width}}><colgroup>{sheet.widths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup><tbody>{sheet.rows.map(row=><tr key={row.number} style={{height:row.height}}>{row.cells.map(cell=><td key={cell.address} data-cell={cell.address} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={cell.style}>{cell.text}</td>)}</tr>)}</tbody></table>{sheet.images.map((picture,index)=><img key={index} src={picture.url} alt={`${sheet.name} 圖片／簽名 ${index+1}`} style={{left:picture.left,top:picture.top,width:picture.width,height:picture.height}}/>)}</div></div></div>{result.warnings.map(warning=><p key={warning} className="workbook-warning">{warning}</p>)}</>}<small className="workbook-limit">瀏覽器檢視表格、合併儲存格、數值、內嵌圖片與簽名；複雜 Excel 圖表、頁首頁尾或浮動物件需由報告填寫人員核對原始檔。</small>{full&&<TemplatePreview title={result?.fileName||requestId} read={readFull} onClose={()=>setFull(false)}/>}</section>;
}
