export function reportDate(value){if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}):'';}
export function normalizeReportText(value){
 const expression='(?<![\\d.])([0-9]+(?:\\.[0-9]+)?(?:\\s*(?:±|～|~|／|/|–|—)\\s*[0-9]+(?:\\.[0-9]+)?)*)\\s*';
 const render=(numbers,unit,digits)=>numbers.replace(/[0-9]+(?:\.[0-9]+)?/g,n=>Number(n).toFixed(digits))+(/[A-Za-z]/.test(unit[0])?' ':'')+unit;
 return value.replaceAll('☑','■').replace(new RegExp(expression+'(milliseconds?|minutes?|seconds?|hours?|msec|mins?|secs?|hrs?|ms|s|h|毫秒|分鐘|小時|秒)(?![A-Za-z])','gi'),(_,numbers,unit)=>render(numbers,unit,/^(ms|msec|milliseconds?|毫秒)$/i.test(unit)?0:2)).replace(new RegExp(expression+'(V)(?![A-Za-z])','gi'),(_,numbers,unit)=>render(numbers,unit,1));
}
export function applyReportPresentation(book){
 const format=(sheet,address,numFmt)=>{const cell=sheet.getCell(address);cell.style={...cell.style,numFmt};};
 book.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>{
  if(cell.isMerged&&cell.master.address!==cell.address)return;
  if(typeof cell.value==='string')cell.value=normalizeReportText(cell.value);
  else if(cell.value?.richText){const value=cell.value.richText.map(run=>run.text).join(''),normalized=normalizeReportText(value);if(normalized!==value)cell.value=normalized;}
  if(['FFFFFF00','FFFFFFCC'].includes(cell.fill?.fgColor?.argb?.toUpperCase()))cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
  if(cell.value==='■'||cell.value==='□')cell.font={...cell.font,color:{argb:'FF000000'}};
 })));
 const sheet=book.getWorksheet('1.1一般性能試驗-2');
 if(sheet){
  for(const col of ['Q','V','AA','AF','AK']){
   for(const row of [123,124,125,126,127,128,193,209,211])format(sheet,col+row,'0.00');
   for(const row of [189,190])format(sheet,col+row,'0.0');
  }
  for(let row=166;row<=170;row++)for(const col of ['G','L','Q','V','AA','AF','AK'])format(sheet,col+row,'0.00');
 }
 const cover=book.getWorksheet('1.1一般性能試驗-1');
 if(cover)for(let row=54;row<=57;row++)for(let col=6;col<=44;col++)cover.getCell(row,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
}
