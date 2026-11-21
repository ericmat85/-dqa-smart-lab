import {originalBusinessEnabled,appStorage} from './originalBusiness.mjs';
import {findTrialDefinition,readTrialCatalog} from './trialCatalogStore.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {canOpenReportArchive} from './reportArchive.mjs';
import {canEditAdmin} from './adminCenterStore.mjs';
export const TEMPLATE_EVENT='dqa:report-templates-updated';
export function assertTemplateAccess({actorId,system='lms'},storage=appStorage(),write=false){
 let rows;try{rows=JSON.parse(storage?.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS));}catch{throw Error('帳號資料無法核對。');}
 const actor=Array.isArray(rows)&&rows.find(a=>a.id===actorId);
 if(!actor||!canOpenReportArchive(actor,system,storage)||write&&(system!=='lms'||!canEditAdmin(actor,storage)))throw Error(write?'目前帳號沒有上傳範本的管理權限。':'目前帳號沒有範本查閱權限。');return actor;
}
// Read ZIP directory bounds before ExcelJS inflates XML or embedded media.
export function inspectTemplateZip(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(b.length<22||b.length>10*1024*1024)throw Error('範本須為 10 MB 以下的 .xlsx。');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);let eocd=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===b.length){eocd=i;break;}
 if(eocd<0||v.getUint16(eocd+4,true)!==0||v.getUint16(eocd+6,true)!==0)throw Error('不支援此 Excel 壓縮格式。');
 const count=v.getUint16(eocd+10,true),size=v.getUint32(eocd+12,true),start=v.getUint32(eocd+16,true);if(!count||count>512||start+size!==eocd)throw Error('範本壓縮結構或項目數超限。');
 let p=start,total=0,sheets=0;const entries=[];const names=new Set();
 for(let i=0;i<count;i++){
  if(p+46>eocd||v.getUint32(p,true)!==0x02014b50)throw Error('範本壓縮結構無效。');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),packed=v.getUint32(p+20,true),unpacked=v.getUint32(p+24,true),n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  if(p+46+n+extra+comment>eocd||local+30>start||v.getUint32(local,true)!==0x04034b50||flags&1||![0,8].includes(method)||unpacked===0xffffffff)throw Error('範本含加密或不支援的內容。');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p+46,p+46+n)),key=name.toLowerCase();
  if(names.has(key)||/[\\\u0000]/.test(name)||name.startsWith('/')||name.split('/').includes('..')||/^[A-Za-z]:/.test(name))throw Error('範本含重複或不安全的檔案路徑。');names.add(key);
  if(/vbaproject|activex|externalLinks|embeddings|connections\.xml|customui/i.test(name))throw Error('範本不得包含巨集、外部連結或內嵌執行物件。');
  if(/^xl\/worksheets\/sheet\d+\.xml$/i.test(name))sheets++;
  const dataStart=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);if(dataStart+packed>start)throw Error('範本內容區段超界。');entries.push({name,method,packed,unpacked,dataStart});
  total+=unpacked;if(total>32*1024*1024||unpacked>16*1024*1024||unpacked>1000*Math.max(1,packed))throw Error('範本解壓縮容量超限。');p+=46+n+extra+comment;
 }
 if(p!==eocd||!names.has('[content_types].xml')||!names.has('xl/workbook.xml')||sheets<1||sheets>16)throw Error('範本須包含 1～16 張 Excel 工作表。');return {sheets,uncompressedBytes:total,entries};
}
async function verifyTemplateStreams(bytes,directory){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let total=0;
 for(const entry of directory.entries){
  const data=b.subarray(entry.dataStart,entry.dataStart+entry.packed),xml=/\.(xml|rels)$/i.test(entry.name),parts=[];
  const stream=new Blob([data]).stream(),reader=(entry.method===8?stream.pipeThrough(new DecompressionStream('deflate-raw')):stream).getReader();let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;total+=value.byteLength;if(size>entry.unpacked||size>16*1024*1024||total>32*1024*1024){await reader.cancel();throw Error('範本實際解壓縮容量超限。');}if(xml)parts.push(value);}if(size!==entry.unpacked)throw Error('範本解壓縮大小與目錄不一致。');}
  catch(e){try{await reader.cancel();}catch{}throw e;}
  if(xml){const body=await new Blob(parts).text();if(/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(body))throw Error('範本不得含外部 XML 來源或實體。');if(/<(?:[A-Za-z]+:)?f(?:\s|\/?>)/i.test(body))throw Error('上傳範本不得含公式；請另存為純欄位版。');}
 }
}
export async function validateUploadedTemplate(bytes,name){
 if(!/\.xlsx$/i.test(name||''))throw Error('只接受 .xlsx 範本，不接受 .xls、.xlsm 或 PDF。');const directory=inspectTemplateZip(bytes);await verifyTemplateStreams(bytes,directory);
 const Excel=await excelModule(),book=new Excel.Workbook();try{await book.xlsx.load(bytes);}catch{throw Error('Excel 無法讀取，可能已加密或損壞。');}
 if(book.worksheets.length>16||book.worksheets.every(s=>s.state&&s.state!=='visible'))throw Error('範本沒有可預覽的工作表。');
 let cells=0;book.eachSheet(s=>{if(s.rowCount>2000||s.columnCount>48)throw Error('範本最多 2000 列、48 欄。');s.eachRow(r=>r.eachCell(c=>{cells++;if(cells>100000)throw Error('範本儲存格數量超限。');if(c.value?.formula||c.value?.sharedFormula||c.value?.hyperlink)throw Error('上傳範本不得含公式或超連結；請另存為純欄位版。');}));for(const image of s.getImages()){const media=book.getImage(image.imageId);if(!media||!['png','jpeg','jpg'].includes(media.extension))throw Error('圖片只接受內嵌 PNG／JPEG。');}});
 if(book.media.length>32)throw Error('範本圖片數量超限。');
 const declared=[];const add=value=>{if(typeof value==='string'&&value.trim())declared.push(value.trim());};
 add(book.getWorksheet('報告首頁')?.getCell('C12').text);
 const info=book.getWorksheet('範本資訊');if(info)info.eachRow(r=>{if(['試驗範本','試驗'].includes(r.getCell(1).text.trim()))add(r.getCell(2).text);});
 const request=book.getWorksheet('委託單')?.getCell('C19').text||'';if(request.startsWith('試驗項目 Test item：'))add(request.slice('試驗項目 Test item：'.length));
 add(book.getWorksheet('1.1一般性能試驗-1')?.getCell('F9').text);
 return {sheets:book.worksheets.map(s=>s.name),cells,declaredTrials:[...new Set(declared)]};
}
export function assertUploadedTrialBinding(trialId,details,storage=appStorage()){
 if(trialId==='CUSTOM')return {status:'CUSTOM_ONLY'};
 if(trialId==='BLANK'){if(details.declaredTrials?.length)throw Error('這份範本含有指定試驗項目，不能標示為空白委託單。');return {status:'BLANK'};}
 const row=readTrialCatalog(storage).rows.find(r=>r.id===trialId);if(!row)throw Error('所選的對應試驗不存在，請重新選擇。');
 const names=details.declaredTrials||[];
 if(!names.length||names.some(name=>findTrialDefinition(name,storage)?.id!==row.id))throw Error('範本內的試驗項目與所選對應試驗不一致，已停止；請下載正確試驗範本，或歸類為自訂報告範本。');
 return {status:'VERIFIED',trialId:row.id,trialName:row.name,declaredTrials:names};
}
const guided=globalThis.__DQA_GUIDED_REPORT_DB__;const dbName=typeof guided==='string'&&/^dqa-tour-reports-[a-f0-9-]+$/.test(guided)?guided+'-templates':'dqa-report-template-library-v1';
function openDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open(dbName,1);q.onupgradeneeded=()=>q.result.createObjectStore('templates',{keyPath:'id'});q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});}
const repository={
 async list(){if(originalBusinessEnabled())return [];const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('templates','readonly'),q=tx.objectStore('templates').getAll();tx.oncomplete=()=>{db.close();resolve(q.result);};tx.onerror=()=>{db.close();reject(tx.error);};});},
 async get(id){if(originalBusinessEnabled())return null;const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('templates','readonly'),q=tx.objectStore('templates').get(id);tx.oncomplete=()=>{db.close();resolve(q.result);};tx.onerror=()=>{db.close();reject(tx.error);};});},
 async put(value,authorize){if(originalBusinessEnabled())throw Error('雲端範本上傳尚未接通，檔案未儲存。');const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('templates','readwrite'),store=tx.objectStore('templates'),q=store.getAll();let error;
  q.onsuccess=()=>{try{authorize();if(q.result.length>=20||q.result.reduce((sum,r)=>sum+r.byteLength,0)+value.byteLength>100*1024*1024)throw Error('最多保存 20 份上傳範本，總容量上限 100 MB。');store.add(value);}catch(e){error=e;tx.abort();}};
  tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(error||tx.error||Error('範本儲存失敗，請確認瀏覽器容量。'));};});},
};
const meta=({bytes:_bytes,...value})=>value;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function saveUploadedTemplate(file,{actorId,system='lms',syntheticConfirmed=false,trialId='CUSTOM',version='CUSTOM-1',signal}={},storage=appStorage(),repo=repository){
 const access={actorId,system};let details;const authorize=()=>{if(signal?.aborted)throw Error('範本上傳已取消。');const actor=assertTemplateAccess(access,storage,true);if(details)assertUploadedTrialBinding(trialId,details,storage);return actor;};authorize();
 if(!syntheticConfirmed)throw Error('請先確認範本只含合成資料，沒有真實客戶、機密或個人簽名。');
 if(!['CUSTOM','BLANK'].includes(trialId)&&!/^TRIAL-(?:\d{3}|[a-f0-9]{32})$/.test(trialId)||typeof version!=='string'||!version.trim()||version.length>80)throw Error('範本分類或版本無效。');
 if(!file||file.size>10*1024*1024||typeof file.name!=='string')throw Error('範本須小於 10 MB。');
 const bytes=new Uint8Array(await file.arrayBuffer());details=await validateUploadedTemplate(bytes,file.name);const digest=await hash(bytes),trialBinding=assertUploadedTrialBinding(trialId,details,storage);authorize();
 const record={id:crypto.randomUUID(),name:file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,160),version:version.trim(),trialId,synthetic:true,createdBy:actorId,createdAt:new Date().toISOString(),sha256:digest,byteLength:bytes.byteLength,sheets:details.sheets,trialBinding,bytes};
 await repo.put(record,authorize);globalThis.dispatchEvent?.(new Event(TEMPLATE_EVENT));return meta(record);
}
export async function listUploadedTemplates(access,storage=appStorage(),repo=repository){assertTemplateAccess(access,storage);const records=await repo.list();assertTemplateAccess(access,storage);return records.map(meta).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function readUploadedTemplate(id,access,storage=appStorage(),repo=repository){assertTemplateAccess(access,storage);const record=await repo.get(id);if(!record||record.synthetic!==true||await hash(record.bytes)!==record.sha256)throw Error('範本已不存在或完整性驗證失敗。');const details=await validateUploadedTemplate(record.bytes,record.name),trialBinding=assertUploadedTrialBinding(record.trialId,details,storage);assertTemplateAccess(access,storage);return {...record,trialBinding};}
