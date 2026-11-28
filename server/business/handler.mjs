import {handleScheduleBatches} from './scheduleBatches.mjs';
import {handleSpecificationParameters} from './specificationParameters.mjs';
import {parseParameterCatalog,DEFAULT_SPEC_PARAMETERS} from '../../src/specificationParameters.mjs';
import {validateTrialDetails,descriptionText,trialEquipmentIds} from '../../src/trialDefinitionDetails.mjs';
import {handleDemoReports} from './demoReports.mjs';
import {handleSchedulingCalendar} from './schedulingCalendar.mjs';
import {validateCalendarPolicy} from '../../src/schedulingCalendar.mjs';
import {TRIAL_TYPES} from '../../src/trialTypes.mjs';
import {handlePreapproval} from './preapproval.mjs';
import {validateStageFields} from '../../src/templateStageFields.mjs';
import {handleDocumentMappings} from './documentMappings.mjs';
import {handleTrialTemplates} from './trialTemplates.mjs';
import {handleBlankTemplates} from './blankTemplates.mjs';
import {validateImageChange} from '../../src/workspaceImages.mjs';
import {handleFinance} from './finance.mjs';
import {validateWorkspaceProfile} from '../../src/workspaceProfile.mjs';
import {validateWorkspaceAppearance} from '../../src/workspaceAppearance.mjs';
import {REPORT_FILE_MAX_BYTES} from '../../src/reportFilePolicy.mjs';
import {flowTestReport} from './flowTestReport.mjs';
import {signaturePortConfig} from '../../src/digitalSignaturePortConfig.mjs';
import {checkSignaturePort,verifySignaturePort} from './digitalSignaturePort.mjs';
import {handleBusinessAI} from './businessAI.mjs';
import {requestPasswordRecovery} from './passwordRecovery.mjs';
import {accountDeletionServiceKey,verifyAdministratorPassword} from './accountDeletion.mjs';
import {deliverAccountInvitation} from './accountInvitations.mjs';
import {reportAttestationKey,fileAttestation,safeObject,validateHumanFile,readStorageBytes} from './humanReports.mjs';
import {explicitHours,sourceConditions} from '../../src/trialSourceFacts.mjs';
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
export const COOKIE='__Host-dqa_business';
const REF='mmazbwzdiizabikmiily',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const RESOURCE={
 trials:['trial_definitions','id,legacy_id,name,aliases,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision','name'],
 equipment:['equipment','id,legacy_id,name,category,model,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision','name'],
 materials:['materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,status,revision','name'],
 requests:['requests','project_group_id,project_item_index,execution_kind,id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details','legacy_id'],
 schedules:['schedules','id,legacy_id,request_id,executor_member_id,starts_at,ends_at,status,preparation_minutes,cleanup_minutes,revision','legacy_id'],
 reports:['reports','id,request_id,status,revision,created_at,updated_at',null],
 documents:['artifacts','id,legacy_id,kind,name,request_id,trial_id,revision,updated_at','name'],
 borrows:['borrows','id,legacy_id,borrower_member_id,equipment_id,material_id,quantity,purpose,starts_at,due_at,status,revision','legacy_id'],
 qualifications:['qualifications','id,member_id,equipment_id,trial_id,training,issued_on,expires_on,status,revision','training'],
 quality:['quality_records','id,title,owner_member_id,request_id,equipment_id,trial_id,status,severity,cause,action,resolution,due_on,revision','title'],
 sites:['sites','id,legacy_id,name,location,revision','name'],
 departments:['departments','id,legacy_id,name,parent_id,revision','name'],
 resourceevents:['resource_events','id,kind,resource_id,actor_label,action,reason,detail,created_at',null],
 audit:['audit_events','id,table_name,record_id,operation,changed_columns,created_at','table_name'],
};
class ApiError extends Error{constructor(status,code,extra={}){super(code);this.status=status;this.code=code;this.extra=extra;}}
const sha=value=>createHash('sha256').update(value).digest('hex');
function anonymousKey(value){try{if(/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value||''))return true;const payload=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));return payload.role==='anon'&&payload.ref===REF;}catch{return false;}}
export function sealSession(session,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64url'),iv);cipher.setAAD(Buffer.from(COOKIE));const bytes=Buffer.concat([cipher.update(JSON.stringify(session)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
export function openSession(value,key){try{if(!value||value.length>5500)throw Error();const b=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64url'),b.subarray(0,12));cipher.setAAD(Buffer.from(COOKIE));cipher.setAuthTag(b.subarray(12,28));const s=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]));if(!UUID.test(s.id)||!UUID.test(s.tenant)||typeof s.nonce!=='string'||typeof s.access!=='string'||typeof s.refresh!=='string'||!Number.isSafeInteger(s.expires)||!Number.isSafeInteger(s.absolute)||s.absolute<=Date.now())throw Error();return s;}catch{throw new ApiError(401,'AUTHENTICATION_REQUIRED');}}
function cookie(value,seconds=28800){return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;}
async function bodyOf(req,maxBytes=24576){if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new ApiError(415,'JSON_REQUIRED');let body=req.body;if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>maxBytes)throw new ApiError(413,'PAYLOAD_TOO_LARGE');}body=raw;}if(typeof body==='string'){if(Buffer.byteLength(body)>maxBytes)throw new ApiError(413,'PAYLOAD_TOO_LARGE');try{body=JSON.parse(body);}catch{throw new ApiError(400,'INVALID_JSON');}}if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>maxBytes)throw new ApiError(400,'INVALID_BODY');return body;}
function fields(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new ApiError(422,'UNKNOWN_FIELDS');}
function businessRoute(req,origin){
 const raw=String(req.url||'');if(raw.length>4096||/[\\#\r\n]/.test(raw))throw new ApiError(404,'ROUTE_NOT_FOUND');
 const rawPath=raw.split('?')[0].replace(/^https:\/\/[^/]+/,'');if(/%|\/\//.test(rawPath)||rawPath.split('/').some(x=>x==='.'||x==='..'))throw new ApiError(404,'ROUTE_NOT_FOUND');
 const parsed=new URL(raw,origin);if(parsed.origin!==origin)throw new ApiError(404,'ROUTE_NOT_FOUND');
 const allowed=path=>/^\/(?:schedule-batches\/(?:prepare|execute|result\/[a-f0-9-]{36})|specification-parameters\/(?:context|prepare|execute|result\/[a-f0-9-]{36})|scheduling\/(?:context|save|result\/[a-f0-9-]{36})|demo-reports\/generate|preapproval\/(?:number|samples|(?:request|result)\/[a-f0-9-]{36})|document-mappings(?:\/(?:save|(?:result|stage)\/[a-f0-9-]{36}|(?:source|case)\/(?:REQUEST|REPORT)\/[a-f0-9-]{36}))?|trial-templates(?:\/(?:save|delete-builtin|delete-file|inbox|claim|ack|(?:file|result|request)\/[a-f0-9-]{36}))?|templates\/blank(?:\/(?:save|delete|default|(?:file|result)\/[a-f0-9-]{36}))?|finance\/(?:context|snapshot|save|attach|(?:result|events|file)\/[a-f0-9-]{36})|assistant-commands(?:\/(?:search|preview|execute|result\/[a-f0-9-]{36}))|images|config|login|claim|refresh|logout|me|password|snapshot|activate|recover|signature-settings|flow-tests\/(?:preview|execute|(?:run|report|result)\/[a-f0-9-]{36})|notifications\/(?:settings|test|status)|ai\/(?:generate|status|clear|validate-schedule|settings\/E[1-4]|result\/[a-f0-9-]{36})|execution\/(?:prepare|execute|upload|(?:result|file|download|signature)\/[a-f0-9-]{36})|planning\/(?:preview|prepare|execute|result\/[a-f0-9-]{36})|projects\/(?:prepare|execute|result\/[a-f0-9-]{36})|workflow\/(?:prepare|execute|(?:result|signature|document)\/[a-f0-9-]{36})|resources\/(?:trial-details\/[a-f0-9-]{36}|settings|prepare|execute|result\/[a-f0-9-]{36})|access(?:\/(?:save|result\/[a-f0-9-]{36}))?|maintenance(?:\/(?:preview|execute|restore|result\/[a-f0-9-]{36}))?|data\/[a-z]+(?:\/[a-f0-9-]{36})?)$/.test(path);
 const hint=value=>{const parts=Array.isArray(value)?value:typeof value==='string'?value.split('/'):[];if(!parts.length||parts.length>4||parts.some(x=>typeof x!=='string'||!x||!/^[A-Za-z0-9_-]+$/.test(x)))throw new ApiError(422,'ROUTE_PARAMETER_INVALID');const path='/'+parts.join('/');if(!allowed(path))throw new ApiError(404,'ROUTE_NOT_FOUND');return path;};
 if(parsed.searchParams.getAll('path').length>1)throw new ApiError(422,'ROUTE_PARAMETER_INVALID');
 const hints=[parsed.searchParams.has('path')?parsed.searchParams.get('path'):undefined,req.query?.path,req.params?.path].filter(x=>x!==undefined).map(hint);
 if(hints.some(x=>x!==hints[0]))throw new ApiError(422,'ROUTE_PARAMETER_INVALID');
 const pathname=parsed.pathname.replace(/\/$/,'');let path=pathname.startsWith('/api/business/')?pathname.slice('/api/business'.length):null;
 if(allowed(path)){if(hints.length&&hints[0]!==path)throw new ApiError(422,'ROUTE_PARAMETER_INVALID');}
 else if(['/api/business','/api/business/index','/api/business/index.js','/api/business/[...path]','/api/business/[...path].js'].includes(pathname)&&hints.length)path=hints[0];
 else throw new ApiError(404,'ROUTE_NOT_FOUND');
 parsed.searchParams.delete('path');
 if(path==='/data/requests'&&parsed.searchParams.has('id')){
  const id=parsed.searchParams.get('id');if(parsed.searchParams.getAll('id').length!==1||!UUID.test(id)||!['GET','PATCH'].includes(req.method))throw new ApiError(422,'QUERY_INVALID');
  path+='/'+id;parsed.searchParams.delete('id');
 }
 return {parsed,path};
}
export function createBusinessHandler({env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now(),signaturePortTransport}={}){
 return async(req,res)=>{
  const trace='I-'+randomUUID().replaceAll('-','');let dispatchedWrite=false;
  const reply=(status,data)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Trace-ID',trace);res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json({...data,trace_id:trace});};
  try{
   if(env.BUSINESS_ENABLED!=='true')throw new ApiError(503,'BUSINESS_CONNECTION_DISABLED');
   const origin=new URL(env.BUSINESS_ORIGIN||'https://'+env.VERCEL_URL).origin;
   if(!origin.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw new ApiError(503,'CONFIGURATION_REQUIRED');
   if(req.headers.origin&&req.headers.origin!==origin)throw new ApiError(403,'ORIGIN_DENIED');
   if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'ORIGIN_DENIED');
   if(!['GET','POST','PATCH'].includes(req.method))throw new ApiError(405,'METHOD_DENIED');
   if(req.method!=='GET'&&req.headers.origin!==origin)throw new ApiError(403,'ORIGIN_REQUIRED');
   if(env.BUSINESS_SUPABASE_URL!==`https://${REF}.supabase.co`||!anonymousKey(env.BUSINESS_SUPABASE_ANON_KEY)||!/^[A-Za-z0-9_-]{43}$/.test(env.BUSINESS_COOKIE_KEY||''))throw new ApiError(503,'CONFIGURATION_REQUIRED');
   const {parsed,path}=businessRoute(req,origin);

   async function upstream(path,{token,method='GET',body,profile=false,headers={}}={}){
    let response;try{response=await fetchImpl(env.BUSINESS_SUPABASE_URL+path,{method,headers:{apikey:env.BUSINESS_SUPABASE_ANON_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(profile?{'Accept-Profile':'dqa_business','Content-Profile':'dqa_business'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new ApiError(503,dispatchedWrite?'WRITE_OUTCOME_UNKNOWN':'UPSTREAM_UNAVAILABLE',{outcome_unknown:dispatchedWrite});}
    const text=await response.text();const maxResponseBytes=path==='/rest/v1/rpc/document_mapping_case'?16777216:['/rest/v1/rpc/document_mapping_report_context','/rest/v1/rpc/document_mapping_source','/rest/v1/rpc/document_mapping_case','/rest/v1/rpc/trial_template_file','/rest/v1/rpc/request_trial_template_file','/rest/v1/rpc/blank_request_template_file','/rest/v1/rpc/original_ui_snapshot','/rest/v1/rpc/workspace_images','/rest/v1/rpc/save_workspace_image'].includes(path)?8388608:2097152;if(Buffer.byteLength(text)>maxResponseBytes)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID',{outcome_unknown:dispatchedWrite});let data;try{data=text?JSON.parse(text):null;}catch{throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID',{outcome_unknown:dispatchedWrite});}
    if(!response.ok){
     const known=[...'BATCH_ACCESS_DENIED BATCH_FIELDS_INVALID BATCH_OPERATION_CONFLICT BATCH_RATE_LIMITED BATCH_SOURCE_CHANGED BATCH_EXPIRED BATCH_EMPTY BATCH_DRAFT_CONFLICT BATCH_NOT_ELIGIBLE BATCH_UNITS_REQUIRED BATCH_EQUIPMENT_REQUIRED BATCH_SEARCH_LIMIT BATCH_NO_SLOT BATCH_SAMPLE_CODE_REQUIRED'.split(' '),...'SPEC_PARAMETER_ACCESS_DENIED SPEC_PARAMETER_FIELDS_INVALID SPEC_PARAMETER_NOT_FOUND SPEC_PARAMETER_IN_USE SPEC_PARAMETER_REVISION_CONFLICT SPEC_PARAMETER_OPERATION_CONFLICT SPEC_PARAMETER_NAME_EXISTS SPEC_PARAMETER_LIMIT SPEC_PARAMETER_RATE_LIMITED SPEC_PARAMETER_EXPIRED'.split(' '),...'EQUIPMENT_CAPABILITIES_INVALID PLANNING_CONDITIONS_UNVERIFIED PLANNING_CONDITIONS_EXCEEDED'.split(' '),...'TRIAL_SUBTRIALS_INVALID TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED TRIAL_DETAILS_INVALID TRIAL_EQUIPMENT_INVALID TRIAL_EQUIPMENT_MISMATCH TRIAL_DELETED'.split(' '),...'CALENDAR_ACCESS_DENIED CALENDAR_FIELDS_INVALID CALENDAR_POLICY_INVALID CALENDAR_COVERAGE_REQUIRED CALENDAR_NONWORKING_DAY CALENDAR_CONTIGUOUS_WINDOW CALENDAR_OPERATION_CONFLICT CALENDAR_RETEST_REQUIRED CALENDAR_NO_REMAINING_WORK CALENDAR_NO_WINDOW CALENDAR_DURATION_INVALID CALENDAR_SEARCH_LIMIT PREAPPROVAL_SAMPLE_MANUAL_REQUIRED PREAPPROVAL_SAMPLE_COUNT_INVALID PREAPPROVAL_SAMPLE_FORMAT_INVALID PREAPPROVAL_SAMPLE_DUPLICATE PREAPPROVAL_SAMPLE_ALREADY_USED PREAPPROVAL_SAMPLE_GROUP_EXISTS PREAPPROVAL_SAMPLE_GENERATION_REQUIRED TRIAL_TYPE_INVALID'.split(' '),...'COMPOUND_PROTOCOL_INVALID COMPOUND_PROTOCOL_REQUIRED COMPOUND_TRIAL_REQUIRED COMPOUND_CATALOG_CHANGED COMPOUND_PLAN_REQUIRED COMPOUND_HANDOFF_WINDOW COMPOUND_OPERATOR_WINDOW'.split(' '),...'PREAPPROVAL_NUMBER_AFTER_PLAN HUMAN_CANCELLATION_PENDING FLOW_TEST_PREFLIGHT_REQUIRED PREAPPROVAL_FIELDS_INVALID PREAPPROVAL_STATE_INVALID PREAPPROVAL_OPERATION_CONFLICT PREAPPROVAL_SAMPLE_REQUIRED PREAPPROVAL_PLAN_REQUIRED PREAPPROVAL_DERIVED_FIELDS_IMMUTABLE PREAPPROVAL_SCHEDULE_EXPIRED PREPARATION_NOT_READY'.split(' '),...'TEMPLATE_STAGE_FIELDS_REQUIRED TEMPLATE_STAGE_FIELDS_INVALID TEMPLATE_STAGE_OPERATION_CONFLICT'.split(' '),...'DOCUMENT_MAPPING_ACCESS_DENIED DOCUMENT_MAPPING_NOT_FOUND DOCUMENT_MAPPING_INVALID DOCUMENT_MAPPING_CONFLICT DOCUMENT_MAPPING_REQUIRED DOCUMENT_TEMPLATE_INVALID OTHER_PURPOSE_REQUIRED ORIGINAL_SOURCE_REQUIRED TRIAL_TEMPLATE_REQUEST_FORM_DENIED'.split(' '),...'TRIAL_TEMPLATE_ACCESS_DENIED TRIAL_TEMPLATE_ADMIN_REQUIRED TRIAL_TEMPLATE_FIELDS_INVALID TRIAL_TEMPLATE_FILE_INVALID TRIAL_TEMPLATE_NOT_FOUND TRIAL_TEMPLATE_OPERATION_CONFLICT TRIAL_TEMPLATE_REVISION_CONFLICT TRIAL_TEMPLATE_LIMIT TRIAL_TEMPLATE_CLAIM_STALE TRIAL_TEMPLATE_IN_USE'.split(' '),...'TEMPLATE_ACCESS_DENIED TEMPLATE_ADMIN_REQUIRED TEMPLATE_NOT_FOUND TEMPLATE_FIELDS_INVALID TEMPLATE_FILE_INVALID TEMPLATE_OPERATION_CONFLICT TEMPLATE_IN_USE TEMPLATE_LIMIT'.split(' '),...'COMMAND_ACCESS_DENIED COMMAND_ADMIN_REQUIRED COMMAND_INVALID COMMAND_SCHEMA_INCOMPLETE COMMAND_BATCH_TOO_LARGE COMMAND_RATE_LIMITED COMMAND_NOT_FOUND COMMAND_CONFIRMATION_INVALID COMMAND_EXPIRED COMMAND_PREVIEW_STALE'.split(' '),'WORKSPACE_IMAGE_ACCESS_DENIED','WORKSPACE_IMAGE_INVALID','WORKSPACE_APPEARANCE_ACCESS_DENIED','WORKSPACE_APPEARANCE_FIELDS_INVALID','RESOURCE_DELETED','EQUIPMENT_ACTIVITY_FIELDS_INVALID',...'FINANCE_ACCESS_DENIED FINANCE_FIELDS_INVALID FINANCE_OPERATION_CONFLICT FINANCE_VOIDED FINANCE_LINKED_COST FINANCE_SOURCE_INVALID FINANCE_PROJECT_MISMATCH FINANCE_RATE_LABEL_REQUIRED FINANCE_LINKS_INVALID FINANCE_LINK_TOTAL_INVALID FINANCE_FILE_INVALID FINANCE_FILE_EXISTS FINANCE_FILE_NOT_FOUND'.split(' '),'WORKSPACE_PROFILE_ACCESS_DENIED','WORKSPACE_PROFILE_FIELDS_INVALID',...'PROJECT_FIELDS_INVALID PROJECT_LIMIT PROJECT_OPERATION_CONFLICT PROJECT_OPERATION_EXPIRED PROJECT_RATE_LIMITED PROJECT_LINK_IMMUTABLE PROJECT_GROUP_REQUIRED'.split(' '),...'HUMAN_STOP_DENIED HUMAN_STOP_STATE_INVALID HUMAN_VIRTUAL_MARK_REQUIRED HUMAN_REPORT_PURPOSE_MISMATCH EXECUTION_KIND_INVALID EXECUTION_KIND_IMMUTABLE VIRTUAL_TRIAL_REQUIRED VIRTUAL_ACCELERATOR_REQUIRED VIRTUAL_CLOCK_DENIED'.split(' '),...'FLOW_TEST_ACCESS_DENIED FLOW_TEST_ADMIN_REQUIRED FLOW_TEST_FIELDS_INVALID FLOW_TEST_RECEIPT_REQUIRED FLOW_TEST_OPERATION_CONFLICT FLOW_TEST_RATE_LIMITED FLOW_TEST_ALREADY_EXISTS FLOW_TEST_SOURCE_CHANGED FLOW_TEST_CONFIRMATION_REQUIRED FLOW_TEST_COMPLETED'.split(' '),...'SIGNATURE_PORT_ADMIN_REQUIRED SIGNATURE_PORT_FIELDS_INVALID'.split(' '),...'SIGNATURE_SETTINGS_ACCESS_DENIED SIGNATURE_CONFIGURATION_INVALID SIGNATURE_FIELDS_INVALID SIGNATURE_DIGITAL_NOT_CONFIGURED'.split(' '),...'AI_FIELDS_INVALID AI_ACCESS_DENIED AI_OPERATION_CONFLICT AI_RATE_LIMITED AI_PROVIDER_EVIDENCE_REQUIRED'.split(' '),...'ACCESS_MEMBER_DELETED ACCESS_DELETE_SELF_DENIED ACCESS_MEMBER_WORK_IN_USE ACCESS_MEMBER_RESOURCE_IN_USE ACCESS_DELETE_EXPIRED'.split(' '),...'NOTIFICATION_ACCESS_DENIED NOTIFICATION_FIELDS_INVALID NOTIFICATION_DISABLED NOTIFICATION_RATE_LIMITED NOTIFICATION_SERVICE_UNAVAILABLE HUMAN_ACCESS_DENIED HUMAN_RELEASE_REQUIRED HUMAN_FIELDS_INVALID HUMAN_OPERATION_CONFLICT HUMAN_OPERATION_EXPIRED HUMAN_RATE_LIMITED HUMAN_STATE_INVALID HUMAN_EXECUTOR_REQUIRED HUMAN_RECEIPT_WINDOW HUMAN_START_WINDOW HUMAN_EQUIPMENT_UNAVAILABLE HUMAN_COMPLETION_TOO_EARLY HUMAN_RESULT_REQUIRED HUMAN_UPLOAD_STALE HUMAN_FILE_VERIFICATION_REQUIRED HUMAN_REPORT_REVIEW_DENIED HUMAN_REPORT_LEVEL_CONFLICT HUMAN_RETURN_REASON_REQUIRED HUMAN_RESERVATION_CONFLICT HUMAN_FILE_INVALID'.split(' '),...'PLANNING_ACCESS_DENIED PLANNING_FIELDS_INVALID PLANNING_APPROVAL_REQUIRED PLANNING_SOURCE_INCOMPLETE PLANNING_EXECUTOR_REQUIRED PLANNING_TRIAL_UNVERIFIED PLANNING_FIXED_DURATION PLANNING_DURATION_REQUIRED PLANNING_WEEKDAY_REQUIRED PLANNING_EQUIPMENT_REQUIRED PLANNING_SPACE_INSUFFICIENT PLANNING_DAILY_HOURS PLANNING_DATE_INVALID PLANNING_END_DATE_MISMATCH PLANNING_RESOURCE_CONFLICT PLANNING_OPERATION_CONFLICT PLANNING_OPERATION_EXPIRED PLANNING_RATE_LIMITED'.split(' '),'WORKFLOW_ACCESS_DENIED', 'WORKFLOW_RELEASE_REQUIRED', 'WORKFLOW_FIELDS_INVALID', 'WORKFLOW_RETURN_REASON_REQUIRED', 'WORKFLOW_SIGNATURE_REQUIRED', 'WORKFLOW_SUPERVISOR_REQUIRED', 'WORKFLOW_REQUEST_INCOMPLETE', 'WORKFLOW_SELF_REVIEW_DENIED', 'WORKFLOW_REVIEW_LEVEL_REQUIRED', 'WORKFLOW_REVIEW_LEVEL_CONFLICT', 'WORKFLOW_OPERATION_CONFLICT', 'WORKFLOW_OPERATION_EXPIRED', 'WORKFLOW_STATE_INVALID', 'WORKFLOW_DOCUMENT_REQUIRED', 'WORKFLOW_RATE_LIMITED','RESOURCE_WRITE_DENIED', 'RESOURCE_FIELDS_INVALID', 'RESOURCE_OPERATION_CONFLICT', 'RESOURCE_OPERATION_EXPIRED', 'RESOURCE_RATE_LIMITED', 'RESOURCE_REASON_REQUIRED', 'RESOURCE_RESERVED', 'RESOURCE_SPACE_REQUIRED', 'RESOURCE_ID_IMMUTABLE', 'RESOURCE_STATUS_INVALID', 'RESOURCE_LIMIT', 'RESOURCE_DUPLICATE', 'TRIAL_DURATION_INVALID', 'TRIAL_PROFILE_INVALID', 'TRIAL_FIXED_DURATION', 'TRIAL_PROFILE_IMMUTABLE', 'TRIAL_NAME_EXISTS', 'STOCK_INSUFFICIENT', 'STOCK_INVALID', 'STOCK_UNIT_IMMUTABLE','ACCESS_ADMIN_REQUIRED', 'ACCESS_FIELDS_INVALID', 'ACCESS_MEMBER_UNAVAILABLE', 'ACCESS_ROLE_UNAVAILABLE', 'ACCESS_SELF_LOCKOUT', 'ACCESS_EMAIL_IMMUTABLE', 'ACCESS_EMAIL_EXISTS', 'ACCESS_SUPERVISOR_INVALID', 'ACCESS_SUPERVISOR_IN_USE', 'ACCESS_ROLE_EXISTS', 'ACCESS_LAST_ADMIN', 'ACCESS_OPERATION_CONFLICT', 'ACCESS_RATE_LIMITED', 'ACCESS_DIRECTORY_LIMIT','REVISION_CONFLICT','DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY','DRAFT_NOT_AVAILABLE','DRAFT_WRITE_DENIED','MEMBERSHIP_REQUIRED','TRIAL_NOT_AVAILABLE','DRAFT_FIELDS_INVALID','DRAFT_FIELDS_TOO_LONG','ORIGINAL_FORM_INVALID','DRAFT_SIGNATURE_INVALID','SNAPSHOT_PAGINATION_REQUIRED','RULE_NOT_APPROVED','MAINTENANCE_ADMIN_REQUIRED','MAINTENANCE_SELECTION_INVALID','MAINTENANCE_CONFIRMATION_INVALID','MAINTENANCE_PLAN_EXPIRED','MAINTENANCE_PREVIEW_STALE','MAINTENANCE_ACTIVE_RESERVATIONS','MAINTENANCE_EMPTY','MAINTENANCE_RUN_NOT_FOUND','MAINTENANCE_BATCH_TOO_LARGE','MAINTENANCE_RATE_LIMITED'];const code=known.find(k=>data?.message===k);
     if(code){const status=code==='BATCH_ACCESS_DENIED'?403:code==='BATCH_RATE_LIMITED'?429:['BATCH_SOURCE_CHANGED','BATCH_OPERATION_CONFLICT','BATCH_EXPIRED','BATCH_DRAFT_CONFLICT'].includes(code)?409:code==='SPEC_PARAMETER_ACCESS_DENIED'?403:['SPEC_PARAMETER_IN_USE','SPEC_PARAMETER_REVISION_CONFLICT','SPEC_PARAMETER_OPERATION_CONFLICT','SPEC_PARAMETER_NAME_EXISTS','SPEC_PARAMETER_EXPIRED'].includes(code)?409:code==='SPEC_PARAMETER_RATE_LIMITED'?429:code==='CALENDAR_ACCESS_DENIED'?403:['CALENDAR_OPERATION_CONFLICT','PREAPPROVAL_SAMPLE_ALREADY_USED','PREAPPROVAL_SAMPLE_GROUP_EXISTS'].includes(code)?409:['PREAPPROVAL_OPERATION_CONFLICT','PREAPPROVAL_STATE_INVALID','PREAPPROVAL_SCHEDULE_EXPIRED','PREAPPROVAL_PLAN_REQUIRED','PREPARATION_NOT_READY'].includes(code)?409:code==='TEMPLATE_STAGE_OPERATION_CONFLICT'?409:code==='DOCUMENT_MAPPING_ACCESS_DENIED'?403:code==='DOCUMENT_MAPPING_NOT_FOUND'?404:code==='DOCUMENT_MAPPING_CONFLICT'?409:['DOCUMENT_MAPPING_REQUIRED','DOCUMENT_MAPPING_INVALID','DOCUMENT_TEMPLATE_INVALID','OTHER_PURPOSE_REQUIRED','ORIGINAL_SOURCE_REQUIRED','TRIAL_TEMPLATE_REQUEST_FORM_DENIED'].includes(code)?422:code==='TRIAL_TEMPLATE_ACCESS_DENIED'||code==='TRIAL_TEMPLATE_ADMIN_REQUIRED'?403:code==='TRIAL_TEMPLATE_NOT_FOUND'?404:['TRIAL_TEMPLATE_IN_USE','TRIAL_TEMPLATE_OPERATION_CONFLICT','TRIAL_TEMPLATE_REVISION_CONFLICT','TRIAL_TEMPLATE_LIMIT','TRIAL_TEMPLATE_CLAIM_STALE'].includes(code)?409:code==='TEMPLATE_NOT_FOUND'?404:code==='TEMPLATE_OPERATION_CONFLICT'||code==='TEMPLATE_IN_USE'||code==='TEMPLATE_LIMIT'?409:code==='NOTIFICATION_SERVICE_UNAVAILABLE'?503:['TEMPLATE_ACCESS_DENIED','TEMPLATE_ADMIN_REQUIRED','COMMAND_ACCESS_DENIED','COMMAND_ADMIN_REQUIRED','WORKSPACE_IMAGE_ACCESS_DENIED','WORKSPACE_APPEARANCE_ACCESS_DENIED','FINANCE_ACCESS_DENIED','WORKSPACE_PROFILE_ACCESS_DENIED','HUMAN_STOP_DENIED','FLOW_TEST_ACCESS_DENIED','FLOW_TEST_ADMIN_REQUIRED','SIGNATURE_PORT_ADMIN_REQUIRED','SIGNATURE_SETTINGS_ACCESS_DENIED','NOTIFICATION_ACCESS_DENIED','NOTIFICATION_DISABLED','AI_ACCESS_DENIED','HUMAN_ACCESS_DENIED','HUMAN_EXECUTOR_REQUIRED','HUMAN_REPORT_REVIEW_DENIED','HUMAN_REPORT_LEVEL_CONFLICT','HUMAN_FILE_VERIFICATION_REQUIRED','HUMAN_RELEASE_REQUIRED','PLANNING_ACCESS_DENIED','MAINTENANCE_ADMIN_REQUIRED','ACCESS_ADMIN_REQUIRED','RESOURCE_WRITE_DENIED','WORKFLOW_ACCESS_DENIED','WORKFLOW_SELF_REVIEW_DENIED','WORKFLOW_REVIEW_LEVEL_REQUIRED','WORKFLOW_REVIEW_LEVEL_CONFLICT','WORKFLOW_RELEASE_REQUIRED'].includes(code)?403:['PROJECT_RATE_LIMITED','FLOW_TEST_RATE_LIMITED','NOTIFICATION_RATE_LIMITED','AI_RATE_LIMITED','HUMAN_RATE_LIMITED','PLANNING_RATE_LIMITED','MAINTENANCE_RATE_LIMITED','ACCESS_RATE_LIMITED','RESOURCE_RATE_LIMITED','WORKFLOW_RATE_LIMITED'].includes(code)?429:['PROJECT_OPERATION_CONFLICT','PROJECT_OPERATION_EXPIRED','HUMAN_STOP_STATE_INVALID','FLOW_TEST_OPERATION_CONFLICT','FLOW_TEST_ALREADY_EXISTS','FLOW_TEST_SOURCE_CHANGED','FLOW_TEST_COMPLETED','HUMAN_OPERATION_CONFLICT','HUMAN_OPERATION_EXPIRED','HUMAN_UPLOAD_STALE','HUMAN_RESERVATION_CONFLICT','HUMAN_STATE_INVALID','PLANNING_OPERATION_CONFLICT','PLANNING_OPERATION_EXPIRED','PLANNING_RESOURCE_CONFLICT','PLANNING_APPROVAL_REQUIRED','WORKFLOW_OPERATION_CONFLICT','WORKFLOW_OPERATION_EXPIRED','WORKFLOW_STATE_INVALID','RESOURCE_OPERATION_CONFLICT','RESOURCE_OPERATION_EXPIRED','RESOURCE_DELETED','RESOURCE_RESERVED','RESOURCE_DUPLICATE','TRIAL_NAME_EXISTS','STOCK_INSUFFICIENT','REVISION_CONFLICT','MAINTENANCE_PLAN_EXPIRED','MAINTENANCE_PREVIEW_STALE','MAINTENANCE_ACTIVE_RESERVATIONS','MAINTENANCE_EMPTY'].includes(code)||code.startsWith('DRAFT_ID')?409:['RULE_NOT_APPROVED','DRAFT_NOT_AVAILABLE','DRAFT_WRITE_DENIED','MEMBERSHIP_REQUIRED'].includes(code)?403:422;throw new ApiError(status,code);}
     if(dispatchedWrite&&response.status>=500)throw new ApiError(503,'WRITE_OUTCOME_UNKNOWN',{outcome_unknown:true});
     throw new ApiError(response.status===401?401:response.status===429?429:response.status>=500?503:response.status===403?403:422,response.status===401?'AUTHENTICATION_REQUIRED':response.status===429?'RATE_LIMITED':'UPSTREAM_REQUEST_REJECTED');
    }
    return {data,response};
   }
   const rpc=async(name,args,token)=>{const data=(await upstream('/rest/v1/rpc/'+name,{token,method:'POST',body:args,profile:true})).data;
    if(name==='original_ui_snapshot'&&(Object.hasOwn(data||{},'compound_trials')||Object.hasOwn(data||{},'trial_types'))){const extra=Object.hasOwn(data,'compound_trials')?data.compound_trials:[],types=Object.hasOwn(data,'trial_types')?data.trial_types:[];if(!Array.isArray(extra)||extra.length>1||extra.some(t=>!UUID.test(t.id||'')||t.profile_code!=='COMPOUND_ENVIRONMENT'||t.enabled!==true)||!Array.isArray(types)||types.length>1000||types.some(t=>!UUID.test(t.trial_id||'')||!TRIAL_TYPES.some(type=>type.id===t.test_type))||new Set(types.map(t=>t.trial_id)).size!==types.length)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');const policies=data.trial_calendar_policies||[];if(!Array.isArray(policies)||policies.length>1000||policies.some(p=>!UUID.test(p.trial_id||'')||!Number.isSafeInteger(p.revision)||p.revision<1))throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');try{policies.forEach(p=>validateCalendarPolicy(p.calendar_policy));}catch{throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');}const calendars=new Map(policies.map(p=>[p.trial_id,p.calendar_policy])),byId=new Map(types.map(t=>[t.trial_id,t.test_type]));const editorRows=data.trial_editor_details||[];try{if(!Array.isArray(editorRows)||editorRows.length>1000)throw Error();const parameterTypes=parseParameterCatalog(data.specification_parameters??DEFAULT_SPEC_PARAMETERS);editorRows.forEach(r=>{if(!UUID.test(r.trial_id))throw Error();validateTrialDetails(r.details,{types:parameterTypes,trialType:byId.get(r.trial_id)});});}catch{throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');}const details=new Map(editorRows.map(r=>[r.trial_id,r.details]));return {...data,trials:[...(data.trials||[]).filter(t=>!extra.some(e=>e.id===t.id)),...extra].map(t=>({...t,...(details.has(t.id)?{editor_details:details.get(t.id)}:{}),...(byId.has(t.id)?{test_type:byId.get(t.id)}:{}),...(calendars.has(t.id)?{calendar_policy:calendars.get(t.id)}:{})}))};}
    return data;};
   if(path==='/config'&&req.method==='GET'){const status=await entryStatus();if(typeof status?.activation_available!=='boolean')throw new ApiError(503,'CONFIGURATION_REQUIRED');return reply(200,{enabled:true,auth:'supabase',activation_available:status.activation_available,workflow_gate:'RULE_NOT_APPROVED',write_scope:'OWN_DRAFT_RESOURCES_ACCESS_AND_TENANT_MANUAL_REQUESTS'});}
   async function entryStatus(){const key=accountDeletionServiceKey(env);if(!key)throw new ApiError(503,'CONFIGURATION_REQUIRED');return (await upstream('/rest/v1/rpc/public_account_entry_status',{method:'POST',profile:true,headers:{apikey:key,Authorization:'Bearer '+key},body:{}})).data;}
   const rawCookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
   const read=()=>openSession(rawCookie,env.BUSINESS_COOKIE_KEY);
   async function user(token){const {data}=await upstream('/auth/v1/user',{token});if(!UUID.test(data?.id)||!data.email_confirmed_at)throw new ApiError(401,'AUTHENTICATION_REQUIRED');return data;}
   async function valid(s){const identity=await user(s.access),tenant=await rpc('check_browser_session',{p_id:s.id,p_nonce_sha256:sha(s.nonce)},s.access);if(tenant!==s.tenant)throw new ApiError(401,'SESSION_REVOKED');return identity;}
   async function refreshTokens(s){const {data}=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh}});if(!data?.access_token||!data?.refresh_token||!Number.isSafeInteger(data.expires_in)||data.expires_in<=0)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');return {...s,access:data.access_token,refresh:data.refresh_token,expires:now()+data.expires_in*1000};}
   function save(s){const encrypted=sealSession(s,env.BUSINESS_COOKIE_KEY);if(encrypted.length>3800)throw new ApiError(503,'SESSION_COOKIE_TOO_LARGE');res.setHeader('Set-Cookie',cookie(encrypted,Math.max(0,Math.floor((s.absolute-now())/1000))));}
   if(path==='/recover'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);fields(body,['operation_id','email']);
    if(!UUID.test(body.operation_id||'')||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email.trim())||body.email.length>254)throw new ApiError(422,'RECOVERY_FIELDS_INVALID');
    if(!accountDeletionServiceKey(env))throw new ApiError(503,'CONFIGURATION_REQUIRED');
    const address=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unavailable').slice(0,256),clientHash=createHmac('sha256',env.BUSINESS_COOKIE_KEY).update(address).digest('hex');
    await requestPasswordRecovery({env,fetchImpl,origin,operation:body.operation_id,email:body.email.trim().toLowerCase(),clientHash});return reply(202,{accepted:true});
   }
   if(path==='/activate'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);fields(body,['email','password']);
    const entry=await entryStatus();if(entry?.activation_available!==true)throw new ApiError(403,'ACCOUNT_ACTIVATION_CLOSED');
    if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254||typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new ApiError(422,'ACTIVATION_FIELDS_INVALID');
    dispatchedWrite=true;await upstream('/auth/v1/signup?redirect_to='+encodeURIComponent(origin+'/account/activate'),{method:'POST',body:{email:body.email.trim().toLowerCase(),password:body.password}});
    return reply(200,{confirmation_required:true});
   }
   if(path==='/login'||path==='/claim'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);fields(body,path==='/login'?['email','password','tenant_id']:['access_token','refresh_token','tenant_id']);let tokens;
    if(path==='/login'){
     if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254||typeof body.password!=='string'||body.password.length<1||body.password.length>256)throw new ApiError(422,'CREDENTIALS_REQUIRED');
     try{tokens=(await upstream('/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email,password:body.password}})).data;}catch(error){if([401,422].includes(error.status))throw new ApiError(401,'AUTHENTICATION_FAILED');throw error;}
    }else{
     if(typeof body.access_token!=='string'||body.access_token.length>5000||typeof body.refresh_token!=='string'||body.refresh_token.length>500)throw new ApiError(422,'INVALID_TOKEN');
     tokens={access_token:body.access_token,refresh_token:body.refresh_token,expires_in:300};
    }
    if(!tokens?.access_token||!tokens?.refresh_token||!Number.isSafeInteger(tokens.expires_in)||tokens.expires_in<=0)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    const identity=await user(tokens.access_token);await rpc('claim_pending_memberships',{},tokens.access_token);const context=await rpc('connection_context',{},tokens.access_token);
    if(context?.user_id!==identity.id||!Array.isArray(context.memberships))throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    const membership=body.tenant_id?context.memberships.find(m=>m.tenant_id===body.tenant_id):context.memberships.length===1?context.memberships[0]:null;
    if(!membership)throw new ApiError(403,context.memberships.length>1?'TENANT_SELECTION_REQUIRED':'MEMBERSHIP_REQUIRED',context.memberships.length>1?{workspaces:context.memberships.map(m=>({id:m.tenant_id,name:m.tenant_name}))}:{});
    const id=randomUUID(),nonce=randomBytes(32).toString('base64url'),opened=await rpc('open_browser_session',{p_tenant:membership.tenant_id,p_id:id,p_nonce_sha256:sha(nonce)},tokens.access_token);
    const absolute=Date.parse(opened?.expires_at);if(opened?.id!==id||!Number.isSafeInteger(absolute)||absolute<=now()||absolute>now()+28900000)throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');
    save({id,nonce,tenant:membership.tenant_id,access:tokens.access_token,refresh:tokens.refresh_token,expires:now()+tokens.expires_in*1000,absolute});return reply(200,{authenticated:true,member:membership,expires_at:absolute});
   }
   let session=read();
   if(path==='/refresh'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');fields(await bodyOf(req),[]);session=await refreshTokens(session);await valid(session);save(session);return reply(200,{authenticated:true,expires_at:session.absolute});
   }
   if(path==='/logout'){
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');fields(await bodyOf(req),[]);res.setHeader('Set-Cookie',cookie('',0));
    if(session.expires<=now())session=await refreshTokens(session);
    const revoked=await rpc('revoke_browser_session',{p_id:session.id,p_nonce_sha256:sha(session.nonce)},session.access);
    if(!revoked)throw new ApiError(503,'SESSION_REVOCATION_UNCONFIRMED');
    // Durable DB revocation protects this application even if the Auth logout request fails.
    let authRevoked=true;try{await upstream('/auth/v1/logout?scope=local',{token:session.access,method:'POST'});}catch{authRevoked=false;}
    return reply(200,{signed_out:true,server_session_revoked:true,auth_refresh_revocation_confirmed:authRevoked});
   }
   if(session.expires<=now()+10000)throw new ApiError(401,'SESSION_REFRESH_REQUIRED');
   const identity=await valid(session);
   if(path==='/images'){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    if(req.method==='GET')return reply(200,{data:await rpc('workspace_images',{p_tenant:session.tenant},session.access)});
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
    const change=await bodyOf(req,710000);try{validateImageChange(change);}catch{throw new ApiError(422,'WORKSPACE_IMAGE_INVALID');}
    dispatchedWrite=true;return reply(200,{data:await rpc('save_workspace_image',{p_tenant:session.tenant,p_kind:change.kind,p_image:change.image,p_name:change.name,p_expected_revision:change.expected_revision},session.access)});
   }
   if(path==='/demo-reports/generate')return await handleDemoReports({req,parsed,session,identity,rpc,bodyOf,fields,ApiError,reply,valid});
   if(path.startsWith('/schedule-batches/'))return await handleScheduleBatches({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite:()=>{dispatchedWrite=true;}});
   if(path.startsWith('/specification-parameters/'))return await handleSpecificationParameters({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite:()=>{dispatchedWrite=true;}});
   if(path.startsWith('/scheduling/'))return await handleSchedulingCalendar({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite:()=>{dispatchedWrite=true;}});
   if(path.startsWith('/preapproval/'))return await handlePreapproval({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite:()=>{dispatchedWrite=true;}});
   if(path==='/document-mappings'||path.startsWith('/document-mappings/'))return await handleDocumentMappings({path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply,markWrite:()=>{dispatchedWrite=true;}});
   if(path==='/trial-templates'||path.startsWith('/trial-templates/'))return await handleTrialTemplates({markWrite:()=>{dispatchedWrite=true;},path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply});
   if(path==='/templates/blank'||path.startsWith('/templates/blank/'))return await handleBlankTemplates({markWrite:()=>{dispatchedWrite=true;},path,req,parsed,session,rpc,bodyOf,fields,ApiError,reply});
   if(path.startsWith('/finance/'))return await handleFinance({markWrite:()=>{dispatchedWrite=true;},path,req,res,parsed,session,rpc,bodyOf,fields,ApiError,reply});
   if(path.startsWith('/ai/'))return await handleBusinessAI({path,req,res,parsed,env,fetchImpl,session,identity,rpc,upstream,bodyOf,fields,ApiError,reply,trace,valid});
   if(path==='/signature-settings'){
    const section=parsed.searchParams.get('section');
    if(parsed.searchParams.size&&!(parsed.searchParams.size===1&&['port','targets'].includes(section)&&req.method==='GET'))throw new ApiError(422,'QUERY_INVALID');
    if(req.method==='GET'){
     if(section==='port'){const data=await rpc('digital_signature_port_settings',{p_tenant:session.tenant},session.access);return reply(200,{data:{...data,verification_approved:env.SIGNATURE_PORT_ALLOW_VERIFICATION==='true'}});}
     if(section==='targets')return reply(200,{data:await rpc('digital_signature_verification_targets',{p_tenant:session.tenant},session.access)});
     return reply(200,{data:await rpc('signature_method_settings',{p_tenant:session.tenant},session.access)});
    }
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);
    if(body.action!==undefined){
     if(!['save_port','check_port','verify_report'].includes(body.action))throw new ApiError(422,'SIGNATURE_PORT_FIELDS_INVALID');
     fields(body,body.action==='save_port'?['action','member_id','config','expected_revision']:body.action==='check_port'?['action','member_id','expected_revision']:['action','member_id','artifact_version_id','expected_sha256','expected_revision']);
     if(!UUID.test(body.member_id||'')||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'SIGNATURE_PORT_FIELDS_INVALID');
     if(body.action==='save_port'){
      let config;try{config=signaturePortConfig(body.config);}catch{throw new ApiError(422,'SIGNATURE_PORT_FIELDS_INVALID');}
      dispatchedWrite=true;return reply(200,{data:await rpc('save_digital_signature_port',{p_tenant:session.tenant,p_member:body.member_id,p_config:config,p_expected_revision:body.expected_revision},session.access)});
     }
     const config=await rpc('digital_signature_port_settings',{p_tenant:session.tenant},session.access);if(config.scope_member_id!==body.member_id)throw new ApiError(403,'SIGNATURE_PORT_ADMIN_REQUIRED');if(config.revision!==body.expected_revision)throw new ApiError(409,'REVISION_CONFLICT');
     if(body.action==='check_port')return reply(200,{data:await checkSignaturePort(config.config,env,signaturePortTransport)});
     if(!UUID.test(body.artifact_version_id||'')||!/^[a-f0-9]{64}$/.test(body.expected_sha256||''))throw new ApiError(422,'SIGNATURE_PORT_FIELDS_INVALID');
     if(env.SIGNATURE_PORT_ALLOW_VERIFICATION!=='true')throw new ApiError(403,'SIGNATURE_PORT_VERIFICATION_NOT_APPROVED');
     if(!config.config)throw new ApiError(422,'SIGNATURE_PORT_NOT_CONFIGURED');
     const file=await rpc('human_report_file',{p_tenant:session.tenant,p_id:body.artifact_version_id},session.access);
     if(!file)throw new ApiError(403,'HUMAN_ACCESS_DENIED');if(file.mime_type!=='application/pdf'||file.sha256!==body.expected_sha256||!Number.isSafeInteger(file.byte_size)||file.byte_size<5||file.byte_size>REPORT_FILE_MAX_BYTES)throw new ApiError(409,'SIGNATURE_PORT_DOCUMENT_INVALID');
     let bytes;try{bytes=await readStorageBytes(fetchImpl,env,session.access,file);}catch{throw new ApiError(422,'SIGNATURE_PORT_DOCUMENT_INVALID');}
     await valid(session);const fresh=await rpc('digital_signature_port_settings',{p_tenant:session.tenant},session.access);if(fresh.scope_member_id!==body.member_id)throw new ApiError(403,'SIGNATURE_PORT_ADMIN_REQUIRED');if(fresh.revision!==config.revision)throw new ApiError(409,'REVISION_CONFLICT');
     try{return reply(200,{data:await verifySignaturePort(fresh.config,env,{bytes,sha256:file.sha256},signaturePortTransport)});}catch(e){const code=/^SIGNATURE_PORT_[A-Z_]+$/.test(e.code||'')?e.code:'SIGNATURE_PORT_UNAVAILABLE';throw new ApiError(/NOT_APPROVED|NOT_ALLOWED|CHECKS_DISABLED/.test(code)?403:/TIMEOUT|UNAVAILABLE/.test(code)?503:422,code);}
    }
    fields(body,['method','expected_revision']);
    if(!['IMAGE','DIGITAL'].includes(body.method)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'SIGNATURE_FIELDS_INVALID');
    dispatchedWrite=true;return reply(200,{data:await rpc('save_signature_method_settings',{p_tenant:session.tenant,p_method:body.method,p_expected_revision:body.expected_revision},session.access)});
   }
   if(path.startsWith('/notifications/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    if(path==='/notifications/settings'&&req.method==='GET')return reply(200,{data:await rpc('notification_settings',{p_tenant:session.tenant},session.access)});
    if(path==='/notifications/status'&&req.method==='GET')return reply(200,{data:await rpc('notification_status',{p_tenant:session.tenant},session.access)});
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);
    if(path==='/notifications/settings'){
     fields(body,['member_id','enabled','expected_revision']);if(!UUID.test(body.member_id||'')||typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'NOTIFICATION_FIELDS_INVALID');
     dispatchedWrite=true;return reply(200,{data:await rpc('save_notification_settings',{p_tenant:session.tenant,p_member:body.member_id,p_enabled:body.enabled,p_expected_revision:body.expected_revision},session.access)});
    }
    if(path==='/notifications/test'){
     fields(body,['member_id','operation_id','system']);if(!UUID.test(body.member_id||'')||!UUID.test(body.operation_id||'')||!['lms','lab','request'].includes(body.system))throw new ApiError(422,'NOTIFICATION_FIELDS_INVALID');
     dispatchedWrite=true;return reply(200,{data:await rpc('test_notification_email',{p_tenant:session.tenant,p_member:body.member_id,p_operation:body.operation_id,p_system:body.system},session.access)});
    }
    throw new ApiError(404,'ROUTE_NOT_FOUND');
   }
   if(path==='/me'&&req.method==='GET'){
    const context=await rpc('connection_context',{},session.access),member=context?.memberships?.find(m=>m.tenant_id===session.tenant);if(!member||context.user_id!==identity.id)throw new ApiError(401,'SESSION_REVOKED');return reply(200,{user:{id:identity.id,email:identity.email},member,expires_at:session.absolute,workflow_gate:'RULE_NOT_APPROVED'});
   }
   if(path.startsWith('/flow-tests/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    const match=path.match(/^\/flow-tests\/(run|report|result)\/([a-f0-9-]{36})$/);
    if(match&&req.method==='GET'&&UUID.test(match[2])){
     const data=await rpc(match[1]==='result'?'flow_test_result':'flow_test_run',{p_tenant:session.tenant,[match[1]==='result'?'p_operation':'p_request']:match[2]},session.access);
     if(match[1]!=='report')return reply(200,{data});if(!data)throw new ApiError(404,'FLOW_TEST_ACCESS_DENIED');
     res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");res.setHeader('Content-Disposition','attachment; filename="flow-test-'+data.id+'.html"');res.setHeader('Cache-Control','no-store');return res.status(200).send(flowTestReport(data));
    }
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req,8192);
    if(path==='/flow-tests/preview'){
     fields(body,['request_id']);if(!UUID.test(body.request_id||''))throw new ApiError(422,'FLOW_TEST_FIELDS_INVALID');
     return reply(200,{data:await rpc('preview_flow_test',{p_tenant:session.tenant,p_request:body.request_id},session.access)});
    }
    if(path!=='/flow-tests/execute')throw new ApiError(404,'ROUTE_NOT_FOUND');fields(body,['operation_id','command']);const c=body.command;
    if(!UUID.test(body.operation_id||'')||!c||typeof c!=='object'||Array.isArray(c))throw new ApiError(422,'FLOW_TEST_FIELDS_INVALID');
    fields(c,['action','request_id','run_id','expected_revision','source_sha256','reason','confirmation']);
    if(!['CREATE','ADVANCE'].includes(c.action)||!UUID.test(c.request_id||'')||!UUID.test(c.run_id||'')||!Number.isSafeInteger(c.expected_revision)||c.expected_revision<0||!/^[a-f0-9]{64}$/.test(c.source_sha256||'')||typeof c.reason!=='string'||c.reason.length>500||typeof c.confirmation!=='string'||c.confirmation.length>100)throw new ApiError(422,'FLOW_TEST_FIELDS_INVALID');
    dispatchedWrite=true;return reply(200,{data:await rpc('execute_flow_test',{p_tenant:session.tenant,p_operation:body.operation_id,p_command:c},session.access)});
   }
   if(path.startsWith('/execution/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');const match=path.match(/^\/execution\/(result|file|download|signature)\/([a-f0-9-]{36})$/);
    if(match&&req.method==='GET'&&UUID.test(match[2])){
     const name={result:'human_operation_result',file:'human_report_file',download:'human_report_file',signature:'human_report_signature'}[match[1]],args={p_tenant:session.tenant,[match[1]==='result'?'p_operation':'p_id']:match[2]},data=await rpc(name,args,session.access);if(!data)throw new ApiError(404,'HUMAN_ACCESS_DENIED');
     if(match[1]==='download'){
      const object=safeObject(data);if(!Number.isSafeInteger(data.byte_size)||data.byte_size<1||data.byte_size>REPORT_FILE_MAX_BYTES||!/^[a-f0-9]{64}$/.test(data.sha256||'')||!['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(data.mime_type))throw new ApiError(422,'HUMAN_FILE_INVALID');
      const signed=await upstream('/storage/v1/object/sign/'+object,{token:session.access,method:'POST',body:{expiresIn:60}}),relative=signed.data?.signedURL;
      if(typeof relative!=='string'||!relative.startsWith('/object/sign/'+object+'?token=')||relative.includes('#'))throw new ApiError(502,'HUMAN_FILE_UNAVAILABLE');
      const url=new URL(env.BUSINESS_SUPABASE_URL+'/storage/v1'+relative);if(url.searchParams.size!==1||!url.searchParams.get('token'))throw new ApiError(502,'HUMAN_FILE_UNAVAILABLE');
      return reply(200,{data:{url:url.href,sha256:data.sha256,byte_size:data.byte_size,mime_type:data.mime_type,expires_in:60}});
     }
     if(match[1]!=='file')return reply(200,{data});const bytes=await readStorageBytes(fetchImpl,env,session.access,data);res.setHeader('Content-Type',data.mime_type);res.setHeader('X-Content-SHA256',data.sha256);res.setHeader('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(data.file_name));res.setHeader('Cache-Control','no-store');return res.status(200).send(bytes);
    }
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req,1500000);
    if(path==='/execution/upload'){
     fields(body,['id','request_id','kind','file_name','byte_size','sha256','request_revision','report_revision']);if(!UUID.test(body.id||'')||!UUID.test(body.request_id||'')||!['REPORT','ARCHIVE'].includes(body.kind)||typeof body.file_name!=='string'||body.file_name.length>180||!Number.isSafeInteger(body.byte_size)||body.byte_size<1||body.byte_size>REPORT_FILE_MAX_BYTES||!/^[a-f0-9]{64}$/.test(body.sha256||'')||!Number.isSafeInteger(body.request_revision)||body.request_revision<1||!Number.isSafeInteger(body.report_revision)||body.report_revision<0)throw new ApiError(422,'HUMAN_FILE_INVALID');
     dispatchedWrite=true;const intent=await rpc('prepare_report_upload',{p_tenant:session.tenant,p_id:body.id,p_request:body.request_id,p_kind:body.kind,p_name:body.file_name,p_size:body.byte_size,p_sha256:body.sha256,p_request_revision:body.request_revision,p_report_revision:body.report_revision},session.access);const object=safeObject(intent);const signed=await upstream('/storage/v1/object/upload/sign/'+object,{token:session.access,method:'POST',body:{upsert:false}});const relative=signed.data?.url;if(typeof relative!=='string'||!relative.startsWith('/object/upload/sign/'+object+'?'))throw new ApiError(502,'HUMAN_FILE_UNAVAILABLE');return reply(200,{data:{id:intent.id,url:env.BUSINESS_SUPABASE_URL+'/storage/v1'+relative,mime_type:intent.mime_type}});
    }
    if(!['/execution/prepare','/execution/execute'].includes(path))throw new ApiError(404,'ROUTE_NOT_FOUND');fields(body,['operation_id','command']);const c=body.command;if(!UUID.test(body.operation_id||'')||!c||typeof c!=='object'||Array.isArray(c))throw new ApiError(422,'HUMAN_FIELDS_INVALID');fields(c,['action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id','template_fields']);
    if(!['BOOK','CANCEL_REQUEST','CANCEL_REJECT','PREPARE','RECEIVE','START','COMPLETE','STOP','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE'].includes(c.action)||!UUID.test(c.request_id||'')||!Number.isSafeInteger(c.expected_request_revision)||c.expected_request_revision<1||['expected_schedule_revision','expected_report_revision','expected_draft_revision'].some(k=>!Number.isSafeInteger(c[k])||c[k]<0)||typeof c.signature_data!=='string'||c.signature_data.length>1400000||typeof c.comment!=='string'||c.comment.length>2000||c.upload_id!==null&&!UUID.test(c.upload_id||''))throw new ApiError(422,'HUMAN_FIELDS_INVALID');
    const stageFields=Object.hasOwn(c,'template_fields');if(stageFields){if(!['PREPARE','RECEIVE','COMPLETE'].includes(c.action))throw new ApiError(422,'TEMPLATE_STAGE_FIELDS_INVALID');try{validateStageFields(c.action==='PREPARE'?'LAB_PREPARE':c.action==='RECEIVE'?'LAB_RECEIVE':'LAB_COMPLETE',c.template_fields);}catch{throw new ApiError(422,'TEMPLATE_STAGE_FIELDS_INVALID');}}const {template_fields,...baseCommand}=c;
    if(c.action==='PREPARE'&&c.signature_data!=='')throw new ApiError(422,'HUMAN_FIELDS_INVALID');
    if(c.action==='STOP'&&(c.signature_data!==''||c.upload_id!==null))throw new ApiError(422,'HUMAN_FIELDS_INVALID');
    let attestation=null;if(path==='/execution/execute'&&['REPORT_SUBMIT','CONFIRM_ARCHIVE'].includes(c.action)){
     let reportKey;try{reportKey=reportAttestationKey(env);}catch{throw new ApiError(503,'REPORT_ATTESTATION_NOT_CONFIGURED');}
     const intent=await rpc('report_upload_intent',{p_tenant:session.tenant,p_id:c.upload_id},session.access);if(!intent)throw new ApiError(409,'HUMAN_UPLOAD_STALE');try{const bytes=await readStorageBytes(fetchImpl,env,session.access,intent);await validateHumanFile(bytes,intent,{loadMapping:()=>rpc('document_mapping_report_context',{p_tenant:session.tenant,p_request:intent.request_id},session.access)});attestation=fileAttestation(reportKey,intent);}catch(error){throw new ApiError(422,['HUMAN_VIRTUAL_MARK_REQUIRED','HUMAN_REPORT_PURPOSE_MISMATCH','HUMAN_FILE_HASH_MISMATCH','HUMAN_REPORT_BINDING_INVALID','HUMAN_FILE_UNAVAILABLE'].includes(error.message)?error.message:'HUMAN_FILE_INVALID');}
    }
    dispatchedWrite=true;return reply(200,{data:await rpc(stageFields?(path.endsWith('/prepare')?'prepare_human_template_operation':'execute_human_template_operation'):(path.endsWith('/prepare')?'prepare_human_operation':'execute_human_operation'),{p_tenant:session.tenant,p_operation:body.operation_id,p_command:baseCommand,...(stageFields?{p_fields:template_fields}:{}),...(path.endsWith('/execute')?{p_attestation:attestation}:{})},session.access)});
   }
   if(path.startsWith('/planning/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');const result=path.match(/^\/planning\/result\/([a-f0-9-]{36})$/);
    if(result&&req.method==='GET'&&UUID.test(result[1]))return reply(200,{data:await rpc('schedule_draft_result',{p_tenant:session.tenant,p_operation:result[1]},session.access)});
    if(!['/planning/preview','/planning/prepare','/planning/execute'].includes(path)||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const preview=path==='/planning/preview',body=await bodyOf(req,16384);fields(body,preview?['command']:['operation_id','command']);const c=body.command;
    if(!preview&&!UUID.test(body.operation_id||'')||!c||typeof c!=='object'||Array.isArray(c))throw new ApiError(422,'PLANNING_FIELDS_INVALID');fields(c,['request_id','expected_request_revision','expected_draft_revision','data']);
    if(!UUID.test(c.request_id||'')||!Number.isSafeInteger(c.expected_request_revision)||c.expected_request_revision<1||!Number.isSafeInteger(c.expected_draft_revision)||c.expected_draft_revision<0||!c.data||typeof c.data!=='object'||Array.isArray(c.data))throw new ApiError(422,'PLANNING_FIELDS_INVALID');
    fields(c.data,['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units','compound']);
    if(!Number.isSafeInteger(c.data.sample_space_units)||c.data.sample_space_units<1||c.data.sample_space_units>100000)throw new ApiError(422,'PLANNING_FIELDS_INVALID');
    if(preview)return reply(200,{data:await rpc('preview_schedule_draft',{p_tenant:session.tenant,p_command:c},session.access)});
    dispatchedWrite=true;return reply(200,{data:await rpc(path.endsWith('/prepare')?'prepare_schedule_draft':'execute_schedule_draft',{p_tenant:session.tenant,p_operation:body.operation_id,p_command:c},session.access)});
   }
   if(path.startsWith('/projects/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    const match=path.match(/^\/projects\/result\/([a-f0-9-]{36})$/);
    if(match&&req.method==='GET'&&UUID.test(match[1]))return reply(200,{data:await rpc('project_request_result',{p_tenant:session.tenant,p_operation:match[1]},session.access)});
    if(!['/projects/prepare','/projects/execute'].includes(path)||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
    const body=await bodyOf(req,4194304);fields(body,['operation_id','command']);const c=body.command;
    if(!UUID.test(body.operation_id||'')||!c||typeof c!=='object'||Array.isArray(c))throw new ApiError(422,'PROJECT_FIELDS_INVALID');
    fields(c,['name','execution_kind','submit','common','items']);
    if(typeof c.name!=='string'||!c.name.trim()||c.name.length>100||!['REAL','VIRTUAL'].includes(c.execution_kind)||typeof c.submit!=='boolean'||!Array.isArray(c.items)||c.items.length<1||c.items.length>100||!c.common||typeof c.common!=='object'||Array.isArray(c.common))throw new ApiError(422,'PROJECT_FIELDS_INVALID');
    for(const item of c.items){if(!item||typeof item!=='object'||Array.isArray(item))throw new ApiError(422,'PROJECT_FIELDS_INVALID');fields(item,['trial_id','name','quantity','specification','acceptance','judgementRequired']);if(!UUID.test(item.trial_id||'')||typeof item.name!=='string'||!['需作判定','不作判定'].includes(item.judgementRequired)||![item.specification,item.acceptance].every(x=>typeof x==='string'&&x.length<=3000)||item.quantity!==null&&(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>999999))throw new ApiError(422,'PROJECT_FIELDS_INVALID');}
    dispatchedWrite=true;return reply(200,{data:await rpc(path.endsWith('/prepare')?'prepare_project_request':'execute_project_request',{p_tenant:session.tenant,p_operation:body.operation_id,p_command:c},session.access)});
   }
   if(path.startsWith('/workflow/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    const readMatch=path.match(/^\/workflow\/(result|signature|document)\/([a-f0-9-]{36})$/);
    if(readMatch&&req.method==='GET'&&UUID.test(readMatch[2])){const names={result:'request_operation_result',signature:'request_signature_image',document:'request_document_version'},args={p_tenant:session.tenant,[readMatch[1]==='result'?'p_operation':'p_id']:readMatch[2]};const data=await rpc(names[readMatch[1]],args,session.access);if(!data)throw new ApiError(404,'WORKFLOW_ACCESS_DENIED');return reply(200,{data});}
    if(!['/workflow/prepare','/workflow/execute'].includes(path)||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
    const body=await bodyOf(req,1500000);fields(body,['operation_id','command']);const c=body.command;if(c&&typeof c==='object'&&!Array.isArray(c))fields(c,['request_id','expected_revision','action','signature_data','comment','template_fields','plan_revision']);
    if(!UUID.test(body.operation_id||'')||!c||!UUID.test(c.request_id||'')||!Number.isSafeInteger(c.expected_revision)||c.expected_revision<1||!['SUBMIT','MANAGER_APPROVE','LMS_APPROVE','RETURN'].includes(c.action)||typeof c.signature_data!=='string'||c.signature_data.length>1400000||typeof c.comment!=='string'||c.comment.length>2000)throw new ApiError(422,'WORKFLOW_FIELDS_INVALID');
    const stageFields=Object.hasOwn(c,'template_fields')||Object.hasOwn(c,'plan_revision');if(stageFields){if(c.action!=='LMS_APPROVE'||c.plan_revision!==undefined&&(!Number.isSafeInteger(c.plan_revision)||c.plan_revision<1))throw new ApiError(422,'TEMPLATE_STAGE_FIELDS_INVALID');try{validateStageFields('LMS_1',c.template_fields||{});}catch{throw new ApiError(422,'TEMPLATE_STAGE_FIELDS_INVALID');}}const {template_fields,plan_revision,...baseCommand}=c;
    dispatchedWrite=true;return reply(200,{data:await rpc(stageFields?(path.endsWith('/prepare')?'prepare_request_template_operation':'execute_request_template_operation'):(path.endsWith('/prepare')?'prepare_request_operation':'execute_request_operation'),{p_tenant:session.tenant,p_operation:body.operation_id,p_command:baseCommand,...(stageFields?{p_fields:template_fields||{},p_plan_revision:plan_revision??null}:{})},session.access)});
   }
   if(path==='/resources/settings'){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    if(req.method==='GET')return reply(200,{data:await rpc('equipment_activity_settings',{p_tenant:session.tenant},session.access)});
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
    const body=await bodyOf(req);fields(body,['configuration','expected_revision']);
    if(!body.configuration||typeof body.configuration!=='object'||Array.isArray(body.configuration)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'EQUIPMENT_ACTIVITY_FIELDS_INVALID');
    dispatchedWrite=true;return reply(200,{data:await rpc('save_equipment_activity_settings',{p_tenant:session.tenant,p_configuration:body.configuration,p_expected_revision:body.expected_revision},session.access)});
   }
   if(path.startsWith('/resources/')){
    const trialDetail=path.match(/^\/resources\/trial-details\/([a-f0-9-]{36})$/);if(trialDetail&&req.method==='GET'&&UUID.test(trialDetail[1])&&!parsed.searchParams.size)return reply(200,{data:await rpc('trial_editor_detail',{p_tenant:session.tenant,p_trial:trialDetail[1]},session.access)});
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');const match=path.match(/^\/resources\/result\/([a-f0-9-]{36})$/);
    if(match&&req.method==='GET'&&UUID.test(match[1]))return reply(200,{data:await rpc('resource_operation_result',{p_tenant:session.tenant,p_operation:match[1]},session.access)});
    if(!['/resources/prepare','/resources/execute'].includes(path)||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
    const body=await bodyOf(req,550000);fields(body,['operation_id','command']);const c=body.command;if(c&&typeof c==='object'&&!Array.isArray(c))fields(c,['kind','action','id','expected_revision','data']);
    if(!UUID.test(body.operation_id||'')||!c||typeof c!=='object'||Array.isArray(c)||!['trial','equipment','material'].includes(c.kind)||!['save','status','stock','delete'].includes(c.action)||!UUID.test(c.id||'')||!Number.isSafeInteger(c.expected_revision)||c.expected_revision<0||!c.data||typeof c.data!=='object'||Array.isArray(c.data))throw new ApiError(422,'RESOURCE_FIELDS_INVALID');
    if(c.kind==='trial'&&c.action==='save'){if(c.data.definition_details){try{validateTrialDetails(c.data.definition_details,{types:null,trialType:c.data.test_type});if(trialEquipmentIds(c.data.definition_details).some(id=>!UUID.test(id))||descriptionText(c.data.definition_details.description)!==c.data.specification)throw Error();}catch{throw new ApiError(422,'TRIAL_DETAILS_INVALID');}}try{if(c.data.profile_code!=='COMPOUND_ENVIRONMENT'&&explicitHours({specification:c.data.specification})!==c.data.duration_hours)throw Error();sourceConditions({specification:c.data.specification});}catch{throw new ApiError(422,'TRIAL_DURATION_INVALID');}}
    dispatchedWrite=true;return reply(200,{data:await rpc(path.endsWith('/prepare')?'prepare_resource_operation':'execute_resource_operation',{p_tenant:session.tenant,p_operation:body.operation_id,p_command:c},session.access)});
   }
   if(path==='/access'&&req.method==='GET'&&parsed.searchParams.get('section')==='appearance'){
    if([...parsed.searchParams.keys()].some(key=>!['section','version'].includes(key))||parsed.searchParams.getAll('section').length!==1||parsed.searchParams.getAll('version').length>1||parsed.searchParams.has('version')&&parsed.searchParams.get('version')!=='2')throw new ApiError(422,'QUERY_INVALID');
    return reply(200,{data:await rpc(parsed.searchParams.get('version')==='2'?'workspace_appearance_v2':'workspace_appearance',{p_tenant:session.tenant},session.access)});
   }
   if(path==='/access'&&req.method==='GET'&&parsed.searchParams.get('section')==='profile'){
    if(parsed.searchParams.size!==1)throw new ApiError(422,'QUERY_INVALID');
    return reply(200,{data:await rpc('workspace_profile',{p_tenant:session.tenant},session.access)});
   }
   if(path==='/access'||path.startsWith('/access/')){
    // Account routing/query metadata never enters identity, command data or RPC URLs.
    const forbidden=/^(?:path|__proto__|constructor|prototype|tenant|tenant_id|p_tenant|user|user_id|actor|actor_id|role|role_id|permissions?|status)(?:$|\.|\[)/i;
    if([...parsed.searchParams.keys()].some(k=>[...k].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||forbidden.test(k)))throw new ApiError(422,'QUERY_INVALID');
    const receipt=path.match(/^\/access\/result\/([a-f0-9-]{36})$/);
    const ids=parsed.searchParams.getAll('operation_id');
    if(ids.length>1||ids.length&&(!UUID.test(ids[0])||path!=='/access'||req.method!=='GET'))throw new ApiError(422,'QUERY_INVALID');
    if(path==='/access'&&req.method==='GET')return reply(200,{data:await rpc(ids.length?'access_result_with_invitation':'access_directory_with_invitations',{p_tenant:session.tenant,...(ids.length?{p_operation:ids[0]}:{})},session.access)});
    if(receipt&&req.method==='GET'&&UUID.test(receipt[1]))return reply(200,{data:await rpc('access_result_with_invitation',{p_tenant:session.tenant,p_operation:receipt[1]},session.access)});
    if(!['/access','/access/save'].includes(path)||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);
    if(path==='/access'&&body.action==='save_appearance'){
     if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
     fields(body,['action','configuration','expected_revision']);
     if(!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'WORKSPACE_APPEARANCE_FIELDS_INVALID');
     let configuration;try{configuration=validateWorkspaceAppearance(body.configuration);}catch{throw new ApiError(422,'WORKSPACE_APPEARANCE_FIELDS_INVALID');}
     const version2=Object.hasOwn(body.configuration,'headerColor');if(!version2){const {headerColor:_headerColor,...legacy}=configuration;configuration=legacy;}
     dispatchedWrite=true;return reply(200,{data:await rpc(version2?'save_workspace_appearance_v2':'save_workspace_appearance',{p_tenant:session.tenant,p_configuration:configuration,p_expected_revision:body.expected_revision},session.access)});
    }
    if(path==='/access'&&body.action==='save_profile'){
     if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
     fields(body,['action','configuration','expected_revision']);
     if(!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw new ApiError(422,'WORKSPACE_PROFILE_FIELDS_INVALID');
     let configuration;try{configuration=validateWorkspaceProfile(body.configuration);}catch{throw new ApiError(422,'WORKSPACE_PROFILE_FIELDS_INVALID');}
     dispatchedWrite=true;return reply(200,{data:await rpc('save_workspace_profile',{p_tenant:session.tenant,p_configuration:configuration,p_expected_revision:body.expected_revision},session.access)});
    }
    if(path==='/access'&&body.action==='resolve'){
     fields(body,['action','operation_id']);if(!UUID.test(body.operation_id||''))throw new ApiError(422,'ACCESS_FIELDS_INVALID');dispatchedWrite=true;return reply(200,{data:await rpc('resolve_access_with_deletion',{p_tenant:session.tenant,p_operation:body.operation_id},session.access)});
    }
    if(path==='/access'&&body.action==='delete'){
     fields(body,['action','operation_id','id','expected_revision','password']);
     if(!UUID.test(body.operation_id||'')||!UUID.test(body.id||'')||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1||typeof body.password!=='string'||body.password.length<1||body.password.length>256)throw new ApiError(422,'ACCESS_FIELDS_INVALID');
     const serviceKey=accountDeletionServiceKey(env);if(!serviceKey)throw new ApiError(503,'CONFIGURATION_REQUIRED');
     dispatchedWrite=true;const prepared=await rpc('prepare_account_deletion',{p_tenant:session.tenant,p_operation:body.operation_id,p_member:body.id,p_expected_revision:body.expected_revision},session.access);
     if(prepared?.reauth_granted!==true)return reply(200,{data:prepared});
     const outcome=await verifyAdministratorPassword({env,fetchImpl,identity,session,password:body.password});
     const {data}=await upstream('/rest/v1/rpc/complete_account_deletion',{method:'POST',profile:true,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},body:{p_tenant:session.tenant,p_operation:body.operation_id,p_actor:identity.id,p_outcome:outcome}});
     if(data?.state==='REJECTED_NO_WRITE')throw new ApiError(422,data.code==='ADMIN_PASSWORD_INVALID'?'ADMIN_PASSWORD_INVALID':'ADMIN_REAUTH_UNAVAILABLE');
     return reply(200,{data});
    }
    if(path==='/access'&&body.action==='invite'){
     fields(body,['action','operation_id','id','expected_revision']);if(!UUID.test(body.operation_id||'')||!UUID.test(body.id||'')||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1)throw new ApiError(422,'ACCESS_FIELDS_INVALID');
     dispatchedWrite=true;const result=await rpc('request_account_invitation',{p_tenant:session.tenant,p_member:body.id,p_expected_revision:body.expected_revision,p_operation:body.operation_id},session.access);
     return reply(200,{data:await deliverAccountInvitation({env,fetchImpl,origin,tenant:session.tenant,actor:identity.id,result})});
    }
    fields(body,path==='/access'?['action','operation_id','kind','id','expected_revision','data']:['operation_id','kind','id','expected_revision','data']);
    if(path==='/access'&&body.action!=='save'||!UUID.test(body.operation_id||'')||!UUID.test(body.id||'')||!['member','role'].includes(body.kind)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0||!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new ApiError(422,'ACCESS_FIELDS_INVALID');
    dispatchedWrite=true;const result=await rpc('save_access_with_invitation',{p_tenant:session.tenant,p_operation:body.operation_id,p_kind:body.kind,p_id:body.id,p_expected_revision:body.expected_revision,p_data:body.data},session.access);return reply(200,{data:await deliverAccountInvitation({env,fetchImpl,origin,tenant:session.tenant,actor:identity.id,result})});
   }
   if(path.startsWith('/assistant-commands/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    if(path==='/assistant-commands/search'&&req.method==='GET')return reply(200,{data:await rpc('assistant_virtual_requests',{p_tenant:session.tenant},session.access)});
    const resultPath=path.match(/^\/assistant-commands\/result\/([a-f0-9-]{36})$/);
    if(resultPath&&req.method==='GET'&&UUID.test(resultPath[1]))return reply(200,{data:await rpc('assistant_command_result',{p_tenant:session.tenant,p_id:resultPath[1]},session.access)});
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);
    if(path==='/assistant-commands/preview'){
     fields(body,['action']);if(!['CLEANUP','RESTART'].includes(body.action))throw new ApiError(422,'COMMAND_INVALID');
     dispatchedWrite=true;return reply(200,{data:await rpc('preview_assistant_command',{p_tenant:session.tenant,p_action:body.action},session.access)});
    }
    if(path!=='/assistant-commands/execute')throw new ApiError(404,'ROUTE_NOT_FOUND');
    fields(body,['id','fingerprint','confirmation','password']);
    if(!UUID.test(body.id||'')||!/^[a-f0-9]{64}$/.test(body.fingerprint||'')||!['刪除所有虛擬委託','初始化系統'].includes(body.confirmation))throw new ApiError(422,'COMMAND_CONFIRMATION_INVALID');
    const args={p_tenant:session.tenant,p_id:body.id,p_fingerprint:body.fingerprint,p_confirmation:body.confirmation};
    if(body.confirmation==='刪除所有虛擬委託'){
     if(body.password!==undefined)throw new ApiError(422,'UNKNOWN_FIELDS');dispatchedWrite=true;return reply(200,{data:await rpc('execute_assistant_cleanup',args,session.access)});
    }
    if(typeof body.password!=='string'||body.password.length<1||body.password.length>256)throw new ApiError(422,'CREDENTIALS_REQUIRED');
    const serviceKey=accountDeletionServiceKey(env);if(!serviceKey)throw new ApiError(503,'CONFIGURATION_REQUIRED');
    dispatchedWrite=true;const prepared=await rpc('prepare_assistant_restart',args,session.access);
    if(prepared?.reauth_granted!==true)return reply(200,{data:prepared});
    const outcome=await verifyAdministratorPassword({env,fetchImpl,identity,session,password:body.password});
    const {data}=await upstream('/rest/v1/rpc/complete_assistant_restart',{method:'POST',profile:true,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},body:{p_tenant:session.tenant,p_id:body.id,p_actor:identity.id,p_outcome:outcome}});
    return reply(200,{data});
   }
   if(path==='/maintenance'||path.startsWith('/maintenance/')){
    if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
    if(path==='/maintenance'&&req.method==='GET')return reply(200,{data:await rpc('maintenance_overview',{p_tenant:session.tenant},session.access)});
    const receipt=path.match(/^\/maintenance\/result\/([a-f0-9-]{36})$/);
    if(receipt&&req.method==='GET'&&UUID.test(receipt[1]))return reply(200,{data:await rpc('case_cleanup_result',{p_tenant:session.tenant,p_run:receipt[1]},session.access)});
    if(req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');const body=await bodyOf(req);
    let name,args;
    if(path==='/maintenance/preview'){
     fields(body,['selection']);if(body.selection!==null&&(!Array.isArray(body.selection)||body.selection.length<1||body.selection.length>200||body.selection.some(k=>typeof k!=='string'||!/^(request|legacy):[a-f0-9-]{36}$/.test(k))))throw new ApiError(422,'MAINTENANCE_SELECTION_INVALID');
     name='preview_case_cleanup';args={p_selection:body.selection};
    }else if(path==='/maintenance/execute'){
     fields(body,['plan_id','fingerprint','confirmation']);if(!UUID.test(body.plan_id||'')||!/^[a-f0-9]{64}$/.test(body.fingerprint||'')||body.confirmation!=='移至回收區')throw new ApiError(422,'MAINTENANCE_CONFIRMATION_INVALID');name='execute_case_cleanup';args={p_plan:body.plan_id,p_fingerprint:body.fingerprint,p_confirmation:body.confirmation};
    }else if(path==='/maintenance/restore'){
     fields(body,['run_id','confirmation']);if(!UUID.test(body.run_id||'')||body.confirmation!=='還原委託資料')throw new ApiError(422,'MAINTENANCE_CONFIRMATION_INVALID');name='restore_case_cleanup';args={p_run:body.run_id,p_confirmation:body.confirmation};
    }else throw new ApiError(404,'ROUTE_NOT_FOUND');
    dispatchedWrite=true;return reply(200,{data:await rpc(name,{p_tenant:session.tenant,...args},session.access)});
   }
   if(path==='/snapshot'&&req.method==='GET'){const [core,planning,human,activity]=await Promise.all([rpc('original_ui_snapshot',{p_tenant:session.tenant},session.access),rpc('schedule_draft_snapshot',{p_tenant:session.tenant},session.access),rpc('human_workflow_snapshot',{p_tenant:session.tenant},session.access),rpc('equipment_usage_snapshot',{p_tenant:session.tenant},session.access).catch(()=>({available:false}))]);return reply(200,{data:{...core,...planning,...human,equipment_activity:activity}});}
   if(path==='/password'&&req.method==='POST'){
    const body=await bodyOf(req);fields(body,['password','reset_sessions']);if(body.reset_sessions!==undefined&&typeof body.reset_sessions!=='boolean')throw new ApiError(422,'UNKNOWN_FIELDS');if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new ApiError(422,'PASSWORD_TOO_SHORT');dispatchedWrite=true;if(body.reset_sessions)await rpc('revoke_other_own_browser_sessions',{p_keep:session.id},session.access);
    await upstream('/auth/v1/user',{token:session.access,method:'PUT',body:{password:body.password}});
    if(body.reset_sessions){const revoked=await rpc('revoke_browser_session',{p_id:session.id,p_nonce_sha256:sha(session.nonce)},session.access);res.setHeader('Set-Cookie',cookie('',0));if(!revoked)throw new ApiError(503,'SESSION_REVOCATION_UNCONFIRMED',{outcome_unknown:true});try{await upstream('/auth/v1/logout?scope=global',{token:session.access,method:'POST'});}catch{/* Durable application sessions have already been revoked. */}res.setHeader('Set-Cookie',cookie('',0));}
    return reply(200,{password_updated:true,signed_out:!!body.reset_sessions});
   }
   const match=path.match(/^\/data\/([a-z]+)(?:\/([a-f0-9-]{36}))?$/),resource=match?.[1],id=match?.[2];
   if(!match||!Object.hasOwn(RESOURCE,resource)||id&&!UUID.test(id))throw new ApiError(404,'ROUTE_NOT_FOUND');
   const [table,select,searchColumn]=RESOURCE[resource];
   if(req.method==='GET'){
    if([...parsed.searchParams.keys()].some(k=>!['page','limit','q'].includes(k)))throw new ApiError(422,'QUERY_INVALID');
    const page=Number(parsed.searchParams.get('page')||1),limit=Number(parsed.searchParams.get('limit')||25),q=parsed.searchParams.get('q')||'';
    if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(limit)||limit<1||limit>100||q.length>80||q&&!/^[\p{L}\p{N} _.-]+$/u.test(q))throw new ApiError(422,'QUERY_INVALID');
    const params=new URLSearchParams({select:resource==='requests'&&id?select+',draft_signature_data':select,tenant_id:'eq.'+session.tenant,order:resource==='trials'?'legacy_id.asc':'created_at.desc,id.asc',limit:String(limit),offset:String((page-1)*limit)});if(id)params.set('id','eq.'+id);if(q&&searchColumn)params.set(searchColumn,'ilike.*'+q.replaceAll('_','\\_')+'*');
    const {data,response}=await upstream('/rest/v1/'+table+'?'+params,{token:session.access,profile:true,headers:{Prefer:'count=exact'}});if(!Array.isArray(data))throw new ApiError(502,'UPSTREAM_RESPONSE_INVALID');const range=response.headers.get('content-range'),total=range&&/\/(\d+)$/.test(range)?Number(range.split('/').pop()):null;return reply(200,{data,page,limit,total,source:'SUPABASE_BUSINESS'});
   }
   if(resource!=='requests'||!['POST','PATCH'].includes(req.method))throw new ApiError(403,'RULE_NOT_APPROVED');
   const body=await bodyOf(req,2097152);fields(body,req.method==='POST'?['id','data','execution_kind']:['expected_revision','data']);
   const requestId=req.method==='POST'?body.id:id;if(!UUID.test(requestId||'')||req.method==='POST'&&id||req.method==='PATCH'&&(!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1))throw new ApiError(422,'DRAFT_FIELDS_INVALID');
   if(!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new ApiError(422,'DRAFT_FIELDS_INVALID');
   if(req.method==='POST'&&body.execution_kind!==undefined&&!['REAL','VIRTUAL'].includes(body.execution_kind))throw new ApiError(422,'EXECUTION_KIND_INVALID');
   dispatchedWrite=true;const data=await rpc(req.method==='POST'?(body.execution_kind==='VIRTUAL'?'create_classified_request_draft':'create_request_draft'):'update_request_draft',{p_tenant:session.tenant,p_id:requestId,...(req.method==='PATCH'?{p_expected_revision:body.expected_revision}:{}),p_data:body.data,...(req.method==='POST'&&body.execution_kind==='VIRTUAL'?{p_kind:'VIRTUAL'}:{})},session.access);return reply(req.method==='POST'?201:200,{data});
  }catch(error){if(!(error instanceof ApiError)&&['DOCUMENT_MAPPING_REQUIRED','DOCUMENT_TEMPLATE_INVALID'].includes(error.message))error=new ApiError(422,error.message);return reply(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'BUSINESS_SERVICE_UNAVAILABLE'},...(error.extra||{}),...(dispatchedWrite&&!(error instanceof ApiError)?{outcome_unknown:true}:{})});}
 };
}
export default createBusinessHandler();
