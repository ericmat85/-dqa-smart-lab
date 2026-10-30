import {useEffect,useState} from 'react';
import {buildWorkbookView,readReportWorkbook} from './reportWorkbookView.mjs';
import './ReportWorkbookView.css';
export default function ReportWorkbookView({requestId,actorId,revision,onReady}){
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[sheetIndex,setSheetIndex]=useState(0),[zoom,setZoom]=useState(.75),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let cancelled=false;const urls=[];
  async function load(){
   setLoading(true);setError('');setResult(null);setSheetIndex(0);onReady?.(null);
   try{
    const file=await readReportWorkbook({requestId,actorId,expectedRevision:revision}),model=await buildWorkbookView(file.bytes);
    if(cancelled)return;
    for(const sheet of model.sheets)for(const picture of sheet.images){picture.url=URL.createObjectURL(new Blob([picture.bytes],{type:picture.type}));urls.push(picture.url);}
    setResult({...model,fileName:file.fileName});onReady?.(file.revision);
   }catch(err){if(!cancelled)setError(err.message);}finally{if(!cancelled)setLoading(false);}
  }
  load();return()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[requestId,actorId,revision,attempt,onReady]);
 const sheet=result?.sheets[sheetIndex];
 return <section className="workbook-view" aria-label="Excel 報告唯讀檢視"><header><div><h4>Excel 報告檢視</h4><small>{result?.fileName||'讀取目前簽核版本'} · 唯讀檢視，不會產生 PDF</small></div><label>顯示比例<select value={zoom} onChange={event=>setZoom(Number(event.target.value))}>{[.5,.75,1,1.25].map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</select></label></header>{loading&&<p role="status">正在讀取完整 Excel、圖片與簽名…</p>}{error&&<p role="alert">{error}<button onClick={()=>setAttempt(value=>value+1)}>重新載入 Excel</button></p>}{result&&<><div className="workbook-sheets" role="tablist" aria-label="報告工作表">{result.sheets.map((item,index)=><button key={item.name} role="tab" id={`sheet-tab-${index}`} aria-selected={index===sheetIndex} aria-controls="workbook-sheet-panel" onClick={()=>setSheetIndex(index)}>{item.name}</button>)}</div><p className="workbook-sheet-meta">{sheet.rows.length} 列 × {sheet.widths.length} 欄 · 可在檢視區上下及左右捲動，查看全部欄位。</p><div className="workbook-scroll" role="tabpanel" id="workbook-sheet-panel" aria-labelledby={`sheet-tab-${sheetIndex}`} tabIndex={0}><div style={{width:sheet.width*zoom,height:sheet.height*zoom}}><div className="workbook-sheet" style={{width:sheet.width,height:sheet.height,zoom}}><table aria-label={sheet.name} style={{width:sheet.width}}><colgroup>{sheet.widths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup><tbody>{sheet.rows.map(row=><tr key={row.number} style={{height:row.height}}>{row.cells.map(cell=><td key={cell.address} data-cell={cell.address} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={cell.style}>{cell.text}</td>)}</tr>)}</tbody></table>{sheet.images.map((picture,index)=><img key={index} src={picture.url} alt={`${sheet.name} 圖片／簽名 ${index+1}`} style={{left:picture.left,top:picture.top,width:picture.width,height:picture.height}}/>)}</div></div></div>{result.warnings.map(warning=><p key={warning} className="workbook-warning">{warning}</p>)}</>}<small className="workbook-limit">瀏覽器檢視表格、合併儲存格、數值、內嵌圖片與簽名；複雜 Excel 圖表、頁首頁尾或浮動物件可能需下載原檔核對。</small></section>;
}
