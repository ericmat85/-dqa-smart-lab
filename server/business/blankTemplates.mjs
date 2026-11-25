import {createHash} from 'node:crypto';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function handleBlankTemplates({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 const call=(name,args={})=>rpc(name,{p_tenant:session.tenant,...args},session.access);
 if(path==='/templates/blank'&&req.method==='GET')return reply(200,{data:await call('blank_request_template_library')});
 const match=path.match(/^\/templates\/blank\/(file|result)\/([a-f0-9-]{36})$/);
 if(match&&req.method==='GET'&&UUID.test(match[2]))return reply(200,{data:await call(match[1]==='file'?'blank_request_template_file':'blank_request_template_result',{[match[1]==='file'?'p_id':'p_operation']:match[2]})});
 if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
 const b=await bodyOf(req,3000000);
 if(path==='/templates/blank/save'){
 fields(b,['operation_id','id','name','version','sha256','content']);
 if(!UUID.test(b.operation_id||'')||!UUID.test(b.id||'')||typeof b.name!=='string'||b.name.length>160||!b.name.toLowerCase().endsWith('.xlsx')||/[\r\n/\\]/.test(b.name)||typeof b.version!=='string'||!b.version.trim()||b.version.length>80||!/^[a-f0-9]{64}$/.test(b.sha256||'')||typeof b.content!=='string'||b.content.length>2796204||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.content))throw new ApiError(422,'TEMPLATE_FIELDS_INVALID');
 // Authorize before inflating untrusted input. The SQL write checks again.
 const library=await call('blank_request_template_library');if(library.can_manage!==true)throw new ApiError(403,'TEMPLATE_ADMIN_REQUIRED');
 const bytes=Buffer.from(b.content,'base64');if(bytes.length<22||bytes.length>2097152||createHash('sha256').update(bytes).digest('hex')!==b.sha256)throw new ApiError(422,'TEMPLATE_FILE_INVALID');
 try{const {validateUploadedTemplate}=await import('../../src/reportTemplateStore.mjs');const details=await validateUploadedTemplate(new Uint8Array(bytes),b.name);if(details.declaredTrials.length)throw Error('Blank templates cannot contain assigned trials');}catch{throw new ApiError(422,'TEMPLATE_FILE_INVALID');}
 markWrite();return reply(200,{data:await call('save_blank_request_template',{p_operation:b.operation_id,p_id:b.id,p_name:b.name,p_version:b.version,p_sha256:b.sha256,p_content:b.content})});
 }
 if(path==='/templates/blank/delete'){
 fields(b,['operation_id','id','revision']);if(!UUID.test(b.operation_id||'')||!(b.id==='BLANK'||UUID.test(b.id||''))||!Number.isSafeInteger(b.revision)||b.revision<0)throw new ApiError(422,'TEMPLATE_FIELDS_INVALID');markWrite();return reply(200,{data:await call('delete_blank_request_template',{p_operation:b.operation_id,p_id:b.id,p_revision:b.revision})});
 }
 throw new ApiError(404,'ROUTE_NOT_FOUND');
}
