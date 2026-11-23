import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {syntheticReportPhoto} from './helpers/syntheticReportPhoto.mjs';
import Excel from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {REPORT_FILE_MAX_BYTES as MAX,isReportFileSize,assertReportFileSize,reportDownloadURL,readReportResponseBytes} from '../src/reportFilePolicy.mjs';
import {validateHumanFile,readStorageBytes,zipBounds} from '../server/business/humanReports.mjs';
import {inspectReport} from '../src/reportWorkbook.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const intent=bytes=>({kind:'REPORT',request_legacy_id:'REQ-LARGE-SYNTHETIC',byte_size:bytes.length,sha256:hash(bytes)});
test('report limit includes 20 MiB and rejects empty, invalid and over-limit files',()=>{
 assert.equal(MAX,20971520);for(const n of [1,3145729,MAX])assert.equal(isReportFileSize(n),true);
 for(const n of [0,-1,MAX+1,Infinity,NaN,'20',1.5])assert.equal(isReportFileSize(n),false);
 assert.throws(()=>assertReportFileSize(MAX+1),/20 MB/);
});
test('a report containing a genuine synthetic PNG over 3 MiB passes browser and independent server verification',async()=>{
 const w=new Excel.Workbook(),s=w.addWorksheet('試驗報告');s.getCell('A1').value='DQA SMART LAB｜合成大圖報告';s.getCell('B4').value='REQ-LARGE-SYNTHETIC';s.getCell('B16').value='合成測試結果，非正式量測';s.getCell('A21').value='三階';s.getCell('D21').value='二階';s.getCell('G21').value='執行人';const photo=syntheticReportPhoto();for(let i=0;i<3;i++){const image=w.addImage({buffer:photo,extension:'png'});s.addImage(image,{tl:{col:0,row:30+i*25},ext:{width:640,height:512}});}
 const bytes=Buffer.from(await w.xlsx.writeBuffer());assert.ok(bytes.length>10*1024*1024&&bytes.length<MAX);assert.ok(zipBounds(bytes)>0);await validateHumanFile(bytes,intent(bytes));assert.equal((await inspectReport(bytes,'REQ-LARGE-SYNTHETIC','synthetic.xlsx')).ok,true);
 const bad=Buffer.from(bytes);bad[100]^=1;await assert.rejects(validateHumanFile(bad,intent(bytes)),/HASH_MISMATCH/);
});
test('photo-sized archival PDF over 3 MiB is accepted without weakening purpose checks',async()=>{
 const p=await PDFDocument.create();p.addPage();p.addPage();await p.attach(randomBytes(4*1024*1024),'synthetic-photo.bin');const bytes=Buffer.from(await p.save());assert.ok(bytes.length>3145728);await validateHumanFile(bytes,{...intent(bytes),kind:'ARCHIVE'});
});
test('download stream accepts the exact ceiling and rejects missing/oversized/truncated bytes',async()=>{
 const bytes=Buffer.alloc(MAX,1),result=await readReportResponseBytes(new Response(bytes),MAX);assert.equal(result.length,MAX);
 await assert.rejects(readReportResponseBytes(new Response(Buffer.alloc(11)),10),/大小不一致/);
 await assert.rejects(readReportResponseBytes(new Response(Buffer.alloc(9)),10),/大小不一致/);
 await assert.rejects(readReportResponseBytes(new Response('x',{headers:{'content-length':String(MAX+1)}}),1),/大小不一致/);
 await assert.rejects(readReportResponseBytes(new Response('x'),MAX+1),/20 MB/);
});
test('signed download URLs accept only private report paths, omit credentials and reject redirects or other schemes',()=>{
 const valid='https://synthetic.invalid/storage/v1/object/sign/dqa-business-reports/'+Array(3).fill('00000000-0000-4000-8000-000000000001').join('/')+'.xlsx?token=SYNTHETIC';assert.equal(reportDownloadURL(valid),valid);
 for(const url of [valid.replace('https:','http:'),valid.replace('https://','https://user:pass@'),valid.replace('dqa-business-reports','public'),valid+'#fragment',valid+'&other=1',valid.replace('?token=SYNTHETIC','')])assert.throws(()=>reportDownloadURL(url));
});
test('server storage reads are bounded at 20 MiB and still verify the saved hash',async()=>{
 const bytes=Buffer.alloc(4*1024*1024,1),i={...intent(bytes),bucket:'dqa-business-reports',object_key:Array(3).fill('00000000-0000-4000-8000-000000000001').join('/')+'.xlsx'},env={BUSINESS_SUPABASE_URL:'https://synthetic.invalid',BUSINESS_SUPABASE_ANON_KEY:'SYNTHETIC'};
 assert.equal((await readStorageBytes(async()=>new Response(bytes),env,'SYNTHETIC',i)).length,bytes.length);
 await assert.rejects(readStorageBytes(async()=>new Response('x',{headers:{'content-length':String(MAX+1)}}),env,'SYNTHETIC',i),/HUMAN_FILE_INVALID/);
});

test('decoded body size remains authoritative when a transfer uses compression',async()=>{const bytes=Buffer.alloc(10);assert.equal((await readReportResponseBytes(new Response(bytes,{headers:{'content-length':'8','content-encoding':'gzip'}}),10)).length,10);});
