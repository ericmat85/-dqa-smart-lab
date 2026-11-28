-- Schedule confirmation now precedes first-level signature. Previously first-approved documents retain their flow.
CREATE TABLE dqa_private.preapproval_cutover(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,cutover_at timestamptz NOT NULL DEFAULT clock_timestamp(),enabled boolean NOT NULL DEFAULT true);
INSERT INTO dqa_private.preapproval_cutover(tenant_id) SELECT id FROM dqa_business.tenants;
CREATE TABLE dqa_private.preapproval_samples(tenant_id uuid NOT NULL,request_id uuid NOT NULL,document_id uuid NOT NULL,sample_code text NOT NULL CHECK(length(btrim(sample_code)) BETWEEN 1 AND 120),revision integer NOT NULL,actor uuid NOT NULL,PRIMARY KEY(tenant_id,request_id),FOREIGN KEY(tenant_id,document_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id) ON DELETE CASCADE);
CREATE TABLE dqa_private.preapproval_number_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,request_id uuid NOT NULL,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id) ON DELETE CASCADE);
CREATE TABLE dqa_private.preapproval_plan_operations(tenant_id uuid NOT NULL,operation_id uuid NOT NULL,request_id uuid NOT NULL,document_id uuid NOT NULL,actor uuid NOT NULL,draft_id uuid NOT NULL,draft_revision bigint NOT NULL,sample_revision integer NOT NULL,plan jsonb NOT NULL,PRIMARY KEY(tenant_id,operation_id),FOREIGN KEY(tenant_id,document_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id) ON DELETE CASCADE);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['preapproval_cutover','preapproval_samples','preapproval_number_operations','preapproval_plan_operations'] LOOP EXECUTE format('ALTER TABLE dqa_private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON dqa_private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
ALTER TABLE dqa_business.schedules DROP CONSTRAINT executor_reservation_exclusive;
ALTER TABLE dqa_business.schedules ADD CONSTRAINT executor_reservation_exclusive EXCLUDE USING gist(tenant_id WITH =,executor_member_id WITH =,tstzrange(reserve_from,reserve_until,'[)') WITH &&) WHERE(execution_kind='REAL' AND (status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR status='PENDING_APPROVAL' AND plan->>'flow_version'='PREAPPROVAL_V2'));
CREATE FUNCTION dqa_private.preapproval_document(p_tenant uuid,p_document uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_document IS NOT NULL AND EXISTS(SELECT 1 FROM dqa_private.preapproval_cutover c WHERE c.tenant_id=p_tenant AND c.enabled AND NOT EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE e.tenant_id=p_tenant AND e.request_document_version_id=p_document AND e.stage='LMS_1' AND e.decision='APPROVE' AND e.created_at<c.cutover_at))
$$;
CREATE FUNCTION dqa_private.preflight_required(p_tenant uuid,p_document uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_document IS NOT NULL AND EXISTS(SELECT 1 FROM dqa_private.preapproval_cutover c WHERE c.tenant_id=p_tenant AND c.enabled AND NOT EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE e.tenant_id=p_tenant AND e.request_document_version_id=p_document AND e.stage='LAB_RECEIVE' AND e.decision='APPROVE' AND e.created_at<c.cutover_at))
$$;
CREATE FUNCTION dqa_private.preapproval_can_plan(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND dqa_private.can_read_request(p_tenant,p_request) AND EXISTS(SELECT 1 FROM dqa_business.requests q WHERE q.tenant_id=p_tenant AND q.id=p_request AND CASE WHEN dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN q.status='AWAITING_LMS_REVIEW' AND q.request_review_level=0 AND q.owner_member_id<>dqa_private.member_id(p_tenant) AND EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=p_tenant AND m.id=dqa_private.member_id(p_tenant) AND r.enabled AND 'lms'=ANY(r.systems) AND ((dqa_private.can(p_tenant,'requests.review_lms') AND r.review_level=1 AND 'requests'=ANY(r.pages)) OR (dqa_private.is_admin(p_tenant) AND 'schedule'=ANY(r.pages)))) ELSE dqa_private.can(p_tenant,'schedules.plan') AND dqa_private.can(p_tenant,'requests.read_all') AND dqa_private.can(p_tenant,'equipment.read') AND dqa_private.can(p_tenant,'catalog.read') AND EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=p_tenant AND m.id=dqa_private.member_id(p_tenant) AND 'lms'=ANY(r.systems) AND 'schedule'=ANY(r.pages)) END)
$$;
CREATE FUNCTION dqa_business.save_preapproval_sample_number(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;old dqa_private.preapproval_samples;op dqa_private.preapproval_number_operations;fp text;result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF p_operation IS NULL OR p_revision IS NULL OR p_revision<0 OR p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'PREAPPROVAL_FIELDS_INVALID';END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_request,p_document,p_request_revision,p_revision,btrim(p_code))::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.preapproval_number_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request FOR UPDATE;
 IF q.request_document_version_id IS DISTINCT FROM p_document OR q.revision IS DISTINCT FROM p_request_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF NOT dqa_private.preapproval_document(p_tenant,p_document) OR q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0 THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
 SELECT * INTO old FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF old.document_id=p_document AND old.sample_code=btrim(p_code) THEN result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',old.revision);
 ELSE
 INSERT INTO dqa_private.preapproval_samples VALUES(p_tenant,p_request,p_document,btrim(p_code),1,auth.uid()) ON CONFLICT(tenant_id,request_id) DO UPDATE SET document_id=EXCLUDED.document_id,sample_code=EXCLUDED.sample_code,revision=dqa_private.preapproval_samples.revision+1,actor=auth.uid() RETURNING * INTO old;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',old.revision);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'preapproval_samples',p_request,'UPDATE',ARRAY['sample_code','revision']);
 END IF;
 INSERT INTO dqa_private.preapproval_number_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result,p_request);RETURN result;
END $$;
CREATE FUNCTION dqa_business.preapproval_number_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;BEGIN IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;SELECT o.result INTO result FROM dqa_private.preapproval_number_operations o WHERE o.tenant_id=p_tenant AND o.id=p_operation AND o.actor=auth.uid();RETURN coalesce(result,jsonb_build_object('id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND'));END $$;

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
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units')) OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(data->>'preparation_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'cleanup_minutes','')!~'^(0|[1-9][0-9]{0,3})$' OR coalesce(data->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(data->>'end_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_FIELDS_INVALID';END IF;
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
  IF number_row.request_id IS NULL OR number_row.sample_code<>data->>'sample_code' THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_REQUIRED';END IF;
 ELSIF req.status<>'AWAITING_SCHEDULING' OR req.request_review_level<>2 OR req.request_document_version_id IS NULL THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;

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
 plan:=dqa_private.schedule_draft_plan(p_tenant,p_command);SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 INSERT INTO dqa_business.schedule_drafts(tenant_id,request_id,request_revision,document_version_id,plan,actor_member_id) VALUES(p_tenant,req.id,req.revision,req.request_document_version_id,plan,dqa_private.member_id(p_tenant)) ON CONFLICT(tenant_id,request_id) DO UPDATE SET request_revision=EXCLUDED.request_revision,document_version_id=EXCLUDED.document_version_id,plan=EXCLUDED.plan,actor_member_id=EXCLUDED.actor_member_id RETURNING * INTO draft;
 outcome:=jsonb_build_object('state','SAVED','operation_id',p_operation,'draft_id',draft.id,'request_id',req.id,'revision',draft.revision,'reserved',false,'scope','DRAFT_ONLY');UPDATE dqa_private.schedule_draft_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
END $$;
CREATE FUNCTION dqa_private.preapproval_plan_command(p_tenant uuid,p_request uuid,p_plan jsonb,p_revision bigint) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',p_revision,'data',jsonb_build_object('sample_space_units',p_plan->'sample_space_units','equipment_ids',coalesce((SELECT jsonb_agg(a->'equipment_id') FROM jsonb_array_elements(p_plan->'allocations') a),'[]'),'equipment_revisions',p_plan->'equipment_revisions','executor_id',p_plan->'executor_id','executor_revision',p_plan->'executor_revision','start_date',p_plan->'start_date','end_date',p_plan->'end_date','sample_code',p_plan->'sample_code','note',p_plan->'note','preparation_minutes',p_plan->'preparation_minutes','cleanup_minutes',p_plan->'cleanup_minutes')) FROM dqa_business.requests q WHERE q.tenant_id=p_tenant AND q.id=p_request
$$;
CREATE FUNCTION dqa_private.preapproval_auto_fields(p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb;i integer;a jsonb;start_day text;end_day text;
BEGIN
 result:=jsonb_build_object('sampleCode',p_plan->>'sample_code','outsourced',CASE WHEN p_plan->>'outsourced'='true' THEN 'yes' ELSE 'no' END,'plannedOperator',p_plan->>'executor_label','plannedStartDate',p_plan->>'start_date');
 IF p_plan->>'outsourced'='true' THEN
  RETURN result||jsonb_build_object('outsourceExpectedDate',p_plan->>'end_date','equipment1','委外設備','equipmentStart1',p_plan->>'start_date','equipmentEnd1',p_plan->>'end_date');
 END IF;
 FOR i IN 1..coalesce(jsonb_array_length(p_plan->'allocations'),0) LOOP
  a:=p_plan->'allocations'->(i-1);
  SELECT to_char((to_timestamp(min((s->>'start_ms')::numeric)/1000) AT TIME ZONE 'Asia/Taipei')::date,'YYYY-MM-DD'),to_char((to_timestamp((max((s->>'end_ms')::numeric)-1)/1000) AT TIME ZONE 'Asia/Taipei')::date,'YYYY-MM-DD') INTO start_day,end_day FROM jsonb_array_elements(p_plan->'segments') s WHERE s->>'equipment_id'=a->>'equipment_id';
  result:=result||jsonb_build_object('equipment'||i,a->>'equipment_name','equipmentStart'||i,coalesce(start_day,p_plan->>'start_date'),'equipmentEnd'||i,coalesce(end_day,p_plan->>'end_date'));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION dqa_private.preapproval_derived_keys() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT ARRAY['sampleCode','outsourced','outsourceExpectedDate','plannedOperator','plannedStartDate','equipment1','equipmentStart1','equipmentEnd1','equipment2','equipmentStart2','equipmentEnd2','equipment3','equipmentStart3','equipmentEnd3','equipment4','equipmentStart4','equipmentEnd4']
$$;
CREATE FUNCTION dqa_private.preapproval_bind_plan(p_tenant uuid,p_operation uuid,p_command jsonb,p_fields jsonb,p_plan_revision bigint,p_prepare boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;n dqa_private.preapproval_samples;old dqa_private.preapproval_plan_operations;plan jsonb;auto_fields jsonb;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 SELECT * INTO old FROM dqa_private.preapproval_plan_operations WHERE tenant_id=p_tenant AND operation_id=p_operation;
 IF FOUND AND EXISTS(SELECT 1 FROM dqa_private.request_operations WHERE tenant_id=p_tenant AND id=p_operation AND state='SAVED' AND actor_id=auth.uid()) THEN
  IF old.actor<>auth.uid() OR old.request_id<>q.id OR p_plan_revision IS DISTINCT FROM old.draft_revision THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;
  auto_fields:=dqa_private.preapproval_auto_fields(old.plan);
  IF EXISTS(SELECT 1 FROM jsonb_each(p_fields) f WHERE f.key=ANY(dqa_private.preapproval_derived_keys()) AND f.value IS DISTINCT FROM auto_fields->f.key AND f.value<>'""'::jsonb) THEN RAISE EXCEPTION 'PREAPPROVAL_DERIVED_FIELDS_IMMUTABLE';END IF;
  RETURN (p_fields-dqa_private.preapproval_derived_keys())||auto_fields;
 END IF;
 IF p_command->>'action'<>'LMS_APPROVE' OR q.request_review_level<>0 OR NOT dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN RETURN p_fields;END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,q.id) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=q.id AND document_id=q.request_document_version_id;
 IF d.id IS NULL OR n.request_id IS NULL OR d.document_version_id<>q.request_document_version_id OR d.request_revision<>q.revision OR p_plan_revision IS DISTINCT FROM d.revision OR d.plan->>'sample_code'<>n.sample_code OR (d.plan->>'sample_revision')::integer IS DISTINCT FROM n.revision THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
 SELECT * INTO old FROM dqa_private.preapproval_plan_operations WHERE tenant_id=p_tenant AND operation_id=p_operation;
 IF FOUND THEN
  IF old.actor<>auth.uid() OR old.document_id<>q.request_document_version_id OR old.draft_id<>d.id OR old.draft_revision<>d.revision OR old.sample_revision<>n.revision OR old.plan<>d.plan THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;
 ELSE
  IF NOT p_prepare THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;
  plan:=dqa_private.schedule_draft_plan(p_tenant,dqa_private.preapproval_plan_command(p_tenant,q.id,d.plan,d.revision));
  IF plan<>d.plan THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
  INSERT INTO dqa_private.preapproval_plan_operations VALUES(p_tenant,p_operation,q.id,q.request_document_version_id,auth.uid(),d.id,d.revision,n.revision,plan);
 END IF;
 auto_fields:=dqa_private.preapproval_auto_fields(d.plan);
 IF EXISTS(SELECT 1 FROM jsonb_each(p_fields) f WHERE f.key=ANY(dqa_private.preapproval_derived_keys()) AND f.value IS DISTINCT FROM auto_fields->f.key AND f.value<>'""'::jsonb) THEN RAISE EXCEPTION 'PREAPPROVAL_DERIVED_FIELDS_IMMUTABLE';END IF;
 RETURN (p_fields-dqa_private.preapproval_derived_keys())||auto_fields;
END $$;
CREATE FUNCTION dqa_private.preapproval_transition(p_tenant uuid,p_operation uuid,p_request uuid,p_stage text,p_decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;receipt dqa_private.preapproval_plan_operations;s dqa_business.schedules;plan jsonb;a jsonb;sid uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 IF NOT dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=q.id AND status NOT IN('DRAFT','CANCELLED') FOR UPDATE;
 IF p_stage='LMS_1' AND p_decision='APPROVE' THEN
  SELECT * INTO receipt FROM dqa_private.preapproval_plan_operations WHERE tenant_id=p_tenant AND operation_id=p_operation AND request_id=q.id AND document_id=q.request_document_version_id AND actor=auth.uid();
  SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
  IF receipt.operation_id IS NULL OR s.id IS NOT NULL OR receipt.draft_id<>d.id OR receipt.draft_revision<>d.revision OR receipt.plan<>d.plan THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
  plan:=dqa_private.schedule_draft_plan(p_tenant,dqa_private.preapproval_plan_command(p_tenant,q.id,d.plan,d.revision));
  IF plan<>receipt.plan THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',sid,NULL,'PENDING_APPROVAL');
  INSERT INTO dqa_business.schedules(id,tenant_id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,draft_id,plan,sample_code,reserve_from,reserve_until,execution_kind) VALUES(sid,p_tenant,'SCH-'||q.legacy_id||'-V'||(SELECT version FROM dqa_business.request_document_versions WHERE tenant_id=p_tenant AND id=q.request_document_version_id),q.id,(plan->>'executor_id')::uuid,(plan->>'starts_at')::timestamptz,(plan->>'ends_at')::timestamptz,(plan->>'preparation_minutes')::integer,(plan->>'cleanup_minutes')::integer,'PENDING_APPROVAL',d.id,plan,plan->>'sample_code',(plan->>'reserve_from')::timestamptz,(plan->>'reserve_until')::timestamptz,q.execution_kind);
  IF q.execution_kind='REAL' THEN FOR a IN SELECT jsonb_array_elements(plan->'allocations') LOOP INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,sid,(a->>'equipment_id')::uuid,(plan->>'reserve_from')::timestamptz,(plan->>'reserve_until')::timestamptz,(a->>'space_units')::integer,(a->>'quantity')::integer);END LOOP;END IF;
 ELSIF p_stage='LMS_2' THEN
  IF s.id IS NULL OR s.status<>'PENDING_APPROVAL' OR s.plan->>'document_id' IS DISTINCT FROM q.request_document_version_id::text THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
  IF p_decision='APPROVE' THEN
   IF clock_timestamp()>=s.starts_at THEN RAISE EXCEPTION 'PREAPPROVAL_SCHEDULE_EXPIRED';END IF;
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,'AWAITING_RECEIPT');UPDATE dqa_business.schedules SET status='AWAITING_RECEIPT' WHERE id=s.id;
  ELSE
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',s.id,s.status,'CANCELLED');UPDATE dqa_business.schedules SET status='CANCELLED' WHERE id=s.id;
   UPDATE dqa_business.schedule_equipment SET released_at=clock_timestamp() WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL;
  END IF;
 END IF;
 DELETE FROM dqa_private.human_permits WHERE tenant_id=p_tenant AND operation_id=p_operation AND transaction_id=txid_current();
END $$;
-- The executor first records preparation checks, then signs a distinct no-abnormalities confirmation.
CREATE FUNCTION dqa_private.preparation_ready(p_tenant uuid,p_request uuid,p_schedule uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(t.fields->>'sampleCorrect'='yes' AND (t.fields->>'sampleQuantity')::integer>0 AND coalesce(t.fields->>'sampleReceivedDate','')<>'' AND t.fields->>'fixturesReady' IN('yes','not_applicable') AND t.fields->>'operationFamiliar'='yes' AND CASE WHEN q.form_details->>'priority'='委外' THEN t.fields->>'outsourceBooked'='yes' ELSE t.fields->>'outsourceBooked' IN('yes','not_applicable') END,false)
 FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.tenant_id=q.tenant_id AND s.request_id=q.id AND s.id=p_schedule JOIN LATERAL(SELECT t.* FROM dqa_private.request_template_stage_entries t JOIN dqa_business.approval_events e ON e.tenant_id=t.tenant_id AND e.id=t.event_id WHERE t.tenant_id=q.tenant_id AND t.request_id=q.id AND t.document_id=q.request_document_version_id AND t.schedule_id=s.id AND t.stage='LAB_PREPARE' AND e.actor_member_id=s.executor_member_id ORDER BY e.created_at DESC,e.id DESC LIMIT 1)t ON true WHERE q.tenant_id=p_tenant AND q.id=p_request
$$;

CREATE FUNCTION dqa_business.preapproval_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'document_id',q.request_document_version_id,'flow_version',CASE WHEN dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN 'PREAPPROVAL_V2' ELSE 'LEGACY' END,'preflight_required',dqa_private.preflight_required(p_tenant,q.request_document_version_id),'sample_code',n.sample_code,'sample_revision',n.revision,'preparation_ready',coalesce(dqa_private.preparation_ready(p_tenant,q.id,s.id),false),'has_preparation',EXISTS(SELECT 1 FROM dqa_private.request_template_stage_entries t JOIN dqa_business.approval_events e ON e.tenant_id=t.tenant_id AND e.id=t.event_id WHERE t.tenant_id=q.tenant_id AND t.document_id=q.request_document_version_id AND t.schedule_id=s.id AND t.stage='LAB_PREPARE' AND e.actor_member_id=s.executor_member_id))),'[]') INTO rows FROM dqa_business.requests q LEFT JOIN dqa_private.preapproval_samples n ON n.tenant_id=q.tenant_id AND n.request_id=q.id AND n.document_id=q.request_document_version_id LEFT JOIN dqa_business.schedules s ON s.tenant_id=q.tenant_id AND s.request_id=q.id AND s.status NOT IN('DRAFT','CANCELLED') WHERE q.tenant_id=p_tenant AND dqa_private.can_read_request(p_tenant,q.id) AND dqa_private.case_row_active(p_tenant,'requests',q.id) AND (dqa_private.preapproval_document(p_tenant,q.request_document_version_id) OR dqa_private.preflight_required(p_tenant,q.request_document_version_id));
 RETURN jsonb_build_object('preapproval_requests',rows);
END $$;
CREATE FUNCTION dqa_business.preapproval_context(p_tenant uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO equipment FROM(SELECT id,legacy_id,name,category,model,space_units,daily_hours,operational_status,revision,display_details,specification FROM dqa_business.equipment WHERE tenant_id=p_tenant ORDER BY name,id LIMIT 1001)x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO executors FROM(SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab.execute'=ANY(r.permissions) AND lower(u.email)=m.login_email AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp()) ORDER BY m.display_name,m.id LIMIT 1001)x;
  IF jsonb_array_length(equipment)>1000 OR jsonb_array_length(executors)>1000 THEN RAISE EXCEPTION 'SNAPSHOT_PAGINATION_REQUIRED';END IF;
 END IF;
 RETURN jsonb_build_object('preflight_required',dqa_private.preflight_required(p_tenant,q.request_document_version_id),'flow_version',CASE WHEN dqa_private.preapproval_document(p_tenant,q.request_document_version_id) THEN 'PREAPPROVAL_V2' ELSE 'LEGACY' END,'request_id',q.id,'document_id',q.request_document_version_id,'request_revision',q.revision,'outsourced',coalesce(q.form_details->>'priority'='委外',false),'sample_code',CASE WHEN n.document_id=q.request_document_version_id THEN n.sample_code ELSE NULL END,'sample_revision',coalesce(n.revision,0),'can_plan',canplan,'draft',CASE WHEN d.id IS NOT NULL THEN to_jsonb(d)-'actor_member_id' ELSE NULL END,'schedule',CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id',s.id,'status',s.status,'revision',s.revision,'plan',s.plan) ELSE NULL END,'auto_fields',CASE WHEN d.document_version_id=q.request_document_version_id THEN dqa_private.preapproval_auto_fields(d.plan) ELSE '{}' END,'preparation',entry,'preparation_ready',coalesce(dqa_private.preparation_ready(p_tenant,p_request,s.id),false),'mapping',coalesce(mapping,'[]'),'equipment',equipment,'executors',executors);
END $$;

CREATE OR REPLACE FUNCTION dqa_business.execute_request_operation(p_tenant uuid, p_operation uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE op dqa_private.request_operations; req dqa_business.requests; actor dqa_business.memberships; actor_role dqa_business.roles; supervisor dqa_business.memberships; supervisor_role dqa_business.roles;
 action text:=p_command->>'action';actor_member uuid; next_status text; workflow_stage text;workflow_decision text;event_id uuid:=gen_random_uuid();doc dqa_business.request_document_versions; payload jsonb;digest text;review_level integer;outcome jsonb; trial dqa_business.trial_definitions;
BEGIN
 PERFORM dqa_private.validate_request_command(p_command);PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 SELECT * INTO op FROM dqa_private.request_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_OPERATION_CONFLICT';END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
 IF op.state='EXPIRED' OR op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_OPERATION_EXPIRED';END IF;
 IF NOT dqa_business.request_workflow_enabled(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_RELEASE_REQUIRED';END IF;
 SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR NOT dqa_private.can_read_request(p_tenant,req.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',req.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED';END IF;
 IF req.revision<>(p_command->>'expected_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 actor_member:=dqa_private.member_id(p_tenant);SELECT * INTO actor FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=actor_member;SELECT * INTO actor_role FROM dqa_business.roles WHERE tenant_id=p_tenant AND id=actor.role_id;
 review_level:=req.request_review_level;
 IF action='SUBMIT' THEN
  IF req.owner_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.submit') OR NOT ('request'=ANY(actor_role.systems)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED';END IF;
  IF req.status NOT IN ('DRAFT','RETURNED') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_STATE_INVALID';END IF;
  SELECT * INTO supervisor FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=actor.supervisor_member_id AND enabled AND auth_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth_user_id AND u.email_confirmed_at IS NOT NULL);
  SELECT * INTO supervisor_role FROM dqa_business.roles WHERE tenant_id=p_tenant AND id=supervisor.role_id AND enabled;
  IF supervisor.id IS NULL OR supervisor.id=actor_member OR NOT ('request'=ANY(supervisor_role.systems)) OR NOT(supervisor_role.is_tenant_admin OR 'requests.review_manager'=ANY(supervisor_role.permissions)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_SUPERVISOR_REQUIRED';END IF;
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=req.trial_id AND enabled;
  IF trial.id IS NULL OR coalesce(length(btrim(req.product_code)),0)=0 OR coalesce(length(btrim(req.customer_name)),0)=0 OR req.quantity IS NULL OR req.requested_date IS NULL OR NOT isfinite(req.requested_date) OR length(btrim(req.purpose))=0 OR length(btrim(req.specification))=0 OR length(btrim(req.acceptance))=0 OR jsonb_array_length(coalesce(req.form_details->'testItems','[]'))<>1 OR NOT (req.form_details->'testItems'->>0=ANY(array_append(trial.aliases,trial.name))) OR jsonb_array_length(coalesce(req.form_details->'purpose','[]'))=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_REQUEST_INCOMPLETE';END IF;
  payload:=jsonb_build_object('tenant_id',p_tenant,'request_id',req.id,'request_legacy_id',req.legacy_id,'owner_member_id',req.owner_member_id,'owner_label',actor.display_name,'supervisor_member_id',supervisor.id,'supervisor_label',supervisor.display_name,'trial_id',req.trial_id,'trial_snapshot',req.trial_snapshot,'product_code',req.product_code,'customer_name',req.customer_name,'purpose',req.purpose,'quantity',req.quantity,'requested_date',req.requested_date,'specification',req.specification,'acceptance',req.acceptance,'execution_kind',req.execution_kind,'form_details',req.form_details-'sampleSpaceUnits'-'sample_space_units');
  digest:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  INSERT INTO dqa_business.request_document_versions(tenant_id,request_id,version,request_revision,payload,document_sha256,submitted_by) VALUES(p_tenant,req.id,coalesce((SELECT max(v.version)+1 FROM dqa_business.request_document_versions v WHERE v.tenant_id=p_tenant AND v.request_id=req.id),1),req.revision,payload,digest,actor_member) RETURNING * INTO doc;
  workflow_stage:='REQUESTER';workflow_decision:='SUBMIT';next_status:='AWAITING_REQUEST_MANAGER';review_level:=0;
 ELSE
  IF actor_member=req.owner_member_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_SELF_REVIEW_DENIED';END IF;
  SELECT * INTO doc FROM dqa_business.request_document_versions WHERE tenant_id=p_tenant AND id=req.request_document_version_id AND request_id=req.id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_DOCUMENT_REQUIRED';END IF;
  IF req.status='AWAITING_REQUEST_MANAGER' AND action IN ('MANAGER_APPROVE','RETURN') THEN
   IF req.supervisor_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.review_manager') OR NOT ('request'=ANY(actor_role.systems)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED';END IF;
   workflow_stage:='REQUEST_MANAGER';next_status:='AWAITING_LMS_REVIEW';
  ELSIF req.status='AWAITING_LMS_REVIEW' AND action IN ('LMS_APPROVE','RETURN') THEN
   IF NOT dqa_private.can(p_tenant,'requests.review_lms') OR NOT ('lms'=ANY(actor_role.systems)) OR NOT ('requests'=ANY(actor_role.pages)) OR actor_role.review_level<>req.request_review_level+1 OR actor_role.review_level NOT IN (1,2) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_REVIEW_LEVEL_REQUIRED';END IF;
   workflow_stage:='LMS_'||actor_role.review_level;
   IF EXISTS(SELECT 1 FROM dqa_business.approval_events a WHERE a.tenant_id=p_tenant AND a.request_id=req.id AND a.actor_member_id=actor_member AND a.stage IN ('LMS_1','LMS_2') AND a.stage<>workflow_stage AND a.decision IN ('APPROVE','RETURN')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_REVIEW_LEVEL_CONFLICT';END IF;
   IF action<>'RETURN' THEN review_level:=req.request_review_level+1;END IF;next_status:=CASE WHEN review_level=2 THEN 'AWAITING_SCHEDULING' ELSE 'AWAITING_LMS_REVIEW' END;
  ELSE RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_STATE_INVALID';END IF;
  workflow_decision:=CASE WHEN action='RETURN' THEN 'RETURN' ELSE 'APPROVE' END;IF action='RETURN' THEN next_status:='RETURNED';review_level:=0;END IF;
 END IF;
 IF workflow_stage IN('LMS_1','LMS_2') THEN PERFORM dqa_private.preapproval_transition(p_tenant,p_operation,req.id,workflow_stage,workflow_decision);IF workflow_stage='LMS_2' AND workflow_decision='APPROVE' AND dqa_private.preapproval_document(p_tenant,doc.id) THEN next_status:='AWAITING_LAB_RECEIPT';END IF;END IF;
 INSERT INTO dqa_private.request_transition_permits(tenant_id,request_id,transaction_id,operation_id,event_id,actor_id,from_status,to_status,stage,decision) VALUES(p_tenant,req.id,txid_current(),p_operation,event_id,auth.uid(),req.status,next_status,workflow_stage,workflow_decision);
 INSERT INTO dqa_business.approval_events(id,tenant_id,request_id,actor_member_id,stage,decision,comment,request_document_version_id,operation_id,actor_label) VALUES(event_id,p_tenant,req.id,actor_member,workflow_stage,workflow_decision,p_command->>'comment',doc.id,p_operation,actor.display_name);
 IF length(p_command->>'signature_data')>0 THEN INSERT INTO dqa_business.request_signatures(tenant_id,request_id,document_version_id,approval_event_id,actor_member_id,signature_data,signature_sha256) VALUES(p_tenant,req.id,doc.id,event_id,actor_member,p_command->>'signature_data',encode(sha256(decode(split_part(p_command->>'signature_data',',',2),'base64')),'hex'));END IF;
 UPDATE dqa_business.requests SET status=next_status,request_review_level=review_level,request_document_version_id=doc.id,supervisor_member_id=CASE WHEN action='SUBMIT' THEN supervisor.id ELSE req.supervisor_member_id END WHERE tenant_id=p_tenant AND id=req.id RETURNING * INTO req;
 DELETE FROM dqa_private.request_transition_permits WHERE tenant_id=p_tenant AND request_id=req.id AND transaction_id=txid_current();
 outcome:=jsonb_build_object('state','SAVED','operation_id',p_operation,'request_id',req.id,'legacy_id',req.legacy_id,'revision',req.revision,'status',req.status,'document_version_id',doc.id,'document_sha256',doc.document_sha256,'review_level',review_level);
 UPDATE dqa_private.request_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_FIELDS_INVALID';
END $$;
CREATE OR REPLACE FUNCTION dqa_private.bind_template_stage_operation(p_tenant uuid, p_operation uuid, p_kind text, p_command jsonb, p_fields jsonb, p_prepare boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE q dqa_business.requests;old dqa_private.template_stage_operation_fields;st text;sid uuid;fp text;cfp text;req text[];mp jsonb;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 IF q.id IS NULL OR NOT dqa_private.can_read_request(p_tenant,q.id) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 IF p_kind='WORKFLOW' AND p_command->>'action'='LMS_APPROVE' THEN st:='LMS_'||(q.request_review_level+1);
 ELSIF p_kind='HUMAN' AND p_command->>'action'='PREPARE' THEN st:='LAB_PREPARE';
 ELSIF p_kind='HUMAN' AND p_command->>'action' IN('RECEIVE','COMPLETE') THEN st:=CASE p_command->>'action' WHEN 'RECEIVE' THEN 'LAB_RECEIVE' ELSE 'LAB_COMPLETE' END;
 ELSE RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
 IF dqa_private.preflight_required(p_tenant,q.request_document_version_id) AND st='LAB_RECEIVE' THEN
 IF (p_fields-'executionAbnormal'-'abnormalDescription')<>'{}' THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
 p_fields:=coalesce((SELECT t.fields FROM dqa_private.request_template_stage_entries t JOIN dqa_business.approval_events e ON e.tenant_id=t.tenant_id AND e.id=t.event_id JOIN dqa_business.schedules s ON s.tenant_id=t.tenant_id AND s.id=t.schedule_id WHERE t.tenant_id=p_tenant AND t.document_id=q.request_document_version_id AND t.stage='LAB_PREPARE' AND s.status='AWAITING_RECEIPT' AND e.actor_member_id=s.executor_member_id ORDER BY e.created_at DESC,e.id DESC LIMIT 1),'{}')||p_fields;END IF;
 fp:=encode(sha256(convert_to(p_fields::text,'UTF8')),'hex');cfp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO old FROM dqa_private.template_stage_operation_fields WHERE tenant_id=p_tenant AND kind=p_kind AND operation_id=p_operation;
 IF FOUND THEN
  IF old.actor<>auth.uid() OR old.command_hash<>cfp OR old.fields_hash IS DISTINCT FROM fp THEN RAISE EXCEPTION 'TEMPLATE_STAGE_OPERATION_CONFLICT';END IF;
  RETURN;
 END IF;
 IF NOT p_prepare THEN RAISE EXCEPTION 'TEMPLATE_STAGE_OPERATION_CONFLICT';END IF;
 IF q.request_document_version_id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_DOCUMENT_REQUIRED';END IF;
 IF st LIKE 'LAB_%' THEN SELECT id INTO sid FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=q.id AND status NOT IN('DRAFT','CANCELLED');END IF;
 SELECT request_mapping INTO mp FROM dqa_private.mapped_document_pins WHERE tenant_id=p_tenant AND document_id=q.request_document_version_id;
 req:=dqa_private.preapproval_required_fields(p_tenant,q.request_document_version_id,st,coalesce(mp,'[]'));PERFORM dqa_private.validate_template_stage_fields(st,p_fields,req);
 INSERT INTO dqa_private.template_stage_operation_fields VALUES(p_tenant,p_operation,p_kind,auth.uid(),cfp,fp,q.id,q.request_document_version_id,sid,st,p_fields);
END $$;
CREATE OR REPLACE FUNCTION dqa_private.capture_template_stage_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE receipt dqa_private.template_stage_operation_fields;mp jsonb;sid uuid;vals jsonb:='{}';
BEGIN
 IF NEW.decision<>'APPROVE' OR NEW.stage NOT IN('REQUEST_MANAGER','LMS_1','LMS_2','LAB_PREPARE','LAB_RECEIVE','LAB_COMPLETE') OR NEW.request_document_version_id IS NULL THEN RETURN NEW;END IF;
 IF NEW.stage LIKE 'LAB_%' THEN SELECT id INTO sid FROM dqa_business.schedules WHERE tenant_id=NEW.tenant_id AND request_id=NEW.request_id AND status NOT IN('DRAFT','CANCELLED');END IF;
 SELECT * INTO receipt FROM dqa_private.template_stage_operation_fields WHERE tenant_id=NEW.tenant_id AND operation_id=NEW.operation_id AND kind=CASE WHEN NEW.stage LIKE 'LAB_%' THEN 'HUMAN' ELSE 'WORKFLOW' END;
 IF FOUND THEN
  IF receipt.actor IS DISTINCT FROM auth.uid() OR receipt.request_id<>NEW.request_id OR receipt.document_id<>NEW.request_document_version_id OR receipt.stage<>NEW.stage OR receipt.schedule_id IS DISTINCT FROM sid THEN RAISE EXCEPTION 'TEMPLATE_STAGE_OPERATION_CONFLICT';END IF;
  vals:=receipt.fields;
 END IF;
 SELECT request_mapping INTO mp FROM dqa_private.mapped_document_pins WHERE tenant_id=NEW.tenant_id AND document_id=NEW.request_document_version_id;
 PERFORM dqa_private.validate_template_stage_fields(NEW.stage,vals,dqa_private.preapproval_required_fields(NEW.tenant_id,NEW.request_document_version_id,NEW.stage,coalesce(mp,'[]')));
 IF dqa_private.preflight_required(NEW.tenant_id,NEW.request_document_version_id) AND NEW.stage='LAB_RECEIVE' AND (vals->>'executionAbnormal' IS DISTINCT FROM 'no' OR NOT coalesce(dqa_private.preparation_ready(NEW.tenant_id,NEW.request_id,sid),false)) THEN RAISE EXCEPTION 'PREPARATION_NOT_READY';END IF;
 INSERT INTO dqa_private.request_template_stage_entries VALUES(NEW.tenant_id,NEW.id,NEW.request_id,NEW.request_document_version_id,NEW.stage,sid,vals);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.start_due_lab_trials(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE s dqa_business.schedules;q dqa_business.requests;at_time timestamptz:=clock_timestamp();
 started integer:=0;blocked integer:=0;lock_id uuid;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
 AND coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTOSTART_SERVICE_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled)
 THEN RETURN jsonb_build_object('started',0,'blocked',0,'state','DISABLED');END IF;
 -- Same lock order as booking, account maintenance and recycle operations.
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 FOR lock_id IN SELECT id FROM dqa_business.schedules WHERE tenant_id=p_tenant
  AND execution_kind='REAL' AND status='BOOKED' AND received_at IS NOT NULL AND starts_at<=at_time AND ends_at>at_time
  ORDER BY starts_at,id LIMIT 1000
 LOOP
  SELECT r.* INTO q FROM dqa_business.requests r JOIN dqa_business.schedules z
   ON z.tenant_id=r.tenant_id AND z.request_id=r.id WHERE z.id=lock_id FOR UPDATE OF r;
  SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND id=lock_id FOR UPDATE;
  IF s.status<>'BOOKED' OR q.status<>'AWAITING_LAB_RECEIPT' OR s.received_at IS NULL
   OR EXISTS(SELECT 1 FROM dqa_private.case_recycle_items i WHERE i.tenant_id=p_tenant AND i.restored_at IS NULL
     AND ((i.entity='requests' AND i.record_id=q.id) OR (i.entity='schedules' AND i.record_id=s.id))) THEN CONTINUE;END IF;
  -- Lock devices in stable order; state transitions are atomic with the booking.
  PERFORM e.id FROM dqa_business.equipment e JOIN dqa_business.schedule_equipment a
   ON a.tenant_id=e.tenant_id AND a.equipment_id=e.id
   WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND a.released_at IS NULL ORDER BY e.id FOR UPDATE OF e;
  IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r
   ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id
   WHERE m.tenant_id=p_tenant AND m.id=s.executor_member_id AND m.enabled AND m.deleted_at IS NULL AND r.enabled
   AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND 'lab.execute'=ANY(r.permissions)
   AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=m.login_email AND (u.banned_until IS NULL OR u.banned_until<=at_time))
   OR (NOT(coalesce(s.plan->>'flow_version'='PREAPPROVAL_V2',false) AND coalesce(s.plan->>'outsourced'='true',false)) AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL))
   OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.equipment e
    ON e.tenant_id=a.tenant_id AND e.id=a.equipment_id WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND a.released_at IS NULL
     AND (e.operational_status<>'IDLE' OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment other
      JOIN dqa_business.schedules z ON z.tenant_id=other.tenant_id AND z.id=other.schedule_id
      WHERE other.tenant_id=p_tenant AND other.equipment_id=e.id AND other.schedule_id<>s.id
      AND other.released_at IS NULL AND z.status IN('RUNNING','PAUSED'))))
  THEN blocked:=blocked+1;CONTINUE;END IF;
  INSERT INTO dqa_private.schedule_start_permits VALUES(p_tenant,s.id,q.id,txid_current());
  UPDATE dqa_business.schedules SET status='RUNNING',started_at=at_time WHERE id=s.id;
  UPDATE dqa_business.requests SET status='RUNNING' WHERE id=q.id;
  UPDATE dqa_business.equipment SET operational_status='IN_USE' WHERE tenant_id=p_tenant
   AND id IN(SELECT equipment_id FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL);
  INSERT INTO dqa_private.schedule_start_events(tenant_id,schedule_id,request_id,executor_member_id,scheduled_at,started_at)
   VALUES(p_tenant,s.id,q.id,s.executor_member_id,s.starts_at,at_time);
  DELETE FROM dqa_private.schedule_start_permits WHERE tenant_id=p_tenant AND schedule_id=s.id AND transaction_id=txid_current();
  started:=started+1;
 END LOOP;
 RETURN jsonb_build_object('started',started,'blocked',blocked,'state','READY');
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
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id')) OR coalesce(p_command->>'action','') NOT IN('BOOK','PREPARE','RECEIVE','START','COMPLETE','STOP','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE') OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR EXISTS(SELECT 1 FROM unnest(ARRAY['expected_schedule_revision','expected_report_revision','expected_draft_revision']) k WHERE coalesce(p_command->>k,'')!~'^(0|[1-9][0-9]{0,14})$') OR jsonb_typeof(p_command->'signature_data') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'comment') IS DISTINCT FROM 'string' OR length(p_command->>'comment')>2000 THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
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
  stage:='LAB_STOP';decision:='NOTE';next_q:='CANCELLED';
 ELSIF action IN('PREPARE','RECEIVE','START','COMPLETE') THEN
  IF q.execution_kind='VIRTUAL' AND action<>'RECEIVE' THEN RAISE EXCEPTION 'VIRTUAL_ACCELERATOR_REQUIRED';END IF;
  IF NOT dqa_private.can(p_tenant,'lab.execute') OR NOT('lab'=ANY(actor_role.systems) AND 'requests'=ANY(actor_role.pages)) OR s.executor_member_id IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_EXECUTOR_REQUIRED';END IF;
  IF action='PREPARE' THEN
   IF NOT dqa_private.preflight_required(p_tenant,q.request_document_version_id) OR s.status<>'AWAITING_RECEIPT' OR q.status<>'AWAITING_LAB_RECEIPT' OR clock_timestamp()>=s.starts_at OR p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
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
CREATE OR REPLACE FUNCTION dqa_private.can_read_request(p_tenant uuid, p_request uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
 SELECT dqa_private.can(p_tenant)
 AND dqa_private.case_row_active(p_tenant,'requests',p_request)
 AND EXISTS(SELECT 1 FROM dqa_business.requests r
  WHERE r.tenant_id=p_tenant AND r.id=p_request AND (
   dqa_private.can(p_tenant,'requests.read_all')
   OR r.owner_member_id=dqa_private.member_id(p_tenant)
   OR r.supervisor_member_id=dqa_private.member_id(p_tenant)
   OR (dqa_private.can(p_tenant,'lab.execute') AND EXISTS(
    SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant
     AND s.request_id=r.id AND s.status NOT IN('DRAFT','CANCELLED','PENDING_APPROVAL')
     AND s.executor_member_id=dqa_private.member_id(p_tenant)))))
$$;
CREATE OR REPLACE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}'; cfg jsonb; historical jsonb; item record;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 FOR definition IN SELECT * FROM (VALUES
('requests','requests','project_group_id,project_item_index,execution_kind,id,tenant_id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details,request_document_version_id,request_review_level'),
('trials','trial_definitions','id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision'),
('equipment','equipment','id,legacy_id,name,category,model,serial_number,site_id,owner_member_id,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision,display_details,service_started_at'),
('materials','materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,site_id,owner_member_id,status,revision,display_details'),
('schedules','schedules','execution_kind,virtual_percent,virtual_at,id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,revision'),
('members','memberships','id,legacy_id,display_name,role_id,department_id,site_id,enabled,login_email,supervisor_member_id'),
('roles','roles','id,code,name,is_tenant_admin,permissions,enabled,systems,pages,review_level'),
('sites','sites','id,legacy_id,name,location'),
('departments','departments','id,legacy_id,name,parent_id'),
('borrows','borrows','id,legacy_id,borrower_member_id,equipment_id,material_id,quantity,purpose,starts_at,due_at,status'),
('operations','lab_operations','id,request_id,actor_member_id,action,reason,status,created_at'),
('allocations','schedule_equipment','id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity,released_at'),
('quality','quality_records','id,title,owner_member_id,request_id,equipment_id,trial_id,status,severity,cause,action,resolution,due_on'),
('qualifications','qualifications','id,member_id,equipment_id,trial_id,training,issued_on,expires_on,status'),
('workflow_versions','request_document_versions','id,request_id,version,request_revision,document_sha256,submitted_by,created_at'),
('workflow_signatures','request_signatures','id,request_id,document_version_id,approval_event_id,actor_member_id,signature_sha256,verification,created_at'),
('workflow_events','approval_events','id,request_id,actor_member_id,stage,decision,comment,request_document_version_id,operation_id,actor_label,created_at'),
('reports','reports','id,request_id,status,revision,created_at,updated_at')
 ) t(name,table_name,columns) LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) FROM (SELECT %s FROM dqa_business.%I WHERE tenant_id=$1 ORDER BY id LIMIT 1001) r',definition.columns,definition.table_name) INTO rows USING p_tenant;
 IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED'; END IF;
 result:=result||jsonb_build_object(definition.name,rows);
 END LOOP;
 -- Imported demonstration states remain immutable archive data, never operational workflow records.
 SELECT configuration INTO cfg FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='legacy_browser_archive';
 IF cfg->>'mode'='READ_ONLY_ARCHIVE' AND dqa_private.is_admin(p_tenant) AND EXISTS(
  SELECT 1 FROM dqa_business.import_batches b WHERE b.tenant_id=p_tenant AND b.id=(cfg->>'batch_id')::uuid
  AND b.source_sha256=cfg->>'source_sha256' AND b.status='STAGED') THEN
  historical:=jsonb_build_object('metadata',cfg);
  FOR item IN SELECT * FROM (VALUES ('reviews','reviews'),('schedules','schedules'),('equipment_details','equipment'),('labAudit','labAudit')) v(name,collection) LOOP
   SELECT coalesce(jsonb_agg(r.payload ORDER BY r.legacy_id),'[]'::jsonb) INTO rows
   FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.batch_id=(cfg->>'batch_id')::uuid AND r.source_collection=item.collection;
   IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED'; END IF;
   historical:=historical||jsonb_build_object(item.name,rows);
  END LOOP;
  result:=result||jsonb_build_object('legacy_import',historical);
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') INTO rows FROM (SELECT * FROM dqa_business.resource_events WHERE tenant_id=p_tenant ORDER BY created_at DESC,id DESC LIMIT 200) e;
 result:=result||jsonb_build_object('resource_events',rows,'resource_events_limited',(SELECT count(*)>200 FROM dqa_business.resource_events WHERE tenant_id=p_tenant));
 RETURN result||dqa_business.preapproval_snapshot(p_tenant)||jsonb_build_object('request_workflow_enabled',dqa_business.request_workflow_enabled(p_tenant),'request_supervisors',dqa_business.request_supervisor(p_tenant));
END $$;
CREATE OR REPLACE FUNCTION dqa_business.document_mapping_stage_context(p_tenant uuid, p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE q dqa_business.requests;mp jsonb;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND request_document_version_id=p_document;
 IF q.id IS NULL OR NOT dqa_private.can(p_tenant) OR NOT dqa_private.can_read_request(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT request_mapping INTO mp FROM dqa_private.mapped_document_pins WHERE tenant_id=p_tenant AND document_id=p_document;
 RETURN jsonb_build_object('preflight_required',dqa_private.preflight_required(p_tenant,p_document),'flow_version',CASE WHEN dqa_private.preapproval_document(p_tenant,p_document) THEN 'PREAPPROVAL_V2' ELSE 'LEGACY' END,'document_id',p_document,'mapping',coalesce(mp,'[]'),'stages',dqa_private.template_stage_context(p_tenant,p_document));
END $$;
CREATE OR REPLACE FUNCTION dqa_business.document_mapping_case(p_tenant uuid, p_kind text, p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE pin dqa_private.mapped_document_pins;r jsonb;q dqa_business.requests;
BEGIN
 IF p_kind NOT IN('REQUEST','REPORT') OR p_kind IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND request_document_version_id=p_document;
 IF q.id IS NULL OR NOT dqa_private.can(p_tenant) OR NOT dqa_private.can_read_request(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT * INTO pin FROM dqa_private.mapped_document_pins WHERE tenant_id=p_tenant AND document_id=p_document;
 IF p_kind='REPORT' THEN
  r:=dqa_business.request_trial_template_file(p_tenant,p_document);IF r->>'has_template'='false' THEN RETURN r;END IF;
  IF pin.document_id IS NULL OR jsonb_array_length(pin.report_mapping)=0 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_REQUIRED';END IF;
  r:=r||jsonb_build_object('mapping',pin.report_mapping);
 ELSE
  IF pin.request_file_id IS NULL THEN RETURN jsonb_build_object('has_template',false);END IF;
  r:=jsonb_build_object('has_template',true,'id',pin.request_file_id,'document_id',p_document,'name',pin.request_name,'sha256',pin.request_sha256,'byteLength',octet_length(pin.request_content),'content',replace(encode(pin.request_content,'base64'),E'\n',''),'mapping',pin.request_mapping);
 END IF;
 RETURN r||CASE WHEN p_kind='REQUEST' THEN jsonb_build_object('stages',dqa_private.template_stage_context(p_tenant,p_document,true)) ELSE '{}' END||jsonb_build_object('preflight_required',dqa_private.preflight_required(p_tenant,p_document),'flow_version',CASE WHEN dqa_private.preapproval_document(p_tenant,p_document) THEN 'PREAPPROVAL_V2' ELSE 'LEGACY' END,'kind',p_kind,'request_code',q.legacy_id,'payload',pin.payload,'department',pin.department,'execution_kind',pin.execution_kind);
END $$;
CREATE OR REPLACE FUNCTION dqa_private.template_stage_context(p_tenant uuid, p_document uuid, p_signatures boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$ WITH confirmed AS (SELECT coalesce(jsonb_object_agg(x.stage,x.data),'{}') FROM (
 SELECT DISTINCT ON(e.stage) e.stage,jsonb_build_object('fields',coalesce(t.fields,'{}'),'actor',e.actor_label,'at',e.created_at)||CASE WHEN p_signatures THEN jsonb_build_object('signature_data',s.signature_data,'signature_sha256',s.signature_sha256) ELSE '{}' END data
 FROM dqa_business.approval_events e LEFT JOIN dqa_business.request_signatures s ON s.tenant_id=e.tenant_id AND s.approval_event_id=e.id AND s.document_version_id=e.request_document_version_id
 LEFT JOIN dqa_private.request_template_stage_entries t ON t.tenant_id=e.tenant_id AND t.event_id=e.id
 WHERE e.tenant_id=p_tenant AND e.request_document_version_id=p_document AND (e.stage='REQUESTER' AND e.decision='SUBMIT' OR e.stage IN('REQUEST_MANAGER','LMS_1','LMS_2','LAB_PREPARE','LAB_RECEIVE','LAB_COMPLETE') AND e.decision='APPROVE')
 AND (e.stage NOT LIKE 'LAB_%' OR t.schedule_id=(SELECT id FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=e.request_id AND status NOT IN('DRAFT','CANCELLED')))
 ORDER BY e.stage,e.created_at DESC,e.id DESC)x) SELECT coalesce(c.value,'{}')||CASE WHEN NOT(coalesce(c.value,'{}') ? 'LMS_1') AND dqa_private.preapproval_document(p_tenant,p_document) THEN coalesce((SELECT jsonb_build_object('LMS_1',jsonb_build_object('fields',dqa_private.preapproval_auto_fields(d.plan),'preview_only',true)) FROM dqa_business.requests q JOIN dqa_business.schedule_drafts d ON d.tenant_id=q.tenant_id AND d.request_id=q.id JOIN dqa_private.preapproval_samples n ON n.tenant_id=q.tenant_id AND n.request_id=q.id WHERE q.tenant_id=p_tenant AND q.request_document_version_id=p_document AND d.document_version_id=p_document AND d.request_revision=q.revision AND n.document_id=p_document AND d.plan->>'sample_code'=n.sample_code AND d.plan->>'sample_revision'=n.revision::text),'{}') ELSE '{}' END FROM confirmed AS c(value) $$;
CREATE OR REPLACE FUNCTION dqa_private.validate_template_stage_fields(p_stage text, p_fields jsonb, p_required text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $$
DECLARE defs jsonb:=coalesce(dqa_private.template_stage_schema()->'inputs'->p_stage,'[]');item jsonb;v jsonb;k text;typ text;need boolean;dt date;i integer;
BEGIN
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR octet_length(p_fields::text)>12000 THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs) d WHERE d->>0=x)) THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
 FOR item IN SELECT jsonb_array_elements(defs) LOOP
  k:=item->>0;typ:=item->>2;v:=p_fields->k;
  IF v IS NOT NULL THEN
   IF typ='multi' THEN
    IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
    IF jsonb_array_length(v)>3 OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(v) x)<>jsonb_array_length(v) OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (item->3 @> jsonb_build_array(x))) THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
   ELSIF typ IN('choice','optionalChoice','pendingChoice') THEN
    IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR NOT(v#>>'{}'=ANY(CASE typ WHEN 'optionalChoice' THEN ARRAY['yes','no','not_applicable'] WHEN 'pendingChoice' THEN ARRAY['yes','no','pending'] ELSE ARRAY['yes','no'] END)) THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
   ELSIF typ='number' THEN
    IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR v::text !~ '^(0|[1-9][0-9]{0,5})$' THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
   ELSE
    IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>1000 THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
    IF typ='date' THEN BEGIN
     IF v#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
     dt:=(v#>>'{}')::date;IF to_char(dt,'YYYY-MM-DD')<>v#>>'{}' THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;
     EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END;END IF;
   END IF;
  END IF;
  need:=k=ANY(p_required);
  IF k='permitOther' THEN need:=need AND coalesce(p_fields->'permitTypes' @> '["other"]',false);
  ELSIF k='outsourceExpectedDate' THEN need:=need AND p_fields->>'outsourced'='yes';
  ELSIF k='resourcesExpectedDate' THEN need:=need AND p_fields->>'resourcesReady'='no';
  ELSIF k='fixturesImprovedDate' THEN need:=need AND p_fields->>'fixturesReady'='no';
  ELSIF k='operationImprovedDate' THEN need:=need AND p_fields->>'operationFamiliar'='no';
  ELSIF k='abnormalDescription' THEN need:=need AND p_fields->>'executionAbnormal'='yes';END IF;
  IF need AND (v IS NULL OR v='[]'::jsonb OR coalesce(length(btrim(v#>>'{}')),0)=0) THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_REQUIRED';END IF;
 END LOOP;
 IF p_fields->'permitTypes' @> '["other"]' AND coalesce(length(btrim(p_fields->>'permitOther')),0)=0 OR p_fields->>'executionAbnormal'='yes' AND coalesce(length(btrim(p_fields->>'abnormalDescription')),0)=0 THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_REQUIRED';END IF;
 FOR i IN 1..4 LOOP IF p_fields->>('equipmentEnd'||i)<p_fields->>('equipmentStart'||i) THEN RAISE EXCEPTION 'TEMPLATE_STAGE_FIELDS_INVALID';END IF;END LOOP;
END $$;
CREATE OR REPLACE FUNCTION dqa_private.template_stage_schema() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $schema$ SELECT '{"inputs":{"LMS_1":[["permitTypes","委託許可類別","multi",["new_product","design_change","other"]],["permitOther","其他許可內容","text"],["allowed","委託需求是否被許可","choice"],["criteriaClear","測試項目規範與判定基準是否清楚","choice"],["outsourced","是否有委外試驗","choice"],["outsourceExpectedDate","委外預計完成日","date"],["resourcesReady","設備工具夾具是否足以執行測試","choice"],["resourcesExpectedDate","設備工具夾具預計備妥日","date"],["sampleCode","測試件編號","text"],["equipment1","耐久設備 1","text"],["equipmentStart1","設備 1 預估開始日","date"],["equipmentEnd1","設備 1 預估結束日","date"],["equipment2","耐久設備 2","text"],["equipmentStart2","設備 2 預估開始日","date"],["equipmentEnd2","設備 2 預估結束日","date"],["equipment3","耐久設備 3","text"],["equipmentStart3","設備 3 預估開始日","date"],["equipmentEnd3","設備 3 預估結束日","date"],["equipment4","耐久設備 4","text"],["equipmentStart4","設備 4 預估開始日","date"],["equipmentEnd4","設備 4 預估結束日","date"],["plannedOperator","測試人員","text"],["plannedStartDate","計畫執行開始日","date"],["reportDueDate","報告產出日","date"]],"LAB_RECEIVE":[["sampleCorrect","樣品數量與狀態是否正確","choice"],["sampleQuantity","樣品數","number"],["sampleReceivedDate","收樣日","date"],["fixturesReady","治工夾具數量正確且功能正常","optionalChoice"],["fixturesImprovedDate","治工夾具改善完成日","date"],["operationFamiliar","是否熟悉物品與工具操作及使用","choice"],["operationImprovedDate","操作熟悉度改善完成日","date"],["outsourceBooked","委外項目是否完成預約","optionalChoice"],["outsourceCompletedDate","委外完成日（如已確定）","date"],["executionAbnormal","試驗前準備是否有異常","pendingChoice"],["abnormalDescription","異常說明","text"]],"LAB_COMPLETE":[["executionAbnormal","執行過程是否有異常","choice"],["abnormalDescription","異常說明","text"]],"LAB_PREPARE":[["sampleCorrect","樣品數量與狀態是否正確","choice"],["sampleQuantity","樣品數","number"],["sampleReceivedDate","收樣日","date"],["fixturesReady","治工夾具數量正確且功能正常","optionalChoice"],["fixturesImprovedDate","治工夾具改善完成日","date"],["operationFamiliar","是否熟悉物品與工具操作及使用","choice"],["operationImprovedDate","操作熟悉度改善完成日","date"],["outsourceBooked","委外項目是否完成預約","optionalChoice"],["outsourceCompletedDate","委外完成日（如已確定）","date"]]},"fields":[{"id":"lms1PermitNewProductCheck","label":"一階主管｜許可新產品","stage":"LMS_1","key":"permitTypes","type":"check","equals":"new_product"},{"id":"lms1PermitDesignChangeCheck","label":"一階主管｜許可設變","stage":"LMS_1","key":"permitTypes","type":"check","equals":"design_change"},{"id":"lms1PermitOtherCheck","label":"一階主管｜許可其他","stage":"LMS_1","key":"permitTypes","type":"check","equals":"other"},{"id":"lms1PermitOtherContent","label":"一階主管｜其他許可內容","stage":"LMS_1","key":"permitOther","type":"text"},{"id":"lms1AllowedYesCheck","label":"一階主管｜委託需求許可（是）","stage":"LMS_1","key":"allowed","type":"check","equals":"yes"},{"id":"lms1AllowedNoCheck","label":"一階主管｜委託需求許可（否）","stage":"LMS_1","key":"allowed","type":"check","equals":"no"},{"id":"lms1CriteriaClearYesCheck","label":"一階主管｜規範與判定基準清楚（是）","stage":"LMS_1","key":"criteriaClear","type":"check","equals":"yes"},{"id":"lms1CriteriaClearNoCheck","label":"一階主管｜規範與判定基準清楚（否）","stage":"LMS_1","key":"criteriaClear","type":"check","equals":"no"},{"id":"lms1OutsourcedYesCheck","label":"一階主管｜委外試驗（是）","stage":"LMS_1","key":"outsourced","type":"check","equals":"yes"},{"id":"lms1OutsourcedNoCheck","label":"一階主管｜委外試驗（否）","stage":"LMS_1","key":"outsourced","type":"check","equals":"no"},{"id":"lms1ResourcesReadyYesCheck","label":"一階主管｜設備工具夾具足以執行（是）","stage":"LMS_1","key":"resourcesReady","type":"check","equals":"yes"},{"id":"lms1ResourcesReadyNoCheck","label":"一階主管｜設備工具夾具足以執行（否）","stage":"LMS_1","key":"resourcesReady","type":"check","equals":"no"},{"id":"lms1OutsourceExpectedDate","label":"一階主管｜委外預計完成日","stage":"LMS_1","key":"outsourceExpectedDate","type":"date"},{"id":"lms1OutsourceExpectedDateYear","label":"一階主管｜委外預計完成日（年）","stage":"LMS_1","key":"outsourceExpectedDate","type":"dateYear"},{"id":"lms1OutsourceExpectedDateMonth","label":"一階主管｜委外預計完成日（月）","stage":"LMS_1","key":"outsourceExpectedDate","type":"dateMonth"},{"id":"lms1OutsourceExpectedDateDay","label":"一階主管｜委外預計完成日（日）","stage":"LMS_1","key":"outsourceExpectedDate","type":"dateDay"},{"id":"lms1ResourcesExpectedDate","label":"一階主管｜設備工具夾具預計備妥日","stage":"LMS_1","key":"resourcesExpectedDate","type":"date"},{"id":"lms1ResourcesExpectedDateYear","label":"一階主管｜設備工具夾具預計備妥日（年）","stage":"LMS_1","key":"resourcesExpectedDate","type":"dateYear"},{"id":"lms1ResourcesExpectedDateMonth","label":"一階主管｜設備工具夾具預計備妥日（月）","stage":"LMS_1","key":"resourcesExpectedDate","type":"dateMonth"},{"id":"lms1ResourcesExpectedDateDay","label":"一階主管｜設備工具夾具預計備妥日（日）","stage":"LMS_1","key":"resourcesExpectedDate","type":"dateDay"},{"id":"lms1SampleCode","label":"一階主管｜測試件編號","stage":"LMS_1","key":"sampleCode","type":"text"},{"id":"lms1Equipment1","label":"一階主管｜耐久設備 1","stage":"LMS_1","key":"equipment1","type":"text"},{"id":"lms1EquipmentStart1","label":"一階主管｜設備 1 預估開始日","stage":"LMS_1","key":"equipmentStart1","type":"date"},{"id":"lms1EquipmentStart1Year","label":"一階主管｜設備 1 預估開始日（年）","stage":"LMS_1","key":"equipmentStart1","type":"dateYear"},{"id":"lms1EquipmentStart1Month","label":"一階主管｜設備 1 預估開始日（月）","stage":"LMS_1","key":"equipmentStart1","type":"dateMonth"},{"id":"lms1EquipmentStart1Day","label":"一階主管｜設備 1 預估開始日（日）","stage":"LMS_1","key":"equipmentStart1","type":"dateDay"},{"id":"lms1EquipmentEnd1","label":"一階主管｜設備 1 預估結束日","stage":"LMS_1","key":"equipmentEnd1","type":"date"},{"id":"lms1EquipmentEnd1Year","label":"一階主管｜設備 1 預估結束日（年）","stage":"LMS_1","key":"equipmentEnd1","type":"dateYear"},{"id":"lms1EquipmentEnd1Month","label":"一階主管｜設備 1 預估結束日（月）","stage":"LMS_1","key":"equipmentEnd1","type":"dateMonth"},{"id":"lms1EquipmentEnd1Day","label":"一階主管｜設備 1 預估結束日（日）","stage":"LMS_1","key":"equipmentEnd1","type":"dateDay"},{"id":"lms1Equipment2","label":"一階主管｜耐久設備 2","stage":"LMS_1","key":"equipment2","type":"text"},{"id":"lms1EquipmentStart2","label":"一階主管｜設備 2 預估開始日","stage":"LMS_1","key":"equipmentStart2","type":"date"},{"id":"lms1EquipmentStart2Year","label":"一階主管｜設備 2 預估開始日（年）","stage":"LMS_1","key":"equipmentStart2","type":"dateYear"},{"id":"lms1EquipmentStart2Month","label":"一階主管｜設備 2 預估開始日（月）","stage":"LMS_1","key":"equipmentStart2","type":"dateMonth"},{"id":"lms1EquipmentStart2Day","label":"一階主管｜設備 2 預估開始日（日）","stage":"LMS_1","key":"equipmentStart2","type":"dateDay"},{"id":"lms1EquipmentEnd2","label":"一階主管｜設備 2 預估結束日","stage":"LMS_1","key":"equipmentEnd2","type":"date"},{"id":"lms1EquipmentEnd2Year","label":"一階主管｜設備 2 預估結束日（年）","stage":"LMS_1","key":"equipmentEnd2","type":"dateYear"},{"id":"lms1EquipmentEnd2Month","label":"一階主管｜設備 2 預估結束日（月）","stage":"LMS_1","key":"equipmentEnd2","type":"dateMonth"},{"id":"lms1EquipmentEnd2Day","label":"一階主管｜設備 2 預估結束日（日）","stage":"LMS_1","key":"equipmentEnd2","type":"dateDay"},{"id":"lms1Equipment3","label":"一階主管｜耐久設備 3","stage":"LMS_1","key":"equipment3","type":"text"},{"id":"lms1EquipmentStart3","label":"一階主管｜設備 3 預估開始日","stage":"LMS_1","key":"equipmentStart3","type":"date"},{"id":"lms1EquipmentStart3Year","label":"一階主管｜設備 3 預估開始日（年）","stage":"LMS_1","key":"equipmentStart3","type":"dateYear"},{"id":"lms1EquipmentStart3Month","label":"一階主管｜設備 3 預估開始日（月）","stage":"LMS_1","key":"equipmentStart3","type":"dateMonth"},{"id":"lms1EquipmentStart3Day","label":"一階主管｜設備 3 預估開始日（日）","stage":"LMS_1","key":"equipmentStart3","type":"dateDay"},{"id":"lms1EquipmentEnd3","label":"一階主管｜設備 3 預估結束日","stage":"LMS_1","key":"equipmentEnd3","type":"date"},{"id":"lms1EquipmentEnd3Year","label":"一階主管｜設備 3 預估結束日（年）","stage":"LMS_1","key":"equipmentEnd3","type":"dateYear"},{"id":"lms1EquipmentEnd3Month","label":"一階主管｜設備 3 預估結束日（月）","stage":"LMS_1","key":"equipmentEnd3","type":"dateMonth"},{"id":"lms1EquipmentEnd3Day","label":"一階主管｜設備 3 預估結束日（日）","stage":"LMS_1","key":"equipmentEnd3","type":"dateDay"},{"id":"lms1Equipment4","label":"一階主管｜耐久設備 4","stage":"LMS_1","key":"equipment4","type":"text"},{"id":"lms1EquipmentStart4","label":"一階主管｜設備 4 預估開始日","stage":"LMS_1","key":"equipmentStart4","type":"date"},{"id":"lms1EquipmentStart4Year","label":"一階主管｜設備 4 預估開始日（年）","stage":"LMS_1","key":"equipmentStart4","type":"dateYear"},{"id":"lms1EquipmentStart4Month","label":"一階主管｜設備 4 預估開始日（月）","stage":"LMS_1","key":"equipmentStart4","type":"dateMonth"},{"id":"lms1EquipmentStart4Day","label":"一階主管｜設備 4 預估開始日（日）","stage":"LMS_1","key":"equipmentStart4","type":"dateDay"},{"id":"lms1EquipmentEnd4","label":"一階主管｜設備 4 預估結束日","stage":"LMS_1","key":"equipmentEnd4","type":"date"},{"id":"lms1EquipmentEnd4Year","label":"一階主管｜設備 4 預估結束日（年）","stage":"LMS_1","key":"equipmentEnd4","type":"dateYear"},{"id":"lms1EquipmentEnd4Month","label":"一階主管｜設備 4 預估結束日（月）","stage":"LMS_1","key":"equipmentEnd4","type":"dateMonth"},{"id":"lms1EquipmentEnd4Day","label":"一階主管｜設備 4 預估結束日（日）","stage":"LMS_1","key":"equipmentEnd4","type":"dateDay"},{"id":"lms1PlannedOperator","label":"一階主管｜測試人員","stage":"LMS_1","key":"plannedOperator","type":"text"},{"id":"lms1PlannedStartDate","label":"一階主管｜計畫執行開始日","stage":"LMS_1","key":"plannedStartDate","type":"date"},{"id":"lms1PlannedStartDateYear","label":"一階主管｜計畫執行開始日（年）","stage":"LMS_1","key":"plannedStartDate","type":"dateYear"},{"id":"lms1PlannedStartDateMonth","label":"一階主管｜計畫執行開始日（月）","stage":"LMS_1","key":"plannedStartDate","type":"dateMonth"},{"id":"lms1PlannedStartDateDay","label":"一階主管｜計畫執行開始日（日）","stage":"LMS_1","key":"plannedStartDate","type":"dateDay"},{"id":"lms1ReportDueDate","label":"一階主管｜報告產出日","stage":"LMS_1","key":"reportDueDate","type":"date"},{"id":"lms1ReportDueDateYear","label":"一階主管｜報告產出日（年）","stage":"LMS_1","key":"reportDueDate","type":"dateYear"},{"id":"lms1ReportDueDateMonth","label":"一階主管｜報告產出日（月）","stage":"LMS_1","key":"reportDueDate","type":"dateMonth"},{"id":"lms1ReportDueDateDay","label":"一階主管｜報告產出日（日）","stage":"LMS_1","key":"reportDueDate","type":"dateDay"},{"id":"labSampleCorrectYesCheck","label":"執行者｜樣品數量與狀態是否正確（是）","stage":"LAB_RECEIVE","key":"sampleCorrect","type":"check","equals":"yes"},{"id":"labSampleCorrectNoCheck","label":"執行者｜樣品數量與狀態是否正確（否）","stage":"LAB_RECEIVE","key":"sampleCorrect","type":"check","equals":"no"},{"id":"labSampleQuantity","label":"執行者｜樣品數","stage":"LAB_RECEIVE","key":"sampleQuantity","type":"number"},{"id":"labSampleReceivedDate","label":"執行者｜收樣日","stage":"LAB_RECEIVE","key":"sampleReceivedDate","type":"date"},{"id":"labSampleReceivedDateYear","label":"執行者｜收樣日（年）","stage":"LAB_RECEIVE","key":"sampleReceivedDate","type":"dateYear"},{"id":"labSampleReceivedDateMonth","label":"執行者｜收樣日（月）","stage":"LAB_RECEIVE","key":"sampleReceivedDate","type":"dateMonth"},{"id":"labSampleReceivedDateDay","label":"執行者｜收樣日（日）","stage":"LAB_RECEIVE","key":"sampleReceivedDate","type":"dateDay"},{"id":"labFixturesReadyYesCheck","label":"執行者｜治工夾具數量正確且功能正常（是）","stage":"LAB_RECEIVE","key":"fixturesReady","type":"check","equals":"yes"},{"id":"labFixturesReadyNoCheck","label":"執行者｜治工夾具數量正確且功能正常（否）","stage":"LAB_RECEIVE","key":"fixturesReady","type":"check","equals":"no"},{"id":"labFixturesReadyNotApplicableCheck","label":"執行者｜治工夾具數量正確且功能正常（不適用）","stage":"LAB_RECEIVE","key":"fixturesReady","type":"check","equals":"not_applicable"},{"id":"labFixturesImprovedDate","label":"執行者｜治工夾具改善完成日","stage":"LAB_RECEIVE","key":"fixturesImprovedDate","type":"date"},{"id":"labFixturesImprovedDateYear","label":"執行者｜治工夾具改善完成日（年）","stage":"LAB_RECEIVE","key":"fixturesImprovedDate","type":"dateYear"},{"id":"labFixturesImprovedDateMonth","label":"執行者｜治工夾具改善完成日（月）","stage":"LAB_RECEIVE","key":"fixturesImprovedDate","type":"dateMonth"},{"id":"labFixturesImprovedDateDay","label":"執行者｜治工夾具改善完成日（日）","stage":"LAB_RECEIVE","key":"fixturesImprovedDate","type":"dateDay"},{"id":"labOperationFamiliarYesCheck","label":"執行者｜是否熟悉物品與工具操作及使用（是）","stage":"LAB_RECEIVE","key":"operationFamiliar","type":"check","equals":"yes"},{"id":"labOperationFamiliarNoCheck","label":"執行者｜是否熟悉物品與工具操作及使用（否）","stage":"LAB_RECEIVE","key":"operationFamiliar","type":"check","equals":"no"},{"id":"labOperationImprovedDate","label":"執行者｜操作熟悉度改善完成日","stage":"LAB_RECEIVE","key":"operationImprovedDate","type":"date"},{"id":"labOperationImprovedDateYear","label":"執行者｜操作熟悉度改善完成日（年）","stage":"LAB_RECEIVE","key":"operationImprovedDate","type":"dateYear"},{"id":"labOperationImprovedDateMonth","label":"執行者｜操作熟悉度改善完成日（月）","stage":"LAB_RECEIVE","key":"operationImprovedDate","type":"dateMonth"},{"id":"labOperationImprovedDateDay","label":"執行者｜操作熟悉度改善完成日（日）","stage":"LAB_RECEIVE","key":"operationImprovedDate","type":"dateDay"},{"id":"labOutsourceBookedYesCheck","label":"執行者｜委外項目是否完成預約（是）","stage":"LAB_RECEIVE","key":"outsourceBooked","type":"check","equals":"yes"},{"id":"labOutsourceBookedNoCheck","label":"執行者｜委外項目是否完成預約（否）","stage":"LAB_RECEIVE","key":"outsourceBooked","type":"check","equals":"no"},{"id":"labOutsourceBookedNotApplicableCheck","label":"執行者｜委外項目是否完成預約（不適用）","stage":"LAB_RECEIVE","key":"outsourceBooked","type":"check","equals":"not_applicable"},{"id":"labOutsourceCompletedDate","label":"執行者｜委外完成日（如已確定）","stage":"LAB_RECEIVE","key":"outsourceCompletedDate","type":"date"},{"id":"labOutsourceCompletedDateYear","label":"執行者｜委外完成日（如已確定）（年）","stage":"LAB_RECEIVE","key":"outsourceCompletedDate","type":"dateYear"},{"id":"labOutsourceCompletedDateMonth","label":"執行者｜委外完成日（如已確定）（月）","stage":"LAB_RECEIVE","key":"outsourceCompletedDate","type":"dateMonth"},{"id":"labOutsourceCompletedDateDay","label":"執行者｜委外完成日（如已確定）（日）","stage":"LAB_RECEIVE","key":"outsourceCompletedDate","type":"dateDay"},{"id":"labExecutionAbnormalYesCheck","label":"執行者｜試驗前準備是否有異常（是）","stage":"LAB_RECEIVE","key":"executionAbnormal","type":"check","equals":"yes"},{"id":"labExecutionAbnormalNoCheck","label":"執行者｜試驗前準備是否有異常（否）","stage":"LAB_RECEIVE","key":"executionAbnormal","type":"check","equals":"no"},{"id":"labAbnormalDescription","label":"執行者｜異常說明","stage":"LAB_RECEIVE","key":"abnormalDescription","type":"text"},{"id":"requesterSignature","label":"委託者｜簽名圖檔","stage":"REQUESTER","key":"","type":"signature"},{"id":"requesterName","label":"委託者｜姓名","stage":"REQUESTER","key":"","type":"actor"},{"id":"requesterSignedDate","label":"委託者｜簽名日期","stage":"REQUESTER","key":"","type":"SignedDate"},{"id":"requesterSignedYear","label":"委託者｜簽名年","stage":"REQUESTER","key":"","type":"SignedYear"},{"id":"requesterSignedMonth","label":"委託者｜簽名月","stage":"REQUESTER","key":"","type":"SignedMonth"},{"id":"requesterSignedDay","label":"委託者｜簽名日","stage":"REQUESTER","key":"","type":"SignedDay"},{"id":"requestManagerSignature","label":"直屬主管｜簽名圖檔","stage":"REQUEST_MANAGER","key":"","type":"signature"},{"id":"requestManagerName","label":"直屬主管｜姓名","stage":"REQUEST_MANAGER","key":"","type":"actor"},{"id":"requestManagerSignedDate","label":"直屬主管｜簽名日期","stage":"REQUEST_MANAGER","key":"","type":"SignedDate"},{"id":"requestManagerSignedYear","label":"直屬主管｜簽名年","stage":"REQUEST_MANAGER","key":"","type":"SignedYear"},{"id":"requestManagerSignedMonth","label":"直屬主管｜簽名月","stage":"REQUEST_MANAGER","key":"","type":"SignedMonth"},{"id":"requestManagerSignedDay","label":"直屬主管｜簽名日","stage":"REQUEST_MANAGER","key":"","type":"SignedDay"},{"id":"lms1Signature","label":"一階主管｜簽名圖檔","stage":"LMS_1","key":"","type":"signature"},{"id":"lms1Name","label":"一階主管｜姓名","stage":"LMS_1","key":"","type":"actor"},{"id":"lms1SignedDate","label":"一階主管｜簽名日期","stage":"LMS_1","key":"","type":"SignedDate"},{"id":"lms1SignedYear","label":"一階主管｜簽名年","stage":"LMS_1","key":"","type":"SignedYear"},{"id":"lms1SignedMonth","label":"一階主管｜簽名月","stage":"LMS_1","key":"","type":"SignedMonth"},{"id":"lms1SignedDay","label":"一階主管｜簽名日","stage":"LMS_1","key":"","type":"SignedDay"},{"id":"lms2Signature","label":"二階主管｜簽名圖檔","stage":"LMS_2","key":"","type":"signature"},{"id":"lms2Name","label":"二階主管｜姓名","stage":"LMS_2","key":"","type":"actor"},{"id":"lms2SignedDate","label":"二階主管｜簽名日期","stage":"LMS_2","key":"","type":"SignedDate"},{"id":"lms2SignedYear","label":"二階主管｜簽名年","stage":"LMS_2","key":"","type":"SignedYear"},{"id":"lms2SignedMonth","label":"二階主管｜簽名月","stage":"LMS_2","key":"","type":"SignedMonth"},{"id":"lms2SignedDay","label":"二階主管｜簽名日","stage":"LMS_2","key":"","type":"SignedDay"},{"id":"labReceiptSignature","label":"執行者試驗前確認｜簽名圖檔","stage":"LAB_RECEIVE","key":"","type":"signature"},{"id":"labReceiptName","label":"執行者試驗前確認｜姓名","stage":"LAB_RECEIVE","key":"","type":"actor"},{"id":"labReceiptSignedDate","label":"執行者試驗前確認｜簽名日期","stage":"LAB_RECEIVE","key":"","type":"SignedDate"},{"id":"labReceiptSignedYear","label":"執行者試驗前確認｜簽名年","stage":"LAB_RECEIVE","key":"","type":"SignedYear"},{"id":"labReceiptSignedMonth","label":"執行者試驗前確認｜簽名月","stage":"LAB_RECEIVE","key":"","type":"SignedMonth"},{"id":"labReceiptSignedDay","label":"執行者試驗前確認｜簽名日","stage":"LAB_RECEIVE","key":"","type":"SignedDay"},{"id":"labCompletionSignature","label":"執行者完成｜簽名圖檔","stage":"LAB_COMPLETE","key":"","type":"signature"},{"id":"labCompletionName","label":"執行者完成｜姓名","stage":"LAB_COMPLETE","key":"","type":"actor"},{"id":"labCompletionSignedDate","label":"執行者完成｜簽名日期","stage":"LAB_COMPLETE","key":"","type":"SignedDate"},{"id":"labCompletionSignedYear","label":"執行者完成｜簽名年","stage":"LAB_COMPLETE","key":"","type":"SignedYear"},{"id":"labCompletionSignedMonth","label":"執行者完成｜簽名月","stage":"LAB_COMPLETE","key":"","type":"SignedMonth"},{"id":"labCompletionSignedDay","label":"執行者完成｜簽名日","stage":"LAB_COMPLETE","key":"","type":"SignedDay"}]}'::jsonb $schema$;
CREATE OR REPLACE FUNCTION dqa_business.save_document_mapping(p_tenant uuid, p_operation uuid, p_kind text, p_file uuid, p_revision integer, p_sha256 text, p_mapping jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE s jsonb;fp text;op dqa_private.document_mapping_operations;old dqa_private.document_cell_mappings;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_file IS NULL OR p_kind NOT IN('REQUEST','REPORT') OR p_kind IS NULL OR p_revision IS NULL OR p_revision<0 OR p_sha256 IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_typeof(p_mapping) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_array_length(p_mapping) NOT BETWEEN 1 AND 224 OR octet_length(p_mapping::text)>60000 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r WHERE jsonb_typeof(r)<>'object' OR (r-'field'-'sheet'-'cell')<>'{}' OR jsonb_typeof(r->'field') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'sheet') IS DISTINCT FROM 'string' OR length(r->>'sheet') NOT BETWEEN 1 AND 31 OR jsonb_typeof(r->'cell') IS DISTINCT FROM 'string' OR r->>'cell' !~ '^([A-Z]|A[A-V])([1-9][0-9]{0,2}|1[0-9]{3}|2000)$' OR r->>'field' NOT IN('id','productCode','productType','customer','customerPartNo','dueDate','quantity','department','requester','supervisor','priority','project','testItems','specification','judgementRequired','judgementCriteria','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','notes','sourceInHouse','sourceOverseas','sourceCustomer','sourceSupplier','sourceCompetitor','judgementRequiredCheck','judgementNotRequiredCheck','purposeNewProduct','purposeEV','purposeReproduction','purposeOtherSelected','purposeDesignChange','purposeDV','purposePeriodic','purposeMassProduct','purposePV','purposeOtherContent','sourceInHouseContent','sourceOverseasContent','sourceCustomerContent','sourceSupplierContent','sourceCompetitorContent','lms1Equipment4','lms1EquipmentStart4','lms1EquipmentStart4Year','lms1EquipmentStart4Month','lms1EquipmentStart4Day','lms1EquipmentEnd4','lms1EquipmentEnd4Year','lms1EquipmentEnd4Month','lms1EquipmentEnd4Day','lms1PermitNewProductCheck','lms1PermitDesignChangeCheck','lms1PermitOtherCheck','lms1PermitOtherContent','lms1AllowedYesCheck','lms1AllowedNoCheck','lms1CriteriaClearYesCheck','lms1CriteriaClearNoCheck','lms1OutsourcedYesCheck','lms1OutsourcedNoCheck','lms1ResourcesReadyYesCheck','lms1ResourcesReadyNoCheck','lms1OutsourceExpectedDate','lms1OutsourceExpectedDateYear','lms1OutsourceExpectedDateMonth','lms1OutsourceExpectedDateDay','lms1ResourcesExpectedDate','lms1ResourcesExpectedDateYear','lms1ResourcesExpectedDateMonth','lms1ResourcesExpectedDateDay','lms1SampleCode','lms1Equipment1','lms1EquipmentStart1','lms1EquipmentStart1Year','lms1EquipmentStart1Month','lms1EquipmentStart1Day','lms1EquipmentEnd1','lms1EquipmentEnd1Year','lms1EquipmentEnd1Month','lms1EquipmentEnd1Day','lms1Equipment2','lms1EquipmentStart2','lms1EquipmentStart2Year','lms1EquipmentStart2Month','lms1EquipmentStart2Day','lms1EquipmentEnd2','lms1EquipmentEnd2Year','lms1EquipmentEnd2Month','lms1EquipmentEnd2Day','lms1Equipment3','lms1EquipmentStart3','lms1EquipmentStart3Year','lms1EquipmentStart3Month','lms1EquipmentStart3Day','lms1EquipmentEnd3','lms1EquipmentEnd3Year','lms1EquipmentEnd3Month','lms1EquipmentEnd3Day','lms1PlannedOperator','lms1PlannedStartDate','lms1PlannedStartDateYear','lms1PlannedStartDateMonth','lms1PlannedStartDateDay','lms1ReportDueDate','lms1ReportDueDateYear','lms1ReportDueDateMonth','lms1ReportDueDateDay','labSampleCorrectYesCheck','labSampleCorrectNoCheck','labSampleQuantity','labSampleReceivedDate','labSampleReceivedDateYear','labSampleReceivedDateMonth','labSampleReceivedDateDay','labFixturesReadyYesCheck','labFixturesReadyNoCheck','labFixturesReadyNotApplicableCheck','labFixturesImprovedDate','labFixturesImprovedDateYear','labFixturesImprovedDateMonth','labFixturesImprovedDateDay','labOperationFamiliarYesCheck','labOperationFamiliarNoCheck','labOperationImprovedDate','labOperationImprovedDateYear','labOperationImprovedDateMonth','labOperationImprovedDateDay','labOutsourceBookedYesCheck','labOutsourceBookedNoCheck','labOutsourceBookedNotApplicableCheck','labOutsourceCompletedDate','labOutsourceCompletedDateYear','labOutsourceCompletedDateMonth','labOutsourceCompletedDateDay','labExecutionAbnormalYesCheck','labExecutionAbnormalNoCheck','labAbnormalDescription','requesterSignature','requesterName','requesterSignedDate','requesterSignedYear','requesterSignedMonth','requesterSignedDay','requestManagerSignature','requestManagerName','requestManagerSignedDate','requestManagerSignedYear','requestManagerSignedMonth','requestManagerSignedDay','lms1Signature','lms1Name','lms1SignedDate','lms1SignedYear','lms1SignedMonth','lms1SignedDay','lms2Signature','lms2Name','lms2SignedDate','lms2SignedYear','lms2SignedMonth','lms2SignedDay','labReceiptSignature','labReceiptName','labReceiptSignedDate','labReceiptSignedYear','labReceiptSignedMonth','labReceiptSignedDay','labCompletionSignature','labCompletionName','labCompletionSignedDate','labCompletionSignedYear','labCompletionSignedMonth','labCompletionSignedDay')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r GROUP BY r->>'sheet',r->>'cell' HAVING count(*)>1) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF p_kind='REPORT' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r JOIN jsonb_array_elements(dqa_private.template_stage_schema()->'fields') f ON f->>'id'=r->>'field') THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_file,p_revision,p_sha256,p_mapping)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('mapping-op:'||p_tenant||':'||p_operation,0));SELECT * INTO op FROM dqa_private.document_mapping_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('document-mapping:'||p_tenant,0));s:=dqa_business.document_mapping_source(p_tenant,p_kind,p_file);
 IF s->>'sha256'<>p_sha256 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;
 SELECT * INTO old FROM dqa_private.document_cell_mappings WHERE tenant_id=p_tenant AND kind=p_kind AND file_id=p_file;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;
 INSERT INTO dqa_private.document_cell_mappings(tenant_id,kind,file_id,sha256,revision,mapping) VALUES(p_tenant,p_kind,p_file,p_sha256,1,p_mapping) ON CONFLICT(tenant_id,kind,file_id) DO UPDATE SET mapping=p_mapping,revision=dqa_private.document_cell_mappings.revision+1;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',coalesce(old.revision,0)+1);INSERT INTO dqa_private.document_mapping_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'document_cell_mappings',p_file,'UPDATE',ARRAY['mapping','revision']);RETURN result;
END $$;
ALTER TABLE dqa_business.lab_operations DROP CONSTRAINT lab_operations_action_check;
ALTER TABLE dqa_business.lab_operations ADD CONSTRAINT lab_operations_action_check CHECK(action IN('PREPARE','RECEIVE','START','CANCEL','INTERRUPT','COMPLETE','SUBMIT_REPORT'));
CREATE FUNCTION dqa_private.preapproval_required_fields(p_tenant uuid,p_document uuid,p_stage text,p_mapping jsonb) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE keys text[];BEGIN
 IF NOT dqa_private.preapproval_document(p_tenant,p_document) AND (p_stage NOT LIKE 'LAB_%' OR NOT dqa_private.preflight_required(p_tenant,p_document)) THEN RETURN dqa_private.template_stage_required(p_stage,p_mapping);END IF;
 keys:=dqa_private.template_stage_required(CASE WHEN p_stage='LAB_PREPARE' THEN 'LAB_RECEIVE' ELSE p_stage END,p_mapping);
 IF p_stage='LMS_1' THEN SELECT coalesce(array_agg(k),'{}') INTO keys FROM unnest(keys) k WHERE NOT k=ANY(dqa_private.preapproval_derived_keys());keys:=keys||ARRAY['permitTypes','allowed','criteriaClear','resourcesReady'];
 ELSIF p_stage='LAB_PREPARE' THEN keys:=array_remove(array_remove(keys,'executionAbnormal'),'abnormalDescription')||ARRAY['sampleCorrect','sampleQuantity','sampleReceivedDate','fixturesReady','operationFamiliar','outsourceBooked'];
 ELSIF p_stage='LAB_RECEIVE' THEN keys:=keys||ARRAY['sampleCorrect','sampleQuantity','sampleReceivedDate','fixturesReady','operationFamiliar','outsourceBooked','executionAbnormal'];
 ELSIF p_stage='LAB_COMPLETE' THEN keys:='{}';END IF;RETURN keys;
END $$;
CREATE FUNCTION dqa_business.prepare_request_template_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_fields jsonb,p_plan_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;effective jsonb;BEGIN
 result:=dqa_business.prepare_request_operation(p_tenant,p_operation,p_command);
 effective:=dqa_private.preapproval_bind_plan(p_tenant,p_operation,p_command,p_fields,p_plan_revision,true);
 PERFORM dqa_private.bind_template_stage_operation(p_tenant,p_operation,'WORKFLOW',p_command,effective,true);RETURN result;
END $$;
CREATE FUNCTION dqa_business.execute_request_template_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_fields jsonb,p_plan_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE effective jsonb;BEGIN
 effective:=dqa_private.preapproval_bind_plan(p_tenant,p_operation,p_command,p_fields,p_plan_revision,false);
 PERFORM dqa_private.bind_template_stage_operation(p_tenant,p_operation,'WORKFLOW',p_command,effective,false);RETURN dqa_business.execute_request_operation(p_tenant,p_operation,p_command);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.prepare_request_template_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_fields jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT dqa_business.prepare_request_template_operation(p_tenant,p_operation,p_command,p_fields,NULL) $$;
CREATE OR REPLACE FUNCTION dqa_business.execute_request_template_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_fields jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT dqa_business.execute_request_template_operation(p_tenant,p_operation,p_command,p_fields,NULL) $$;
DO $$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_private' AND (p.proname LIKE 'preapproval_%' OR p.proname IN('preparation_ready','preflight_required')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);END LOOP;
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('preapproval_snapshot','preapproval_context','save_preapproval_sample_number','preapproval_number_result','prepare_request_template_operation','execute_request_template_operation') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END LOOP;
END $$;
