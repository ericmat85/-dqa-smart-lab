const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function handlePreapproval({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');const m=path.match(/^\/preapproval\/(request|result)\/([a-f0-9-]{36})$/);
 if(req.method==='GET'&&m&&UUID.test(m[2]))return reply(200,{data:await rpc(m[1]==='request'?'preapproval_context':'preapproval_number_result',{p_tenant:session.tenant,[m[1]==='request'?'p_request':'p_operation']:m[2]},session.access)});
 if(req.method==='POST'&&path==='/preapproval/number'){
  const b=await bodyOf(req,4096);fields(b,['operation_id','request_id','document_id','request_revision','revision','code','draft_revision']);if(![b.operation_id,b.request_id,b.document_id].every(x=>UUID.test(x||''))||!Number.isSafeInteger(b.request_revision)||b.request_revision<1||!Number.isSafeInteger(b.revision)||b.revision<0||!Number.isSafeInteger(b.draft_revision)||b.draft_revision<1||typeof b.code!=='string'||!b.code.trim()||b.code.trim().length>120)throw new ApiError(422,'PREAPPROVAL_FIELDS_INVALID');
  markWrite();return reply(200,{data:await rpc('save_preapproval_sample_number',{p_tenant:session.tenant,p_operation:b.operation_id,p_request:b.request_id,p_document:b.document_id,p_request_revision:b.request_revision,p_revision:b.revision,p_code:b.code.trim(),p_plan_revision:b.draft_revision},session.access)});
 }throw new ApiError(405,'METHOD_DENIED');
}
