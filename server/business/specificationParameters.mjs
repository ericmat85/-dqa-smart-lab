import {parameterKindValid,validateParameterDefinition} from '../../src/specificationParameters.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function handleSpecificationParameters({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 if(req.method==='GET'&&path==='/specification-parameters/context')return reply(200,{data:await rpc('spec_parameter_context',{p_tenant:session.tenant},session.access)});
 const match=path.match(/^\/specification-parameters\/result\/([a-f0-9-]{36})$/);
 if(req.method==='GET'&&match&&UUID.test(match[1]))return reply(200,{data:await rpc('spec_parameter_result',{p_tenant:session.tenant,p_operation:match[1]},session.access)});
 if(req.method!=='POST'||!['/specification-parameters/prepare','/specification-parameters/execute'].includes(path))throw new ApiError(405,'METHOD_DENIED');
 const b=await bodyOf(req,6000);fields(b,['operation_id','command']);const c=b.command;
 if(!UUID.test(b.operation_id||'')||!c||Array.isArray(c)||typeof c!=='object')throw new ApiError(422,'SPEC_PARAMETER_FIELDS_INVALID');
 fields(c,['action','parameter_id','expected_revision','expected_member','data']);
 if(!['SAVE','DELETE'].includes(c.action)||!parameterKindValid(c.parameter_id)||!Number.isSafeInteger(c.expected_revision)||c.expected_revision<0||!UUID.test(c.expected_member||'')||!c.data||Array.isArray(c.data)||typeof c.data!=='object')throw new ApiError(422,'SPEC_PARAMETER_FIELDS_INVALID');
 try{if(c.action==='SAVE')validateParameterDefinition(c.data);else if(Object.keys(c.data).length)throw Error();}catch{throw new ApiError(422,'SPEC_PARAMETER_FIELDS_INVALID');}
 markWrite();return reply(200,{data:await rpc(path.endsWith('/prepare')?'prepare_spec_parameter':'save_spec_parameter',{p_tenant:session.tenant,p_operation:b.operation_id,p_member:c.expected_member,p_action:c.action,p_kind:c.parameter_id,p_expected:c.expected_revision,p_data:c.data},session.access)});
}
