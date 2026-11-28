const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function validBatchCommand(c){
 return c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).sort().join()==='expected_member,options,selection'&&UUID.test(c.expected_member||'')&&c.options&&Object.keys(c.options).sort().join()==='earliest,latest'&&['earliest','latest'].every(k=>typeof c.options[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.options[k]))&&Array.isArray(c.selection)&&c.selection.length>=1&&c.selection.length<=20&&new Set(c.selection.map(j=>j?.request_id)).size===c.selection.length&&c.selection.every(j=>j&&Object.keys(j).sort().join()==='equipment_count,expected_draft_revision,expected_request_revision,request_id,sample_code,sample_space_units'&&UUID.test(j.request_id||'')&&Number.isSafeInteger(j.expected_request_revision)&&j.expected_request_revision>=1&&Number.isSafeInteger(j.expected_draft_revision)&&j.expected_draft_revision>=0&&(j.sample_space_units===null||Number.isSafeInteger(j.sample_space_units)&&j.sample_space_units>=1&&j.sample_space_units<=100000)&&(j.equipment_count===null||Number.isSafeInteger(j.equipment_count)&&j.equipment_count>=0&&j.equipment_count<=4)&&typeof j.sample_code==='string'&&j.sample_code.length<=100);
}
export async function handleScheduleBatches({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 const result=path.match(/^\/schedule-batches\/result\/([a-f0-9-]{36})$/);
 if(result&&UUID.test(result[1])&&req.method==='GET')return reply(200,{data:await rpc('schedule_batch_result',{p_tenant:session.tenant,p_operation:result[1]},session.access)});
 if(req.method!=='POST'||!['/schedule-batches/prepare','/schedule-batches/execute'].includes(path))throw new ApiError(405,'METHOD_DENIED');
 const body=await bodyOf(req,18000);fields(body,path.endsWith('/prepare')?['operation_id','command']:['operation_id']);if(!UUID.test(body.operation_id||''))throw new ApiError(422,'BATCH_FIELDS_INVALID');
 if(path.endsWith('/prepare')&&!validBatchCommand(body.command))throw new ApiError(422,'BATCH_FIELDS_INVALID');
 markWrite();return reply(200,{data:await rpc(path.endsWith('/prepare')?'prepare_schedule_batch':'execute_schedule_batch',{p_tenant:session.tenant,p_operation:body.operation_id,...(path.endsWith('/prepare')?{p_command:body.command}:{})},session.access)});
}
