import {validateCalendarPolicy} from '../../src/schedulingCalendar.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function handleSchedulingCalendar({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 if(req.method==='GET'&&path==='/scheduling/context')return reply(200,{data:await rpc('scheduling_context',{p_tenant:session.tenant},session.access)});
 const match=path.match(/^\/scheduling\/result\/([a-f0-9-]{36})$/);if(req.method==='GET'&&match&&UUID.test(match[1]))return reply(200,{data:await rpc('scheduling_result',{p_tenant:session.tenant,p_operation:match[1]},session.access)});
 if(req.method!=='POST'||path!=='/scheduling/save')throw new ApiError(405,'METHOD_DENIED');
 const b=await bodyOf(req,8000);fields(b,['operation_id','action','data']);if(!UUID.test(b.operation_id||'')||!['INCIDENT','RESOLVE','DECIDE','POLICY'].includes(b.action)||!b.data||typeof b.data!=='object'||Array.isArray(b.data))throw new ApiError(422,'CALENDAR_FIELDS_INVALID');
 const d=b.data;fields(d,b.action==='INCIDENT'?['kind','first_day','last_day','equipment_id','reason']:b.action==='RESOLVE'?['incident_id','reason']:b.action==='POLICY'?['trial_id','expected_revision','policy','reason']:['schedule_id','expected_revision','decision','reason']);
 if(typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>1000||b.action==='INCIDENT'&&(!['CLOSURE','WORKING_DAY','EQUIPMENT_FAULT'].includes(d.kind)||![d.first_day,d.last_day].every(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x))||!(d.equipment_id===null||UUID.test(d.equipment_id||'')))||b.action==='RESOLVE'&&!UUID.test(d.incident_id||'')||b.action==='POLICY'&&(!UUID.test(d.trial_id||'')||!Number.isSafeInteger(d.expected_revision)||d.expected_revision<0)||b.action==='DECIDE'&&(!UUID.test(d.schedule_id||'')||!Number.isSafeInteger(d.expected_revision)||d.expected_revision<1||!['RESUME','RETEST'].includes(d.decision)))throw new ApiError(422,'CALENDAR_FIELDS_INVALID');
 if(b.action==='POLICY'){try{validateCalendarPolicy(d.policy);}catch{throw new ApiError(422,'CALENDAR_POLICY_INVALID');}}
 markWrite();return reply(200,{data:await rpc('save_scheduling_operation',{p_tenant:session.tenant,p_operation:b.operation_id,p_action:b.action,p_data:d},session.access)});
}
