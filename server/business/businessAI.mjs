import {createHash,createHmac} from 'node:crypto';
import {accountDeletionServiceKey} from './accountDeletion.mjs';
import {e4LabScope} from '../../src/e4LabScope.mjs';
import {readStorageBytes,reportAIFields} from './humanReports.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const BACKEND='https://dqa-e4-mock-4fbdeebf.onrender.com';
const hash=v=>createHash('sha256').update(v).digest('hex');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const COLUMNS={requests:'id,legacy_id,trial_id,product_code,purpose,quantity,requested_date,specification,acceptance,status,revision,request_review_level,trial_snapshot,form_details',trials:'id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,revision',equipment:'id,legacy_id,name,category,model,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision',materials:'id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,status,revision',schedules:'id,legacy_id,request_id,executor_member_id,starts_at,ends_at,status,revision,sample_space_units:plan->sample_space_units,test_hours:plan->hours_per_batch,scheduling_unit:plan->scheduling_unit,scheduling_days:plan->scheduling_days',reports:'id,request_id,status,current_version_id,revision',borrows:'id,legacy_id,equipment_id,material_id,quantity,purpose,starts_at,due_at,status,revision',qualifications:'id,equipment_id,trial_id,training,issued_on,expires_on,status,revision',quality:'id,title,request_id,equipment_id,trial_id,status,severity,cause,action,resolution,due_on,revision',documents:'id,legacy_id,kind,name,request_id,trial_id,revision'};
const TABLES={requests:'requests',trials:'trial_definitions',equipment:'equipment',materials:'materials',schedules:'schedules',reports:'reports',borrows:'borrows',qualifications:'qualifications',quality:'quality_records',documents:'artifacts'};
function select(row,keys){return Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));}
function providerEvidence(data,engine,operation,language){
 return data?.engine===engine&&data.operation_id===operation&&data.real_ai===true&&data.execution_mode==='LIVE_PROVIDER'&&data.provider==='openai_responses'&&data.model==='gpt-6-luna'&&/^req_[A-Za-z0-9_-]+$/.test(data.provider_request_id||'')&&/^resp_[A-Za-z0-9_-]+$/.test(data.provider_response_id||'')&&/^I-[a-f0-9]{32}$/.test(data.trace_id||'')&&['en','zh-TW'].includes(data.response_language)&&(!language||data.response_language===language)&&Number.isSafeInteger(data.usage?.input_tokens)&&Number.isSafeInteger(data.usage?.output_tokens)&&data.usage.input_tokens>=0&&data.usage.output_tokens>=0&&/^\d+(?:\.\d+)?$/.test(data.estimated_cost_usd||'')&&Number(data.estimated_cost_usd)<=.05&&typeof data.result?.summary==='string'&&Array.isArray(data.result.references)&&Array.isArray(data.result.findings)&&Array.isArray(data.result.sections);
}
function brief(kind,r){
 const fields={requests:['legacy_id','product_code','quantity','requested_date','status','revision'],trials:['legacy_id','name','profile_code','duration_hours','specification_version','revision'],equipment:['legacy_id','name','category','space_units','operational_status','revision'],materials:['legacy_id','name','unit','available_quantity','min_stock','status','revision'],schedules:['legacy_id','request_id','starts_at','ends_at','sample_space_units','test_hours','scheduling_unit','scheduling_days','status','revision'],reports:['request_id','status','revision'],borrows:['legacy_id','equipment_id','material_id','quantity','purpose','starts_at','due_at','status','revision'],qualifications:['equipment_id','trial_id','training','issued_on','expires_on','status','revision'],quality:['title','request_id','equipment_id','trial_id','status','severity','cause','action','resolution','due_on','revision'],documents:['legacy_id','kind','name','request_id','trial_id','revision']};
 return {reference:kind+':'+r.id,...select(r,fields[kind]||[])};
}
export async function handleBusinessAI({path,req,res,parsed,env,fetchImpl,session,identity,rpc,upstream,bodyOf,fields,ApiError,reply,trace,valid}){
 if(parsed.searchParams.size)throw new ApiError(422,'QUERY_INVALID');
 const secret=env.BUSINESS_AI_GATEWAY_SECRET,key=accountDeletionServiceKey(env);
 if(env.BUSINESS_AI_ENABLED!=='true'||typeof secret!=='string'||secret.length<32||!key||env.BUSINESS_AI_BACKEND_URL!==BACKEND)throw new ApiError(503,'BUSINESS_AI_NOT_CONFIGURED');
 const serviceRpc=async(name,args)=>(await upstream('/rest/v1/rpc/'+name,{method:'POST',body:args,profile:true,headers:{apikey:key,Authorization:'Bearer '+key}})).data;
 async function remote(route,body,signal){
  const method=body===undefined?'GET':'POST',raw=body===undefined?'':JSON.stringify(body),at=String(Date.now());
  const signature=createHmac('sha256',secret).update(`BUSINESS_AI_V1.${method}.${route}.${at}.${raw}`).digest('hex');
  let r;try{r=await fetchImpl(BACKEND+route,{method,body:body===undefined?undefined:raw,headers:{'Content-Type':'application/json','X-Business-AI-At':at,'X-Business-AI-Signature':signature},redirect:'error',signal:signal?AbortSignal.any([AbortSignal.timeout(45000),signal]):AbortSignal.timeout(15000)});}catch{throw new ApiError(503,body?'AI_OUTCOME_UNKNOWN':'AI_BACKEND_UNAVAILABLE',{outcome_unknown:!!body});}
  let p;try{const text=await r.text();if(Buffer.byteLength(text)>200000)throw Error();p=JSON.parse(text);}catch{throw new ApiError(502,'AI_RESPONSE_INVALID',{outcome_unknown:!!body});}
  if(!r.ok){const code=/^[A-Z0-9_]{1,100}$/.test(p.error?.code||'')?p.error.code:'AI_PROVIDER_UNAVAILABLE';throw new ApiError(r.status,code,{outcome_unknown:!!p.outcome_unknown,provider_trace:p.trace_id});}return p;
 }
 if(path==='/ai/status'&&req.method==='GET'){
  const [health,observations]=await Promise.all([remote('/__business_ai/health'),rpc('business_ai_overview',{p_tenant:session.tenant},session.access)]);return reply(200,{data:{...health.data,observations},provider_trace:health.trace_id});
 }
 const resultMatch=path.match(/^\/ai\/result\/([a-f0-9-]{36})$/);
 if(resultMatch&&req.method==='GET'){
  let result=await rpc('business_ai_result',{p_tenant:session.tenant,p_operation:resultMatch[1]},session.access);
  if(['DISPATCHED','UNKNOWN'].includes(result.state)){
   const recovery=await remote('/__business_ai/result',{engine:result.engine,operation_id:resultMatch[1],subject:hash(session.tenant+':'+identity.id)});
   if(recovery.data?.state==='SUCCEEDED'){
    const recovered=recovery.data.data;
    if(!providerEvidence(recovered,result.engine,resultMatch[1]))throw new ApiError(502,'AI_PROVIDER_EVIDENCE_REQUIRED');
    if(result.engine==='E2'){recovered.candidates=result.candidate_source||[];recovered.selected_candidate_id=recovered.result.selected_candidate_id;}
    await valid(session);await serviceRpc('finish_business_ai',{p_tenant:session.tenant,p_operation:resultMatch[1],p_actor:identity.id,p_state:'SUCCEEDED',p_result:recovered,p_error:null});result=await rpc('business_ai_result',{p_tenant:session.tenant,p_operation:resultMatch[1]},session.access);
   }else if(recovery.data?.state==='FAILED'){
    const code=/^[A-Z0-9_]{1,100}$/.test(recovery.data.error_code||'')?recovery.data.error_code:'AI_OUTPUT_REJECTED';await serviceRpc('finish_business_ai',{p_tenant:session.tenant,p_operation:resultMatch[1],p_actor:identity.id,p_state:'FAILED',p_result:null,p_error:code});result=await rpc('business_ai_result',{p_tenant:session.tenant,p_operation:resultMatch[1]},session.access);
   }
  }return reply(200,{data:result});
 }
 if(path==='/ai/clear'&&req.method==='POST'){const b=await bodyOf(req);fields(b,['system']);if(!['lms','lab','request'].includes(b.system))throw new ApiError(422,'AI_FIELDS_INVALID');await rpc('clear_business_ai_conversation',{p_tenant:session.tenant,p_system:b.system},session.access);return reply(200,{cleared:true,model_call_performed:false});}
 if(path==='/ai/validate-schedule'&&req.method==='POST'){
  const b=await bodyOf(req);fields(b,['command']);if(!object(b.command))throw new ApiError(422,'AI_FIELDS_INVALID');return reply(200,{data:await rpc('validate_business_ai_schedule',{p_tenant:session.tenant,p_command:b.command},session.access)});
 }
 if(path!=='/ai/generate'||req.method!=='POST')throw new ApiError(405,'METHOD_DENIED');
 const body=await bodyOf(req);fields(body,['operation_id','engine','system','input']);
 if(!UUID.test(body.operation_id||'')||!['E1','E2','E3','E4'].includes(body.engine)||!['lms','lab','request'].includes(body.system)||!object(body.input))throw new ApiError(422,'AI_FIELDS_INVALID');
 const {engine,system,input,operation_id}=body,language=input.language==='en'?'en':'zh-TW';
 if(input.language!==undefined&&!['en','zh-TW'].includes(input.language))throw new ApiError(422,'AI_FIELDS_INVALID');
 const allowed={E1:['request_id','expected_revision','language'],E2:['request_id','expected_revision','options','language'],E3:['source_kind','record_ids','title','purpose','section_titles','language'],E4:['question','language']};fields(input,allowed[engine]);
 if(engine==='E4'){if(typeof input.question!=='string'||!input.question.trim()||input.question.length>1500)throw new ApiError(422,'AI_FIELDS_INVALID');const scope=e4LabScope(input.question);if(!scope.allowed)throw new ApiError(422,scope.code);}
 if(['E1','E2'].includes(engine)&&(!UUID.test(input.request_id||'')||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<1))throw new ApiError(422,'AI_FIELDS_INVALID');
 if(engine==='E3'&&(!['requests','schedules','anomalies','results','equipment','materials'].includes(input.source_kind)||!Array.isArray(input.record_ids)||input.record_ids.length>100||!input.record_ids.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x))||typeof input.title!=='string'||input.title.length<1||input.title.length>40||typeof input.purpose!=='string'||input.purpose.length>4000||!Array.isArray(input.section_titles)||input.section_titles.length>8||input.section_titles.some(x=>typeof x!=='string'||!x.trim()||x.length>60)))throw new ApiError(422,'AI_FIELDS_INVALID');
 const prepared=await rpc('prepare_business_ai',{p_tenant:session.tenant,p_operation:operation_id,p_engine:engine,p_system:system,p_input:input,p_session:session.id},session.access);
 if(!prepared.dispatch){const result=await rpc('business_ai_result',{p_tenant:session.tenant,p_operation:operation_id},session.access);if(result.state==='SUCCEEDED')return reply(200,{data:result.data});throw new ApiError(409,result.state==='DISPATCHED'||result.state==='UNKNOWN'?'AI_OUTCOME_UNKNOWN':result.error_code||'AI_OPERATION_CLOSED',{outcome_unknown:['DISPATCHED','UNKNOWN'].includes(result.state),operation_id});}
 let claimed=false;
 async function rows(kind,{id,legacy,requestId,extra=''}={}){
  const params=new URLSearchParams({select:COLUMNS[kind],tenant_id:'eq.'+session.tenant,limit:'201',order:'id'});if(id)params.set('id','eq.'+id);if(legacy)params.set('legacy_id','eq.'+legacy);if(requestId)params.set('request_id','eq.'+requestId);
  const r=await upstream('/rest/v1/'+TABLES[kind]+'?'+params.toString()+extra,{token:session.access,profile:true});if(!Array.isArray(r.data)||r.data.length>200)throw new ApiError(422,'AI_SOURCE_TOO_LARGE');return r.data;
 }
 async function requestRow(id){const r=(await rows('requests',{id}))[0];if(!r)throw new ApiError(403,'AI_ACCESS_DENIED');if(input.expected_revision&&r.revision!==input.expected_revision)throw new ApiError(409,'REVISION_CONFLICT');return r;}
 try{
  const auth=await rpc('connection_context',{},session.access),member=auth.memberships?.find(m=>m.tenant_id===session.tenant);if(!member||auth.user_id!==identity.id)throw new ApiError(401,'SESSION_REVOKED');const can=permission=>member.is_admin||member.permissions?.includes(permission);
  const refs=[],requestRefs=new Set(),records=[],counts={};let question='',candidates=[],extra={};
  const add=(kind,row,detail=false)=>{const r=detail?{reference:kind+':'+row.id,...select(row,kind==='requests'?['legacy_id','trial_id','product_code','purpose','quantity','requested_date','specification','acceptance','status','revision','request_review_level','trial_snapshot']:kind==='trials'?['legacy_id','name','profile_code','specification','acceptance','equipment_reference','specification_version','duration_hours','revision']:kind==='equipment'?['legacy_id','name','category','model','space_units','daily_hours','operational_status','specification','next_calibration','next_maintenance','revision']:Object.keys(brief(kind,row)).filter(x=>x!=='reference'))}:brief(kind,row);records.push(r);refs.push(r.reference);if(kind==='requests')requestRefs.add(row.id);if(row.request_id)requestRefs.add(row.request_id);};
  if(engine==='E1'){
   const q=await requestRow(input.request_id);add('requests',q,true);
   const trial=(await rows('trials',{id:q.trial_id}))[0];if(trial)add('trials',trial,true);
   const reports=await rows('reports',{requestId:q.id});reports.forEach(r=>add('reports',r));
   const sig=(await upstream('/rest/v1/request_signatures?'+new URLSearchParams({select:'id,approval_event_id,actor_member_id,created_at',tenant_id:'eq.'+session.tenant,request_id:'eq.'+q.id,limit:'101'}),{token:session.access,profile:true})).data;
   if(Array.isArray(sig)&&sig.length>100)throw new ApiError(422,'AI_SOURCE_TOO_LARGE');extra.signature_metadata={count:Array.isArray(sig)?sig.length:0,authenticity:'NOT_VERIFIED',images_sent:false};
   if(reports.length){const version=(await upstream('/rest/v1/report_versions?'+new URLSearchParams({select:'id,artifact_version_id,version',tenant_id:'eq.'+session.tenant,request_id:'eq.'+q.id,order:'version.desc',limit:'1'}),{token:session.access,profile:true})).data?.[0];if(version){const file=await rpc('human_report_file',{p_tenant:session.tenant,p_id:version.artifact_version_id},session.access);if(file){extra.report_file={version:version.version,file_name:file.file_name,mime_type:file.mime_type,byte_size:file.byte_size,coverage:'METADATA_ONLY'};if(file.mime_type.includes('spreadsheetml')){const bytes=await readStorageBytes(fetchImpl,env,session.access,file);const selected=await reportAIFields(bytes);extra.report_file.coverage='SELECTED_KEY_CELLS_NOT_FULL_WORKBOOK';extra.report_file.cells=selected;}}}}
   question='請審查此委託、簽名紀錄與報告已提供資料，列出缺漏與需人工確認之處。不得作成簽核決定。';
  }else if(engine==='E2'){
   const q=await requestRow(input.request_id);add('requests',q,true);
   if(!object(input.options))throw new ApiError(422,'AI_FIELDS_INVALID');
   const assessment=await rpc('business_ai_schedule_candidates',{p_tenant:session.tenant,p_request:q.id,p_options:input.options},session.access);candidates=assessment.candidates||[];
   if(!candidates.length)throw new ApiError(422,assessment.search_limited?'AI_SEARCH_LIMIT_REACHED':'AI_NO_VALID_CANDIDATE');
   extra.scheduling_unit='DAY';extra.scheduling_policy='Each batch occupies whole days, rounded up; keep original test hours unchanged. Operation tests skip weekends.';extra.sample_space_units=candidates[0]?.plan.sample_space_units;extra.sample_space_source='PLANNER_INPUT';
   extra.candidates=candidates.map(c=>({id:c.id,start_date:c.plan.start_date,end_date:c.plan.end_date,equipment_ids:c.plan.allocations.map(a=>a.equipment_id),executor:c.plan.executor_label,calendar:c.plan.calendar,scheduling_unit:c.plan.scheduling_unit,scheduling_days:c.plan.scheduling_days,calendar_days:c.plan.calendar_days,hours_per_batch:c.plan.hours_per_batch,operating_conditions:c.plan.operating_conditions,physical_feasibility:c.plan.physical_feasibility}));
   question='請從已通過既有排程規則查核的候選方案中，選出最合適的一項，說明理由與仍需人工確認事項。';
  }else if(engine==='E3'){
   let kind=['anomalies','results'].includes(input.source_kind)?'schedules':input.source_kind;
   const list=await rows(kind),wanted=new Set(input.record_ids);let selected=list.filter(r=>wanted.has(r.id)||wanted.has(r.legacy_id)||wanted.has(r.request_id));
   const resolved=new Set(selected.flatMap(r=>[r.id,r.legacy_id,r.request_id]).filter(x=>wanted.has(x)));
   if(kind==='schedules'&&input.source_kind==='schedules'&&resolved.size<wanted.size){const q=await rows('requests');const waiting=q.filter(r=>r.status==='AWAITING_SCHEDULING'&&wanted.has('SCH-'+r.legacy_id)&&!resolved.has('SCH-'+r.legacy_id));for(const r of waiting){add('requests',r);resolved.add('SCH-'+r.legacy_id);}extra.includes_awaiting_scheduling=waiting.length>0;}
   if(wanted.size&&resolved.size!==wanted.size)throw new ApiError(403,'AI_REPORT_SOURCE_MISMATCH');
   counts.selected=wanted.size;selected.forEach(r=>add(kind,r));extra.report_title=input.title;extra.section_titles=input.section_titles;extra.scope='ONLY_SELECTED_AUTHORIZED_RECORDS';
   question=input.purpose||'請依目前已授權的所選來源，製作客製化實驗室報告草稿。';
  }else{
   question=input.question;const history=await rpc('business_ai_conversation',{p_tenant:session.tenant,p_system:system},session.access);if(Array.isArray(history)&&history.length)extra.history_for_interpretation_only=history;
   const kinds=/借用|borrow/i.test(question)?['borrows']:/資格|訓練|qualification|training/i.test(question)?['qualifications']:/品質|改善|quality/i.test(question)?['quality']:/範本|文件|template|document/i.test(question)?['documents']:/目錄|種類|類型|規範|手法|有哪些試驗|試驗(?:資訊|項目|方法|條件)|高溫|低溫|濕|振動|鹽霧|熱衝擊|機械衝擊|防水|防塵|IPX\d|ESD|EMC|日照|耐候|拉力|跌落|插拔|電壓變動|specification|test (?:catalog|types|methods)/i.test(question)?['trials']:/設備|機台|校驗|保養|equipment/i.test(question)?['equipment']:/物料|庫存|material|stock/i.test(question)?['materials']:/排程|進度|schedule/i.test(question)?['schedules']: /報告|report/i.test(question)?['reports']:['requests'];
   const wanted=question.match(/\b(?:REQ-[A-Za-z0-9-]+|EQ-\d{3}|MAT-\d{3}|SCH-[A-Za-z0-9-]+|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\b/g)||[];
   if(wanted.some(x=>x.startsWith('REQ-')))kinds.splice(0,kinds.length,'requests');
   for(const kind of kinds){const permission={trials:'catalog.read',equipment:'equipment.read',materials:'materials.read',qualifications:'qualifications.read',quality:'quality.read',documents:'catalog.read'}[kind];if(permission&&!can(permission)){counts[kind]=null;extra.coverage='UNAVAILABLE_WITH_CURRENT_ACCESS';continue;}const list=await rows(kind);counts[kind]=list.length;const matched=list.filter(r=>wanted.includes(r.id)||wanted.includes(r.legacy_id)||kind==='trials'&&[r.name,...(r.aliases||[])].some(name=>name&&question.includes(name))||kind==='equipment'&&question.includes(r.name));const detail=matched.length>0;
    const selected=detail?matched:list;selected.forEach(r=>add(kind,r,detail));extra.coverage=detail?'MATCHING_RECORDS_WITH_AUTHORIZED_TOTAL':'COMPLETE';}
   extra.access_scope='ONLY_CURRENT_AUTHORIZED_RECORDS_NOT_ENTIRE_ORGANIZATION';extra.system_guide='委託與報告的提交、簽名與簽核必須由對應人員操作；AI 僅提供建議或草稿。排程建議先帶入表單，再由使用者確認儲存。排程每批未滿一天也按整天保留，試驗原始工時另行保留，不可把整天占用當成實際量測或試驗時數。報表可預覽與匯出 Excel/PDF，設備容量使用必填空間 U；設備端口支援設定但不代表已連上實機。資料儲存於共用資料庫，個人顯示偏好仍可能保存在瀏覽器。';if(can('catalog.read'))extra.test_method_notes='高溫高濕依來源固定 250H，可跨週末；振動耐久每顆 20H、每次一顆，操作型試驗僅工作日。其他試驗以目錄與案件已核定條件為準。';
  }
  const citations=records.map((r,i)=>{const reference='R'+(i+1),source_reference=r.reference,label=r.legacy_id||r.name||r.product_code||source_reference;r.reference=reference;return {reference,source_reference,label};});
  const context={source:'AUTHORIZED_DATABASE',observed_at:new Date().toISOString(),records,counts,references:['SUMMARY',...citations.map(c=>c.reference)],...extra};
  if(Buffer.byteLength(JSON.stringify(context))>12000)throw new ApiError(422,'AI_SOURCE_TOO_LARGE');
  claimed=await serviceRpc('claim_business_ai',{p_tenant:session.tenant,p_operation:operation_id,p_actor:identity.id,p_context_sha256:hash(JSON.stringify(context)),p_request_refs:[...requestRefs],p_source_data:{candidates,observed_at:context.observed_at,citations,record_count:records.length}});
  if(!claimed)throw new ApiError(409,'AI_OUTCOME_UNKNOWN',{outcome_unknown:true,operation_id});
  const controller=new AbortController();const cancelled=()=>controller.abort();const closed=()=>{if(!res.writableEnded)cancelled();};req.once?.('aborted',cancelled);res.once?.('close',closed);
  let packet;
  try{packet=await remote('/__business_ai/generate',{engine,operation_id,subject:hash(session.tenant+':'+identity.id),session_nonce:hash(session.id),language,question,context},controller.signal);}finally{req.off?.('aborted',cancelled);res.off?.('close',closed);}
  const data=packet.data;
  if(!providerEvidence(data,engine,operation_id,language)||data.result.references.some(r=>!context.references.includes(r)))throw new ApiError(502,'AI_PROVIDER_EVIDENCE_REQUIRED',{outcome_unknown:true,operation_id});
  await valid(session);
  if(engine==='E1'){const fresh=await requestRow(input.request_id);if(fresh.revision!==records[0].revision)throw new ApiError(409,'AI_SOURCE_CHANGED');}
  if(engine==='E2'){
   const selected=candidates.find(c=>c.id===data.result.selected_candidate_id);if(!selected)throw new ApiError(502,'AI_OUTPUT_REJECTED');await rpc('validate_business_ai_schedule',{p_tenant:session.tenant,p_command:selected.command},session.access);data.candidates=candidates;data.selected_candidate_id=selected.id;
  }
  data.source={citations,observed_at:context.observed_at,references:context.references,request_ids:[...requestRefs],record_count:records.length,coverage:extra.coverage||extra.scope||'SELECTED_AUTHORIZED_FIELDS'};
  const saved=await serviceRpc('finish_business_ai',{p_tenant:session.tenant,p_operation:operation_id,p_actor:identity.id,p_state:'SUCCEEDED',p_result:data,p_error:null});if(!saved)throw new ApiError(503,'AI_OUTCOME_UNKNOWN',{outcome_unknown:true,operation_id});
  return reply(200,{data});
 }catch(error){
  const code=/^[A-Z0-9_]{1,100}$/.test(error.code||'')?error.code:'AI_SOURCE_INVALID';
  try{await serviceRpc('finish_business_ai',{p_tenant:session.tenant,p_operation:operation_id,p_actor:identity.id,p_state:error.extra?.outcome_unknown||claimed&&!(error instanceof ApiError)?'UNKNOWN':'FAILED',p_result:null,p_error:code});}catch{/* Preserve dispatch state; never retry a model call. */}
  if(error instanceof ApiError){if(claimed)error.extra={...error.extra,operation_id};throw error;}throw new ApiError(503,code,{operation_id,...(claimed?{outcome_unknown:true}:{})});
 }
}
