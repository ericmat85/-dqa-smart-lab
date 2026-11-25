import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createReportTemplate,inspectReport,excelModule} from '../../src/reportWorkbook.mjs';
import {passedDemoReview} from '../../src/demoReportPreparation.mjs';
import {fillMappedWorkbook,documentValues} from '../../src/documentCellMapping.mjs';
import {markVirtualWorkbook} from '../../src/virtualDocuments.mjs';
import {validateHumanFile} from './humanReports.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function demoReportSource(core,human,member,id){
 const q=core.requests?.find(q=>q.id===id),s=core.schedules?.find(s=>s.request_id===id&&s.status==='COMPLETED'),detail=human.human_schedules?.find(x=>x.id===s?.id),trial=core.trials?.find(t=>t.id===q?.trial_id);
 if(!member?.systems?.includes('lab')||!member.pages?.includes('requests')||!member.is_admin&&!member.permissions?.includes('reports.submit')||!q||!s||s.executor_member_id!==member.id)throw Error('DEMO_REPORT_ACCESS_DENIED');
 if(q.execution_kind!=='VIRTUAL')throw Error('VIRTUAL_TRIAL_REQUIRED');
 if(q.status!=='COMPLETED'||s.execution_kind!=='VIRTUAL'||!detail?.received_at||!detail.completed_at||!trial)throw Error('DEMO_REPORT_NOT_READY');
 return {q,s:{...s,...detail},trial,stamp:JSON.stringify([q.id,q.revision,q.request_document_version_id,s.id,s.revision,trial.id,trial.revision])};
}
export async function buildDemoReport({source,core,mapped,loadGeneral=()=>readFile(new URL('../../public/templates/general-performance-v1.xlsx',import.meta.url))}){
 const {q,s,trial}=source;
 const request={...q.form_details,id:q.legacy_id,executionKind:'VIRTUAL',productCode:q.product_code,customer:q.customer_name,quantity:q.quantity,specification:q.specification,judgementCriteria:q.acceptance,testItems:[trial.name],execution:{hours:s.plan?.hours_per_batch,equipment:s.plan?.outsourced?'委外設備':(s.plan?.allocations||[]).map(a=>core.equipment?.find(e=>e.id===a.equipment_id)?.name||a.equipment_name||'').filter(Boolean).join('、'),operator:core.members?.find(m=>m.id===s.executor_member_id)?.display_name||s.plan?.executor_label||'',sampleCode:s.sample_code||'',plannedStart:s.starts_at,plannedEnd:s.ends_at,completedAt:s.completed_at}};
 const rows=(core.trials||[]).map(t=>({id:t.legacy_id,name:t.name,aliases:t.aliases||[],profileId:t.profile_code,specification:t.specification,acceptance:t.acceptance,equipment:t.equipment_reference,version:t.specification_version,durationHours:Number(t.duration_hours),builtin:t.source_kind==='SYNTHETIC',synthetic:t.source_kind==='SYNTHETIC'}));
 const storage={getItem:key=>key==='dqa-trial-catalog-v1'?JSON.stringify({version:1,revision:1,rows}):null};let bytes;
 if(mapped?.has_template){
  const raw=Buffer.from(mapped.content||'','base64');if(raw.length!==mapped.byteLength||createHash('sha256').update(raw).digest('hex')!==mapped.sha256)throw Error('DOCUMENT_TEMPLATE_INVALID');
  const values=documentValues(mapped);request.productCode=values.productCode;request.testItems=[values.testItems];
  bytes=await fillMappedWorkbook({...mapped,bytes:raw},mapped,{kind:'REPORT'});
  const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);
  book.getWorksheet('系統簽核資訊').getCell('B8').value=`DEMO：${trial.name}；樣品 ${s.sample_code||q.quantity}，已完成虛擬試驗。合成結果僅用於流程驗證。`;
  const record=book.addWorksheet('Demo試驗紀錄');record.columns=[{width:24},{width:95}];for(const row of [['委託單號',q.legacy_id],['產品代碼',q.product_code],['試驗項目',trial.name],['樣品編號',s.sample_code],['數量',q.quantity],['試驗規範',q.specification],['判定基準',q.acceptance],['設備',request.execution.equipment],['執行人',request.execution.operator],['試驗起訖',`${s.starts_at} ～ ${s.completed_at}`],['合成觀察','DEMO：依委託條件完成虛擬試驗，功能／外觀觀察無異常（非實測）。'],['用途','僅供虛擬委託流程驗證，非真實量測或正式合格證明。']])record.addRow(row);record.eachRow(r=>r.eachCell(c=>{c.alignment={wrapText:true,vertical:'top'};}));record.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1};markVirtualWorkbook(book,request);bytes=new Uint8Array(await book.xlsx.writeBuffer());
 }else bytes=await createReportTemplate(request,true,{requireTrialMatch:true,storage,assets:{},...(/一般性能/.test(trial.name)?{templateBytes:await loadGeneral()}: {})});
 bytes=Buffer.from(bytes);if(bytes.length>3*1024*1024)throw Error('DEMO_REPORT_TOO_LARGE');
 const name=`${q.legacy_id}-DEMO.xlsx`,check=await inspectReport(bytes,q.legacy_id,name,request,{storage});if(!passedDemoReview(check))throw Error('DEMO_REPORT_CHECK_FAILED');
 const sha256=createHash('sha256').update(bytes).digest('hex');await validateHumanFile(bytes,{kind:'REPORT',request_legacy_id:q.legacy_id,execution_kind:'VIRTUAL',trial_name:trial.name,product_code:q.product_code,byte_size:bytes.length,sha256},{loadMapping:async()=>mapped});
 return {name,content:bytes.toString('base64'),byteLength:bytes.length,sha256,check:{...check,server_verified:true},request_id:q.id,request_code:q.legacy_id,request_revision:q.revision,schedule_revision:s.revision,document_id:q.request_document_version_id};
}
export async function handleDemoReports({req,parsed,session,identity,rpc,bodyOf,fields,ApiError,reply,valid}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const b=await bodyOf(req,2048);fields(b,['request_id','request_revision','schedule_revision']);if(!UUID.test(b.request_id||'')||!Number.isSafeInteger(b.request_revision)||b.request_revision<1||!Number.isSafeInteger(b.schedule_revision)||b.schedule_revision<1)throw new ApiError(422,'DEMO_REPORT_FIELDS_INVALID');
 const call=(name,args={})=>rpc(name,{p_tenant:session.tenant,...args},session.access),context=await rpc('connection_context',{},session.access),member=context.memberships?.find(m=>m.tenant_id===session.tenant);if(context.user_id!==identity.id)throw new ApiError(401,'SESSION_REVOKED');
 try{
  const [core,human]=await Promise.all([call('original_ui_snapshot'),call('human_workflow_snapshot')]),source=demoReportSource(core,human,member,b.request_id);
  if(source.q.revision!==b.request_revision||source.s.revision!==b.schedule_revision)throw Error('REVISION_CONFLICT');
  const mapped=await call('document_mapping_report_context',{p_request:b.request_id}),data=await buildDemoReport({source,core,mapped});
  const [next,nextHuman,nextContext]=await Promise.all([call('original_ui_snapshot'),call('human_workflow_snapshot'),rpc('connection_context',{},session.access)]);if(demoReportSource(next,nextHuman,nextContext.memberships?.find(m=>m.tenant_id===session.tenant),b.request_id).stamp!==source.stamp)throw Error('REVISION_CONFLICT');await valid(session);return reply(200,{data});
 }catch(e){if(e instanceof ApiError)throw e;const code=['DEMO_REPORT_ACCESS_DENIED','VIRTUAL_TRIAL_REQUIRED','DEMO_REPORT_NOT_READY','DEMO_REPORT_TOO_LARGE','REVISION_CONFLICT','DOCUMENT_TEMPLATE_INVALID','DEMO_REPORT_CHECK_FAILED','HUMAN_REPORT_BINDING_INVALID','HUMAN_VIRTUAL_MARK_REQUIRED','DOCUMENT_MAPPING_REQUIRED'].includes(e.message)?e.message:'DEMO_REPORT_CHECK_FAILED';throw new ApiError(code==='DEMO_REPORT_ACCESS_DENIED'?403:code==='REVISION_CONFLICT'||code==='DEMO_REPORT_NOT_READY'?409:422,code);}
}
