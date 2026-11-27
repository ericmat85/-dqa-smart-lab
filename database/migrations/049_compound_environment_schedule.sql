-- A compound protocol is one signed project request and one atomic reservation.
-- Every selected device and the executor are reserved for the complete chain.
-- Stage durations remain exact; work-hour violations are rejected, never padded.
CREATE FUNCTION dqa_private.compound_trial_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $rules$ SELECT '{"HIGH_HUMIDITY": {"equipment_pattern": "恆溫恆濕|環境試驗箱", "mode": "batch", "fixed_duration": true, "hours": 250}, "THERMAL_SHOCK": {"equipment_pattern": "冷熱衝擊", "mode": "batch", "fixed_duration": false, "hours": 48}, "VIBRATION_DURABILITY": {"equipment_pattern": "振動", "mode": "serial", "fixed_duration": true, "hours": 20}, "HUMIDITY_CYCLE": {"equipment_pattern": "恆溫恆濕|環境試驗箱", "mode": "batch", "fixed_duration": false, "hours": 48}, "THERMAL_CYCLE": {"equipment_pattern": "環境試驗箱|恆溫恆濕", "mode": "batch", "fixed_duration": false, "hours": 48}, "LOW_TEMPERATURE": {"equipment_pattern": "環境試驗箱|恆溫恆濕", "mode": "batch", "fixed_duration": false, "hours": 48}, "HIGH_TEMPERATURE": {"equipment_pattern": "環境試驗箱|恆溫恆濕|高溫爐", "mode": "batch", "fixed_duration": false, "hours": 48}, "SALT_SPRAY": {"equipment_pattern": "鹽霧", "mode": "batch", "fixed_duration": false, "hours": 48}, "WATER_INGRESS": {"equipment_pattern": "防水", "mode": "serial", "fixed_duration": false, "hours": 1}, "ESD": {"equipment_pattern": "ESD", "mode": "serial", "fixed_duration": false, "hours": 0.5}, "WEATHERING": {"equipment_pattern": "耐候", "mode": "batch", "fixed_duration": false, "hours": 48}, "DUST": {"equipment_pattern": "防塵", "mode": "batch", "fixed_duration": false, "hours": 8}, "TENSILE": {"equipment_pattern": "拉力", "mode": "serial", "fixed_duration": false, "hours": 1}, "INSPECTION": {"equipment_pattern": "顯微鏡", "mode": "serial", "fixed_duration": false, "hours": 0.25}, "MECHANICAL_SHOCK": {"equipment_pattern": "機械衝擊", "mode": "serial", "fixed_duration": false, "hours": 1}, "DROP": {"equipment_pattern": "跌落", "mode": "serial", "fixed_duration": false, "hours": 1}, "INSERTION": {"equipment_pattern": "插拔", "mode": "serial", "fixed_duration": false, "hours": 20}, "VOLTAGE": {"equipment_pattern": "電源|電壓", "mode": "serial", "fixed_duration": false, "hours": 1}, "EMC": {"equipment_pattern": "EMC|電磁相容", "mode": "serial", "fixed_duration": false, "hours": 2}}'::jsonb $rules$;

ALTER FUNCTION dqa_private.validate_original_fields(jsonb,text) RENAME TO validate_single_original_fields_v48;
CREATE FUNCTION dqa_private.validate_original_fields(p_details jsonb,p_signature text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_details IS NOT NULL AND octet_length(p_details::text)>20000 THEN RAISE EXCEPTION 'ORIGINAL_FORM_INVALID';END IF;
 IF p_details ? 'compoundStages' AND (jsonb_typeof(p_details->'compoundStages') IS DISTINCT FROM 'array' OR p_details->>'compoundVersion' IS DISTINCT FROM '1') THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF NOT(p_details ? 'compoundStages') AND p_details ? 'compoundVersion' THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 PERFORM dqa_private.validate_single_original_fields_v48(p_details-ARRAY['compoundStages','compoundVersion'],p_signature);
END $$;
REVOKE ALL ON FUNCTION dqa_private.validate_original_fields(jsonb,text),dqa_private.validate_single_original_fields_v48(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.validate_compound_protocol(p_tenant uuid,p_stages jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE stage jsonb;t dqa_business.trial_definitions;rule jsonb;total integer:=0;
BEGIN
 IF jsonb_typeof(p_stages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_stages) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 FOR stage IN SELECT v FROM jsonb_array_elements(p_stages) v LOOP
  IF jsonb_typeof(stage) IS DISTINCT FROM 'object' OR NOT(stage ?& ARRAY['trial_id','trial_revision','profile_id','name','label','duration_minutes','operation','specification','acceptance','judgementRequired']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(stage) k WHERE k NOT IN('trial_id','trial_revision','profile_id','name','label','duration_minutes','operation','specification','acceptance','judgementRequired')) OR coalesce(stage->>'trial_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(stage->>'trial_revision','')!~'^[1-9][0-9]{0,14}$' OR jsonb_typeof(stage->'duration_minutes') IS DISTINCT FROM 'number' OR coalesce(stage->>'duration_minutes','')!~'^[1-9][0-9]{0,5}$' OR length(btrim(coalesce(stage->>'label',''))) NOT BETWEEN 1 AND 100 OR coalesce(stage->>'operation','') NOT IN('continuous','operator') OR coalesce(stage->>'judgementRequired','') NOT IN('需作判定','不作判定') OR length(btrim(coalesce(stage->>'specification',''))) NOT BETWEEN 1 AND 3000 OR length(coalesce(stage->>'acceptance',''))>3000 OR stage->>'judgementRequired'='需作判定' AND length(btrim(coalesce(stage->>'acceptance','')))=0 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
  SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(stage->>'trial_id')::uuid AND enabled FOR SHARE;
  rule:=dqa_private.compound_trial_rules()->t.profile_code;
  IF NOT FOUND OR rule IS NULL OR stage->>'profile_id' IS DISTINCT FROM t.profile_code OR stage->>'name' IS DISTINCT FROM t.name OR (stage->>'trial_revision')::bigint<>t.revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='COMPOUND_CATALOG_CHANGED';END IF;
  IF (rule->>'fixed_duration')::boolean AND (stage->>'duration_minutes')::integer<>(rule->>'hours')::numeric*60 OR rule->>'mode'<>'batch' AND stage->>'operation'='continuous' THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
  total:=total+(stage->>'duration_minutes')::integer;IF total>525600 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 END LOOP;
END $$;
CREATE FUNCTION dqa_private.guard_compound_protocol() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t dqa_business.trial_definitions;
BEGIN
 IF TG_OP='UPDATE' AND NEW.form_details IS NOT DISTINCT FROM OLD.form_details AND NEW.trial_id IS NOT DISTINCT FROM OLD.trial_id THEN RETURN NEW;END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=NEW.tenant_id AND id=NEW.trial_id;
 IF t.profile_code='COMPOUND_ENVIRONMENT' THEN
  IF NEW.form_details->>'priority' IS DISTINCT FROM '專案' OR NEW.form_details->>'compoundVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_REQUIRED';END IF;
  PERFORM dqa_private.validate_compound_protocol(NEW.tenant_id,NEW.form_details->'compoundStages');
 ELSIF NEW.form_details ? 'compoundStages' THEN RAISE EXCEPTION 'COMPOUND_TRIAL_REQUIRED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER compound_protocol BEFORE INSERT OR UPDATE ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_compound_protocol();
INSERT INTO dqa_business.trial_definitions(tenant_id,legacy_id,name,profile_code,specification,specification_version,acceptance,equipment_reference,source_kind)
SELECT id,'TRIAL-'||md5('compound-environment:'||id::text),'複合式環境試驗','COMPOUND_ENVIRONMENT','依已核對的階段順序與總工時連續執行；設備切換限平日作業時段。','COMPOUND-1','依各階段已核對的判定基準逐項確認。','各階段分別指定設備，整串保留資源。','MANUAL' FROM dqa_business.tenants;
-- Older applications validate a fixed single-trial catalog. Keep the new type
-- out of their ordinary table snapshot; upgraded servers opt in via catalog metadata.
CREATE POLICY compound_catalog_opt_in ON dqa_business.trial_definitions AS RESTRICTIVE FOR SELECT TO authenticated USING(profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT');
ALTER FUNCTION dqa_business.preapproval_snapshot(uuid) RENAME TO preapproval_snapshot_v48;
CREATE FUNCTION dqa_business.preapproval_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;extra jsonb:='[]';
BEGIN
 result:=dqa_business.preapproval_snapshot_v48(p_tenant);
 IF dqa_private.can(p_tenant,'catalog.read') THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO extra FROM (SELECT id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND enabled AND profile_code='COMPOUND_ENVIRONMENT') t;
 END IF;
 RETURN result||jsonb_build_object('compound_trials',extra);
END $$;
REVOKE ALL ON FUNCTION dqa_business.preapproval_snapshot_v48(uuid),dqa_business.preapproval_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.preapproval_snapshot(uuid) TO authenticated;
-- Refresh the invoker snapshot's plan without changing its tenant/RLS behavior.
DO $$ BEGIN EXECUTE pg_get_functiondef('dqa_business.original_ui_snapshot(uuid)'::regprocedure);END $$;
ALTER FUNCTION dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean) RENAME TO calculate_single_schedule_draft_plan_v48;
CREATE FUNCTION dqa_private.compound_working(p_at timestamptz,p_start time,p_end time,p_allow_end boolean DEFAULT false) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT extract(isodow FROM p_at AT TIME ZONE 'Asia/Taipei') BETWEEN 1 AND 5 AND (p_at AT TIME ZONE 'Asia/Taipei')::time>=p_start AND CASE WHEN p_allow_end THEN (p_at AT TIME ZONE 'Asia/Taipei')::time<=p_end ELSE (p_at AT TIME ZONE 'Asia/Taipei')::time<p_end END
$$;
CREATE FUNCTION dqa_private.calculate_schedule_draft_plan(p_tenant uuid,p_command jsonb,p_check_end boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;t dqa_business.trial_definitions;m dqa_business.equipment;person dqa_business.memberships;n dqa_private.preapproval_samples;
 data jsonb:=p_command->'data';c jsonb;stages jsonb;stage jsonb;rule jsonb;ids uuid[];stage_ids uuid[];device uuid;eq_versions jsonb:='{}';allocations jsonb:='[]';segments jsonb:='[]';
 starts timestamptz;ends timestamptz;cursor_at timestamptz;stage_end timestamptz;shift_start time;shift_end time;units integer;idx integer:=0;duration integer:=0;newflow boolean;end_date date;
BEGIN
 IF coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id;
 IF t.profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT' THEN RETURN dqa_private.calculate_single_schedule_draft_plan_v48(p_tenant,p_command,p_check_end);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.preapproval_can_plan(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=q.id FOR UPDATE;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id FOR SHARE;
 newflow:=dqa_private.preapproval_document(p_tenant,q.request_document_version_id);
 IF q.request_document_version_id IS NULL OR q.quantity NOT BETWEEN 1 AND 1000 OR q.form_details->>'priority' IS DISTINCT FROM '專案' OR NOT t.enabled OR coalesce(q.trial_snapshot->>'version','')<>t.specification_version THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
 IF (newflow AND (q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0)) OR (NOT newflow AND (q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.status NOT IN('DRAFT','CANCELLED')) THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
 IF coalesce(d.revision,0)<>(p_command->>'expected_draft_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units','compound')) OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(data->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR data->>'preparation_minutes' IS DISTINCT FROM '0' OR data->>'cleanup_minutes' IS DISTINCT FROM '0' OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 0 AND 120 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 units:=(data->>'sample_space_units')::integer;IF units>100000 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 c:=CASE WHEN data ? 'compound' THEN data->'compound' ELSE d.plan->'compound' END;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN('start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids')) OR coalesce(c->>'start_local','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-2][0-9]:[0-5][0-9]$' OR coalesce(c->>'shift_start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(c->>'shift_end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR jsonb_typeof(c->'preloaded_weekend') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'stage_equipment_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'COMPOUND_PLAN_REQUIRED';END IF;
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
  IF NOT dqa_private.compound_working(cursor_at,shift_start,shift_end) AND NOT(idx=1 AND stage->>'profile_id'='HIGH_TEMPERATURE' AND stage->>'operation'='continuous' AND (c->>'preloaded_weekend')::boolean AND extract(isodow FROM cursor_at AT TIME ZONE 'Asia/Taipei')>5) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
  IF stage->>'operation'='operator' AND (NOT dqa_private.compound_working(stage_end,shift_start,shift_end,true) OR (cursor_at AT TIME ZONE 'Asia/Taipei')::date<>(stage_end AT TIME ZONE 'Asia/Taipei')::date) THEN RAISE EXCEPTION 'COMPOUND_OPERATOR_WINDOW';END IF;
  segments:=segments||jsonb_build_array(stage||jsonb_build_object('equipment_id',m.id,'equipment_name',m.name,'quantity',q.quantity,'start_ms',extract(epoch FROM cursor_at)*1000,'end_ms',extract(epoch FROM stage_end)*1000,'starts_at',cursor_at,'ends_at',stage_end));cursor_at:=stage_end;
 END LOOP;
 ends:=cursor_at;end_date:=((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date;
 IF NOT dqa_private.compound_working(ends,shift_start,shift_end,true) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
 IF p_check_end AND data->>'end_date' IS DISTINCT FROM end_date::text THEN RAISE EXCEPTION 'PLANNING_END_DATE_MISMATCH';END IF;
 IF NOT newflow AND btrim(data->>'sample_code')='' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.execution_kind='REAL' AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<ends AND starts<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.execution_kind='REAL' AND s.executor_member_id=person.id AND (s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR s.status='PENDING_APPROVAL' AND s.plan->>'flow_version'='PREAPPROVAL_V2') AND coalesce(s.reserve_from,s.starts_at)<ends AND starts<coalesce(s.reserve_until,s.ends_at) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=q.id;
 RETURN jsonb_build_object('scheduling_unit','MINUTE','scheduling_days',ceil(duration::numeric/1440),'calendar_days',end_date-(starts AT TIME ZONE 'Asia/Taipei')::date+1,'scope','DRAFT_ONLY','reserved',false,'profile_id','COMPOUND_ENVIRONMENT','calendar','continuous','hours_per_batch',duration::numeric/60,'execution_ends_at',ends,'sample_space_units',units,'trial_revision',t.revision,'equipment_revisions',eq_versions,'executor_id',person.id,'executor_label',person.display_name,'executor_revision',person.revision,'start_date',(starts AT TIME ZONE 'Asia/Taipei')::date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'reserve_from',starts,'reserve_until',ends,'segments',segments,'allocations',allocations,'compound',c,'sample_code',btrim(data->>'sample_code'),'note',data->>'note','preparation_minutes',0,'cleanup_minutes',0,'physical_feasibility','HUMAN_REVIEW_REQUIRED','operating_conditions','SIGNED_COMPOUND_PROTOCOL')||CASE WHEN newflow THEN jsonb_build_object('flow_version','PREAPPROVAL_V2','outsourced',false,'equipment_label','','sample_revision',n.revision,'document_id',q.request_document_version_id) ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';
END $$;
REVOKE ALL ON FUNCTION dqa_private.compound_trial_rules(),dqa_private.validate_compound_protocol(uuid,jsonb),dqa_private.guard_compound_protocol(),dqa_private.compound_working(timestamptz,time,time,boolean),dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean),dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
