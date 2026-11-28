import {mappedReportProfile,mappedReportChecks} from '../../src/mappedReportProfile.mjs';
import {documentValues} from '../../src/documentCellMapping.mjs';
import {REPORT_FILE_MAX_BYTES} from '../../src/reportFilePolicy.mjs';
import {validateWorkbookPurpose,validatePdfPurpose} from '../../src/virtualDocuments.mjs';
import {generalProfile,inspectGeneralReport} from '../../src/reportProfiles.mjs';
import {inflateRawSync} from 'node:zlib';
import {createHash,createHmac} from 'node:crypto';
const LIMIT=REPORT_FILE_MAX_BYTES,BUCKET='dqa-business-reports';
// Kept for initial-policy provisioning and regression fixtures, never per-request signing.
export const attestationKey=key=>createHmac('sha256',Buffer.from(key,'base64url')).update('dqa-human-report-attestation-v1').digest();
// The database stores a fixed report key. Session-cookie keys rotate per deployment.
export function reportAttestationKey(env){const key=env?.BUSINESS_REPORT_ATTESTATION_KEY;if(!/^[A-Za-z0-9_-]{43}$/.test(key||'')||Buffer.from(key,'base64url').length!==32||Buffer.from(key,'base64url').toString('base64url')!==key)throw Error('REPORT_ATTESTATION_NOT_CONFIGURED');return key;}
export const fileAttestation=(key,intent)=>createHmac('sha256',Buffer.from(reportAttestationKey({BUSINESS_REPORT_ATTESTATION_KEY:key}),'base64url')).update(`${intent.id}:${intent.sha256}:${intent.byte_size}:${intent.mime_type}`).digest('hex');
export function safeObject(intent){if(intent?.bucket!==BUCKET||!new RegExp('^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\\.(xlsx|pdf)$').test(intent.object_key||''))throw Error('HUMAN_FILE_INVALID');return BUCKET+'/'+intent.object_key;}
export function zipBounds(bytes){
 const b=Buffer.from(bytes);if(b.length<22||b.readUInt32LE(0)!==0x04034b50)throw Error('HUMAN_FILE_INVALID');let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||b.readUInt16LE(end+4)||b.readUInt16LE(end+6))throw Error('HUMAN_FILE_INVALID');const count=b.readUInt16LE(end+10);let at=b.readUInt32LE(end+16),total=0;
 if(count<1||count>512||at>=end)throw Error('HUMAN_FILE_INVALID');
 for(let i=0;i<count;i++){if(at+46>end||b.readUInt32LE(at)!==0x02014b50)throw Error('HUMAN_FILE_INVALID');const size=b.readUInt32LE(at+24),packed=b.readUInt32LE(at+20),offset=b.readUInt32LE(at+42),method=b.readUInt16LE(at+10),n=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32),name=b.subarray(at+46,at+46+n).toString('utf8');total+=size;if(total>30*1024*1024||size===0xffffffff||/\.\.|^\/|\\|vbaProject|externalLinks/i.test(name))throw Error('HUMAN_FILE_INVALID');if(offset+30>at||b.readUInt32LE(offset)!==0x04034b50||b.readUInt16LE(offset+6)&1||![0,8].includes(method))throw Error('HUMAN_FILE_INVALID');const begin=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(begin+packed>at)throw Error('HUMAN_FILE_INVALID');const raw=method===8?inflateRawSync(b.subarray(begin,begin+packed),{maxOutputLength:Math.max(1,size+1)}):b.subarray(begin,begin+packed);if(raw.length!==size)throw Error('HUMAN_FILE_INVALID');if(/\.xml$/i.test(name)&&((raw.toString('utf8').match(/<c[ >]/g)||[]).length>50000||(raw.toString('utf8').match(/<row[ >]/g)||[]).length>20000))throw Error('HUMAN_FILE_INVALID');at+=46+n+extra+comment;}
 if(at>end)throw Error('HUMAN_FILE_INVALID');return total;
}
export async function validateHumanFile(bytes,intent,{loadMapping}={}){
 // Upload id identifies the transfer; document marks bind to the request code.
 const request={id:intent.request_legacy_id,execution_kind:intent.execution_kind};
 if(bytes.length!==intent.byte_size||bytes.length>LIMIT||createHash('sha256').update(bytes).digest('hex')!==intent.sha256)throw Error('HUMAN_FILE_HASH_MISMATCH');
 if(intent.kind==='ARCHIVE'){if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('HUMAN_FILE_INVALID');const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false});if(pdf.getPageCount()<2||pdf.getPageCount()>200)throw Error('HUMAN_FILE_INVALID');await validatePdfPurpose(pdf,request);return;}
 zipBounds(bytes);const Excel=(await import('exceljs')).default,book=new Excel.Workbook();await book.xlsx.load(bytes);if(book.worksheets.length>32)throw Error('HUMAN_FILE_INVALID');validateWorkbookPurpose(book,request);let cells=0;
 book.eachSheet(sheet=>{sheet.eachRow(row=>row.eachCell(cell=>{cells++;if(cells>50000)throw Error('HUMAN_FILE_INVALID');const v=cell.value;if(v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v)){if(v.result===undefined||/\[|\]|https?:|WEBSERVICE|HYPERLINK/i.test(v.formula||''))throw Error('HUMAN_FILE_INVALID');}}));});
 const mapped=loadMapping?await loadMapping():null;if(mapped?.has_template||mappedReportProfile(book)){if(!mapped?.has_template||!mappedReportChecks(book,{id:intent.request_legacy_id,productCode:documentValues(mapped).productCode,testItems:[documentValues(mapped).testItems],sourceHash:mapped.sha256,values:documentValues(mapped),mapping:mapped.mapping}).every(c=>c.ok))throw Error('HUMAN_REPORT_BINDING_INVALID');return;}
 if(generalProfile(book)){if(!inspectGeneralReport(book,intent.request_legacy_id,{productCode:intent.product_code,testItems:[intent.trial_name]}).every(c=>c.ok))throw Error('HUMAN_REPORT_BINDING_INVALID');return;}
 const cover=book.getWorksheet('報告首頁'),main=book.worksheets.find(s=>s.state==='visible'||!s.state);if(!main)throw Error('HUMAN_FILE_INVALID');
 const id=cover?cover.getCell('I16').text:main.getCell('B4').text;if(id!==(cover?'DQA-':'')+intent.request_legacy_id)throw Error('HUMAN_REPORT_BINDING_INVALID');
 if(cover){if(cover.getCell('C12').text!==intent.trial_name||intent.product_code&&cover.getCell('C16').text!==intent.product_code||!cover.getCell('A44').text.trim())throw Error('HUMAN_REPORT_BINDING_INVALID');}
 else if(!main.getCell('A1').text.includes('DQA SMART LAB｜')||!(main.getCell('B16').text.trim()||main.getCell('D12').text.trim()))throw Error('HUMAN_REPORT_BINDING_INVALID');
}
export async function readStorageBytes(fetchImpl,env,token,intent){
 const path=safeObject(intent),res=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/storage/v1/object/authenticated/'+path,{headers:{apikey:env.BUSINESS_SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('HUMAN_FILE_UNAVAILABLE');if(Number(res.headers.get('content-length')||0)>LIMIT)throw Error('HUMAN_FILE_INVALID');let length=0;const chunks=[];
 for await(const chunk of res.body){length+=chunk.length;if(length>LIMIT)throw Error('HUMAN_FILE_INVALID');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
 if(bytes.length!==intent.byte_size||createHash('sha256').update(bytes).digest('hex')!==intent.sha256)throw Error('HUMAN_FILE_HASH_MISMATCH');return bytes;
}

// A bounded, explicit subset of report fields for AI; no pictures/signature bytes.
export async function reportAIFields(bytes){
 zipBounds(bytes);const Excel=(await import('exceljs')).default,book=new Excel.Workbook();await book.xlsx.load(bytes);
 if(book.worksheets.length>32)throw Error('HUMAN_FILE_INVALID');const cells=[];
 for(const sheet of book.worksheets.slice(0,2))for(const address of ['A1','B4','C12','I16','A44','B16','D12']){const text=sheet.getCell(address).text;if(text)cells.push({sheet:sheet.name,cell:address,text});}
 if(Buffer.byteLength(JSON.stringify(cells))>6000)throw Error('AI_SOURCE_TOO_LARGE');return cells;
}
