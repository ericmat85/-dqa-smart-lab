-- Authoritative, day-based scheduling. Nominal work hours and execution segments are preserved.
-- Every batch occupies whole days; preview, E2, save and booking use the same calculation.
-- All planner permissions, request/resource revisions, capacity, calendars and conflict checks are retained.
CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan(p_tenant uuid,p_command jsonb,p_check_end boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE req dqa_business.requests;draft dqa_business.schedule_drafts;actor_role dqa_business.roles;executor dqa_business.memberships;machine dqa_business.equipment;trial dqa_business.trial_definitions;
 rules jsonb:='{"HIGH_HUMIDITY":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":true,"hours":250},"THERMAL_SHOCK":{"equipment_pattern":"冷熱衝擊","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"VIBRATION_DURABILITY":{"equipment_pattern":"振動","calendar":"weekdays","mode":"serial","daily_hours":20,"fixed_duration":true,"hours":20},"HUMIDITY_CYCLE":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"THERMAL_CYCLE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"LOW_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"HIGH_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕|高溫爐","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"SALT_SPRAY":{"equipment_pattern":"鹽霧","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"WATER_INGRESS":{"equipment_pattern":"防水","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"ESD":{"equipment_pattern":"ESD","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.5},"WEATHERING":{"equipment_pattern":"耐候","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"DUST":{"equipment_pattern":"防塵","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":8},"TENSILE":{"equipment_pattern":"拉力","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSPECTION":{"equipment_pattern":"顯微鏡","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.25},"MECHANICAL_SHOCK":{"equipment_pattern":"機械衝擊","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"DROP":{"equipment_pattern":"跌落","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSERTION":{"equipment_pattern":"插拔","calendar":"continuous","mode":"serial","daily_hours":24,"fixed_duration":false,"hours":20},"VOLTAGE":{"equipment_pattern":"電源|電壓","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"EMC":{"equipment_pattern":"EMC|電磁相容","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":2}}';rule jsonb;data jsonb;ids uuid[];item jsonb;execution jsonb:='[]';allocations jsonb:='[]';equipment_versions jsonb:='{}';hours numeric;explicit_hours numeric;matches text[];explicit_values numeric[];
 start_date date;end_date date;cursor_date date;starts timestamptz;ends timestamptz;begin_at timestamptz;end_at timestamptz;execution_ends timestamptz;scheduling_days integer;plan_reserve_from timestamptz;plan_reserve_until timestamptz;prep integer;cleanup integer;
 units integer;remaining integer;assigned integer;capacity integer;slot_capacity integer;left_count integer;day_hours numeric;used numeric;batch_quantity integer;i integer;offset_days integer;expected_draft bigint;actor_member uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,'schedules.plan') OR NOT dqa_private.can(p_tenant,'requests.read_all') OR NOT dqa_private.can(p_tenant,'equipment.read') OR NOT dqa_private.can(p_tenant,'catalog.read') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 actor_member:=dqa_private.member_id(p_tenant);SELECT r.* INTO actor_role FROM dqa_business.roles r JOIN dqa_business.memberships m ON m.role_id=r.id AND m.tenant_id=r.tenant_id WHERE m.id=actor_member AND m.tenant_id=p_tenant;
 IF NOT ('lms'=ANY(actor_role.systems) AND 'schedule'=ANY(actor_role.pages)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 data:=p_command->'data';
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units')) OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(data->>'preparation_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'cleanup_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(data->>'end_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF jsonb_typeof(data->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(data->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 units:=(data->>'sample_space_units')::integer;IF units>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF jsonb_array_length(data->'equipment_ids') NOT BETWEEN 1 AND 4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'equipment_ids') v WHERE jsonb_typeof(v)<>'string' OR trim('"' FROM v::text)!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 SELECT array_agg(v::uuid ORDER BY n) INTO ids FROM jsonb_array_elements_text(data->'equipment_ids') WITH ORDINALITY x(v,n);
 IF cardinality(ids)<>(SELECT count(DISTINCT v) FROM unnest(ids) v) OR (SELECT count(*) FROM jsonb_object_keys(data->'equipment_revisions'))<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 prep:=(data->>'preparation_minutes')::integer;cleanup:=(data->>'cleanup_minutes')::integer;start_date:=(data->>'start_date')::date;end_date:=(data->>'end_date')::date;
 IF prep>1440 OR cleanup>1440 OR start_date<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR start_date>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date+366 OR end_date<start_date OR end_date>start_date+366 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT dqa_private.can_read_request(p_tenant,req.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',req.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 IF req.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF req.status<>'AWAITING_SCHEDULING' OR req.request_review_level<>2 OR req.request_document_version_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_APPROVAL_REQUIRED';END IF;
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
 remaining:=req.quantity;starts:=start_date::timestamp AT TIME ZONE 'Asia/Taipei';ends:=starts;execution_ends:=starts;i:=0;
 FOREACH actor_member IN ARRAY ids LOOP
  i:=i+1;SELECT * INTO machine FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=actor_member FOR SHARE;
  IF NOT FOUND OR machine.operational_status<>'IDLE' OR machine.name!~*(rule->>'equipment_pattern') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_EQUIPMENT_REQUIRED';END IF;
  IF coalesce(data->'equipment_revisions'->>machine.id::text,'')<>machine.revision::text THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  equipment_versions:=equipment_versions||jsonb_build_object(machine.id::text,machine.revision);capacity:=machine.space_units/units;left_count:=cardinality(ids)-i;
  IF capacity<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;
  IF rule->>'mode'='batch' THEN assigned:=least(capacity,remaining-left_count);ELSE assigned:=ceil(remaining::numeric/(left_count+1));END IF;
  IF assigned<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;remaining:=remaining-assigned;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',assigned,'space_units',(CASE WHEN trial.profile_code='VIBRATION_DURABILITY' THEN 1 ELSE least(assigned,capacity) END)*units));
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
 IF EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<plan_reserve_until AND plan_reserve_from<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.executor_member_id=executor.id AND s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND coalesce(s.reserve_from,s.starts_at-s.preparation_minutes*interval '1 minute')<plan_reserve_until AND plan_reserve_from<coalesce(s.reserve_until,s.ends_at+s.cleanup_minutes*interval '1 minute') AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN jsonb_build_object('scheduling_unit','DAY','scheduling_days',scheduling_days,'calendar_days',end_date-start_date+1,'execution_ends_at',execution_ends,'reserve_from',plan_reserve_from,'reserve_until',plan_reserve_until,'sample_space_units',units,'scope','DRAFT_ONLY','reserved',false,'physical_feasibility','NOT_ASSESSED','operating_conditions','HUMAN_REVIEW_REQUIRED','profile_id',trial.profile_code,'calendar',rule->>'calendar','hours_per_batch',hours,'trial_revision',trial.revision,'equipment_revisions',equipment_versions,'executor_id',executor.id,'executor_label',executor.display_name,'executor_revision',executor.revision,'start_date',start_date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'segments',execution,'allocations',allocations,'sample_code',btrim(data->>'sample_code'),'note',data->>'note','preparation_minutes',prep,'cleanup_minutes',cleanup);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';
END $$;
REVOKE ALL ON FUNCTION dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION dqa_private.schedule_draft_plan(p_tenant uuid,p_command jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT dqa_private.calculate_schedule_draft_plan(p_tenant,p_command,true)
$$;
CREATE FUNCTION dqa_business.preview_schedule_draft(p_tenant uuid,p_command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.calculate_schedule_draft_plan(p_tenant,p_command,false)
$$;
REVOKE ALL ON FUNCTION dqa_business.preview_schedule_draft(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.preview_schedule_draft(uuid,jsonb) TO authenticated;
-- Search dates describe allowed start dates; each finish date is calculated once by the same planner.
CREATE OR REPLACE FUNCTION dqa_business.business_ai_schedule_candidates(p_tenant uuid,p_request uuid,p_options jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;t dqa_business.trial_definitions;eq dqa_business.equipment;person record;d date;e date;first_day date;last_day date;ids uuid[];versions jsonb;command jsonb;plan jsonb;items jsonb:='[]';tries integer:=0;count_needed integer;draft_revision bigint;patterns jsonb:='{"HIGH_HUMIDITY":"恆溫恆濕|環境試驗箱","HIGH_TEMPERATURE":"環境試驗箱|恆溫恆濕|高溫爐","LOW_TEMPERATURE":"環境試驗箱|恆溫恆濕","THERMAL_CYCLE":"環境試驗箱|恆溫恆濕","HUMIDITY_CYCLE":"環境試驗箱|恆溫恆濕","THERMAL_SHOCK":"冷熱衝擊","VIBRATION_DURABILITY":"振動","SALT_SPRAY":"鹽霧","WATER_INGRESS":"防水","ESD":"ESD","EMC":"EMC|電磁相容","WEATHERING":"耐候","DUST":"防塵","TENSILE":"拉力","INSPECTION":"顯微鏡","MECHANICAL_SHOCK":"機械衝擊","DROP":"跌落","INSERTION":"插拔","VOLTAGE":"電源|電壓"}';
BEGIN
 IF NOT dqa_private.business_ai_authorized(p_tenant,'E2','lms') OR NOT dqa_private.can_read_request(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request AND dqa_private.case_row_active(p_tenant,'requests',id);
 IF NOT FOUND OR q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_APPROVAL_REQUIRED';END IF;
 IF jsonb_typeof(p_options) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_options) k WHERE k NOT IN('earliest','latest','equipment_count','sample_code','preparation_minutes','cleanup_minutes','preferred_equipment_ids','sample_space_units')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';END IF;
 IF jsonb_typeof(p_options->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(p_options->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF (p_options->>'sample_space_units')::integer>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 first_day:=coalesce(nullif(p_options->>'earliest','')::date,(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date+1);last_day:=coalesce(nullif(p_options->>'latest','')::date,first_day+13);count_needed:=coalesce((p_options->>'equipment_count')::integer,1);
 IF first_day<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR last_day<first_day OR last_day>first_day+31 OR count_needed NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id AND enabled;IF NOT FOUND OR NOT(patterns?t.profile_code) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SOURCE_INCOMPLETE';END IF;
 SELECT coalesce(max(revision),0) INTO draft_revision FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id;
 FOR d IN SELECT generate_series(first_day,last_day,interval '1 day')::date LOOP
  FOR eq IN SELECT * FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY x.id LOOP
   SELECT array_agg(z.id ORDER BY z.is_first DESC,z.id),jsonb_object_agg(z.id::text,z.revision) INTO ids,versions FROM (SELECT x.id,x.revision,(x.id=eq.id) is_first FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY (x.id=eq.id) DESC,x.id LIMIT count_needed) z;
   IF cardinality(ids)<>count_needed THEN CONTINUE;END IF;
   FOR person IN SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL ORDER BY m.id LIMIT 6 LOOP
     tries:=tries+1;IF tries>160 OR jsonb_array_length(items)>=4 THEN RETURN jsonb_build_object('candidates',items,'checks',tries-1,'complete',jsonb_array_length(items)>=4,'search_limited',tries>160);END IF;
     command:=jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',draft_revision,'data',jsonb_build_object('sample_space_units',p_options->'sample_space_units','equipment_ids',to_jsonb(ids),'equipment_revisions',versions,'executor_id',person.id,'executor_revision',person.revision,'start_date',d,'end_date',d,'sample_code',coalesce(nullif(btrim(p_options->>'sample_code'),''),'SMP-'||coalesce(q.legacy_id,q.id::text)),'note','','preparation_minutes',coalesce((p_options->>'preparation_minutes')::integer,0),'cleanup_minutes',coalesce((p_options->>'cleanup_minutes')::integer,0)));
     BEGIN plan:=dqa_private.calculate_schedule_draft_plan(p_tenant,command,false);command:=jsonb_set(command,'{data,end_date}',plan->'end_date');EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN CONTINUE;END;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) v WHERE v->'command'=command) THEN items:=items||jsonb_build_array(jsonb_build_object('id','C'||(jsonb_array_length(items)+1),'command',command,'plan',plan));END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('candidates',items,'checks',tries,'complete',true,'search_limited',false);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';
END $$;

-- Booking persists the exact whole-day occupancy already checked by the planner.
CREATE OR REPLACE FUNCTION dqa_business.execute_human_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_attestation text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  FOR allocation IN SELECT v FROM jsonb_array_elements(plan->'allocations') v LOOP
   INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,s.id,(allocation->>'equipment_id')::uuid,s.reserve_from,s.reserve_until,(allocation->>'space_units')::integer,(allocation->>'quantity')::integer);
  END LOOP;next_q:='AWAITING_LAB_RECEIPT';
 ELSIF action IN('RECEIVE','START','COMPLETE') THEN
  IF NOT dqa_private.can(p_tenant,'lab.execute') OR NOT('lab'=ANY(actor_role.systems) AND 'requests'=ANY(actor_role.pages)) OR s.executor_member_id IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_EXECUTOR_REQUIRED';END IF;
  IF action='RECEIVE' THEN
   IF s.status<>'AWAITING_RECEIPT' OR q.status<>'AWAITING_LAB_RECEIPT' OR clock_timestamp()>=s.starts_at THEN RAISE EXCEPTION 'HUMAN_RECEIPT_WINDOW';END IF;
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
