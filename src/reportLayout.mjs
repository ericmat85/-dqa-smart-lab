// Excel's rowCount/columnCount include formatting-only cells (sometimes XFD).
// Keep real data, merged regions, images and the declared print area instead.
export function cellText(cell){
 const source=cell.isMerged?cell.master:cell;
 return source.value==null?'':source.text;
}
export function reportBounds(sheet){
 let rows=1,columns=1;
 const include=(row,col)=>{rows=Math.max(rows,row);columns=Math.max(columns,col);};
 sheet.eachRow(row=>row.eachCell(cell=>{
  if(cell.isMerged&&cell.master.address!==cell.address)return;
  if(cell.value!=null&&cell.value!=='')include(cell.row,cell.col);
 }));
 const ranges=[...(sheet.model.merges||[]),...(sheet.pageSetup.printArea||'').split('&&')];
 for(const range of ranges){
  const match=range.replaceAll('$','').match(/^(?:[^!]+!)?([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if(!match)continue;
  const col=Array.from(match[3].toUpperCase()).reduce((n,char)=>n*26+char.charCodeAt(0)-64,0);
  include(Number(match[4]),col);
 }
 for(const image of sheet.getImages())include(Math.ceil(image.range.br?.row??image.range.tl.row+3)+1,Math.ceil(image.range.br?.col??image.range.tl.col+3));
 if(rows>2000||columns>50)throw Error(`工作表「${sheet.name}」的實際內容或列印範圍為 ${rows.toLocaleString('en-US')} 列、${columns} 欄，超過 Demo 支援的 2,000 列、50 欄。請縮小內容或列印範圍；空白格式欄不計入限制。`);
 return {rows,columns};
}
