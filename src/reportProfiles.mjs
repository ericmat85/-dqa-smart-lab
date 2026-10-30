import {cellText} from './reportLayout.mjs';
export const GENERAL_PROFILE='general-performance-v1';
export const GENERAL_COVER='1.1一般性能試驗-1';
export const GENERAL_DETAIL='1.1一般性能試驗-2';
export const GENERAL_PAGE_ENDS=[64,100,129,171,195,229];
export const GENERAL_SIGNATURE_CELLS={level3:'F54',level2:'S54',executor:'AF54'};
export const isGeneralRequest=request=>(request.testItems||[]).some(item=>/一般性能/.test(item));
export function generalProfile(book){
 const cover=book.getWorksheet(GENERAL_COVER),detail=book.getWorksheet(GENERAL_DETAIL);
 if(!cover||!detail||(cover.state&&cover.state!=='visible')||(detail.state&&detail.state!=='visible')||cellText(cover.getCell('F9')).trim()!=='一般性能試驗'||!cellText(cover.getCell('S1')).includes('試驗報告單'))return null;
 for(const [address,label]of [['A69','SPEEDO METER'],['A105','ODO/TRIP METER'],['A134','Fuel Gauge'],['A176','電壓計'],['A200','Clock']])if(!cellText(detail.getCell(address)).includes(label))return null;
 for(const [address,label]of [['F52','承'],['S52','確'],['AF52','作']])if(!cellText(cover.getCell(address)).includes(label))return null;
 for(const address of Object.values(GENERAL_SIGNATURE_CELLS))if(!cover.getCell(address).isMerged||cover.getCell(address).master.address!==address)return null;
 return {id:GENERAL_PROFILE,sheetName:cover.name,cells:{...GENERAL_SIGNATURE_CELLS}};
}
// Only resolve direct, internal cell references used by this template's repeated
// headers. This is not an Excel calculation engine; no arbitrary formula runs.
export function refreshHeaderReferences(book){
 const resolve=(sheet,cell,seen=new Set())=>{
  const value=cell.value;if(!value||typeof value!=='object'||!value.formula)return value;
  const key=sheet.name+'!'+cell.address;if(seen.has(key))return undefined;seen.add(key);
  const match=value.formula.match(/^(?:'([^']+)'!)?\$?([A-Z]+)\$?(\d+)$/);
  if(!match)return value.result;
  const target=match[1]?book.getWorksheet(match[1]):sheet;if(!target)return undefined;
  const result=resolve(target,target.getCell(match[2]+match[3]),seen);
  const cached=result==null||result===''?' ':result;
  cell.value={formula:value.formula,result:cached};return cached;
 };
 book.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>{
  if(cell.isMerged&&cell.master.address!==cell.address)return;
  if(cell.value?.formula)resolve(sheet,cell);
 })));
}
const text=(sheet,address)=>String(cellText(sheet.getCell(address))).trim();
function calendarDate(value){
 const match=value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);if(!match)return false;
 const [year,month,day]=match.slice(1).map(Number),date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
const marked=value=>/^(?:☑|☒|■|✓|✔|√|[xv]|OK|NG)$/i.test(value.trim());
export function inspectGeneralReport(book,requestId,request){
 const sheet=book.getWorksheet(GENERAL_COVER),detail=book.getWorksheet(GENERAL_DETAIL),checks=[];
 const add=(label,ok,description)=>checks.push({label,ok,detail:description});
 add('工作表符合已接入版型',book.worksheets.filter(row=>!row.state||row.state==='visible').length===2,'請保留原本兩張工作表；額外文件不能以新增工作表方式合併，避免 PDF 遺漏內容');
 const reportNo=text(sheet,'AK3');add('報告編號對應本案',reportNo===`DQA-${requestId}`||reportNo===requestId,`首頁 AK3：${reportNo||'未填'}；本案請填 DQA-${requestId}`);
 const product=text(sheet,'F13');add('品番已填寫且對應委託單',Boolean(product)&&(!request?.productCode||product===request.productCode),`首頁 F13：${product||'未填'}${request?.productCode?`；本案品番 ${request.productCode}`:''}`);
 add('品名已填寫',Boolean(text(sheet,'F11')),'首頁 F11：請填品名');
 const date=sheet.getCell('AC13').value,dateText=text(sheet,'AC13');
 const validDate=date instanceof Date?Number.isFinite(date.getTime()):typeof date==='number'?date>1&&date<2958466:calendarDate(dateText);
 add('報告日期已填寫',Boolean(validDate),'首頁 AC13：請填有效日期（例如 2026-11-06）');
 const ok=marked(text(sheet,'AF48')),ng=marked(text(sheet,'AL48'));add('合格／不合格擇一勾選',ok!==ng,'首頁 AF48 合格、AL48 不合格，僅勾選一項（☑、✓ 或 X）');
 const summary=[text(sheet,'A40'),text(sheet,'W40')].join('\n').replace(/OK\s*\/\s*NG/gi,'');
 add('結果摘要已填寫',/(?:^|[^\w/])(OK|NG)(?![\w/])|不合格|合格/i.test(summary),'首頁 A40／W40：請填實際結果，範本的「OK/NG」提示不算完成');
 const columns=['Q','V','AA','AF','AK'],rows=[82,83,84,85,86,87,88,91,94,97,119,120,121,122,123,124,125,126,127,128,147,148,149,150,151,152,153,154,155,156,158,160,189,190,191,192,193,209,211];
 const measured=rows.some(row=>columns.some(col=>{const cell=detail.getCell(col+row);return cell.master.address===cell.address&&cell.value!=null&&text(detail,col+row)!==''&&!cell.value?.formula;}));
 add('試驗明細已有填寫',measured,'明細表各樣品測試結果欄至少需有一筆實際填寫；不計範本第 118 列的預留值。此項不代表所有測項均完整或符合規格');
 if(request)add('報告類型符合委託項目',isGeneralRequest(request),'本版型僅供一般性能試驗；其餘案件請使用通常試驗報告');
 return checks;
}
