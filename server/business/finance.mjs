// Finance is isolated from business snapshots, provider prompts and report workflows.
export async function handleFinance({markWrite,path,req,res,parsed,session,rpc,bodyOf,fields,ApiError,reply}){
 const get=req.method==='GET',post=req.method==='POST';
 const call=(name,args={})=>rpc(name,{p_tenant:session.tenant,...args},session.access);
 if(path==='/finance/context'&&get){if([...parsed.searchParams.keys()].some(k=>k!=='search'))throw new ApiError(422,'UNKNOWN_FIELDS');return reply(200,{data:await call('finance_context',{p_search:parsed.searchParams.get('search')||''})});}
 if(path==='/finance/snapshot'&&get){const filter=Object.fromEntries(parsed.searchParams);if(Object.keys(filter).some(k=>!['from','to','project_id','request_id','category','nature','page','year'].includes(k)))throw new ApiError(422,'UNKNOWN_FIELDS');return reply(200,{data:await call('finance_snapshot',{p_filter:filter})});}
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 const match=path.match(/^\/finance\/(result|events|file)\/([a-f0-9-]{36})$/);
 if(match&&get){const data=await call('finance_'+match[1],{[match[1]==='result'?'p_operation':'p_id']:match[2]});if(match[1]!=='file')return reply(200,{data});
  if(!['application/pdf','image/png','image/jpeg'].includes(data?.mime)||typeof data.content!=='string'||data.content.length>360000)throw new ApiError(502,'FINANCE_FILE_INVALID');
  res.statusCode=200;res.setHeader('Content-Type',data.mime);res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(data.name));res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.end(Buffer.from(data.content,'base64'));return;
 }
 if(path==='/finance/save'&&post){const b=await bodyOf(req);fields(b,['operation_id','kind','id','revision','data','void']);if(b.void!==undefined&&typeof b.void!=='boolean')throw new ApiError(422,'FINANCE_FIELDS_INVALID');markWrite();return reply(200,{data:await call('finance_save',{p_operation:b.operation_id,p_kind:b.kind,p_id:b.id,p_revision:b.revision,p_data:b.data,p_void:b.void===true})});}
 if(path==='/finance/attach'&&post){const b=await bodyOf(req,360000);fields(b,['id','revision','name','mime','content']);markWrite();return reply(200,{data:await call('finance_attach',{p_id:b.id,p_revision:b.revision,p_name:b.name,p_mime:b.mime,p_content:b.content})});}
 throw new ApiError(405,'METHOD_DENIED');
}
