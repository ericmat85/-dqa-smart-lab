import {MAPPED_REPORT_SHEET,addMappedReportPage} from './mappedReportProfile.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {validateUploadedTemplate} from './reportTemplateStore.mjs';
import {markVirtualWorkbook} from './virtualDocuments.mjs';
export const DOCUMENT_FIELDS=[['id','委託單號'],['productCode','產品代碼'],['productType','產品類型'],['customer','客戶名稱'],['customerPartNo','客戶品番'],['dueDate','需求日期'],['quantity','測試數量'],['department','委託部門'],['requester','委託者姓名'],['supervisor','直屬主管'],['priority','委託類型'],['project','專案名稱'],['testItems','試驗項目'],['specification','試驗規範／試驗手法'],['judgementRequired','是否判定'],['judgementCriteria','判定基準'],['purpose','試驗目的（含補充）'],['purposeOther','其他試驗目的'],['sampleSource','樣品來源（含內容）'],['sampleSourceOther','樣品來源內容'],['productVersion','製品版次'],['pcbaVersion','PCBA版次'],['softwareVersion','軟體版次'],['manufactureDate','製造日期'],['sampleDescription','樣品說明'],['notes','備註'],['sourceInHouse','社內勾選'],['sourceOverseas','海外廠勾選'],['sourceCustomer','客戶勾選'],['sourceSupplier','廠商勾選'],['sourceCompetitor','競品勾選']];
const fields=new Set(DOCUMENT_FIELDS.map(([key])=>key));
export function validateCellMapping(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>80)throw Error('請設定 1～80 個儲存格對應。');const used=new Set();
 return rows.map(r=>{if(!r||Object.keys(r).some(k=>!['field','sheet','cell'].includes(k))||!fields.has(r.field)||typeof r.sheet!=='string'||!r.sheet||r.sheet.length>31||typeof r.cell!=='string')throw Error('儲存格對應欄位無效。');const cell=r.cell.trim().toUpperCase(),m=/^([A-Z]{1,2})([1-9][0-9]{0,3})$/.exec(cell);let col=0;for(const c of m?.[1]||'')col=col*26+c.charCodeAt(0)-64;if(!m||col>48||Number(m[2])>2000)throw Error('儲存格座標須在 A1～AV2000 內。');const key=JSON.stringify([r.sheet,cell]);if(used.has(key))throw Error('同一儲存格不能重複對應。');used.add(key);return {field:r.field,sheet:r.sheet,cell};});
}
export function documentValues(context){
 const p=context.payload||{},d=p.form_details||{},list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string').join('、'):'',sources=list(d.sampleSource),purpose=list(d.purpose),join=(a,b)=>[a,b].filter(Boolean).join('：');
 return {...Object.fromEntries(DOCUMENT_FIELDS.map(([k])=>[k,typeof d[k]==='string'?d[k]:''])),id:p.request_legacy_id||'',productCode:p.product_code||'',customer:p.customer_name||'',dueDate:p.requested_date||'',quantity:p.quantity??'',department:context.department||'',requester:p.owner_label||'',supervisor:p.supervisor_label||'',specification:p.specification||'',judgementCriteria:p.acceptance||'',testItems:list(d.testItems)||p.trial_snapshot?.name||'',purpose:join(purpose,d.purposeOther),sampleSource:join(sources,d.sampleSourceOther),...Object.fromEntries([['sourceInHouse','社內'],['sourceOverseas','海外廠'],['sourceCustomer','客戶'],['sourceSupplier','廠商'],['sourceCompetitor','競品']].map(([k,label])=>[k,(d.sampleSource||[]).some(x=>x.startsWith(label))?'☑':'☐']))};
}
export async function mappingWorkbook(bytes,name,rows){
 const mapping=validateCellMapping(rows);await validateUploadedTemplate(bytes,name);const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const targets=new Set();if(book.getWorksheet(MAPPED_REPORT_SHEET))throw Error('範本不可包含系統簽核資訊工作表，請上傳空白原稿。');
 for(const r of mapping){const sheet=book.getWorksheet(r.sheet);if(!sheet||sheet.state&&sheet.state!=='visible')throw Error('找不到可見工作表：'+r.sheet);const cell=sheet.getCell(r.cell);if(cell.isMerged&&cell.master.address!==cell.address)throw Error(`${r.sheet}!${r.cell} 是合併區域，請選左上角 ${cell.master.address}。`);const key=sheet.id+':'+cell.master.address;if(targets.has(key))throw Error('同一合併儲存格不能重複對應。');targets.add(key);}
 return {book,mapping};
}
export async function fillMappedWorkbook(source,context,{kind='REPORT'}={}){
 const {book,mapping}=await mappingWorkbook(source.bytes,source.name,source.mapping),values=documentValues(context);
 for(const row of mapping)book.getWorksheet(row.sheet).getCell(row.cell).value=values[row.field];
 if(kind==='REQUEST')for(const sheet of book.worksheets){sheet.eachRow(row=>row.eachCell(cell=>{cell.protection={locked:true};}));await sheet.protect('DQA-submitted-request',{spinCount:1,selectLockedCells:true,selectUnlockedCells:false});}
 if(kind==='REPORT'){for(const s of book.worksheets)s.unprotect();const hash=source.sha256||Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source.bytes)),v=>v.toString(16).padStart(2,'0')).join('');addMappedReportPage(book,values,hash);markVirtualWorkbook(book,{id:values.id,executionKind:context.execution_kind});}
 return new Uint8Array(await book.xlsx.writeBuffer());
}
