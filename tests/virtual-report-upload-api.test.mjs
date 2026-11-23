import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import Excel from 'exceljs';
import {createBusinessHandler,sealSession,COOKIE} from '../server/business/handler.mjs';
import {fileAttestation} from '../server/business/humanReports.mjs';
import {createReportTemplate} from '../src/reportWorkbook.mjs';
import {markVirtualPdf,VIRTUAL_SHEET} from '../src/virtualDocuments.mjs';
import {humanMessage} from '../src/businessHumanClient.mjs';
const id=n=>'fa000000-0000-4000-8000-'+String(n).padStart(12,'0'),T=id(1),Q=id(2),UPLOAD=id(3),USER=id(4),OP=id(5);
const request={id:'REQ-VIRTUAL-API',executionKind:'VIRTUAL',productCode:'SYNTHETIC',testItems:['Synthetic generic'],quantity:'1',execution:{hours:1}};
async function fixture({kind='REPORT',wrongCode=false,unmarked=false}={}){
 let bytes;if(kind==='ARCHIVE'){const p=await PDFDocument.create();p.addPage();p.addPage();await markVirtualPdf(p,{...request,...(wrongCode?{id:UPLOAD}:{})});bytes=Buffer.from(await p.save());}
 else {bytes=Buffer.from(await createReportTemplate(request,true));if(unmarked||wrongCode){const b=new Excel.Workbook();await b.xlsx.load(bytes);if(unmarked)b.removeWorksheet(VIRTUAL_SHEET);else b.getWorksheet(VIRTUAL_SHEET).getCell('B1').value=UPLOAD;bytes=Buffer.from(await b.xlsx.writeBuffer());}}
 const intent={id:UPLOAD,request_id:Q,request_legacy_id:request.id,kind,execution_kind:'VIRTUAL',bucket:'dqa-business-reports',object_key:T+'/'+Q+'/'+UPLOAD+(kind==='REPORT'?'.xlsx':'.pdf'),byte_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:kind==='REPORT'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf'};
 const env={BUSINESS_ENABLED:'true',BUSINESS_ORIGIN:'https://preview.test',BUSINESS_SUPABASE_URL:'https://mmazbwzdiizabikmiily.supabase.co',BUSINESS_SUPABASE_ANON_KEY:'x.'+Buffer.from(JSON.stringify({role:'anon',ref:'mmazbwzdiizabikmiily'})).toString('base64url')+'.fake',BUSINESS_COOKIE_KEY:Buffer.alloc(32,8).toString('base64url')},calls=[];
 const handler=createBusinessHandler({env,fetchImpl:async(raw,options)=>{const u=new URL(raw),b=options.body?JSON.parse(options.body):{};calls.push(u.pathname);assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ACCESS');
  if(u.pathname==='/auth/v1/user')return Response.json({id:USER,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()});
  if(u.pathname.endsWith('/check_browser_session'))return Response.json(T);
  if(u.pathname.endsWith('/report_upload_intent')){assert.equal(b.p_tenant,T);assert.equal(b.p_id,UPLOAD);return Response.json(intent);}
  if(u.pathname.startsWith('/storage/v1/object/authenticated/')){assert.equal(options.redirect,'error');return new Response(bytes);}
  if(u.pathname.endsWith('/execute_human_operation')){assert.equal(b.p_tenant,T);assert.equal(b.p_attestation,fileAttestation(env.BUSINESS_COOKIE_KEY,intent));return Response.json({state:'SAVED'});}
  throw Error('Unexpected API fixture path '+u.pathname);
 }});
 const cookie=COOKIE+'='+sealSession({id:id(6),tenant:T,nonce:'synthetic',access:'SYNTHETIC_ACCESS',refresh:'SYNTHETIC_REFRESH',expires:Date.now()+3600000,absolute:Date.now()+3600000},env.BUSINESS_COOKIE_KEY);
 let result;await handler({url:'/api/business?path=execution%2Fexecute',query:{path:'execution/execute'},method:'POST',body:{operation_id:OP,command:{action:kind==='REPORT'?'REPORT_SUBMIT':'CONFIRM_ARCHIVE',request_id:Q,expected_request_revision:1,expected_schedule_revision:1,expected_report_revision:kind==='REPORT'?0:3,expected_draft_revision:1,signature_data:'data:image/png;base64,c3ludGhldGlj',comment:'合成測試',upload_id:UPLOAD}},headers:{origin:env.BUSINESS_ORIGIN,cookie,'content-type':'application/json'}},{setHeader(){},status(n){this.statusCode=n;return this;},json(body){result={status:this.statusCode,body};}});
 return {result,calls};
}
test('virtual Excel goes through fixed gateway validation with upload UUID distinct from the request code',async()=>{const f=await fixture();assert.equal(f.result.status,200,JSON.stringify(f.result));assert.equal(f.result.body.data.state,'SAVED');assert.ok(f.calls.some(p=>p.endsWith('/execute_human_operation')));});
test('virtual archival PDF binds to the request code rather than its upload UUID',async()=>{const f=await fixture({kind:'ARCHIVE'});assert.equal(f.result.status,200,JSON.stringify(f.result));assert.equal(f.result.body.data.state,'SAVED');});
test('upload UUID cannot substitute for the actual case mark in Excel or PDF',async()=>{for(const kind of ['REPORT','ARCHIVE']){const f=await fixture({kind,wrongCode:true});assert.equal(f.result.status,422);assert.equal(f.result.body.error.code,'HUMAN_VIRTUAL_MARK_REQUIRED');assert.ok(!f.calls.some(p=>p.endsWith('/execute_human_operation')));}});
test('missing marker is still rejected before any report state mutation',async()=>{const f=await fixture({unmarked:true});assert.equal(f.result.status,422);assert.equal(f.result.body.error.code,'HUMAN_VIRTUAL_MARK_REQUIRED');assert.ok(!f.calls.some(p=>p.endsWith('/execute_human_operation')));});
test('raw frontend and coded backend mark errors both display useful Chinese instructions',()=>{for(const e of [Error('HUMAN_VIRTUAL_MARK_REQUIRED'),Object.assign(Error('HUMAN_VIRTUAL_MARK_REQUIRED'),{code:'HUMAN_VIRTUAL_MARK_REQUIRED'})]){assert.match(humanMessage(e),/本案範本/);assert.doesNotMatch(humanMessage(e),/HUMAN_VIRTUAL_MARK_REQUIRED/);}assert.equal(humanMessage(Error('請先完成簽名。')),'請先完成簽名。');});
