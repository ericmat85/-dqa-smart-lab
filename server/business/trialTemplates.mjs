import {mappedDocument} from './documentMappings.mjs';
import {createHash} from 'node:crypto';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function handleTrialTemplates({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 const call=(name,args={})=>rpc(name,{p_tenant:session.tenant,...args},session.access);
 if(req.method==='GET'){
  if(path==='/trial-templates')return reply(200,{data:await call('trial_template_catalog')});
  if(path==='/trial-templates/inbox')return reply(200,{data:await call('trial_template_inbox')});
  const m=path.match(/^\/trial-templates\/(file|result|request)\/([a-f0-9-]{36})$/);if(m&&UUID.test(m[2])){const name={file:'trial_template_file',result:'trial_template_result',request:'request_trial_template_file'}[m[1]],field={file:'p_file',result:'p_operation',request:'p_document'}[m[1]];return reply(200,{data:m[1]==='request'?await mappedDocument(await call('document_mapping_case',{p_kind:'REPORT',p_document:m[2]})):await call(name,{[field]:m[2]})});}
 }
 if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
 const b=await bodyOf(req,3000000);
 if(path==='/trial-templates/delete-file'){
  fields(b,['operation_id','file_id','expected_revision']);if(!UUID.test(b.operation_id||'')||!UUID.test(b.file_id||'')||!Number.isSafeInteger(b.expected_revision)||b.expected_revision<0||b.expected_revision>2147483646)throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');markWrite();return reply(200,{data:await call('delete_report_template_file',{p_operation:b.operation_id,p_file:b.file_id,p_revision:b.expected_revision})});
 }
 if(path==='/trial-templates/delete-builtin'){
  fields(b,['operation_id','trial_id','expected_revision']);if(!UUID.test(b.operation_id||'')||!UUID.test(b.trial_id||'')||!Number.isSafeInteger(b.expected_revision)||b.expected_revision<1)throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');markWrite();return reply(200,{data:await call('delete_builtin_trial_template',{p_operation:b.operation_id,p_trial:b.trial_id,p_revision:b.expected_revision})});
 }
 if(path==='/trial-templates/save'){
  fields(b,['operation_id','trial_id','expected_revision','file_id','name','version','sha256','content']);
  if(!UUID.test(b.operation_id||'')||!UUID.test(b.trial_id||'')||!Number.isSafeInteger(b.expected_revision)||b.expected_revision<0||b.expected_revision>2147483646||!(b.file_id===null||UUID.test(b.file_id||'')))throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');
  const catalog=await call('trial_template_catalog');if(catalog.can_manage!==true)throw new ApiError(403,'TRIAL_TEMPLATE_ADMIN_REQUIRED');const trial=catalog.trials.find(t=>t.id===b.trial_id);if(!trial)throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');
  if(b.content!==null){
   if(typeof b.content!=='string'||b.content.length>2796204||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.content)||typeof b.name!=='string'||b.name.length>160||!b.name.toLowerCase().endsWith('.xlsx')||/[\r\n/\\]/.test(b.name)||typeof b.version!=='string'||!b.version.trim()||b.version.length>80||!/^[a-f0-9]{64}$/.test(b.sha256||''))throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');
   const bytes=Buffer.from(b.content,'base64');if(bytes.length>2097152||createHash('sha256').update(bytes).digest('hex')!==b.sha256)throw new ApiError(422,'TRIAL_TEMPLATE_FILE_INVALID');
   try{const {validateUploadedTemplate}=await import('../../src/reportTemplateStore.mjs');const details=await validateUploadedTemplate(new Uint8Array(bytes),b.name);if(details.declaredTrials.some(name=>![trial.name,...trial.aliases||[]].includes(name)))throw Error('Trial mismatch');}catch{throw new ApiError(422,'TRIAL_TEMPLATE_FILE_INVALID');}
  }else if(b.name!==null||b.version!==null||(b.file_id===null?b.sha256!==null:!/^[a-f0-9]{64}$/.test(b.sha256||'')))throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');
  markWrite();return reply(200,{data:await call('save_trial_template_binding',{p_operation:b.operation_id,p_trial:b.trial_id,p_revision:b.expected_revision,p_file:b.file_id,p_name:b.name,p_version:b.version,p_sha256:b.sha256,p_content:b.content})});
 }
 if(['/trial-templates/claim','/trial-templates/ack'].includes(path)){
  fields(b,path.endsWith('/claim')?['document_id','attempt','manual']:['document_id','attempt']);if(!UUID.test(b.document_id||'')||!UUID.test(b.attempt||'')||(b.manual!==undefined&&typeof b.manual!=='boolean'))throw new ApiError(422,'TRIAL_TEMPLATE_FIELDS_INVALID');markWrite();return reply(200,{data:await call(path.endsWith('/claim')?'claim_trial_template_delivery':'ack_trial_template_delivery',{p_document:b.document_id,p_attempt:b.attempt,...(path.endsWith('/claim')?{p_manual:b.manual===true}:{})})});
 }
 throw new ApiError(404,'ROUTE_NOT_FOUND');
}
