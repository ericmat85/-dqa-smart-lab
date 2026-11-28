-- Signed per-group continuous/noncontinuous mode; optional earliest stage dates. Existing calendar, reservation and approval gates remain authoritative.
CREATE OR REPLACE FUNCTION dqa_private.project_child_data(p_command jsonb, p_item jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT (p_command->'common')||jsonb_build_object('trial_id',p_item->'trial_id','quantity',p_item->'quantity','specification',p_item->>'specification','acceptance',p_item->>'acceptance','form_details',(p_command->'common'->'form_details')||CASE WHEN p_item ? 'compound' THEN jsonb_build_object('compoundStages',p_item->'compound'->'stages','compoundVersion',1,'compoundLabel',p_item->'compound'->>'label')||CASE WHEN p_item->'compound' ? 'mode' THEN jsonb_build_object('compoundMode',p_item->'compound'->>'mode') ELSE '{}'::jsonb END ELSE '{}'::jsonb END||jsonb_build_object('priority','專案','project',p_command->>'name','testItems',jsonb_build_array(p_item->>'name'),'judgementRequired',p_item->>'judgementRequired'))
$function$;

CREATE OR REPLACE FUNCTION dqa_private.validate_original_fields(p_details jsonb, p_signature text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF p_details IS NOT NULL AND octet_length(p_details::text)>20000 THEN RAISE EXCEPTION 'ORIGINAL_FORM_INVALID';END IF;
 IF p_details ? 'compoundStages' AND (jsonb_typeof(p_details->'compoundStages') IS DISTINCT FROM 'array' OR p_details->>'compoundVersion' IS DISTINCT FROM '1') THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF NOT(p_details ? 'compoundStages') AND p_details ? 'compoundVersion' THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF p_details ? 'compoundLabel' AND (NOT(p_details ? 'compoundStages') OR jsonb_typeof(p_details->'compoundLabel') IS DISTINCT FROM 'string' OR length(btrim(p_details->>'compoundLabel')) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF p_details ? 'compoundMode' AND (NOT(p_details ? 'compoundStages') OR jsonb_typeof(p_details->'compoundMode') IS DISTINCT FROM 'string' OR p_details->>'compoundMode' NOT IN('CONTINUOUS','DISCONTINUOUS')) THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 PERFORM dqa_private.validate_single_original_fields_v48(p_details-ARRAY['compoundStages','compoundVersion','compoundLabel','compoundMode'],p_signature);
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.validate_project_request(p_tenant uuid, p_command jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE item jsonb;data jsonb;t dqa_business.trial_definitions;
BEGIN
 IF NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['name','execution_kind','submit','common','items']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('name','execution_kind','submit','common','items'))
 OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'name')) NOT BETWEEN 1 AND 100 OR coalesce(p_command->>'execution_kind','') NOT IN('REAL','VIRTUAL') OR jsonb_typeof(p_command->'submit') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_command->'common') IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
 IF jsonb_array_length(p_command->'items') NOT BETWEEN 1 AND 100 OR octet_length(p_command::text)>4194304 THEN RAISE EXCEPTION 'PROJECT_LIMIT';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_command->'items') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['trial_id','name','quantity','specification','acceptance','judgementRequired']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('trial_id','name','quantity','specification','acceptance','judgementRequired','compound')) OR coalesce(item->>'trial_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(item->>'judgementRequired','') NOT IN('需作判定','不作判定') OR jsonb_typeof(item->'specification')<>'string' OR jsonb_typeof(item->'acceptance')<>'string' OR length(item->>'specification')>3000 OR length(item->>'acceptance')>3000 THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
  SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(item->>'trial_id')::uuid AND enabled;
  IF NOT FOUND OR item->>'name' IS DISTINCT FROM t.name THEN RAISE EXCEPTION 'TRIAL_NOT_AVAILABLE';END IF;
  IF item ? 'compound' THEN
   IF p_command->'common'->'form_details' ? 'compoundStages' OR t.profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT' OR jsonb_typeof(item->'compound') IS DISTINCT FROM 'object' OR NOT(item->'compound' ?& ARRAY['version','label','stages']) OR (SELECT count(*) FROM jsonb_object_keys(item->'compound')) NOT BETWEEN 3 AND 4 OR EXISTS(SELECT 1 FROM jsonb_object_keys(item->'compound') k WHERE k NOT IN('version','label','stages','mode')) OR item->'compound' ? 'mode' AND (jsonb_typeof(item->'compound'->'mode') IS DISTINCT FROM 'string' OR item->'compound'->>'mode' NOT IN('CONTINUOUS','DISCONTINUOUS')) OR item->'compound'->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(item->'compound'->'label') IS DISTINCT FROM 'string' OR length(btrim(item->'compound'->>'label')) NOT BETWEEN 1 AND 100 OR coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,3}$' OR (item->>'quantity')::int>1000 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
   PERFORM dqa_private.validate_compound_protocol(p_tenant,item->'compound'->'stages');
  ELSIF t.profile_code='COMPOUND_ENVIRONMENT' THEN
   IF jsonb_array_length(p_command->'items')<>1 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_REQUIRED';END IF;
   PERFORM dqa_private.validate_compound_protocol(p_tenant,p_command->'common'->'form_details'->'compoundStages');
  ELSIF p_command->'common'->'form_details' ? 'compoundStages' THEN RAISE EXCEPTION 'COMPOUND_TRIAL_REQUIRED';END IF;
  data:=dqa_private.project_child_data(p_command,item);PERFORM dqa_private.validate_draft(data);
  IF (p_command->>'submit')::boolean AND (coalesce(length(btrim(item->>'specification')),0)=0 OR coalesce(length(btrim(item->>'acceptance')),0)=0 OR coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,5}$') THEN RAISE EXCEPTION 'WORKFLOW_REQUEST_INCOMPLETE';END IF;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan_v55(p_tenant uuid, p_command jsonb, p_check_end boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;t dqa_business.trial_definitions;m dqa_business.equipment;person dqa_business.memberships;n dqa_private.preapproval_samples;
 data jsonb:=p_command->'data';c jsonb;stages jsonb;stage jsonb;rule jsonb;ids uuid[];stage_ids uuid[];device uuid;eq_versions jsonb:='{}';allocations jsonb:='[]';segments jsonb:='[]';
 starts timestamptz;ends timestamptz;cursor_at timestamptz;stage_end timestamptz;shift_start time;shift_end time;units integer;idx integer:=0;duration integer:=0;newflow boolean;end_date date;
BEGIN
 IF coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant) AND dqa_private.calendar_repair_id(p_tenant,(p_command->>'request_id')::uuid) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id;
 IF t.profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT' THEN RETURN dqa_private.calculate_single_schedule_draft_plan_v48(p_tenant,p_command,p_check_end);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF (NOT dqa_private.preapproval_can_plan(p_tenant,q.id) AND dqa_private.calendar_repair_id(p_tenant,q.id) IS NULL) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=q.id FOR UPDATE;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id FOR SHARE;
 newflow:=dqa_private.preapproval_document(p_tenant,q.request_document_version_id);
 IF q.request_document_version_id IS NULL OR q.quantity NOT BETWEEN 1 AND 1000 OR q.form_details->>'priority' IS DISTINCT FROM '專案' OR NOT t.enabled OR coalesce(q.trial_snapshot->>'version','')<>t.specification_version THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
 IF ((newflow AND (q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0)) OR (NOT newflow AND (q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.status NOT IN('DRAFT','CANCELLED'))) AND dqa_private.calendar_repair_id(p_tenant,q.id) IS NULL THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
 IF coalesce(d.revision,0)<>(p_command->>'expected_draft_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units','compound')) OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(data->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR data->>'preparation_minutes' IS DISTINCT FROM '0' OR data->>'cleanup_minutes' IS DISTINCT FROM '0' OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 0 AND 32000 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 units:=(data->>'sample_space_units')::integer;IF units>100000 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 c:=CASE WHEN data ? 'compound' THEN data->'compound' ELSE d.plan->'compound' END;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN('start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids','stage_start_dates')) OR coalesce(c->>'start_local','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-2][0-9]:[0-5][0-9]$' OR coalesce(c->>'shift_start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(c->>'shift_end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR jsonb_typeof(c->'preloaded_weekend') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'stage_equipment_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'COMPOUND_PLAN_REQUIRED';END IF;
 starts:=(c->>'start_local')::timestamp AT TIME ZONE 'Asia/Taipei';shift_start:=(c->>'shift_start')::time;shift_end:=(c->>'shift_end')::time;
 IF shift_start>=shift_end OR (starts AT TIME ZONE 'Asia/Taipei')::date<=((clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) OR starts>clock_timestamp()+interval '366 days' OR data->>'start_date' IS DISTINCT FROM to_char(starts AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD') THEN RAISE EXCEPTION 'PLANNING_DATE_INVALID';END IF;
 stages:=q.form_details->'compoundStages';PERFORM dqa_private.validate_compound_protocol(p_tenant,stages);
 IF jsonb_array_length(c->'stage_equipment_ids')<>jsonb_array_length(stages) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'stage_equipment_ids') v WHERE v!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
 SELECT array_agg(v::uuid ORDER BY ord),array_agg(DISTINCT v::uuid ORDER BY v::uuid) INTO stage_ids,ids FROM jsonb_array_elements_text(c->'stage_equipment_ids') WITH ORDINALITY x(v,ord);
 IF cardinality(ids) NOT BETWEEN 1 AND 4 OR data->'equipment_ids' IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v) FROM unnest(ids) v) AND (SELECT array_agg(v::uuid ORDER BY v::uuid) FROM jsonb_array_elements_text(data->'equipment_ids') v) IS DISTINCT FROM ids THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
 SELECT * INTO person FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=(data->>'executor_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT person.enabled OR person.revision<>(data->>'executor_revision')::bigint OR NOT EXISTS(SELECT 1 FROM dqa_business.roles r JOIN auth.users u ON u.id=person.auth_user_id WHERE r.id=person.role_id AND r.tenant_id=p_tenant AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())) THEN RAISE EXCEPTION 'PLANNING_EXECUTOR_REQUIRED';END IF;
 FOREACH device IN ARRAY ids LOOP
  SELECT * INTO m FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=device FOR SHARE;
  IF NOT FOUND OR q.execution_kind='REAL' AND m.operational_status<>'IDLE' THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
  IF coalesce(data->'equipment_revisions'->>m.id::text,'')<>m.revision::text THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF m.space_units<q.quantity*units THEN RAISE EXCEPTION 'PLANNING_SPACE_INSUFFICIENT';END IF;
  eq_versions:=eq_versions||jsonb_build_object(m.id::text,m.revision);allocations:=allocations||jsonb_build_array(jsonb_build_object('equipment_id',m.id,'equipment_name',m.name,'quantity',q.quantity,'space_units',q.quantity*units));
 END LOOP;
 cursor_at:=starts;
 FOR stage IN SELECT v FROM jsonb_array_elements(stages) v LOOP
  idx:=idx+1;SELECT * INTO m FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=stage_ids[idx];rule:=dqa_private.compound_trial_rules()->(stage->>'profile_id');
  IF m.name!~*(rule->>'equipment_pattern') OR stage->>'operation'='continuous' AND m.daily_hours<24 THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
  duration:=duration+(stage->>'duration_minutes')::integer;stage_end:=cursor_at+(stage->>'duration_minutes')::integer*interval '1 minute';
  IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND NOT dqa_private.compound_working(cursor_at,shift_start,shift_end) AND NOT(idx=1 AND stage->>'profile_id'='HIGH_TEMPERATURE' AND stage->>'operation'='continuous' AND (c->>'preloaded_weekend')::boolean AND extract(isodow FROM cursor_at AT TIME ZONE 'Asia/Taipei')>5) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
  IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND stage->>'operation'='operator' AND (NOT dqa_private.compound_working(stage_end,shift_start,shift_end,true) OR (cursor_at AT TIME ZONE 'Asia/Taipei')::date<>(stage_end AT TIME ZONE 'Asia/Taipei')::date) THEN RAISE EXCEPTION 'COMPOUND_OPERATOR_WINDOW';END IF;
  segments:=segments||jsonb_build_array(stage||jsonb_build_object('equipment_id',m.id,'equipment_name',m.name,'quantity',q.quantity,'start_ms',extract(epoch FROM cursor_at)*1000,'end_ms',extract(epoch FROM stage_end)*1000,'starts_at',cursor_at,'ends_at',stage_end));cursor_at:=stage_end;
 END LOOP;
 ends:=cursor_at;end_date:=((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date;
 IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND NOT dqa_private.compound_working(ends,shift_start,shift_end,true) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
 IF p_check_end AND data->>'end_date' IS DISTINCT FROM end_date::text THEN RAISE EXCEPTION 'PLANNING_END_DATE_MISMATCH';END IF;
 IF NOT newflow AND btrim(data->>'sample_code')='' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.execution_kind='REAL' AND NOT dqa_private.calendar_planning(p_tenant,q.id) AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<ends AND starts<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.execution_kind='REAL' AND s.executor_member_id=person.id AND (s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR s.status='PENDING_APPROVAL' AND s.plan->>'flow_version'='PREAPPROVAL_V2') AND coalesce(s.reserve_from,s.starts_at)<ends AND starts<coalesce(s.reserve_until,s.ends_at) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=q.id AND document_id=q.request_document_version_id;
 RETURN jsonb_build_object('scheduling_unit','MINUTE','scheduling_days',ceil(duration::numeric/1440),'calendar_days',end_date-(starts AT TIME ZONE 'Asia/Taipei')::date+1,'scope','DRAFT_ONLY','reserved',false,'profile_id','COMPOUND_ENVIRONMENT','calendar','continuous','hours_per_batch',duration::numeric/60,'execution_ends_at',ends,'sample_space_units',units,'trial_revision',t.revision,'equipment_revisions',eq_versions,'executor_id',person.id,'executor_label',person.display_name,'executor_revision',person.revision,'start_date',(starts AT TIME ZONE 'Asia/Taipei')::date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'reserve_from',starts,'reserve_until',ends,'segments',segments,'allocations',allocations,'compound',c,'sample_code',CASE WHEN newflow THEN coalesce(n.sample_code,'') ELSE btrim(data->>'sample_code') END,'note',data->>'note','preparation_minutes',0,'cleanup_minutes',0,'physical_feasibility','HUMAN_REVIEW_REQUIRED','operating_conditions','SIGNED_COMPOUND_PROTOCOL')||CASE WHEN newflow THEN jsonb_build_object('flow_version','PREAPPROVAL_V2','outsourced',false,'equipment_label','','sample_revision',n.revision,'document_id',q.request_document_version_id) ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan(p_tenant uuid, p_command jsonb, p_check_end boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE p jsonb;compound_mode text;r uuid:=(p_command->>'request_id')::uuid;BEGIN
 INSERT INTO dqa_private.calendar_planning_permits VALUES(p_tenant,r,txid_current(),dqa_private.calendar_repair_id(p_tenant,r)) ON CONFLICT DO NOTHING;
 p:=dqa_private.calculate_schedule_draft_plan_v55(p_tenant,p_command,false);
 SELECT form_details->>'compoundMode' INTO compound_mode FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=r;
 IF p ? 'compound' AND compound_mode IN('CONTINUOUS','DISCONTINUOUS') THEN p:=p||jsonb_build_object('calendar',CASE compound_mode WHEN 'CONTINUOUS' THEN 'compound_continuous' ELSE 'compound_discontinuous' END);END IF;
 p:=dqa_private.apply_schedule_calendar(p_tenant,r,p);
 DELETE FROM dqa_private.calendar_planning_permits WHERE tenant_id=p_tenant AND request_id=r AND transaction_id=txid_current();
 IF p_check_end AND p_command->'data'->>'end_date' IS DISTINCT FROM p->>'end_date' THEN RAISE EXCEPTION 'PLANNING_END_DATE_MISMATCH';END IF;RETURN p;
EXCEPTION WHEN OTHERS THEN DELETE FROM dqa_private.calendar_planning_permits WHERE tenant_id=p_tenant AND request_id=r AND transaction_id=txid_current();RAISE;
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.trial_calendar_policy(p_tenant uuid, p_trial uuid, p_calendar text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT coalesce((SELECT policy||jsonb_build_object('revision',revision) FROM dqa_private.trial_calendar_policies WHERE tenant_id=p_tenant AND trial_id=p_trial),jsonb_build_object('mode',CASE WHEN t.profile_code='COMPOUND_ENVIRONMENT' THEN 'COMPOUND_CONTINUOUS' WHEN coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)='weekdays' THEN 'WORKDAYS_SPLIT' ELSE 'CONTINUOUS' END,'weekends',coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)<>'weekdays','holidays',coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)<>'weekdays','work_start',0,'work_end',1440,'overtime',false,'overtime_end',1440,'substitution',true,'revision',0))||jsonb_build_object('work_start',0,'work_end',1440,'overtime',false,'overtime_end',1440)||CASE WHEN t.profile_code='COMPOUND_ENVIRONMENT' AND p_calendar IN('compound_continuous','compound_discontinuous') THEN jsonb_build_object('mode',CASE p_calendar WHEN 'compound_continuous' THEN 'COMPOUND_CONTINUOUS' ELSE 'COMPOUND_DISCONTINUOUS' END) ELSE '{}'::jsonb END FROM dqa_business.trial_definitions t WHERE t.tenant_id=p_tenant AND t.id=p_trial
$function$;

CREATE OR REPLACE FUNCTION dqa_business.preapproval_context(p_tenant uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q dqa_business.requests;n dqa_private.preapproval_samples;d dqa_business.schedule_drafts;s dqa_business.schedules;equipment jsonb:='[]';executors jsonb:='[]';mapping jsonb;entry jsonb;canplan boolean;
BEGIN
 IF NOT dqa_private.can(p_tenant) OR NOT dqa_private.can_read_request(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=p_request;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=p_request AND status NOT IN('DRAFT','CANCELLED');
 SELECT request_mapping INTO mapping FROM dqa_private.mapped_document_pins WHERE tenant_id=p_tenant AND document_id=q.request_document_version_id;
 SELECT jsonb_build_object('fields',t.fields,'at',e.created_at,'actor',e.actor_label,'event_id',e.id) INTO entry FROM dqa_private.request_template_stage_entries t JOIN dqa_business.approval_events e ON e.tenant_id=t.tenant_id AND e.id=t.event_id WHERE t.tenant_id=p_tenant AND t.document_id=q.request_document_version_id AND t.schedule_id=s.id AND t.stage='LAB_PREPARE' AND e.actor_member_id=s.executor_member_id ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
 canplan:=dqa_private.preapproval_can_plan(p_tenant,p_request);
 IF canplan THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO equipment FROM(SELECT id,legacy_id,name,category,model,space_units,daily_hours,operational_status,revision,display_details,specification,coalesce((SELECT capabilities FROM dqa_private.equipment_capabilities c WHERE c.tenant_id=p_tenant AND c.equipment_id=dqa_business.equipment.id),'[]'::jsonb) capabilities FROM dqa_business.equipment WHERE tenant_id=p_tenant ORDER BY name,id LIMIT 1001)x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO executors FROM(SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab.execute'=ANY(r.permissions) AND lower(u.email)=m.login_email AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp()) ORDER BY m.display_name,m.id LIMIT 1001)x;
  IF jsonb_array_length(equipment)>1000 OR jsonb_array_length(executors)>1000 THEN RAISE EXCEPTION 'SNAPSHOT_PAGINATION_REQUIRED';END IF;
 END IF;
 RETURN jsonb_build_object('preflight_required',dqa_private.preflight_required(p_tenant,q.request_document_version_id),'flow_version',CASE WHEN dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN 'PREAPPROVAL_V2' ELSE 'LEGACY' END,'request_id',q.id,'document_id',q.request_document_version_id,'request_revision',q.revision,'outsourced',coalesce(q.form_details->>'priority'='委外',false),'sample_code',CASE WHEN n.document_id=q.request_document_version_id THEN n.sample_code ELSE NULL END,'sample_revision',coalesce(n.revision,0),'quantity',q.quantity,'calendar_policy',dqa_private.trial_calendar_policy(p_tenant,q.trial_id,coalesce(d.plan->>'calendar',CASE q.form_details->>'compoundMode' WHEN 'CONTINUOUS' THEN 'compound_continuous' WHEN 'DISCONTINUOUS' THEN 'compound_discontinuous' END)),'sample_group_exists',n.request_id IS NOT NULL,'sample_numbers',CASE WHEN n.document_id=q.request_document_version_id THEN to_jsonb(string_to_array(n.sample_code,'、')) ELSE '[]'::jsonb END,'sample_numbers_valid',dqa_private.sample_group_valid(p_tenant,p_request,q.request_document_version_id),'trial_id',q.trial_id,'condition_sources',CASE WHEN canplan THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('trial_id',t.trial_id,'conditions',t.details->'conditions','equipment_ids',t.details->'equipment_ids','sub_trials',coalesce(t.details->'sub_trials','[]'::jsonb))),'[]'::jsonb) FROM dqa_private.trial_editor_settings t WHERE t.tenant_id=p_tenant AND (t.trial_id=q.trial_id OR t.trial_id IN(SELECT (x->>'trial_id')::uuid FROM jsonb_array_elements(coalesce(q.form_details->'compoundStages','[]'::jsonb)) x))) ELSE '[]'::jsonb END,'can_plan',canplan,'draft',CASE WHEN d.id IS NOT NULL THEN to_jsonb(d)-'actor_member_id' ELSE NULL END,'schedule',CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id',s.id,'status',s.status,'revision',s.revision,'plan',s.plan) ELSE NULL END,'auto_fields',CASE WHEN d.document_version_id=q.request_document_version_id THEN dqa_private.preapproval_auto_fields(d.plan) ELSE '{}' END,'preparation',entry,'preparation_ready',coalesce(dqa_private.preparation_ready(p_tenant,p_request,s.id),false),'mapping',coalesce(mapping,'[]'),'equipment',equipment,'executors',executors);
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.apply_schedule_calendar(p_tenant uuid, p_request uuid, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q dqa_business.requests;p jsonb;mode text;seg jsonb;pieces jsonb:='[]';next_device jsonb:='{}';begin_at timestamptz;finish timestamptz;cursor_at timestamptz;first_at timestamptz;last_at timestamptz;work_day date;minutes numeric;days_needed integer;used integer;attempt integer;compound boolean;manual boolean;repair uuid;scope_start timestamptz;scope_end timestamptz;ids uuid[];item_end timestamptz;nominal_end timestamptz;nominal_finish timestamptz;stage_no integer:=0;stage_policy jsonb;child_policy jsonb;stage_dates jsonb;requested_day jsonb;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 p:=dqa_private.trial_calendar_policy(p_tenant,q.trial_id,p_plan->>'calendar');mode:=p->>'mode';compound:=p_plan ? 'compound';repair:=dqa_private.calendar_repair_id(p_tenant,p_request);
 stage_dates:=p_plan->'compound'->'stage_start_dates';
 IF stage_dates IS NOT NULL THEN
  IF NOT compound OR mode<>'COMPOUND_DISCONTINUOUS' OR jsonb_typeof(stage_dates) IS DISTINCT FROM 'array' OR jsonb_array_length(stage_dates)<>jsonb_array_length(q.form_details->'compoundStages') THEN RAISE EXCEPTION 'COMPOUND_STAGE_DATES_INVALID';END IF;
  FOR requested_day IN SELECT value FROM jsonb_array_elements(stage_dates) LOOP
   IF requested_day<>'null'::jsonb AND (jsonb_typeof(requested_day) IS DISTINCT FROM 'string' OR coalesce(requested_day#>>'{}','')!~'^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'COMPOUND_STAGE_DATES_INVALID';END IF;
   IF requested_day<>'null'::jsonb AND (requested_day#>>'{}')::date>(p_plan->>'start_date')::date+366 THEN RAISE EXCEPTION 'COMPOUND_STAGE_DATES_INVALID';END IF;
  END LOOP;
  IF stage_dates->0<>'null'::jsonb AND stage_dates->>0 IS DISTINCT FROM p_plan->>'start_date' THEN RAISE EXCEPTION 'COMPOUND_STAGE_DATES_INVALID';END IF;
 END IF;
 FOR seg IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(p_plan->'segments')=0 AND p_plan->>'outsourced'='true' THEN jsonb_build_array(jsonb_build_object('start_ms',p_plan->'start_ms','end_ms',extract(epoch FROM (p_plan->>'execution_ends_at')::timestamptz)*1000,'quantity',q.quantity)) ELSE p_plan->'segments' END) LOOP
  stage_no:=stage_no+1;IF compound AND mode='COMPOUND_DISCONTINUOUS' THEN seg:=seg||jsonb_build_object('stage_index',stage_no);END IF;
  minutes:=((seg->>'end_ms')::numeric-(seg->>'start_ms')::numeric)/60000;IF minutes<=0 OR minutes>525600 THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
  days_needed:=ceil(minutes/1440);begin_at:=((to_timestamp((seg->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';
  IF compound AND cursor_at IS NOT NULL THEN begin_at:=cursor_at;
  ELSIF NOT compound AND next_device ? coalesce(seg->>'equipment_id','OUTSOURCE') THEN begin_at:=greatest(begin_at,(next_device->>coalesce(seg->>'equipment_id','OUTSOURCE'))::timestamptz);END IF;
  IF compound AND mode='COMPOUND_DISCONTINUOUS' AND stage_dates->(stage_no-1)<>'null'::jsonb THEN begin_at:=greatest(begin_at,((stage_dates->>(stage_no-1))::date::timestamp) AT TIME ZONE 'Asia/Taipei');END IF;
  manual:=compound AND seg->>'operation'='operator';
  stage_policy:=p;IF compound AND mode='COMPOUND_DISCONTINUOUS' THEN child_policy:=dqa_private.trial_calendar_policy(p_tenant,(seg->>'trial_id')::uuid,CASE WHEN manual THEN 'weekdays' ELSE 'continuous' END);stage_policy:=p||jsonb_build_object('weekends',(p->>'weekends')::boolean AND (child_policy->>'weekends')::boolean,'holidays',(p->>'holidays')::boolean AND (child_policy->>'holidays')::boolean);END IF;
  IF compound AND mode='COMPOUND_CONTINUOUS' THEN
   -- Keep the signed stages contiguous internally. Only the whole chain's final date is rounded.
   finish:=begin_at+minutes*interval '1 minute';
   IF NOT dqa_private.calendar_open(p_tenant,(begin_at AT TIME ZONE 'Asia/Taipei')::date,CASE WHEN manual THEN false ELSE (stage_policy->>'weekends')::boolean END,CASE WHEN manual THEN false ELSE (stage_policy->>'holidays')::boolean END) OR NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,stage_policy,manual) THEN RAISE EXCEPTION 'CALENDAR_NONWORKING_DAY';END IF;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes));
  ELSIF mode IN('CONTINUOUS','WORKDAYS_CONTIGUOUS') THEN
   finish:=begin_at+days_needed*interval '1 day';
   IF NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,stage_policy,false) THEN RAISE EXCEPTION 'CALENDAR_NONWORKING_DAY';END IF;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes,'scheduled_days',days_needed));
  ELSIF compound AND NOT manual THEN
   -- An unattended discontinuous stage keeps its exact uninterrupted exposure; its slot ends on a date boundary.
   begin_at:=((begin_at AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';attempt:=0;
   LOOP
    finish:=begin_at+days_needed*interval '1 day';EXIT WHEN dqa_private.calendar_interval_open(p_tenant,begin_at,finish,stage_policy,false);
    attempt:=attempt+1;IF attempt>366 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;begin_at:=begin_at+interval '1 day';
   END LOOP;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes,'scheduled_days',days_needed));
  ELSE
   finish:=((begin_at AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';used:=0;attempt:=0;
   WHILE used<days_needed LOOP
    attempt:=attempt+1;IF attempt>1000 OR jsonb_array_length(pieces)>5000 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;work_day:=(finish AT TIME ZONE 'Asia/Taipei')::date;
    IF NOT dqa_private.calendar_open(p_tenant,work_day,CASE WHEN manual THEN false ELSE (stage_policy->>'weekends')::boolean END,CASE WHEN manual THEN false ELSE (stage_policy->>'holidays')::boolean END) THEN finish:=finish+interval '1 day';CONTINUE;END IF;
    begin_at:=finish;finish:=finish+interval '1 day';used:=used+1;
    pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',least(1440,greatest(0,minutes-(used-1)*1440)),'scheduled_days',1));
   END LOOP;
  END IF;
  cursor_at:=finish;next_device:=next_device||jsonb_build_object(coalesce(seg->>'equipment_id','OUTSOURCE'),((((finish-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei');
 END LOOP;
 SELECT min(to_timestamp((x->>'start_ms')::numeric/1000)),max(to_timestamp((x->>'end_ms')::numeric/1000)),max(to_timestamp((x->>'start_ms')::numeric/1000)+(x->>'nominal_minutes')::numeric*interval '1 minute') INTO first_at,nominal_end,nominal_finish FROM jsonb_array_elements(pieces) x;
 IF first_at IS NULL OR nominal_end<=first_at THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
 last_at:=((((nominal_end-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';
 -- Buffers remain conservative whole-date reservations; no hidden daily shift windows.
 scope_start:=((first_at-((p_plan->>'preparation_minutes')::int)*interval '1 minute') AT TIME ZONE 'Asia/Taipei')::date::timestamp AT TIME ZONE 'Asia/Taipei';scope_end:=((((last_at+((p_plan->>'cleanup_minutes')::int)*interval '1 minute'-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';
 SELECT coalesce(array_agg((x->>'equipment_id')::uuid),'{}') INTO ids FROM jsonb_array_elements(p_plan->'allocations') x;
 IF q.execution_kind='REAL' AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.schedule_id IS DISTINCT FROM repair AND a.released_at IS NULL AND a.reserve_from<scope_end AND (scope_start<a.reserve_until OR EXISTS(SELECT 1 FROM dqa_business.schedules paused WHERE paused.id=a.schedule_id AND paused.tenant_id=p_tenant AND paused.status='PAUSED')) AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.id IS DISTINCT FROM repair AND s.execution_kind='REAL' AND s.executor_member_id=(p_plan->>'executor_id')::uuid AND s.status IN('PENDING_APPROVAL','BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND coalesce(s.reserve_from,s.starts_at)<scope_end AND (s.status='PAUSED' OR scope_start<coalesce(s.reserve_until,s.ends_at)) AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) OR EXISTS(SELECT 1 FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND kind='EQUIPMENT_FAULT' AND resolved_at IS NULL AND equipment_id=ANY(ids) AND first_day<=((scope_end-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date AND last_day>=(scope_start AT TIME ZONE 'Asia/Taipei')::date)) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN p_plan||jsonb_build_object('capability_checks',dqa_private.plan_capability_checks(p_tenant,p_request,p_plan),'scheduling_unit','DAY','date_basis','CALENDAR_DAY_V1','segments',pieces,'starts_at',first_at,'execution_ends_at',last_at,'nominal_execution_ends_at',nominal_finish,'ends_at',last_at,'reserve_from',scope_start,'reserve_until',scope_end,'start_ms',extract(epoch FROM first_at)*1000,'end_ms',extract(epoch FROM last_at)*1000,'start_date',(first_at AT TIME ZONE 'Asia/Taipei')::date,'end_date',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date,'scheduling_days',(SELECT count(DISTINCT day) FROM jsonb_array_elements(pieces) z CROSS JOIN LATERAL generate_series((to_timestamp((z->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')::date::timestamp,((to_timestamp((z->>'end_ms')::numeric/1000)-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date::timestamp,interval '1 day') day),'calendar_days',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date-(first_at AT TIME ZONE 'Asia/Taipei')::date+1,'calendar_policy',p,'calendar_source','TW_OFFICE_2026_2027','priority_rank',dqa_private.scheduling_priority(q.form_details->>'priority'));
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'COMPOUND_STAGE_DATES_INVALID';
END $function$;

CREATE OR REPLACE FUNCTION dqa_private.batch_schedule_candidate(tid uuid, rid uuid, opts jsonb, batch_overlay jsonb, deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q dqa_business.requests;trial dqa_business.trial_definitions;eq dqa_business.equipment;person record;stage jsonb;d date;first_day date;last_day date;ids uuid[];seeds uuid[];versions jsonb;cmd jsonb;data jsonb;plan jsonb;tries integer:=0;count_needed integer;draft_revision bigint;prior_plan jsonb;variant integer;variants integer;external boolean;compound boolean;chosen uuid;stage_ids uuid[];issue text;patterns jsonb:='{"HIGH_HUMIDITY":"恆溫恆濕|環境試驗箱","HIGH_TEMPERATURE":"環境試驗箱|恆溫恆濕|高溫爐","LOW_TEMPERATURE":"環境試驗箱|恆溫恆濕","THERMAL_CYCLE":"環境試驗箱|恆溫恆濕","HUMIDITY_CYCLE":"環境試驗箱|恆溫恆濕","THERMAL_SHOCK":"冷熱衝擊","VIBRATION_DURABILITY":"振動","SALT_SPRAY":"鹽霧","WATER_INGRESS":"防水","ESD":"ESD","EMC":"EMC|電磁相容","WEATHERING":"耐候","DUST":"防塵","TENSILE":"拉力","INSPECTION":"顯微鏡","MECHANICAL_SHOCK":"機械衝擊","DROP":"跌落","INSERTION":"插拔","VOLTAGE":"電源|電壓"}'::jsonb;
BEGIN
 IF NOT dqa_private.preapproval_can_plan(tid,rid) THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=tid AND id=rid AND dqa_private.case_row_active(tid,'requests',id);
 IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_SOURCE_CHANGED';END IF;
 SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=tid AND id=q.trial_id AND enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
 external:=dqa_private.preapproval_document(tid,q.request_document_version_id) AND coalesce(q.form_details->>'priority'='委外',false);compound:=trial.profile_code='COMPOUND_ENVIRONMENT';
 IF NOT external AND NOT compound AND NOT(patterns ? trial.profile_code) THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
 IF NOT dqa_private.preapproval_document(tid,q.request_document_version_id) AND coalesce(btrim(opts->>'sample_code'),'')='' THEN RAISE EXCEPTION 'BATCH_SAMPLE_CODE_REQUIRED';END IF;
 first_day:=(opts->>'earliest')::date;last_day:=(opts->>'latest')::date;count_needed:=(opts->>'equipment_count')::int;
 SELECT sd.revision,sd.plan INTO draft_revision,prior_plan FROM dqa_business.schedule_drafts sd WHERE sd.tenant_id=tid AND sd.request_id=q.id;draft_revision:=coalesce(draft_revision,0);
 IF external THEN seeds:='{}';variants:=1;
 ELSIF compound THEN seeds:='{}';variants:=4;IF jsonb_array_length(coalesce(q.form_details->'compoundStages','[]'))<2 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_REQUIRED';END IF;
 ELSE SELECT coalesce(array_agg(e.id ORDER BY e.id),'{}') INTO seeds FROM dqa_business.equipment e WHERE e.tenant_id=tid AND e.deleted_at IS NULL AND (q.execution_kind='VIRTUAL' OR e.operational_status='IDLE') AND(e.name||' '||coalesce(e.category,'')||' '||coalesce(e.model,''))~*(patterns->>trial.profile_code) AND dqa_private.equipment_condition_error(tid,q.trial_id,e.id) IS NULL;variants:=least(cardinality(seeds),20);END IF;
 IF variants=0 THEN RETURN jsonb_build_object('reason_code','BATCH_EQUIPMENT_REQUIRED');END IF;
 FOR d IN SELECT generate_series(first_day,last_day,interval '1 day')::date LOOP
  FOR variant IN 0..variants-1 LOOP
   ids:='{}';versions:='{}';stage_ids:='{}';
   IF compound AND NOT external THEN
    FOR stage IN SELECT value FROM jsonb_array_elements(q.form_details->'compoundStages') LOOP
     SELECT e.id INTO chosen FROM dqa_business.equipment e WHERE e.tenant_id=tid AND e.deleted_at IS NULL AND(q.execution_kind='VIRTUAL' OR e.operational_status='IDLE') AND(e.name||' '||coalesce(e.category,'')||' '||coalesce(e.model,''))~*(patterns->>(stage->>'profile_id')) AND e.space_units>=(opts->>'sample_space_units')::int*q.quantity AND dqa_private.equipment_condition_error(tid,(stage->>'trial_id')::uuid,e.id) IS NULL ORDER BY md5(e.id::text||variant::text) LIMIT 1;
     IF chosen IS NULL THEN EXIT;END IF;stage_ids:=array_append(stage_ids,chosen);
    END LOOP;
    IF cardinality(stage_ids)<>jsonb_array_length(q.form_details->'compoundStages') THEN issue:='BATCH_EQUIPMENT_REQUIRED';CONTINUE;END IF;
    SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(stage_ids)x;
    IF cardinality(ids)>4 THEN issue:='PLANNING_EQUIPMENT_REQUIRED';CONTINUE;END IF;
    SELECT jsonb_object_agg(e.id::text,e.revision) INTO versions FROM dqa_business.equipment e WHERE e.tenant_id=tid AND e.id=ANY(ids);
   ELSIF NOT external THEN
    SELECT array_agg(e.id ORDER BY e.is_first DESC,e.id),jsonb_object_agg(e.id::text,e.revision) INTO ids,versions FROM(SELECT x.id,x.revision,(x.id=seeds[variant+1]) is_first FROM dqa_business.equipment x WHERE x.tenant_id=tid AND x.id=ANY(seeds) ORDER BY(x.id=seeds[variant+1]) DESC,x.id LIMIT count_needed)e;
    IF cardinality(ids)<>count_needed THEN issue:='PLANNING_EQUIPMENT_REQUIRED';CONTINUE;END IF;
   END IF;
   FOR person IN SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=tid AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND(u.banned_until IS NULL OR u.banned_until<clock_timestamp()) ORDER BY m.id LIMIT 6 LOOP
    tries:=tries+1;IF tries>160 OR clock_timestamp()>deadline THEN RETURN jsonb_build_object('reason_code','BATCH_SEARCH_LIMIT','checks',tries-1);END IF;
    data:=jsonb_build_object('sample_space_units',opts->'sample_space_units','equipment_ids',to_jsonb(ids),'equipment_revisions',versions,'executor_id',person.id,'executor_revision',person.revision,'start_date',d,'end_date',d,'sample_code',CASE WHEN dqa_private.preapproval_document(tid,q.request_document_version_id) THEN '' ELSE coalesce(btrim(opts->>'sample_code'),'') END,'note',coalesce(prior_plan->>'note',''),'preparation_minutes',CASE WHEN compound THEN '0'::jsonb ELSE coalesce(prior_plan->'preparation_minutes','0'::jsonb) END,'cleanup_minutes',CASE WHEN compound THEN '0'::jsonb ELSE coalesce(prior_plan->'cleanup_minutes','0'::jsonb) END);
    IF compound AND NOT external THEN data:=data||jsonb_build_object('compound',jsonb_build_object('start_local',d::text||'T00:00','shift_start','00:00','shift_end','23:59','preloaded_weekend',true,'stage_equipment_ids',to_jsonb(stage_ids))||CASE WHEN q.form_details->>'compoundMode'='DISCONTINUOUS' AND jsonb_typeof(prior_plan->'compound'->'stage_start_dates')='array' THEN jsonb_build_object('stage_start_dates',prior_plan->'compound'->'stage_start_dates') ELSE '{}'::jsonb END);END IF;
    cmd:=jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',draft_revision,'data',data);
    BEGIN plan:=dqa_private.calculate_schedule_draft_plan(tid,cmd,false);cmd:=jsonb_set(cmd,'{data,end_date}',plan->'end_date');EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN issue:=SQLERRM;CONTINUE;END;
    IF dqa_private.batch_plan_conflicts(q.execution_kind,plan,batch_overlay) THEN issue:='BATCH_NO_SLOT';CONTINUE;END IF;
    RETURN jsonb_build_object('command',cmd,'plan',plan,'checks',tries,'equipment_labels',(SELECT coalesce(jsonb_agg(e.name ORDER BY e.id),'[]') FROM dqa_business.equipment e WHERE e.tenant_id=tid AND e.id=ANY(ids)));
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('reason_code',CASE WHEN issue IN('CALENDAR_COVERAGE_REQUIRED','PLANNING_CONDITIONS_UNVERIFIED','PLANNING_CONDITIONS_EXCEEDED','PLANNING_SPACE_INSUFFICIENT','PLANNING_SOURCE_INCOMPLETE','PLANNING_EQUIPMENT_REQUIRED','TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED','COMPOUND_HANDOFF_WINDOW','COMPOUND_OPERATOR_WINDOW','BATCH_EQUIPMENT_REQUIRED') THEN issue ELSE 'BATCH_NO_SLOT' END,'checks',tries);
END $function$;
