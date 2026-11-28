-- Batch previews are draft proposals. Existing booking and approval functions remain authoritative.
CREATE TABLE dqa_private.schedule_batch_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,member_id uuid NOT NULL,fingerprint text NOT NULL,input jsonb NOT NULL,payload jsonb NOT NULL,state text NOT NULL CHECK(state IN('PLANNED','SAVED')),results jsonb NOT NULL DEFAULT '[]',expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '10 minutes'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id));
CREATE INDEX schedule_batch_actor_rate ON dqa_private.schedule_batch_operations(tenant_id,actor,created_at);
ALTER TABLE dqa_private.schedule_batch_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.schedule_batch_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.batch_plan_conflicts(kind text,p jsonb,batch_overlay jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT kind='REAL' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(batch_overlay,'[]'))x WHERE x->>'execution_kind'='REAL' AND (p->>'reserve_from')::timestamptz<(x->'plan'->>'reserve_until')::timestamptz AND (x->'plan'->>'reserve_from')::timestamptz<(p->>'reserve_until')::timestamptz AND(p->>'executor_id'=x->'plan'->>'executor_id' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'allocations')a CROSS JOIN jsonb_array_elements(x->'plan'->'allocations')b WHERE a->>'equipment_id'=b->>'equipment_id')))
$$;
CREATE FUNCTION dqa_private.batch_existing_drafts(t uuid,excluded uuid[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'execution_kind',q.execution_kind,'plan',d.plan) ORDER BY q.id),'[]') FROM dqa_business.schedule_drafts d JOIN dqa_business.requests q ON q.tenant_id=d.tenant_id AND q.id=d.request_id WHERE d.tenant_id=t AND NOT(q.id=ANY(excluded)) AND q.status IN('AWAITING_SCHEDULING','AWAITING_LMS_REVIEW') AND d.request_revision=q.revision AND d.document_version_id IS NOT DISTINCT FROM q.request_document_version_id AND dqa_private.case_row_active(t,'requests',q.id) AND d.plan ?& ARRAY['reserve_from','reserve_until','executor_id','allocations']
$$;
CREATE FUNCTION dqa_private.batch_schedule_packet(o dqa_private.schedule_batch_operations) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',o.id,'state',CASE WHEN o.state='PLANNED' AND o.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE o.state END,'expires_at',o.expires_at,'scope','DRAFT_ONLY','reserved',false,'mode','VALIDATED_RULES','ready_count',(SELECT count(*) FROM jsonb_array_elements(o.payload)j WHERE j->>'state'='READY'),'blocked_count',(SELECT count(*) FROM jsonb_array_elements(o.payload)j WHERE j->>'state'='BLOCKED'),'results',o.results,'jobs',(SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',j->'request_id','legacy_id',j->'legacy_id','title',j->'title','priority',j->'priority','execution_kind',j->'execution_kind','state',j->'state','reason_code',j->'reason_code','equipment_labels',coalesce(j->'equipment_labels','[]'::jsonb),'plan',CASE WHEN j->>'state'='READY' THEN (SELECT coalesce(jsonb_object_agg(k,v),'{}') FROM jsonb_each(j->'plan')x(k,v) WHERE k IN('start_date','end_date','scheduling_days','calendar_days','executor_label','hours_per_batch','sample_space_units','outsourced','calendar')) ELSE NULL END) ORDER BY n),'[]') FROM jsonb_array_elements(o.payload) WITH ORDINALITY z(j,n)))
$$;
CREATE FUNCTION dqa_private.batch_schedule_candidate(tid uuid,rid uuid,opts jsonb,batch_overlay jsonb,deadline timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
    IF compound AND NOT external THEN data:=data||jsonb_build_object('compound',jsonb_build_object('start_local',d::text||'T00:00','shift_start','00:00','shift_end','23:59','preloaded_weekend',true,'stage_equipment_ids',to_jsonb(stage_ids)));END IF;
    cmd:=jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',draft_revision,'data',data);
    BEGIN plan:=dqa_private.calculate_schedule_draft_plan(tid,cmd,false);cmd:=jsonb_set(cmd,'{data,end_date}',plan->'end_date');EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN issue:=SQLERRM;CONTINUE;END;
    IF dqa_private.batch_plan_conflicts(q.execution_kind,plan,batch_overlay) THEN issue:='BATCH_NO_SLOT';CONTINUE;END IF;
    RETURN jsonb_build_object('command',cmd,'plan',plan,'checks',tries,'equipment_labels',(SELECT coalesce(jsonb_agg(e.name ORDER BY e.id),'[]') FROM dqa_business.equipment e WHERE e.tenant_id=tid AND e.id=ANY(ids)));
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('reason_code',CASE WHEN issue IN('CALENDAR_COVERAGE_REQUIRED','PLANNING_CONDITIONS_UNVERIFIED','PLANNING_CONDITIONS_EXCEEDED','PLANNING_SPACE_INSUFFICIENT','PLANNING_SOURCE_INCOMPLETE','PLANNING_EQUIPMENT_REQUIRED','TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED','COMPOUND_HANDOFF_WINDOW','COMPOUND_OPERATOR_WINDOW','BATCH_EQUIPMENT_REQUIRED') THEN issue ELSE 'BATCH_NO_SLOT' END,'checks',tries);
END $$;
CREATE FUNCTION dqa_business.prepare_schedule_batch(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o dqa_private.schedule_batch_operations;r jsonb;job record;q dqa_business.requests;d dqa_business.schedule_drafts;ids uuid[]:='{}';ready_ids uuid[];fp text;input_member uuid;first_day date;last_day date;payload jsonb:='[]';batch_overlay jsonb;fixed_overlay jsonb;entry jsonb;proposal jsonb;issue text;deadline timestamptz:=clock_timestamp()+interval '11 seconds';again boolean;next_payload jsonb;label text;
BEGIN
 IF NOT dqa_private.can(p_tenant,'schedules.plan') THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['expected_member','selection','options']) OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>3 THEN RAISE EXCEPTION 'BATCH_FIELDS_INVALID';END IF;
 input_member:=(p_command->>'expected_member')::uuid;IF input_member IS DISTINCT FROM dqa_private.member_id(p_tenant) THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
 IF jsonb_typeof(p_command->'selection') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'selection') NOT BETWEEN 1 AND 20 OR jsonb_typeof(p_command->'options') IS DISTINCT FROM 'object' OR NOT(p_command->'options' ?& ARRAY['earliest','latest']) OR (SELECT count(*) FROM jsonb_object_keys(p_command->'options'))<>2 OR coalesce(p_command->'options'->>'earliest','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(p_command->'options'->>'latest','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'BATCH_FIELDS_INVALID';END IF;
 first_day:=(p_command->'options'->>'earliest')::date;last_day:=(p_command->'options'->>'latest')::date;
 IF first_day<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR last_day<first_day OR last_day>first_day+31 THEN RAISE EXCEPTION 'PLANNING_DATE_INVALID';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_command->'selection') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT(r ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','sample_space_units','equipment_count','sample_code']) OR (SELECT count(*) FROM jsonb_object_keys(r))<>6 OR coalesce(r->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR (r->>'request_id')::uuid=ANY(ids) OR jsonb_typeof(r->'expected_request_revision') IS DISTINCT FROM 'number' OR coalesce(r->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR jsonb_typeof(r->'expected_draft_revision') IS DISTINCT FROM 'number' OR coalesce(r->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' OR jsonb_typeof(r->'sample_code') IS DISTINCT FROM 'string' OR length(r->>'sample_code')>100 OR r->>'sample_code'~'[[:cntrl:]]' THEN RAISE EXCEPTION 'BATCH_FIELDS_INVALID';END IF;
  IF NOT dqa_private.can_read_request(p_tenant,(r->>'request_id')::uuid) THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
  ids:=array_append(ids,(r->>'request_id')::uuid);
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-batch:'||p_tenant||':'||p_operation,0));
 fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');SELECT * INTO o FROM dqa_private.schedule_batch_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF o.actor IS DISTINCT FROM auth.uid() OR o.member_id<>input_member OR o.fingerprint<>fp THEN RAISE EXCEPTION 'BATCH_OPERATION_CONFLICT';END IF;RETURN dqa_private.batch_schedule_packet(o);END IF;
 IF (SELECT count(*) FROM dqa_private.schedule_batch_operations WHERE tenant_id=p_tenant AND actor=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=10 THEN RAISE EXCEPTION 'BATCH_RATE_LIMITED';END IF;
 batch_overlay:=dqa_private.batch_existing_drafts(p_tenant,ids);
 FOR job IN SELECT v.r FROM jsonb_array_elements(p_command->'selection')v(r) JOIN dqa_business.requests x ON x.tenant_id=p_tenant AND x.id=(v.r->>'request_id')::uuid ORDER BY dqa_private.scheduling_priority(x.form_details->>'priority'),x.requested_date NULLS LAST,x.id LOOP
  r:=job.r;SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(r->>'request_id')::uuid;
  SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id;
  SELECT name INTO label FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id;
  entry:=jsonb_build_object('request_id',q.id,'legacy_id',coalesce(q.legacy_id,q.id::text),'title',coalesce(label,'試驗資料待確認'),'priority',coalesce(q.form_details->>'priority','一般'),'execution_kind',q.execution_kind,'state','BLOCKED');issue:=NULL;
  IF NOT dqa_private.case_row_active(p_tenant,'requests',q.id) OR NOT dqa_private.preapproval_can_plan(p_tenant,q.id) OR (NOT dqa_private.preapproval_document(p_tenant,q.request_document_version_id) AND(q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2)) OR EXISTS(SELECT 1 FROM dqa_business.schedules x WHERE x.tenant_id=p_tenant AND x.request_id=q.id AND x.status NOT IN('DRAFT','CANCELLED') AND dqa_private.case_row_active(p_tenant,'schedules',x.id)) THEN issue:='BATCH_NOT_ELIGIBLE';
  ELSIF q.revision<>(r->>'expected_request_revision')::bigint OR coalesce(d.revision,0)<>(r->>'expected_draft_revision')::bigint THEN issue:='BATCH_SOURCE_CHANGED';
  ELSIF jsonb_typeof(r->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(r->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' OR (r->>'sample_space_units')::numeric>100000 THEN issue:='BATCH_UNITS_REQUIRED';
  ELSIF jsonb_typeof(r->'equipment_count') IS DISTINCT FROM 'number' OR coalesce(r->>'equipment_count','')!~'^[0-4]$' OR (r->>'equipment_count')::int=0 AND coalesce(q.form_details->>'priority','')<>'委外' THEN issue:='BATCH_EQUIPMENT_REQUIRED';
  ELSIF clock_timestamp()>deadline THEN issue:='BATCH_SEARCH_LIMIT';END IF;
  IF issue IS NULL THEN
   BEGIN proposal:=dqa_private.batch_schedule_candidate(p_tenant,q.id,r||(p_command->'options'),batch_overlay,deadline);EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '22023' OR SQLSTATE '42501' THEN issue:=CASE WHEN SQLERRM IN('BATCH_ACCESS_DENIED','BATCH_SAMPLE_CODE_REQUIRED','PLANNING_SOURCE_INCOMPLETE','COMPOUND_PROTOCOL_REQUIRED','CALENDAR_COVERAGE_REQUIRED','PLANNING_CONDITIONS_UNVERIFIED','PLANNING_CONDITIONS_EXCEEDED','TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED') THEN SQLERRM ELSE 'BATCH_NO_SLOT' END;END;
   IF issue IS NULL THEN
    IF proposal ? 'command' THEN
     IF proposal->'command'->>'expected_request_revision' IS DISTINCT FROM r->>'expected_request_revision' OR proposal->'command'->>'expected_draft_revision' IS DISTINCT FROM r->>'expected_draft_revision' THEN issue:='BATCH_SOURCE_CHANGED';
     ELSE entry:=entry||proposal||jsonb_build_object('state','READY');batch_overlay:=batch_overlay||jsonb_build_array(entry);END IF;
    ELSE issue:=coalesce(proposal->>'reason_code','BATCH_NO_SLOT');END IF;
   END IF;
  END IF;
  IF issue IS NOT NULL THEN entry:=entry||jsonb_build_object('reason_code',issue);END IF;payload:=payload||jsonb_build_array(entry);
 END LOOP;
 IF jsonb_array_length(payload)<>jsonb_array_length(p_command->'selection') THEN RAISE EXCEPTION 'BATCH_SOURCE_CHANGED';END IF;
 -- A blocked selection keeps its previous draft. Recheck proposals against those
 -- preserved drafts, propagating conflicts without overwriting any of them.
 LOOP
  SELECT coalesce(array_agg((x->>'request_id')::uuid),'{}') INTO ready_ids FROM jsonb_array_elements(payload)x WHERE x->>'state'='READY';
  fixed_overlay:=dqa_private.batch_existing_drafts(p_tenant,ready_ids);next_payload:='[]';again:=false;
  FOR entry IN SELECT value FROM jsonb_array_elements(payload) LOOP
   IF entry->>'state'='READY' AND dqa_private.batch_plan_conflicts(entry->>'execution_kind',entry->'plan',fixed_overlay) THEN entry:=(entry-'command'-'plan'-'equipment_labels')||jsonb_build_object('state','BLOCKED','reason_code','BATCH_DRAFT_CONFLICT');again:=true;END IF;
   next_payload:=next_payload||jsonb_build_array(entry);
  END LOOP;payload:=next_payload;EXIT WHEN NOT again;
 END LOOP;
 INSERT INTO dqa_private.schedule_batch_operations(tenant_id,id,actor,member_id,fingerprint,input,payload,state) VALUES(p_tenant,p_operation,auth.uid(),input_member,fp,p_command,payload,'PLANNED') RETURNING * INTO o;
 RETURN dqa_private.batch_schedule_packet(o);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'BATCH_FIELDS_INVALID';
END $$;
CREATE FUNCTION dqa_business.execute_schedule_batch(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o dqa_private.schedule_batch_operations;j jsonb;plan jsonb;batch_overlay jsonb;ready_ids uuid[];receipts jsonb:='[]';result jsonb;child_op uuid;
BEGIN
 IF NOT dqa_private.can(p_tenant,'schedules.plan') THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-batch:'||p_tenant||':'||p_operation,0));
 SELECT * INTO o FROM dqa_private.schedule_batch_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid() FOR UPDATE;
 IF NOT FOUND OR o.member_id IS DISTINCT FROM dqa_private.member_id(p_tenant) THEN RAISE EXCEPTION 'BATCH_OPERATION_CONFLICT';END IF;
 IF o.state='SAVED' THEN RETURN dqa_private.batch_schedule_packet(o);END IF;
 IF o.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'BATCH_EXPIRED';END IF;
 SELECT coalesce(array_agg((x->>'request_id')::uuid),'{}') INTO ready_ids FROM jsonb_array_elements(o.payload)x WHERE x->>'state'='READY';
 IF cardinality(ready_ids)=0 THEN RAISE EXCEPTION 'BATCH_EMPTY';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-draft-operations:'||p_tenant,0));
 PERFORM id FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=ANY(ready_ids) ORDER BY id FOR UPDATE;
 batch_overlay:=dqa_private.batch_existing_drafts(p_tenant,ready_ids);
 FOR j IN SELECT value FROM jsonb_array_elements(o.payload) WHERE value->>'state'='READY' LOOP
  IF NOT dqa_private.preapproval_can_plan(p_tenant,(j->>'request_id')::uuid) OR NOT dqa_private.can_read_request(p_tenant,(j->>'request_id')::uuid) THEN RAISE EXCEPTION 'BATCH_SOURCE_CHANGED';END IF;
  plan:=dqa_private.schedule_draft_plan(p_tenant,j->'command');
  IF plan IS DISTINCT FROM j->'plan' THEN RAISE EXCEPTION 'BATCH_SOURCE_CHANGED';END IF;
  IF dqa_private.batch_plan_conflicts(j->>'execution_kind',plan,batch_overlay) THEN RAISE EXCEPTION 'BATCH_DRAFT_CONFLICT';END IF;batch_overlay:=batch_overlay||jsonb_build_array(j);
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(o.payload) WHERE value->>'state'='READY' LOOP
  child_op:=md5(p_operation::text||':'||(j->>'request_id'))::uuid;
  PERFORM dqa_business.prepare_schedule_draft(p_tenant,child_op,j->'command');result:=dqa_business.execute_schedule_draft(p_tenant,child_op,j->'command');receipts:=receipts||jsonb_build_array(result);
 END LOOP;
 UPDATE dqa_private.schedule_batch_operations SET state='SAVED',results=receipts WHERE tenant_id=p_tenant AND id=p_operation RETURNING * INTO o;
 RETURN dqa_private.batch_schedule_packet(o);
END $$;
CREATE FUNCTION dqa_business.schedule_batch_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o dqa_private.schedule_batch_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant,'schedules.plan') THEN RAISE EXCEPTION 'BATCH_ACCESS_DENIED';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('schedule-batch:'||p_tenant||':'||p_operation,0)) THEN RETURN jsonb_build_object('id',p_operation,'state','PROCESSING');END IF;
 SELECT * INTO o FROM dqa_private.schedule_batch_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid() AND member_id=dqa_private.member_id(p_tenant);
 IF NOT FOUND THEN RETURN jsonb_build_object('id',p_operation,'state','NOT_FOUND');END IF;
 RETURN dqa_private.batch_schedule_packet(o);
END $$;
REVOKE ALL ON FUNCTION dqa_private.batch_plan_conflicts(text,jsonb,jsonb),dqa_private.batch_existing_drafts(uuid,uuid[]),dqa_private.batch_schedule_packet(dqa_private.schedule_batch_operations),dqa_private.batch_schedule_candidate(uuid,uuid,jsonb,jsonb,timestamptz),dqa_business.prepare_schedule_batch(uuid,uuid,jsonb),dqa_business.execute_schedule_batch(uuid,uuid),dqa_business.schedule_batch_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_schedule_batch(uuid,uuid,jsonb),dqa_business.execute_schedule_batch(uuid,uuid),dqa_business.schedule_batch_result(uuid,uuid) TO authenticated;
