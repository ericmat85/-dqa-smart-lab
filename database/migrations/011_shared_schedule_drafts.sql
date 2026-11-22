-- Shared planning drafts only. No schedules, reservations or workflow states are written.
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft','catalog.manage','equipment.manage','materials.manage','materials.adjust','requests.submit','requests.review_manager','requests.review_lms','schedules.plan']::text[]);
CREATE TABLE dqa_business.schedule_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,request_id uuid NOT NULL,request_revision bigint NOT NULL,
 document_version_id uuid NOT NULL,plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object' AND octet_length(plan::text)<1000000),actor_member_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,request_id),FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),
 FOREIGN KEY(tenant_id,document_version_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id),FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
ALTER TABLE dqa_business.schedule_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_business.schedule_drafts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_business.schedule_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON dqa_business.schedule_drafts TO authenticated;
CREATE POLICY schedule_draft_read ON dqa_business.schedule_drafts FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id) AND dqa_private.case_row_active(tenant_id,'requests',request_id));
CREATE TRIGGER revision BEFORE UPDATE ON dqa_business.schedule_drafts FOR EACH ROW EXECUTE FUNCTION dqa_private.touch_revision();
CREATE TRIGGER audit_metadata AFTER INSERT OR UPDATE ON dqa_business.schedule_drafts FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
CREATE TABLE dqa_private.schedule_draft_operations(tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN('PLANNED','SAVED','EXPIRED')),result jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '2 minutes'),PRIMARY KEY(tenant_id,id));
REVOKE ALL ON dqa_private.schedule_draft_operations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_private.schedule_draft_plan(p_tenant uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE req dqa_business.requests;draft dqa_business.schedule_drafts;actor_role dqa_business.roles;executor dqa_business.memberships;machine dqa_business.equipment;trial dqa_business.trial_definitions;
 rules jsonb:='{"HIGH_HUMIDITY":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":true,"hours":250},"THERMAL_SHOCK":{"equipment_pattern":"冷熱衝擊","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"VIBRATION_DURABILITY":{"equipment_pattern":"振動","calendar":"weekdays","mode":"serial","daily_hours":20,"fixed_duration":true,"hours":20},"HUMIDITY_CYCLE":{"equipment_pattern":"恆溫恆濕|環境試驗箱","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"THERMAL_CYCLE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"LOW_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"HIGH_TEMPERATURE":{"equipment_pattern":"環境試驗箱|恆溫恆濕|高溫爐","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"SALT_SPRAY":{"equipment_pattern":"鹽霧","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"WATER_INGRESS":{"equipment_pattern":"防水","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"ESD":{"equipment_pattern":"ESD","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.5},"WEATHERING":{"equipment_pattern":"耐候","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":48},"DUST":{"equipment_pattern":"防塵","calendar":"continuous","mode":"batch","daily_hours":8,"fixed_duration":false,"hours":8},"TENSILE":{"equipment_pattern":"拉力","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSPECTION":{"equipment_pattern":"顯微鏡","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":0.25},"MECHANICAL_SHOCK":{"equipment_pattern":"機械衝擊","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"DROP":{"equipment_pattern":"跌落","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"INSERTION":{"equipment_pattern":"插拔","calendar":"continuous","mode":"serial","daily_hours":24,"fixed_duration":false,"hours":20},"VOLTAGE":{"equipment_pattern":"電源|電壓","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":1},"EMC":{"equipment_pattern":"EMC|電磁相容","calendar":"weekdays","mode":"serial","daily_hours":8,"fixed_duration":false,"hours":2}}';rule jsonb;data jsonb;ids uuid[];item jsonb;execution jsonb:='[]';allocations jsonb:='[]';equipment_versions jsonb:='{}';hours numeric;explicit_hours numeric;matches text[];explicit_values numeric[];
 start_date date;end_date date;cursor_date date;starts timestamptz;ends timestamptz;begin_at timestamptz;end_at timestamptz;plan_reserve_from timestamptz;plan_reserve_until timestamptz;prep integer;cleanup integer;
 remaining integer;assigned integer;capacity integer;slot_capacity integer;left_count integer;day_hours numeric;used numeric;batch_quantity integer;i integer;offset_days integer;expected_draft bigint;actor_member uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,'schedules.plan') OR NOT dqa_private.can(p_tenant,'requests.read_all') OR NOT dqa_private.can(p_tenant,'equipment.read') OR NOT dqa_private.can(p_tenant,'catalog.read') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 actor_member:=dqa_private.member_id(p_tenant);SELECT r.* INTO actor_role FROM dqa_business.roles r JOIN dqa_business.memberships m ON m.role_id=r.id AND m.tenant_id=r.tenant_id WHERE m.id=actor_member AND m.tenant_id=p_tenant;
 IF NOT ('lms'=ANY(actor_role.systems) AND 'schedule'=ANY(actor_role.pages)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 data:=p_command->'data';
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes')) OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(data->>'preparation_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'cleanup_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(data->>'end_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
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
 IF req.sample_space_units IS NULL OR req.quantity IS NULL OR req.quantity NOT BETWEEN 1 AND 1000 OR cardinality(ids)>req.quantity THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SOURCE_INCOMPLETE';END IF;
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
 remaining:=req.quantity;starts:=start_date::timestamp AT TIME ZONE 'Asia/Taipei';ends:=starts;i:=0;
 FOREACH actor_member IN ARRAY ids LOOP
  i:=i+1;SELECT * INTO machine FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=actor_member FOR SHARE;
  IF NOT FOUND OR machine.operational_status<>'IDLE' OR machine.name!~*(rule->>'equipment_pattern') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_EQUIPMENT_REQUIRED';END IF;
  IF coalesce(data->'equipment_revisions'->>machine.id::text,'')<>machine.revision::text THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  equipment_versions:=equipment_versions||jsonb_build_object(machine.id::text,machine.revision);capacity:=machine.space_units/req.sample_space_units;left_count:=cardinality(ids)-i;
  IF capacity<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;
  IF rule->>'mode'='batch' THEN assigned:=least(capacity,remaining-left_count);ELSE assigned:=ceil(remaining::numeric/(left_count+1));END IF;
  IF assigned<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;remaining:=remaining-assigned;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',assigned,'space_units',(CASE WHEN trial.profile_code='VIBRATION_DURABILITY' THEN 1 ELSE least(assigned,capacity) END)*req.sample_space_units));
  IF rule->>'mode'='batch' THEN
   end_at:=starts+hours*interval '1 hour';execution:=execution||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',assigned,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM end_at)*1000));ends:=greatest(ends,end_at);
  ELSE
   day_hours:=least((rule->>'daily_hours')::numeric,machine.daily_hours);IF hours>day_hours THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DAILY_HOURS';END IF;
   slot_capacity:=CASE WHEN trial.profile_code='VIBRATION_DURABILITY' THEN 1 ELSE capacity END;offset_days:=0;
   WHILE assigned>0 LOOP
    cursor_date:=start_date+offset_days;offset_days:=offset_days+1;IF offset_days>366 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
    IF rule->>'calendar'='weekdays' AND extract(isodow FROM cursor_date)>5 THEN CONTINUE;END IF;used:=0;
    WHILE assigned>0 AND used+hours<=day_hours LOOP
     batch_quantity:=least(assigned,slot_capacity);begin_at:=(cursor_date::timestamp AT TIME ZONE 'Asia/Taipei')+used*interval '1 hour';end_at:=begin_at+hours*interval '1 hour';assigned:=assigned-batch_quantity;used:=used+hours;
     execution:=execution||jsonb_build_array(jsonb_build_object('equipment_id',machine.id,'quantity',batch_quantity,'start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM end_at)*1000));ends:=greatest(ends,end_at);
    END LOOP;
   END LOOP;
  END IF;
 END LOOP;
 IF remaining>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SPACE_INSUFFICIENT';END IF;
 IF ((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date<>end_date THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_END_DATE_MISMATCH';END IF;
 plan_reserve_from:=starts-prep*interval '1 minute';plan_reserve_until:=ends+cleanup*interval '1 minute';
 IF rule->>'calendar'='weekdays' AND (EXISTS(SELECT 1 FROM generate_series((plan_reserve_from AT TIME ZONE 'Asia/Taipei')::date,((starts-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date,interval '1 day') x WHERE extract(isodow FROM x)>5) OR EXISTS(SELECT 1 FROM generate_series((ends AT TIME ZONE 'Asia/Taipei')::date,((plan_reserve_until-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date,interval '1 day') x WHERE extract(isodow FROM x)>5)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_WEEKDAY_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<plan_reserve_until AND plan_reserve_from<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.executor_member_id=executor.id AND s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND s.starts_at-s.preparation_minutes*interval '1 minute'<plan_reserve_until AND plan_reserve_from<s.ends_at+s.cleanup_minutes*interval '1 minute' AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN jsonb_build_object('scope','DRAFT_ONLY','reserved',false,'physical_feasibility','NOT_ASSESSED','operating_conditions','HUMAN_REVIEW_REQUIRED','profile_id',trial.profile_code,'calendar',rule->>'calendar','hours_per_batch',hours,'trial_revision',trial.revision,'equipment_revisions',equipment_versions,'executor_id',executor.id,'executor_label',executor.display_name,'executor_revision',executor.revision,'start_date',start_date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'segments',execution,'allocations',allocations,'sample_code',btrim(data->>'sample_code'),'note',data->>'note','preparation_minutes',prep,'cleanup_minutes',cleanup);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';
END $$;
REVOKE ALL ON FUNCTION dqa_private.schedule_draft_plan(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.prepare_schedule_draft(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.schedule_draft_operations;fp text;
BEGIN
 IF p_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant,'schedules.plan') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-draft-operations:'||p_tenant,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');SELECT * INTO op FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_OPERATION_CONFLICT';END IF;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);END IF;
 PERFORM dqa_private.schedule_draft_plan(p_tenant,p_command);
 IF (SELECT count(*) FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.schedule_draft_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE FUNCTION dqa_business.execute_schedule_draft(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.schedule_draft_operations;plan jsonb;req dqa_business.requests;draft dqa_business.schedule_drafts;outcome jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'schedules.plan') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_OPERATION_CONFLICT';END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
 IF op.state='EXPIRED' OR op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLANNING_OPERATION_EXPIRED';END IF;
 plan:=dqa_private.schedule_draft_plan(p_tenant,p_command);SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 INSERT INTO dqa_business.schedule_drafts(tenant_id,request_id,request_revision,document_version_id,plan,actor_member_id) VALUES(p_tenant,req.id,req.revision,req.request_document_version_id,plan,dqa_private.member_id(p_tenant)) ON CONFLICT(tenant_id,request_id) DO UPDATE SET request_revision=EXCLUDED.request_revision,document_version_id=EXCLUDED.document_version_id,plan=EXCLUDED.plan,actor_member_id=EXCLUDED.actor_member_id RETURNING * INTO draft;
 outcome:=jsonb_build_object('state','SAVED','operation_id',p_operation,'draft_id',draft.id,'request_id',req.id,'revision',draft.revision,'reserved',false,'scope','DRAFT_ONLY');UPDATE dqa_private.schedule_draft_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
END $$;
CREATE FUNCTION dqa_business.schedule_draft_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.schedule_draft_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.schedule_draft_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND','id',p_operation);END IF;
 IF op.state='PLANNED' AND op.expires_at<=clock_timestamp() THEN UPDATE dqa_private.schedule_draft_operations SET state='EXPIRED' WHERE tenant_id=p_tenant AND id=p_operation RETURNING * INTO op;END IF;
 RETURN CASE WHEN op.state='SAVED' THEN op.result ELSE jsonb_build_object('state',op.state,'id',op.id,'expires_at',op.expires_at) END;
END $$;
CREATE FUNCTION dqa_business.schedule_draft_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE drafts jsonb;executors jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO drafts FROM (SELECT d.id,d.tenant_id,d.request_id,d.request_revision,d.document_version_id,d.plan-'segments' AS plan,d.actor_member_id,d.revision,d.created_at,d.updated_at FROM dqa_business.schedule_drafts d WHERE tenant_id=p_tenant AND dqa_private.can_read_request(p_tenant,request_id) AND dqa_private.case_row_active(p_tenant,'requests',request_id) ORDER BY id LIMIT 1001) x;
 IF jsonb_array_length(drafts)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO executors FROM (SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.enabled AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp()) AND dqa_private.can(p_tenant,'schedules.plan') ORDER BY m.id LIMIT 1001) x;
 IF jsonb_array_length(executors)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED';END IF;
 RETURN jsonb_build_object('schedule_drafts',drafts,'schedule_executors',executors,'schedule_draft_scope','DRAFT_ONLY','formal_booking_enabled',false);
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_schedule_draft(uuid,uuid,jsonb),dqa_business.execute_schedule_draft(uuid,uuid,jsonb),dqa_business.schedule_draft_result(uuid,uuid),dqa_business.schedule_draft_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_schedule_draft(uuid,uuid,jsonb),dqa_business.execute_schedule_draft(uuid,uuid,jsonb),dqa_business.schedule_draft_result(uuid,uuid),dqa_business.schedule_draft_snapshot(uuid) TO authenticated;
