-- Confirm resources first, then attach the sample number. Virtual preparation precedes acceleration.
CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan(p_tenant uuid, p_command jsonb, p_check_end boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $$
DECLARE req dqa_business.requests;draft dqa_business.schedule_drafts;actor_role dqa_business.roles;executor dqa_business.memberships;machine dqa_business.equipment;trial dqa_business.trial_definitions;
 newflow boolean;external boolean;number_row dqa_private.preapproval_samples;
 rules jsonb:='{"HIGH_HUMIDITY":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":true,"hours":250},"THERMAL_SHOCK":{"equipment_pattern":"冷熱衝擊","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"VIBRATION_DURABILITY":{"equipment_pattern":"振動","calendar":"weekdays","mode":"serial","daily_hours":20,"fixed_duration":true,"hours":20},"HUMIDITY_CYCLE":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"THERMAL_CYCLE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"LOW_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"HIGH_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕|高溫爐","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"SALT_SPRAY":{"equipment_pattern":"鹽霧","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"WATER_INGRESS":{"equipment_pattern":"防水","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"ESD":{"equipment_pattern":"ESD","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.5},"WEATHERING":{"equipment_pattern":"耐候","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"DUST":{"equipment_pattern":"防塵","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":8},"TENSILE":{"equipment_pattern":"拉力","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSPECTION":{"equipment_pattern":"顯微鏡","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.25},"MECHANICAL_SHOCK":{"equipment_pattern":"機械衝擊","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"DROP":{"equipment_pattern":"跌落","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSERTION":{"equipment_pattern":"插拔","calendar":"continuous","mode":"serial","daily_hours":24,"fixed_duration":false,"hours":20},"VOLTAGE":{"equipment_pattern":"電源|電壓","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"EMC":{"equipment_pattern":"EMC|電磁相容","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":2}}';rule jsonb;data jsonb;ids uuid[];item jsonb;execution jsonb:='[]';allocations jsonb:='[]';equipment_versions jsonb:='{}';hours numeric;explicit_hours numeric;matches text[];explicit_values numeric[];
 start_date date;end_date date;cursor_date date;starts timestamptz;ends timestamptz;begin_at timestamptz;end_at timestamptz;execution_ends timestamptz;scheduling_days integer;plan_reserve_from timestamptz;plan_reserve_until timestamptz;prep integer;cleanup integer;
 units integer;remaining integer;assigned integer;capacity integer;slot_capacity integer;left_count integer;day_hours numeric;used numeric;batch_quantity integer;i integer;offset_days integer;expected_draft bigint;actor_member uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 actor_member:=dqa_private.member_id(p_tenant);
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 data:=p_command->'data';
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units')) OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 0 AND 120 OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(data->>'preparation_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'cleanup_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(data->>'end_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF jsonb_typeof(data->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(data->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 units:=(data->>'sample_space_units')::integer;IF units>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF jsonb_array_length(data->'equipment_ids') NOT BETWEEN 0 AND 4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'equipment_ids') v WHERE jsonb_typeof(v)<>'string' OR trim('"' FROM v::text)!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 SELECT coalesce(array_agg(v::uuid ORDER BY n),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(data->'equipment_ids') WITH ORDINALITY x(v,n);
 IF cardinality(ids)<>(SELECT count(DISTINCT v) FROM unnest(ids) v) OR (SELECT count(*) FROM jsonb_object_keys(data->'equipment_revisions'))<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 prep:=(data->>'preparation_minutes')::integer;cleanup:=(data->>'cleanup_minutes')::integer;start_date:=(data->>'start_date')::date;end_date:=(data->>'end_date')::date;
 IF prep>1440 OR cleanup>1440 OR start_date<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR start_date>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date+366 OR end_date<start_date OR end_date>start_date+366 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT dqa_private.can_read_request(p_tenant,req.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',req.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 IF req.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 newflow:=dqa_private.preapproval_document(p_tenant,req.request_document_version_id);external:=newflow AND coalesce(req.form_details->>'priority'='委外',false);
 IF NOT dqa_private.preapproval_can_plan(p_tenant,req.id) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 IF newflow THEN
  IF req.status<>'AWAITING_LMS_REVIEW' OR req.request_review_level<>0 THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;
  SELECT * INTO number_row FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=req.id AND document_id=req.request_document_version_id;
  IF btrim(data->>'sample_code')<>'' AND (number_row.request_id IS NULL OR number_row.sample_code<>btrim(data->>'sample_code')) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_REQUIRED';END IF;IF btrim(data->>'sample_code')='' THEN number_row:=NULL;END IF;
 ELSIF req.status<>'AWAITING_SCHEDULING' OR req.request_review_level<>2 OR req.request_document_version_id IS NULL THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;

 IF NOT newflow AND btrim(data->>'sample_code')='' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF (external AND cardinality(ids)<>0) OR (NOT external AND cardinality(ids)=0) THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
 IF req.quantity IS NULL OR req.quantity NOT BETWEEN 1 AND 1000 OR cardinality(ids)>req.quantity THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SOURCE_INCOMPLETE';END IF;
 SELECT * INTO draft FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=req.id FOR UPDATE;expected_draft:=(p_command->>'expected_draft_revision')::bigint;
 IF coalesce(draft.revision,0)<>expected_draft THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO executor FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=(data->>'executor_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT executor.enabled OR NOT EXISTS(SELECT 1 FROM dqa_business.roles r JOIN auth.users u ON u.id=executor.auth_user_id WHERE r.id=executor.role_id AND r.tenant_id=p_tenant AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND u.banned_until IS DISTINCT FROM 'infinity'::timestamptz AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_EXECUTOR_REQUIRED';END IF;
 IF executor.revision<>(data->>'executor_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=req.trial_id AND enabled FOR SHARE;rule:=rules->trial.profile_code;
 IF NOT FOUND OR rule IS NULL OR coalesce(req.trial_snapshot->>'version','')<>trial.specification_version THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_TRIAL_UNVERIFIED';END IF;
 SELECT array_agg(DISTINCT (v[1])::numeric) INTO explicit_values FROM regexp_matches(req.specification,'(-?[0-9]+(?:\.[0-9]+)?)[[:space:]]*(?:小時|hours?|hrs?|h)(?:[^a-z]|$)','gi') v;
 IF cardinality(explicit_values)>1 OR explicit_values[1]<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DURATION_REQUIRED';END IF;explicit_hours:=explicit_values[1];
 IF (rule->>'fixed_duration')::boolean THEN hours:=(rule->>'hours')::numeric;IF explicit_hours IS NOT NULL AND explicit_hours<>hours THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIXED_DURATION';END IF;ELSE hours:=explicit_hours;END IF;
 IF hours IS NULL OR hours<=0 OR hours>8760 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DURATION_REQUIRED';END IF;
 IF rule->>'calendar'='weekdays' AND extract(isodow FROM start_date)>5 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_WEEKDAY_REQUIRED';END IF;
 IF external THEN rule:=rule||jsonb_build_object('mode','batch');END IF;
 remaining:=req.quantity;starts:=start_date::timestamp AT TIME ZONE 'Asia/Taipei';ends:=starts;execution_ends:=starts;i:=0;
 IF external THEN
  end_at:=starts+hours*interval '1 hour';execution_ends:=end_at;ends:=((((end_at-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp AT TIME ZONE 'Asia/Taipei');remaining:=0;
 END IF;
 FOREACH actor_member IN ARRAY ids LOOP
  i:=i+1;SELECT * INTO machine FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=actor_member FOR SHARE;
  IF NOT FOUND OR (req.execution_kind='REAL' AND machine.operational_status<>'IDLE') OR machine.name!~*(rule->>'equipment_pattern') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_EQUIPMENT_REQUIRED';END IF;
  IF coalesce(data->'equipment_revisions'->>machine.id::text,'')<>machine.revision::text THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  equipment_versions:=equipment_versions||jsonb_build_object(machine.id::text,machine.revision);capacity:=machine.space_units/units;left_count:=cardinality(ids)-i;
  IF capacity<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;
  IF rule->>'mode'='batch' THEN assigned:=least(capacity,remaining-left_count);ELSE assigned:=ceil(remaining::numeric/(left_count+1));END IF;
  IF assigned<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;remaining:=remaining-assigned;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',assigned,'space_units',(CASE WHEN trial.profile_code='VIBRATION_DURABILITY' THEN 1 ELSE least(assigned,capacity) END)*units)||CASE WHEN newflow THEN jsonb_build_object('equipment_name',machine.name) ELSE '{}'::jsonb END);
  IF rule->>'mode'='batch' THEN
   end_at:=starts+hours*interval '1 hour';execution:=execution||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',assigned,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM end_at)*1000));execution_ends:=greatest(execution_ends,end_at);ends:=greatest(ends,((((end_at-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp AT TIME ZONE 'Asia/Taipei'));
  ELSE
   day_hours:=least((rule->>'daily_hours')::numeric,machine.daily_hours);IF hours>day_hours THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DAILY_HOURS';END IF;
   slot_capacity:=CASE WHEN trial.profile_code='VIBRATION_DURABILITY' THEN 1 ELSE capacity END;offset_days:=0;
   WHILE assigned>0 LOOP
    cursor_date:=start_date+offset_days;offset_days:=offset_days+1;IF offset_days>366 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
    IF rule->>'calendar'='weekdays' AND extract(isodow FROM cursor_date)>5 THEN CONTINUE;END IF;
    -- One batch per equipment per operating day, even when the nominal test lasts less than a day.
     batch_quantity:=least(assigned,slot_capacity);begin_at:=cursor_date::timestamp AT TIME ZONE 'Asia/Taipei';end_at:=begin_at+hours*interval '1 hour';assigned:=assigned-batch_quantity;
     execution:=execution||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',batch_quantity,'start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM end_at)*1000));execution_ends:=greatest(execution_ends,end_at);ends:=greatest(ends,((((end_at-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp AT TIME ZONE 'Asia/Taipei'));
   END LOOP;
  END IF;
 END LOOP;
 IF remaining>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;
 IF p_check_end AND ((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date<>end_date THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_END_DATE_MISMATCH';END IF;
 end_date:=((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date;
 IF end_date>start_date+366 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
 plan_reserve_from:=((starts-prep*interval '1 minute') AT TIME ZONE 'Asia/Taipei')::date::timestamp AT TIME ZONE 'Asia/Taipei';
 plan_reserve_until:=((((greatest(ends,execution_ends+cleanup*interval '1 minute')-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp AT TIME ZONE 'Asia/Taipei');
 SELECT count(*) INTO scheduling_days FROM generate_series(start_date,end_date,interval '1 day') d WHERE rule->>'calendar'<>'weekdays' OR extract(isodow FROM d)<=5;

 IF rule->>'calendar'='weekdays' AND (EXISTS(SELECT 1 FROM generate_series((plan_reserve_from AT TIME ZONE 'Asia/Taipei')::date,((starts-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date,interval '1 day') x WHERE extract(isodow FROM x)>5) OR EXISTS(SELECT 1 FROM generate_series((execution_ends AT TIME ZONE 'Asia/Taipei')::date,((execution_ends+cleanup*interval '1 minute'-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date,interval '1 day') x WHERE extract(isodow FROM x)>5)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_WEEKDAY_REQUIRED';END IF;
 IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<plan_reserve_until AND plan_reserve_from<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.execution_kind='REAL' AND s.tenant_id=p_tenant AND s.executor_member_id=executor.id AND (s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR s.status='PENDING_APPROVAL' AND s.plan->>'flow_version'='PREAPPROVAL_V2') AND coalesce(s.reserve_from,s.starts_at-s.preparation_minutes*interval '1 minute')<plan_reserve_until AND plan_reserve_from<coalesce(s.reserve_until,s.ends_at+s.cleanup_minutes*interval '1 minute') AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN jsonb_build_object('scheduling_unit','DAY','scheduling_days',scheduling_days,'calendar_days',end_date-start_date+1,'execution_ends_at',execution_ends,'reserve_from',plan_reserve_from,'reserve_until',plan_reserve_until,'sample_space_units',units,'scope','DRAFT_ONLY','reserved',false,'physical_feasibility','NOT_ASSESSED','operating_conditions','HUMAN_REVIEW_REQUIRED','profile_id',trial.profile_code,'calendar',rule->>'calendar','hours_per_batch',hours,'trial_revision',trial.revision,'equipment_revisions',equipment_versions,'executor_id',executor.id,'executor_label',executor.display_name,'executor_revision',executor.revision,'start_date',start_date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'segments',execution,'allocations',allocations,'sample_code',btrim(data->>'sample_code'),'note',data->>'note','preparation_minutes',prep,'cleanup_minutes',cleanup)||CASE WHEN newflow THEN jsonb_build_object('flow_version','PREAPPROVAL_V2','outsourced',coalesce(external,false),'equipment_label',CASE WHEN external THEN '委外設備' ELSE '' END,'sample_revision',number_row.revision,'document_id',req.request_document_version_id) ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';
END $$;
CREATE OR REPLACE FUNCTION dqa_business.save_preapproval_sample_number(p_tenant uuid, p_operation uuid, p_request uuid, p_document uuid, p_request_revision bigint, p_revision integer, p_code text, p_plan_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE q dqa_business.requests;old dqa_private.preapproval_samples;op dqa_private.preapproval_number_operations;fp text;result jsonb;d dqa_business.schedule_drafts;bound_plan jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF p_operation IS NULL OR p_revision IS NULL OR p_revision<0 OR p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'PREAPPROVAL_FIELDS_INVALID';END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_request,p_document,p_request_revision,p_revision,btrim(p_code),p_plan_revision)::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.preapproval_number_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request FOR UPDATE;
 IF q.request_document_version_id IS DISTINCT FROM p_document OR q.revision IS DISTINCT FROM p_request_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF NOT dqa_private.preapproval_document(p_tenant,p_document) OR q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0 THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=p_request FOR UPDATE;IF d.id IS NULL OR d.document_version_id IS DISTINCT FROM p_document OR d.request_revision IS DISTINCT FROM q.revision OR p_plan_revision IS DISTINCT FROM d.revision THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
 SELECT * INTO old FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF old.document_id=p_document AND old.sample_code=btrim(p_code) THEN result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',old.revision);
 ELSE
 INSERT INTO dqa_private.preapproval_samples VALUES(p_tenant,p_request,p_document,btrim(p_code),1,auth.uid()) ON CONFLICT(tenant_id,request_id) DO UPDATE SET document_id=EXCLUDED.document_id,sample_code=EXCLUDED.sample_code,revision=dqa_private.preapproval_samples.revision+1,actor=auth.uid() RETURNING * INTO old;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',old.revision);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'preapproval_samples',p_request,'UPDATE',ARRAY['sample_code','revision']);
 END IF;
 IF d.plan->>'sample_code' IS DISTINCT FROM old.sample_code OR d.plan->>'sample_revision' IS DISTINCT FROM old.revision::text THEN
 bound_plan:=dqa_private.schedule_draft_plan(p_tenant,jsonb_set(dqa_private.preapproval_plan_command(p_tenant,p_request,d.plan,d.revision),'{data,sample_code}',to_jsonb(old.sample_code)));
 UPDATE dqa_business.schedule_drafts SET plan=bound_plan,actor_member_id=dqa_private.member_id(p_tenant) WHERE tenant_id=p_tenant AND id=d.id RETURNING * INTO d;END IF;
 result:=result||jsonb_build_object('draft_revision',d.revision);
 INSERT INTO dqa_private.preapproval_number_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result,p_request);RETURN result;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.save_preapproval_sample_number(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_code text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT dqa_business.save_preapproval_sample_number(p_tenant,p_operation,p_request,p_document,p_request_revision,p_revision,p_code,NULL) $$;
REVOKE ALL ON FUNCTION dqa_business.save_preapproval_sample_number(uuid,uuid,uuid,uuid,bigint,integer,text,bigint) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION dqa_business.save_preapproval_sample_number(uuid,uuid,uuid,uuid,bigint,integer,text,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION dqa_business.prepare_schedule_draft(p_tenant uuid, p_operation uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE op dqa_private.schedule_draft_operations;fp text;
BEGIN
 IF p_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,(p_command->>'request_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-draft-operations:'||p_tenant,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');SELECT * INTO op FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_OPERATION_CONFLICT';END IF;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.requests q WHERE q.tenant_id=p_tenant AND q.id=(p_command->>'request_id')::uuid AND dqa_private.preapproval_document(p_tenant,q.request_document_version_id)) AND coalesce(p_command->'data'->>'sample_code','')<>'' THEN RAISE EXCEPTION 'PREAPPROVAL_NUMBER_AFTER_PLAN';END IF;
 PERFORM dqa_private.schedule_draft_plan(p_tenant,p_command);
 IF (SELECT count(*) FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.schedule_draft_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.execute_schedule_draft(p_tenant uuid, p_operation uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE op dqa_private.schedule_draft_operations;plan jsonb;req dqa_business.requests;draft dqa_business.schedule_drafts;outcome jsonb;
BEGIN
 IF NOT dqa_private.preapproval_can_plan(p_tenant,(p_command->>'request_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_OPERATION_CONFLICT';END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
 IF op.state='EXPIRED' OR op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_OPERATION_EXPIRED';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.requests q WHERE q.tenant_id=p_tenant AND q.id=(p_command->>'request_id')::uuid AND dqa_private.preapproval_document(p_tenant,q.request_document_version_id)) AND coalesce(p_command->'data'->>'sample_code','')<>'' THEN RAISE EXCEPTION 'PREAPPROVAL_NUMBER_AFTER_PLAN';END IF;
 plan:=dqa_private.schedule_draft_plan(p_tenant,p_command);SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 INSERT INTO dqa_business.schedule_drafts(tenant_id,request_id,request_revision,document_version_id,plan,actor_member_id) VALUES(p_tenant,req.id,req.revision,req.request_document_version_id,plan,dqa_private.member_id(p_tenant)) ON CONFLICT(tenant_id,request_id) DO UPDATE SET request_revision=EXCLUDED.request_revision,document_version_id=EXCLUDED.document_version_id,plan=EXCLUDED.plan,actor_member_id=EXCLUDED.actor_member_id RETURNING * INTO draft;
 outcome:=jsonb_build_object('state','SAVED','operation_id',p_operation,'draft_id',draft.id,'request_id',req.id,'revision',draft.revision,'reserved',false,'scope','DRAFT_ONLY');UPDATE dqa_private.schedule_draft_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.prepare_human_operation(p_tenant uuid, p_operation uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE fp text;op dqa_private.human_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id')) OR coalesce(p_command->>'action','') NOT IN('BOOK','CANCEL_REQUEST','CANCEL_REJECT','PREPARE','RECEIVE','START','COMPLETE','STOP','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE') OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR EXISTS(SELECT 1 FROM unnest(ARRAY['expected_schedule_revision','expected_report_revision','expected_draft_revision']) k WHERE coalesce(p_command->>k,'')!~'^(0|[1-9][0-9]{0,14})$') OR jsonb_typeof(p_command->'signature_data') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'comment') IS DISTINCT FROM 'string' OR length(p_command->>'comment')>2000 THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 IF p_command->>'action' IN('REPORT_RETURN','CONFIRM_ARCHIVE') AND p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 IF p_command->>'action'='PREPARE' AND p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 PERFORM dqa_private.validate_original_fields(NULL,p_command->>'signature_data');
 IF NOT dqa_private.can_read_request(p_tenant,(p_command->>'request_id')::uuid) OR NOT dqa_private.case_row_active(p_tenant,'requests',(p_command->>'request_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF p_command->>'action'='STOP' THEN
  IF NOT dqa_private.can_stop_scheduled_trial(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_STOP_DENIED';END IF;
  IF p_command->>'signature_data'<>'' OR p_command->'upload_id' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-operations:'||p_tenant,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');SELECT * INTO op FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'HUMAN_OPERATION_CONFLICT';END IF;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);END IF;
 IF (SELECT count(*) FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION 'HUMAN_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.human_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.execute_human_operation(p_tenant uuid, p_operation uuid, p_command jsonb, p_attestation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE op dqa_private.human_operations;q dqa_business.requests;s dqa_business.schedules;r dqa_business.reports;d dqa_business.schedule_drafts;u dqa_private.report_upload_intents;
 actor uuid;actor_role dqa_business.roles;action text:=p_command->>'action';old_q text;old_s text;old_r text;next_q text;plan jsonb;data jsonb;allocation jsonb;event_id uuid:=gen_random_uuid();new_id uuid:=gen_random_uuid();artifact_id uuid:=gen_random_uuid();artifact_version_id uuid:=gen_random_uuid();version_id uuid:=gen_random_uuid();stage text;decision text;manager_return boolean;proof text;outcome jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'HUMAN_OPERATION_CONFLICT';END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
 IF op.state<>'PLANNED' OR op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'HUMAN_OPERATION_EXPIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR NOT dqa_private.can_read_request(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF q.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 actor:=dqa_private.member_id(p_tenant);SELECT role.* INTO actor_role FROM dqa_business.roles role JOIN dqa_business.memberships m ON m.tenant_id=role.tenant_id AND m.role_id=role.id WHERE m.tenant_id=p_tenant AND m.id=actor;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=q.id AND status NOT IN('DRAFT','CANCELLED') FOR UPDATE;
 SELECT * INTO r FROM dqa_business.reports WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
 IF coalesce(s.revision,0)<>(p_command->>'expected_schedule_revision')::bigint OR coalesce(r.revision,0)<>(p_command->>'expected_report_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 old_q:=q.status;old_s:=s.status;old_r:=r.status;next_q:=q.status;
 IF action='BOOK' THEN
  IF NOT dqa_private.can(p_tenant,'schedules.book') OR NOT ('lms'=ANY(actor_role.systems) AND 'schedule'=ANY(actor_role.pages)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
  IF q.status<>'AWAITING_SCHEDULING' OR s.id IS NOT NULL THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
  SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
  IF NOT FOUND OR d.revision<>(p_command->>'expected_draft_revision')::bigint OR d.request_revision<>q.revision OR d.document_version_id<>q.request_document_version_id THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF (SELECT revision FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id)<>(d.plan->>'trial_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  SELECT jsonb_agg(v->'equipment_id') INTO data FROM jsonb_array_elements(d.plan->'allocations') v;
  plan:=dqa_private.schedule_draft_plan(p_tenant,jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',d.revision,'data',jsonb_build_object('sample_space_units',coalesce(d.plan->'sample_space_units',to_jsonb(q.sample_space_units)),'equipment_ids',data,'equipment_revisions',d.plan->'equipment_revisions','executor_id',d.plan->'executor_id','executor_revision',d.plan->'executor_revision','start_date',d.plan->'start_date','end_date',d.plan->'end_date','sample_code',d.plan->'sample_code','note',d.plan->'note','preparation_minutes',d.plan->'preparation_minutes','cleanup_minutes',d.plan->'cleanup_minutes')));
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',new_id,NULL,'AWAITING_RECEIPT');
  INSERT INTO dqa_business.schedules(id,tenant_id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,draft_id,plan,sample_code,reserve_from,reserve_until)
  VALUES(new_id,p_tenant,'SCH-'||q.legacy_id,q.id,(plan->>'executor_id')::uuid,(plan->>'starts_at')::timestamptz,(plan->>'ends_at')::timestamptz,(plan->>'preparation_minutes')::integer,(plan->>'cleanup_minutes')::integer,'AWAITING_RECEIPT',d.id,plan,plan->>'sample_code',(plan->>'reserve_from')::timestamptz,(plan->>'reserve_until')::timestamptz) RETURNING * INTO s;
  IF q.execution_kind='REAL' THEN FOR allocation IN SELECT v FROM jsonb_array_elements(plan->'allocations') v LOOP
   INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,s.id,(allocation->>'equipment_id')::uuid,s.reserve_from,s.reserve_until,(allocation->>'space_units')::integer,(allocation->>'quantity')::integer);
  END LOOP;END IF;next_q:='AWAITING_LAB_RECEIPT';
 ELSIF action IN('CANCEL_REQUEST','CANCEL_REJECT') THEN
  IF q.status<>'AWAITING_LAB_RECEIPT' OR s.status<>'AWAITING_RECEIPT' OR s.received_at IS NOT NULL OR length(btrim(p_command->>'comment'))=0 OR p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
  IF action='CANCEL_REQUEST' THEN
   IF NOT dqa_private.can(p_tenant,'lab.execute') OR s.executor_member_id IS DISTINCT FROM actor OR NOT('lab'=ANY(actor_role.systems) AND 'requests'=ANY(actor_role.pages)) THEN RAISE EXCEPTION 'HUMAN_EXECUTOR_REQUIRED';END IF;
   IF EXISTS(SELECT 1 FROM dqa_business.lab_operations o WHERE o.tenant_id=p_tenant AND o.request_id=q.id AND o.action='CANCEL' AND o.status='PENDING_APPROVAL') THEN RAISE EXCEPTION 'HUMAN_CANCELLATION_PENDING';END IF;
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',new_id,NULL,'PENDING_APPROVAL');INSERT INTO dqa_business.lab_operations(id,tenant_id,request_id,actor_member_id,action,reason,status) VALUES(new_id,p_tenant,q.id,actor,'CANCEL',p_command->>'comment','PENDING_APPROVAL');stage:='LAB_CANCEL_REQUEST';
  ELSE
   IF NOT EXISTS(SELECT 1 FROM dqa_business.lab_operations o WHERE o.tenant_id=p_tenant AND o.request_id=q.id AND o.action='CANCEL' AND o.status='PENDING_APPROVAL') THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
   IF NOT dqa_private.can_stop_scheduled_trial(p_tenant) THEN RAISE EXCEPTION 'HUMAN_STOP_DENIED';END IF;
   FOR data IN SELECT to_jsonb(o) FROM dqa_business.lab_operations o WHERE o.tenant_id=p_tenant AND o.request_id=q.id AND o.action='CANCEL' AND o.status='PENDING_APPROVAL' FOR UPDATE LOOP
    PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',(data->>'id')::uuid,'PENDING_APPROVAL','REJECTED');UPDATE dqa_business.lab_operations SET status='REJECTED' WHERE tenant_id=p_tenant AND id=(data->>'id')::uuid;END LOOP;
   stage:='LAB_CANCEL_REJECT';
  END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,s.status);UPDATE dqa_business.schedules z SET plan=z.plan WHERE z.id=s.id RETURNING z.* INTO s;decision:='NOTE';
 ELSIF action='STOP' THEN
  IF NOT dqa_private.can_stop_scheduled_trial(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_STOP_DENIED';END IF;
  IF p_command->>'signature_data'<>'' OR p_command->'upload_id' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
  IF q.status NOT IN('AWAITING_LAB_RECEIPT','RUNNING') OR s.id IS NULL OR s.status NOT IN('AWAITING_RECEIPT','BOOKED','RUNNING','PAUSED') OR r.id IS NOT NULL THEN RAISE EXCEPTION 'HUMAN_STOP_STATE_INVALID';END IF;
  -- Capture existing draft revision as well; a stop never rewrites planning inputs.
  SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
  IF coalesce(d.revision,0)<>(p_command->>'expected_draft_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  FOR data IN SELECT to_jsonb(z) FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.request_id=q.id AND z.status NOT IN('COMPLETED','CANCELLED') ORDER BY z.id FOR UPDATE OF z LOOP
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',(data->>'id')::uuid,data->>'status','CANCELLED');
   UPDATE dqa_business.schedules z SET status='CANCELLED',plan=coalesce(z.plan,'{}'::jsonb)||jsonb_build_object('stopped_at',clock_timestamp(),'stopped_by_member_id',actor,'stop_reason',coalesce(nullif(btrim(p_command->>'comment'),''),'主管確認中止排程並取消委託')) WHERE z.tenant_id=p_tenant AND z.id=(data->>'id')::uuid;
  END LOOP;
  SELECT * INTO s FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.id=s.id;
  IF q.execution_kind='REAL' THEN
   UPDATE dqa_business.schedule_equipment a SET released_at=clock_timestamp() WHERE a.tenant_id=p_tenant AND a.schedule_id IN(SELECT z.id FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.request_id=q.id AND z.status='CANCELLED') AND a.released_at IS NULL;
   UPDATE dqa_business.equipment e SET operational_status='IDLE' WHERE e.tenant_id=p_tenant AND e.operational_status IN('IN_USE','PAUSED')
    AND e.id IN(SELECT a.equipment_id FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND z.request_id=q.id AND z.status='CANCELLED')
    AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND a.equipment_id=e.id AND a.released_at IS NULL AND z.status IN('RUNNING','PAUSED'));
  END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',new_id,NULL,'APPROVED');
  INSERT INTO dqa_business.lab_operations(id,tenant_id,request_id,actor_member_id,action,reason,status) VALUES(new_id,p_tenant,q.id,actor,CASE WHEN old_s IN('RUNNING','PAUSED') THEN 'INTERRUPT' ELSE 'CANCEL' END,coalesce(nullif(btrim(p_command->>'comment'),''),'主管確認中止排程並取消委託'),'APPROVED');
  FOR data IN SELECT to_jsonb(o) FROM dqa_business.lab_operations o WHERE o.tenant_id=p_tenant AND o.request_id=q.id AND o.action='CANCEL' AND o.status='PENDING_APPROVAL' FOR UPDATE LOOP
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',(data->>'id')::uuid,'PENDING_APPROVAL','APPROVED');UPDATE dqa_business.lab_operations SET status='APPROVED' WHERE tenant_id=p_tenant AND id=(data->>'id')::uuid;END LOOP;
  stage:='LAB_STOP';decision:='NOTE';next_q:='CANCELLED';
 ELSIF action IN('PREPARE','RECEIVE','START','COMPLETE') THEN
  IF q.execution_kind='VIRTUAL' AND action NOT IN('PREPARE','RECEIVE') THEN RAISE EXCEPTION 'VIRTUAL_ACCELERATOR_REQUIRED';END IF;
  IF NOT dqa_private.can(p_tenant,'lab.execute') OR NOT('lab'=ANY(actor_role.systems) AND 'requests'=ANY(actor_role.pages)) OR s.executor_member_id IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_EXECUTOR_REQUIRED';END IF;
  IF action IN('PREPARE','RECEIVE') AND EXISTS(SELECT 1 FROM dqa_business.lab_operations o WHERE o.tenant_id=p_tenant AND o.request_id=q.id AND o.action='CANCEL' AND o.status='PENDING_APPROVAL') THEN RAISE EXCEPTION 'HUMAN_CANCELLATION_PENDING';END IF;
  IF action='PREPARE' THEN
   IF NOT dqa_private.preflight_required(p_tenant,q.request_document_version_id) OR s.status<>'AWAITING_RECEIPT' OR q.status<>'AWAITING_LAB_RECEIPT' OR (q.execution_kind='REAL' AND clock_timestamp()>=s.starts_at) OR p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,s.status);UPDATE dqa_business.schedules z SET plan=z.plan WHERE z.id=s.id RETURNING z.* INTO s;stage:='LAB_PREPARE';decision:='APPROVE';
  ELSIF action='RECEIVE' THEN
   IF s.status<>'AWAITING_RECEIPT' OR q.status<>'AWAITING_LAB_RECEIPT' OR (q.execution_kind='REAL' AND clock_timestamp()>=s.ends_at) THEN RAISE EXCEPTION 'HUMAN_RECEIPT_WINDOW';END IF;
   IF length(p_command->>'signature_data')=0 THEN RAISE EXCEPTION 'WORKFLOW_SIGNATURE_REQUIRED';END IF;
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,'BOOKED');UPDATE dqa_business.schedules SET status='BOOKED',received_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;stage:='LAB_RECEIVE';decision:='APPROVE';
  ELSIF action='START' THEN
   IF s.status<>'BOOKED' OR s.received_at IS NULL OR q.status<>'AWAITING_LAB_RECEIPT' THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
   IF clock_timestamp()<s.starts_at OR clock_timestamp()>=s.ends_at THEN RAISE EXCEPTION 'HUMAN_START_WINDOW';END IF;
   IF EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.equipment e ON e.tenant_id=a.tenant_id AND e.id=a.equipment_id WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND e.operational_status<>'IDLE') THEN RAISE EXCEPTION 'HUMAN_EQUIPMENT_UNAVAILABLE';END IF;
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,'RUNNING');UPDATE dqa_business.schedules SET status='RUNNING',started_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;
   UPDATE dqa_business.equipment SET operational_status='IN_USE' WHERE tenant_id=p_tenant AND id IN(SELECT equipment_id FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id);next_q:='RUNNING';
  ELSE
   IF s.status<>'RUNNING' OR q.status<>'RUNNING' OR s.started_at IS NULL THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
   IF clock_timestamp()<s.ends_at THEN RAISE EXCEPTION 'HUMAN_COMPLETION_TOO_EARLY';END IF;
   IF length(btrim(p_command->>'comment'))=0 THEN RAISE EXCEPTION 'HUMAN_RESULT_REQUIRED';END IF;IF length(p_command->>'signature_data')=0 THEN RAISE EXCEPTION 'WORKFLOW_SIGNATURE_REQUIRED';END IF;stage:='LAB_COMPLETE';decision:='APPROVE';
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,'COMPLETED');UPDATE dqa_business.schedules SET status='COMPLETED',completed_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;
   UPDATE dqa_business.schedule_equipment SET released_at=clock_timestamp() WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL;
   UPDATE dqa_business.equipment e SET operational_status='IDLE' WHERE e.tenant_id=p_tenant AND e.operational_status='IN_USE' AND e.id IN(SELECT equipment_id FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id) AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND a.equipment_id=e.id AND a.released_at IS NULL AND z.status='RUNNING');next_q:='COMPLETED';
  END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',new_id,NULL,'APPROVED');INSERT INTO dqa_business.lab_operations(id,tenant_id,request_id,actor_member_id,action,reason,status) VALUES(new_id,p_tenant,q.id,actor,action,p_command->>'comment','APPROVED');
 ELSIF action IN('REPORT_SUBMIT','CONFIRM_ARCHIVE') THEN
  SELECT * INTO u FROM dqa_private.report_upload_intents WHERE tenant_id=p_tenant AND id=(p_command->>'upload_id')::uuid AND request_id=q.id AND actor_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR u.consumed_at IS NOT NULL OR u.expires_at<=clock_timestamp() OR u.request_revision<>q.revision OR u.report_revision<>coalesce(r.revision,0) THEN RAISE EXCEPTION 'HUMAN_UPLOAD_STALE';END IF;
  SELECT encode(extensions.hmac(convert_to(u.id::text||':'||u.sha256||':'||u.byte_size::text||':'||u.mime_type,'UTF8'),report_key,'sha256'),'hex') INTO proof FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant;
  IF proof IS NULL OR p_attestation IS DISTINCT FROM proof THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_FILE_VERIFICATION_REQUIRED';END IF;
  IF action='REPORT_SUBMIT' THEN
   IF u.kind<>'REPORT' OR NOT dqa_private.can(p_tenant,'reports.submit') OR NOT('lab'=ANY(actor_role.systems)) OR s.executor_member_id IS DISTINCT FROM actor OR q.status NOT IN('COMPLETED','AWAITING_REPORT_REVIEW') OR (r.id IS NOT NULL AND r.status<>'RETURNED') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
   IF length(p_command->>'signature_data')=0 THEN RAISE EXCEPTION 'WORKFLOW_SIGNATURE_REQUIRED';END IF;
   IF r.id IS NULL THEN INSERT INTO dqa_business.reports(tenant_id,request_id) VALUES(p_tenant,q.id) RETURNING * INTO r;END IF;
  ELSE
   IF r.id IS NULL OR r.current_version_id IS NULL OR u.kind<>'ARCHIVE' OR NOT dqa_private.can(p_tenant,'reports.confirm') OR actor IS DISTINCT FROM q.supervisor_member_id OR r.status IS DISTINCT FROM 'AWAITING_VIEW' OR u.report_version_id IS DISTINCT FROM r.current_version_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
  END IF;
  INSERT INTO dqa_business.artifacts(id,tenant_id,legacy_id,kind,name,request_id,trial_id,owner_member_id) VALUES(artifact_id,p_tenant,'REPORT-'||u.id,'REPORT',u.file_name,q.id,q.trial_id,actor);
  INSERT INTO dqa_business.artifact_versions(id,tenant_id,artifact_id,version,storage_bucket,object_key,sha256,byte_size,mime_type,created_by_member_id) VALUES(artifact_version_id,p_tenant,artifact_id,1,'dqa-business-reports',u.object_key,u.sha256,u.byte_size,u.mime_type,actor);
  IF action='REPORT_SUBMIT' THEN
   INSERT INTO dqa_business.report_versions(id,tenant_id,report_id,request_id,version,artifact_id,artifact_version_id,created_by_member_id) VALUES(version_id,p_tenant,r.id,q.id,coalesce((SELECT max(version)+1 FROM dqa_business.report_versions WHERE tenant_id=p_tenant AND report_id=r.id),1),artifact_id,artifact_version_id,actor);
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'reports',r.id,r.status,'SUBMITTED');UPDATE dqa_business.reports SET status='SUBMITTED',current_version_id=version_id,return_reason=NULL WHERE id=r.id RETURNING * INTO r;stage:='REPORT_SUBMIT';decision:='SUBMIT';next_q:='AWAITING_REPORT_REVIEW';
  ELSE
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'reports',r.id,r.status,'ARCHIVED');UPDATE dqa_business.reports SET status='ARCHIVED',archived_artifact_version_id=artifact_version_id,confirmed_at=clock_timestamp(),confirmed_by=actor WHERE id=r.id RETURNING * INTO r;stage:='REPORT_VIEW';decision:='VIEW';next_q:='CLOSED';
  END IF;UPDATE dqa_private.report_upload_intents SET consumed_at=clock_timestamp() WHERE id=u.id;
 ELSIF action IN('REPORT_APPROVE','REPORT_RETURN') THEN
  IF r.id IS NULL OR r.current_version_id IS NULL OR r.status NOT IN('SUBMITTED','REVIEW_L3','AWAITING_VIEW') THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
  manager_return:=coalesce(action='REPORT_RETURN' AND r.status='AWAITING_VIEW' AND actor=q.supervisor_member_id AND dqa_private.can(p_tenant,'reports.confirm'),false);
  IF NOT manager_return AND ( NOT dqa_private.can(p_tenant,'reports.review') OR NOT('lms'=ANY(actor_role.systems)) OR actor_role.review_level<>(CASE WHEN r.status='SUBMITTED' THEN 2 WHEN r.status='REVIEW_L3' THEN 3 ELSE -1 END) OR actor IN(q.owner_member_id,q.supervisor_member_id) OR actor=(SELECT created_by_member_id FROM dqa_business.report_versions WHERE id=r.current_version_id) ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_REPORT_REVIEW_DENIED';END IF;
  IF NOT manager_return AND EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE e.tenant_id=p_tenant AND e.request_id=q.id AND e.actor_member_id=actor AND e.stage IN('LMS_1','LMS_2','REPORT_L2','REPORT_L3') AND e.stage<>ALL(ARRAY['LMS_'||actor_role.review_level,'REPORT_L'||actor_role.review_level]) AND e.decision IN('APPROVE','RETURN')) THEN RAISE EXCEPTION 'HUMAN_REPORT_LEVEL_CONFLICT';END IF;
  stage:=CASE WHEN manager_return THEN 'REPORT_VIEW_RETURN' ELSE 'REPORT_L'||actor_role.review_level END;decision:=CASE WHEN action='REPORT_RETURN' THEN 'RETURN' ELSE 'APPROVE' END;
  IF action='REPORT_RETURN' THEN IF length(btrim(p_command->>'comment'))=0 THEN RAISE EXCEPTION 'HUMAN_RETURN_REASON_REQUIRED';END IF;old_r:='RETURNED';
  ELSE IF length(p_command->>'signature_data')=0 THEN RAISE EXCEPTION 'WORKFLOW_SIGNATURE_REQUIRED';END IF;old_r:=CASE WHEN actor_role.review_level=2 THEN 'REVIEW_L3' ELSE 'AWAITING_VIEW' END;END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'reports',r.id,r.status,old_r);UPDATE dqa_business.reports SET status=old_r,return_reason=CASE WHEN action='REPORT_RETURN' THEN p_command->>'comment' ELSE NULL END WHERE id=r.id RETURNING * INTO r;next_q:=CASE WHEN r.status='AWAITING_VIEW' THEN 'AWAITING_VIEW_CONFIRMATION' WHEN r.status='RETURNED' THEN 'COMPLETED' ELSE 'AWAITING_REPORT_REVIEW' END;
 ELSE RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 IF stage IS NOT NULL THEN
  INSERT INTO dqa_private.human_permits(tenant_id,operation_id,transaction_id,actor_id,table_name,record_id,event_id,document_version_id,report_version_id,stage,decision) VALUES(p_tenant,p_operation,txid_current(),auth.uid(),'approval_events',event_id,event_id,CASE WHEN stage LIKE 'LAB_%' THEN q.request_document_version_id ELSE NULL END,CASE WHEN stage NOT LIKE 'LAB_%' THEN r.current_version_id ELSE NULL END,stage,decision);
  INSERT INTO dqa_business.approval_events(id,tenant_id,request_id,report_version_id,actor_member_id,stage,decision,comment,request_document_version_id,operation_id,actor_label) VALUES(event_id,p_tenant,q.id,CASE WHEN stage NOT LIKE 'LAB_%' THEN r.current_version_id ELSE NULL END,actor,stage,decision,p_command->>'comment',CASE WHEN stage LIKE 'LAB_%' THEN q.request_document_version_id ELSE NULL END,p_operation,(SELECT display_name FROM dqa_business.memberships WHERE id=actor));
  IF length(p_command->>'signature_data')>0 THEN
   IF stage LIKE 'LAB_%' THEN INSERT INTO dqa_business.request_signatures(tenant_id,request_id,document_version_id,approval_event_id,actor_member_id,signature_data,signature_sha256) VALUES(p_tenant,q.id,q.request_document_version_id,event_id,actor,p_command->>'signature_data',encode(sha256(decode(split_part(p_command->>'signature_data',',',2),'base64')),'hex'));
   ELSE INSERT INTO dqa_business.report_signatures(tenant_id,request_id,report_version_id,approval_event_id,actor_member_id,signature_data,signature_sha256) VALUES(p_tenant,q.id,r.current_version_id,event_id,actor,p_command->>'signature_data',encode(sha256(decode(split_part(p_command->>'signature_data',',',2),'base64')),'hex'));END IF;
  END IF;
 END IF;
 IF next_q<>q.status THEN PERFORM dqa_private.human_permit(p_tenant,p_operation,'requests',q.id,q.status,next_q);UPDATE dqa_business.requests SET status=next_q WHERE id=q.id RETURNING * INTO q;END IF;
 DELETE FROM dqa_private.human_permits WHERE tenant_id=p_tenant AND operation_id=p_operation AND transaction_id=txid_current();
 outcome:=jsonb_build_object('state','SAVED','request_id',q.id,'request_revision',q.revision,'request_status',q.status,'schedule_revision',coalesce(s.revision,0),'report_revision',coalesce(r.revision,0),'action',action);
 UPDATE dqa_private.human_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
EXCEPTION WHEN exclusion_violation OR unique_violation THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='HUMAN_RESERVATION_CONFLICT';END $$;
CREATE FUNCTION dqa_private.virtual_preflight_ready(p_tenant uuid,p_request uuid,p_schedule uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(s.received_at IS NOT NULL AND s.status IN('BOOKED','RUNNING','COMPLETED') AND (NOT dqa_private.preflight_required(p_tenant,q.request_document_version_id) OR (coalesce(dqa_private.preparation_ready(p_tenant,q.id,s.id),false) AND EXISTS(SELECT 1 FROM dqa_private.request_template_stage_entries t JOIN dqa_business.approval_events e ON e.tenant_id=t.tenant_id AND e.id=t.event_id JOIN dqa_business.request_signatures x ON x.tenant_id=e.tenant_id AND x.approval_event_id=e.id WHERE t.tenant_id=p_tenant AND t.document_id=q.request_document_version_id AND t.schedule_id=s.id AND t.stage='LAB_RECEIVE' AND t.fields->>'executionAbnormal'='no' AND e.actor_member_id=s.executor_member_id))),false) FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.tenant_id=q.tenant_id AND s.request_id=q.id WHERE q.tenant_id=p_tenant AND q.id=p_request AND s.id=p_schedule
$$;REVOKE ALL ON FUNCTION dqa_private.virtual_preflight_ready(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION dqa_business.flow_test_run(p_tenant uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE q dqa_business.requests;s dqa_business.schedules;source jsonb;events jsonb;fp text;duration_seconds numeric;
BEGIN
 IF NOT dqa_private.virtual_trial_authorized(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 IF q.execution_kind<>'VIRTUAL' THEN RETURN dqa_business.historical_flow_test_run(p_tenant,p_request);END IF;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=p_request AND status NOT IN('DRAFT','CANCELLED');
 IF dqa_private.preflight_required(p_tenant,(SELECT request_document_version_id FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request)) AND NOT coalesce(dqa_private.virtual_preflight_ready(p_tenant,p_request,s.id),false) THEN RAISE EXCEPTION 'FLOW_TEST_PREFLIGHT_REQUIRED';END IF;
 IF s.id IS NULL OR s.execution_kind<>'VIRTUAL' OR s.received_at IS NULL OR NOT dqa_private.case_row_active(p_tenant,'schedules',s.id)
 OR s.ends_at<=s.starts_at OR jsonb_typeof(s.plan->'hours_per_batch') IS DISTINCT FROM 'number' OR (s.plan->>'hours_per_batch')::numeric<=0 THEN RAISE EXCEPTION 'FLOW_TEST_RECEIPT_REQUIRED';END IF;
 source:=jsonb_build_object('request_id',q.id,'legacy_id',q.legacy_id,'execution_kind',q.execution_kind,'request_revision',q.revision,'document_version_id',q.request_document_version_id,
 'trial_name',q.trial_snapshot->>'name','product_code',q.product_code,'quantity',q.quantity,'schedule_id',s.id,'schedule_revision',s.revision,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'nominal_hours',s.plan->'hours_per_batch','executor_id',s.executor_member_id,'sample_code',s.sample_code,'received_at',s.received_at);
 fp:=encode(sha256(convert_to(source::text,'UTF8')),'hex');duration_seconds:=extract(epoch FROM s.ends_at-s.starts_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object('action','ADVANCE','percent',e.percent,'virtual_at',e.virtual_at,'actual_at',e.created_at,'actor_member_id',e.actor_member_id) ORDER BY e.created_at,e.id),'[]') INTO events
 FROM dqa_private.virtual_trial_events e WHERE e.tenant_id=p_tenant AND e.schedule_id=s.id;
 RETURN jsonb_build_object('id',s.id,'purpose','FLOW_TEST','execution_kind','VIRTUAL','native_status',s.status,'source',source,'source_sha256',fp,'revision',s.revision,
 'percent',s.virtual_percent,'virtual_at',coalesce(s.virtual_at,s.starts_at),'scheduled_seconds',duration_seconds,'virtual_elapsed_seconds',duration_seconds*s.virtual_percent/100,
 'actual_started_at',s.started_at,'actual_completed_at',s.completed_at,'state',CASE s.virtual_percent WHEN 0 THEN 'READY' WHEN 50 THEN 'RUNNING' ELSE 'COMPLETED' END,'events',events);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.execute_flow_test(p_tenant uuid, p_operation uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE op dqa_private.flow_test_operations;q dqa_business.requests;s dqa_business.schedules;run jsonb;fp text;result jsonb;req uuid;actor uuid;next_status text;next_percent integer;at_time timestamptz:=clock_timestamp();operation_row uuid:=gen_random_uuid();
BEGIN
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['action','request_id','run_id','expected_revision','source_sha256','reason','confirmation'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','request_id','run_id','expected_revision','source_sha256','reason','confirmation'))
 OR coalesce(p_command->>'action','')<>'ADVANCE' OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR coalesce(p_command->>'run_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR coalesce(p_command->>'expected_revision','')!~'^[1-9][0-9]{0,14}$'
 OR coalesce(p_command->>'source_sha256','')!~'^[a-f0-9]{64}$' OR p_command->>'reason' IS DISTINCT FROM '' OR p_command->>'confirmation' IS DISTINCT FROM '' THEN RAISE EXCEPTION 'FLOW_TEST_FIELDS_INVALID';END IF;
 req:=(p_command->>'request_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF NOT dqa_private.virtual_trial_authorized(p_tenant,req) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=req FOR UPDATE;
 IF q.execution_kind<>'VIRTUAL' THEN RAISE EXCEPTION 'VIRTUAL_TRIAL_REQUIRED';END IF;
 fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'FLOW_TEST_OPERATION_CONFLICT';END IF;
  RETURN op.result||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(*) FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>at_time-interval '10 minutes')>=100 THEN RAISE EXCEPTION 'FLOW_TEST_RATE_LIMITED';END IF;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=req AND status NOT IN('DRAFT','CANCELLED') FOR UPDATE;
 run:=dqa_business.flow_test_run(p_tenant,req);
 IF dqa_private.preflight_required(p_tenant,(SELECT request_document_version_id FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=req)) AND NOT coalesce(dqa_private.virtual_preflight_ready(p_tenant,req,s.id),false) THEN RAISE EXCEPTION 'FLOW_TEST_PREFLIGHT_REQUIRED';END IF;
 IF run IS NULL OR s.execution_kind<>'VIRTUAL' OR s.received_at IS NULL THEN RAISE EXCEPTION 'FLOW_TEST_RECEIPT_REQUIRED';END IF;
 IF s.id<>(p_command->>'run_id')::uuid OR run->>'source_sha256'<>p_command->>'source_sha256' OR s.revision<>(p_command->>'expected_revision')::bigint THEN RAISE EXCEPTION 'FLOW_TEST_SOURCE_CHANGED';END IF;
 IF s.virtual_percent>=100 THEN RAISE EXCEPTION 'FLOW_TEST_COMPLETED';END IF;
 IF NOT ((s.virtual_percent=0 AND s.status='BOOKED' AND q.status='AWAITING_LAB_RECEIPT') OR (s.virtual_percent=50 AND s.status='RUNNING' AND q.status='RUNNING')) THEN RAISE EXCEPTION 'HUMAN_STATE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id) THEN RAISE EXCEPTION 'HUMAN_RESERVATION_CONFLICT';END IF;
 actor:=dqa_private.member_id(p_tenant);next_percent:=s.virtual_percent+50;next_status:=CASE next_percent WHEN 50 THEN 'RUNNING' ELSE 'COMPLETED' END;
 INSERT INTO dqa_private.virtual_permits VALUES(p_tenant,req,txid_current(),auth.uid(),'ADVANCE');
 PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,next_status);
 PERFORM dqa_private.human_permit(p_tenant,p_operation,'requests',q.id,q.status,next_status);
 PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',operation_row,NULL,'APPROVED');
 UPDATE dqa_business.schedules SET status=next_status,virtual_percent=next_percent,virtual_at=starts_at+(ends_at-starts_at)*next_percent/100,
 started_at=coalesce(started_at,at_time),completed_at=CASE next_percent WHEN 100 THEN at_time ELSE NULL END WHERE id=s.id RETURNING * INTO s;
 UPDATE dqa_business.requests SET status=next_status WHERE id=req;
 INSERT INTO dqa_business.lab_operations(id,tenant_id,request_id,actor_member_id,action,reason,status) VALUES(operation_row,p_tenant,req,actor,CASE next_percent WHEN 50 THEN 'START' ELSE 'COMPLETE' END,'虛擬委託流程測試；未執行實體試驗；模擬進度 '||next_percent||'%','APPROVED');
 INSERT INTO dqa_private.virtual_trial_events(tenant_id,request_id,schedule_id,operation_id,actor_member_id,percent,virtual_at) VALUES(p_tenant,req,s.id,p_operation,actor,next_percent,s.virtual_at);
 DELETE FROM dqa_private.human_permits WHERE tenant_id=p_tenant AND operation_id=p_operation AND transaction_id=txid_current();
 DELETE FROM dqa_private.virtual_permits WHERE tenant_id=p_tenant AND request_id=req AND transaction_id=txid_current();
 result:=jsonb_build_object('state','SAVED','operation_id',p_operation,'request_id',req,'native_workflow',true,'run',dqa_business.flow_test_run(p_tenant,req));
 INSERT INTO dqa_private.flow_test_operations VALUES(p_tenant,p_operation,auth.uid(),fp,req,result,at_time);
 RETURN result;
END $$;