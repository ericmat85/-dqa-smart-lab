// Excel's rowCount/columnCount include formatting-only cells (sometimes XFD).
// Keep real data, merged regions, images and the declared print area instead.
export function cellText(cell){
 const source=cell.isMerged?cell.master:cell;
 return source.value==null?'':source.text;
}
function rangeEnd(range){
 const match=range.replaceAll('$','').match(/^(?:[^!]+!)?([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
 if(!match)return null;
 const col=letters=>Array.from(letters.toUpperCase()).reduce((n,char)=>n*26+char.charCodeAt(0)-64,0);
 return {top:Number(match[2]),left:col(match[1]),bottom:Number(match[4]),right:col(match[3])};
}
export function emptyOutsidePrintMerges(sheet){
 const areas=(sheet.pageSetup.printArea||'').split('&&').map(rangeEnd).filter(Boolean);
 if(!areas.length)return [];
 return (sheet.model.merges||[]).filter(range=>{
  const box=rangeEnd(range);if(!box)return false;
  if(areas.some(area=>box.left<=area.right&&box.right>=area.left&&box.top<=area.bottom&&box.bottom>=area.top))return false;
  const master=sheet.getCell(range.split(':')[0]);return master.value==null||master.value==='';
 });
}
export function normalizeReportMerges(book){
 book.eachSheet(sheet=>{for(const range of emptyOutsidePrintMerges(sheet))sheet.unMergeCells(range);});
}
export function reportBounds(sheet){
 let rows=1,columns=1;
 const include=(row,col)=>{rows=Math.max(rows,row);columns=Math.max(columns,col);};
 sheet.eachRow(row=>row.eachCell(cell=>{
  if(cell.isMerged&&cell.master.address!==cell.address)return;
  if(cell.value!=null&&cell.value!=='')include(cell.row,cell.col);
 }));
 const ignored=new Set(emptyOutsidePrintMerges(sheet));
 const ranges=[...(sheet.model.merges||[]).filter(range=>!ignored.has(range)),...(sheet.pageSetup.printArea||'').split('&&')];
 for(const range of ranges){const box=rangeEnd(range);if(box)include(box.bottom,box.right);}
 for(const image of sheet.getImages())include(Math.ceil(image.range.br?.row??image.range.tl.row+3)+1,Math.ceil(image.range.br?.col??image.range.tl.col+3));
 if(rows>2000||columns>50)throw Error(`工作表「${sheet.name}」的實際內容或列印範圍為 ${rows.toLocaleString('en-US')} 列、${columns} 欄，超過 Demo 支援的 2,000 列、50 欄。請縮小內容或列印範圍；列印範圍外的空白格式與空白合併欄不計入限制。`);
 return {rows,columns};
}
