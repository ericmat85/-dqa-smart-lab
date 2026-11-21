import {appStorage} from './originalBusiness.mjs';
import {getReport} from './reportStore.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {accessSystem} from './demoPermissions.mjs';
import {canReadReport} from './reportRules.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {cellText,normalizeReportMerges,reportBounds} from './reportLayout.mjs';
export async function readReportWorkbook({actorId,requestId,expectedRevision},storage=appStorage(),repository={get:getReport}){
 const report=await repository.get(requestId);
 const accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS)),requests=JSON.parse(storage.getItem('dqa-request-demo-v2')||'[]');
 if(!Array.isArray(accounts)||!Array.isArray(requests))throw Error('帳號或委託資料無法讀取，無法確認報告權限。');
 const actor=accounts.find(row=>row.id===actorId),request=requests.find(row=>row.id===requestId);
 if(!report||!request||!['lms','lab','request'].some(system=>accessSystem(actor,system,storage))||!canReadReport(actor,report,request,storage))throw Error('目前帳號無權檢視這份報告。請使用對應主管帳號登入。');
 if(expectedRevision&&report.revision!==expectedRevision)throw Error('報告版本已更新，請重新開啟檢視。');
 if(!report.signedExcel?.byteLength)throw Error('簽核 Excel 不存在，請確認上傳檔案。');
 return {bytes:report.signedExcel,fileName:report.fileName,revision:report.revision,request};
}
function color(value){const argb=value?.argb;if(typeof argb==='string'&&/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(argb))return '#'+argb.slice(-6);return undefined;}
function cellStyle(cell){
 const font=cell.font||{},alignment=cell.alignment||{},style={fontSize:(font.size||10)*4/3,fontFamily:font.name||'sans-serif',fontWeight:font.bold?'bold':'normal',fontStyle:font.italic?'italic':'normal',color:color(font.color)||'#182b42',background:color(cell.fill?.fgColor)||'#fff',textAlign:alignment.horizontal==='center'?'center':alignment.horizontal==='right'?'right':'left',verticalAlign:alignment.vertical==='bottom'?'bottom':alignment.vertical==='top'?'top':'middle',whiteSpace:alignment.wrapText?'pre-wrap':'pre',overflowWrap:'anywhere'};
 for(const [edge,border]of Object.entries(cell.border||{}))if(['top','bottom','left','right'].includes(edge)&&border?.style)style['border'+edge[0].toUpperCase()+edge.slice(1)]=`${['medium','thick','double'].includes(border.style)?2:1}px ${border.style==='dashed'?'dashed':border.style==='dotted'?'dotted':'solid'} ${color(border.color)||'#96a2b0'}`;
 const diagonals=[];
 if(cell.border?.diagonal?.up)diagonals.push('linear-gradient(to top right, transparent calc(50% - 0.5px), #96a2b0 50%, transparent calc(50% + 0.5px))');
 if(cell.border?.diagonal?.down)diagonals.push('linear-gradient(to bottom right, transparent calc(50% - 0.5px), #96a2b0 50%, transparent calc(50% + 0.5px))');
 if(diagonals.length)style.backgroundImage=diagonals.join(',');
 return style;
}
// Parse cached cell values only: no formula execution, external-link fetching,
// workbook edits or PDF conversion takes place in this viewer.
export async function buildWorkbookView(bytes){
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);normalizeReportMerges(book);
 const warnings=new Set(),sheets=[];
 for(const sheet of book.worksheets.filter(ws=>!ws.state||ws.state==='visible')){
  const bounds=reportBounds(sheet),widths=Array.from({length:bounds.columns},(_,i)=>(sheet.getColumn(i+1).width||8.43)*7+5),heights=Array.from({length:bounds.rows},(_,i)=>(sheet.getRow(i+1).height||15)*4/3);
  const x=[0],y=[0];widths.forEach(value=>x.push(x.at(-1)+value));heights.forEach(value=>y.push(y.at(-1)+value));
  const spans=new Map(),covered=new Set();
  for(const range of sheet.model.merges||[]){
   const [a,b]=range.split(':').map(address=>sheet.getCell(address));if(a.row>bounds.rows||a.col>bounds.columns)continue;
   const lastRow=Math.min(bounds.rows,b.row),lastCol=Math.min(bounds.columns,b.col);spans.set(a.address,{rowSpan:lastRow-a.row+1,colSpan:lastCol-a.col+1});
   for(let row=a.row;row<=lastRow;row++)for(let col=a.col;col<=lastCol;col++)if(row!==a.row||col!==a.col)covered.add(`${row}:${col}`);
  }
  const rows=[];
  for(let row=1;row<=bounds.rows;row++){
   const cells=[];
   for(let col=1;col<=bounds.columns;col++){
    if(covered.has(`${row}:${col}`))continue;
    const cell=sheet.getCell(row,col),value=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cellText(cell);
    if(cell.value?.formula&&cell.value.result===undefined)warnings.add('部分公式沒有已儲存結果；檢視器不會計算公式。');
    cells.push({address:cell.address,text:value,...spans.get(cell.address),style:cellStyle(cell)});
   }
   rows.push({number:row,height:heights[row-1],cells});
  }
  const images=[];
  for(const item of sheet.getImages()){
   const media=book.getImage(item.imageId);
   if(!media||!['png','jpeg','jpg'].includes(media.extension)){warnings.add('部分圖片格式無法在瀏覽器顯示，請由報告填寫人員核對原始 Excel。');continue;}
   let data=media.buffer;if(!data&&media.base64)data=Uint8Array.from(atob(media.base64.split(',').at(-1)),char=>char.charCodeAt(0));
   if(!data){warnings.add('部分圖片缺少內容，請由報告填寫人員核對原始 Excel。');continue;}
   const anchor=item.range.tl,col=Math.floor(anchor.col),row=Math.floor(anchor.row);
   const left=(x[col]||0)+(anchor.col-col)*(widths[col]||0),top=(y[row]||0)+(anchor.row-row)*(heights[row]||0);
   const end=item.range.br,endCol=end?Math.floor(end.col):0,endRow=end?Math.floor(end.row):0;
   const width=item.range.ext?.width||(end?(x[endCol]||0)+(end.col-endCol)*(widths[endCol]||0)-left:210),height=item.range.ext?.height||(end?(y[endRow]||0)+(end.row-endRow)*(heights[endRow]||0)-top:65);
   images.push({bytes:data,type:media.extension==='png'?'image/png':'image/jpeg',left,top,width,height});
  }
  sheets.push({name:sheet.name,widths,rows,images,width:x.at(-1),height:y.at(-1)});
 }
 if(!sheets.length)throw Error('報告沒有可檢視的工作表。');
 const hidden=book.worksheets.length-sheets.length;if(hidden)warnings.add(`另有 ${hidden} 張隱藏工作表；不自動顯示隱藏內容。`);
 return {sheets,warnings:[...warnings]};
}
