import {createHash} from 'node:crypto';
import {mappingWorkbook,validateCellMapping,fillMappedWorkbook} from '../../src/documentCellMapping.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function mappedDocument(context){
 if(context?.has_template===false)return context;
 const bytes=Buffer.from(context.content||'','base64');if(bytes.length!==context.byteLength||createHash('sha256').update(bytes).digest('hex')!==context.sha256)throw Error('DOCUMENT_TEMPLATE_INVALID');
 if(!context.mapping?.length)throw Error('DOCUMENT_MAPPING_REQUIRED');
 let result;try{result=Buffer.from(await fillMappedWorkbook({...context,bytes},context,{kind:context.kind}));}catch{throw Error('DOCUMENT_TEMPLATE_INVALID');}if(result.length>4194304)throw Error('DOCUMENT_TEMPLATE_INVALID');
 return {...context,payload:undefined,stages:undefined,department:undefined,content:result.toString('base64'),byteLength:result.length,source_sha256:context.sha256,sha256:createHash('sha256').update(result).digest('hex'),name:(context.kind==='REQUEST'?'委託單_':'試驗報告單_')+context.request_code+'.xlsx'};
}
export async function handleDocumentMappings({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');const call=(name,args={})=>rpc(name,{p_tenant:session.tenant,...args},session.access);
 if(req.method==='GET'){
  if(path==='/document-mappings')return reply(200,{data:await call('document_mapping_catalog')});
  const stage=path.match(/^\/document-mappings\/stage\/([a-f0-9-]{36})$/);if(stage&&UUID.test(stage[1]))return reply(200,{data:await call('document_mapping_stage_context',{p_document:stage[1]})});
  const result=path.match(/^\/document-mappings\/result\/([a-f0-9-]{36})$/);if(result&&UUID.test(result[1]))return reply(200,{data:await call('document_mapping_result',{p_operation:result[1]})});
  const m=path.match(/^\/document-mappings\/(source|case)\/(REQUEST|REPORT)\/([a-f0-9-]{36})$/);if(m&&UUID.test(m[3])){const data=await call(m[1]==='source'?'document_mapping_source':'document_mapping_case',{p_kind:m[2],[m[1]==='source'?'p_file':'p_document']:m[3]});return reply(200,{data:m[1]==='source'?data:await mappedDocument(data)});}
 }
 if(path==='/document-mappings/save'&&req.method==='POST'){
  const b=await bodyOf(req,65536);fields(b,['operation_id','kind','file_id','revision','sha256','mapping']);if(!UUID.test(b.operation_id||'')||!['REQUEST','REPORT'].includes(b.kind)||!UUID.test(b.file_id||'')||!Number.isSafeInteger(b.revision)||b.revision<0||!/^[a-f0-9]{64}$/.test(b.sha256||''))throw new ApiError(422,'DOCUMENT_MAPPING_INVALID');
  const source=await call('document_mapping_source',{p_kind:b.kind,p_file:b.file_id});if(source.sha256!==b.sha256)throw new ApiError(409,'DOCUMENT_MAPPING_CONFLICT');let mapping;
  try{mapping=validateCellMapping(b.mapping,{kind:b.kind});await mappingWorkbook(Buffer.from(source.content,'base64'),source.name,mapping,{kind:b.kind});}catch(e){throw new ApiError(422,'DOCUMENT_MAPPING_INVALID',{message:e.message});}
  markWrite();return reply(200,{data:await call('save_document_mapping',{p_operation:b.operation_id,p_kind:b.kind,p_file:b.file_id,p_revision:b.revision,p_sha256:b.sha256,p_mapping:mapping})});
 }
 throw new ApiError(405,'METHOD_DENIED');
}
