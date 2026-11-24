import {assetBytes} from './assetBytes.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {pdfTextLayout} from './pdfTextLayout.mjs';
const text=value=>Array.from(String(value??'—')).filter(char=>char==='\n'||char==='\t'||char.charCodeAt(0)>=32&&char.charCodeAt(0)!==127).join('');
export async function buildManagementExport({type,title,columns,rows,summary='',fontBytes}){
 if(!['xlsx','pdf'].includes(type))throw Error('不支援的匯出格式');
 if(!columns.length||!rows.length)throw Error('請先選擇欄位，並確認篩選結果有資料。');
 if(type==='xlsx'){
  const Excel=await excelModule(),book=new Excel.Workbook();book.creator='DQA Smart Lab';
  const sheet=book.addWorksheet('報表明細');sheet.columns=columns.map(column=>({header:column.label,key:column.key,width:24}));
  for(const row of rows)sheet.addRow(Object.fromEntries(columns.map(column=>[column.key,typeof row[column.key]==='number'?row[column.key]:text(row[column.key])])));
  sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:columns.length}};
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF7C3AED'}};
  if(summary){const notes=book.addWorksheet('匯出摘要');notes.columns=[{width:24},{width:100}];notes.addRows([['報表',title],['筆數',rows.length],['篩選與時間',summary],['說明','本機 Demo 資料快照，非正式稽核報告。']]);}
  return new Uint8Array(await book.xlsx.writeBuffer());
 }
 const [{PDFDocument,StandardFonts,rgb},kit]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
 if(!fontBytes){fontBytes=await assetBytes(`${import.meta.env?.BASE_URL||'/'}fonts/NotoSansCJKtc-Regular.otf`,{message:'中文字型載入失敗，請稍後再試。'});}
 const doc=await PDFDocument.create();doc.registerFontkit(kit.default);const cjk=await doc.embedFont(fontBytes,{subset:true}),latin=await doc.embedFont(StandardFonts.Helvetica),layout=pdfTextLayout(cjk,latin);
 doc.setTitle(title);const W=842,H=595,margin=30,size=9,lineHeight=14,width=(W-margin*2)/columns.length;
 function wrap(value,maxWidth){const lines=[];let line='';for(const char of text(value)){if(char==='\n'||line&&layout.width(line+char,size)>maxWidth){lines.push(line);line=char==='\n'?'':char;}else line+=char;}lines.push(line);return lines;}
 let page,y,pageNumber=0;
 const draw=(value,x,top,fontSize=size,color=rgb(.15,.2,.3))=>layout.draw(page,value,{x,y:top,size:fontSize,color});
 function newPage(){page=doc.addPage([W,H]);pageNumber++;draw(title,margin,H-margin,15);draw(`第 ${pageNumber} 頁 · 共 ${rows.length} 筆`,margin,16,8);y=H-margin-24;
  if(summary){for(const line of wrap(summary,W-margin*2).slice(0,4)){draw(line,margin,y,8);y-=lineHeight;}y-=8;}
  page.drawRectangle({x:margin,y:y-20,width:W-margin*2,height:24,color:rgb(.95,.92,1)});columns.forEach((column,i)=>draw(column.label,margin+i*width+4,y-12));y-=34;
 }
 newPage();
 for(const row of rows){const cells=columns.map(column=>wrap(row[column.key],width-8));const lines=Math.max(...cells.map(cell=>cell.length));
  if(y-Math.min(lines*lineHeight,200)<40)newPage();
  for(let line=0;line<lines;line++){if(y<40)newPage();cells.forEach((cell,i)=>{if(cell[line]!==undefined)draw(cell[line],margin+i*width+4,y);});y-=lineHeight;}
  y-=9;page.drawLine({start:{x:margin,y:y+4},end:{x:W-margin,y:y+4},thickness:.4,color:rgb(.87,.89,.93)});
 }
 return new Uint8Array(await doc.save());
}
export function downloadManagementExport(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type:type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}

export function managementExportTime(){const date=new Date();return {stamp:date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}),date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)};}
