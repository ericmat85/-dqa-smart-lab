-- Immutable purpose at creation; existing and old-client cases stay REAL.
ALTER TABLE dqa_business.requests ADD COLUMN execution_kind text NOT NULL DEFAULT 'REAL' CHECK(execution_kind IN('REAL','VIRTUAL'));
ALTER TABLE dqa_business.schedules ADD COLUMN execution_kind text NOT NULL DEFAULT 'REAL' CHECK(execution_kind IN('REAL','VIRTUAL'));
ALTER TABLE dqa_business.schedules ADD COLUMN virtual_percent integer NOT NULL DEFAULT 0 CHECK(virtual_percent IN(0,50,100));
ALTER TABLE dqa_business.schedules ADD COLUMN virtual_at timestamptz;
ALTER TABLE dqa_business.schedules ADD CONSTRAINT virtual_clock_scope CHECK(execution_kind='VIRTUAL' OR (virtual_percent=0 AND virtual_at IS NULL));
CREATE TABLE dqa_private.virtual_permits(tenant_id uuid NOT NULL,request_id uuid NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,action text NOT NULL CHECK(action IN('CREATE','ADVANCE')),PRIMARY KEY(tenant_id,request_id,transaction_id));
CREATE TABLE dqa_private.virtual_trial_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,request_id uuid NOT NULL,schedule_id uuid NOT NULL,operation_id uuid NOT NULL,actor_member_id uuid NOT NULL,percent integer NOT NULL CHECK(percent IN(50,100)),virtual_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,operation_id),FOREIGN KEY(tenant_id,schedule_id) REFERENCES dqa_business.schedules(tenant_id,id));
REVOKE ALL ON dqa_private.virtual_permits,dqa_private.virtual_trial_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON dqa_private.virtual_trial_events FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_private.virtual_trial_events FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
CREATE FUNCTION dqa_private.execution_kind_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE kind text;
BEGIN
 IF TG_TABLE_NAME='requests' THEN
  IF TG_OP='INSERT' THEN
   NEW.execution_kind:=CASE WHEN EXISTS(SELECT 1 FROM dqa_private.virtual_permits p WHERE p.tenant_id=NEW.tenant_id AND p.request_id=NEW.id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.action='CREATE') THEN 'VIRTUAL' ELSE 'REAL' END;
  ELSIF NEW.execution_kind IS DISTINCT FROM OLD.execution_kind THEN RAISE EXCEPTION 'EXECUTION_KIND_IMMUTABLE';END IF;
 ELSE
  SELECT q.execution_kind INTO kind FROM dqa_business.requests q WHERE q.tenant_id=NEW.tenant_id AND q.id=NEW.request_id;
  IF TG_OP='INSERT' THEN NEW.execution_kind:=kind;
   IF NEW.virtual_percent<>0 OR NEW.virtual_at IS NOT NULL THEN RAISE EXCEPTION 'VIRTUAL_CLOCK_DENIED';END IF;
  ELSE
   IF NEW.execution_kind IS DISTINCT FROM OLD.execution_kind OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.execution_kind IS DISTINCT FROM kind THEN RAISE EXCEPTION 'EXECUTION_KIND_IMMUTABLE';END IF;
   IF (NEW.virtual_percent,NEW.virtual_at) IS DISTINCT FROM (OLD.virtual_percent,OLD.virtual_at) AND NOT EXISTS(SELECT 1 FROM dqa_private.virtual_permits p WHERE p.tenant_id=NEW.tenant_id AND p.request_id=NEW.request_id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.action='ADVANCE') THEN RAISE EXCEPTION 'VIRTUAL_CLOCK_DENIED';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION dqa_private.execution_kind_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER execution_kind_guard BEFORE INSERT OR UPDATE ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.execution_kind_guard();
CREATE TRIGGER execution_kind_guard BEFORE INSERT OR UPDATE ON dqa_business.schedules FOR EACH ROW EXECUTE FUNCTION dqa_private.execution_kind_guard();
CREATE FUNCTION dqa_business.create_classified_request_draft(p_tenant uuid,p_id uuid,p_data jsonb,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('REAL','VIRTUAL') THEN RAISE EXCEPTION 'EXECUTION_KIND_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED';END IF;
 IF p_kind='VIRTUAL' THEN INSERT INTO dqa_private.virtual_permits VALUES(p_tenant,p_id,txid_current(),auth.uid(),'CREATE');END IF;
 result:=dqa_business.create_request_draft(p_tenant,p_id,p_data);
 DELETE FROM dqa_private.virtual_permits WHERE tenant_id=p_tenant AND request_id=p_id AND transaction_id=txid_current();
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.create_classified_request_draft(uuid,uuid,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.create_classified_request_draft(uuid,uuid,jsonb,text) TO authenticated;
-- Virtual plans retain their modelled resources, but never reserve physical equipment or people.
ALTER TABLE dqa_business.schedules DROP CONSTRAINT executor_reservation_exclusive;
ALTER TABLE dqa_business.schedules ADD CONSTRAINT executor_reservation_exclusive EXCLUDE USING gist(tenant_id WITH =,executor_member_id WITH =,tstzrange(reserve_from,reserve_until,'[)') WITH &&) WHERE(status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND execution_kind='REAL');
CREATE FUNCTION pg_temp.patch_function(target regprocedure,needle text,replacement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE body text:=pg_get_functiondef(target);
BEGIN
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'VIRTUAL_PATCH_BASELINE_CHANGED: %',target;END IF;
 EXECUTE replace(body,needle,replacement);
END $$;
SELECT pg_temp.patch_function('dqa_business.original_ui_snapshot(uuid)'::regprocedure,$needle$id,tenant_id,legacy_id,owner_member_id$needle$,$replacement$execution_kind,id,tenant_id,legacy_id,owner_member_id$replacement$);
SELECT pg_temp.patch_function('dqa_business.original_ui_snapshot(uuid)'::regprocedure,$needle$id,legacy_id,request_id,executor_member_id$needle$,$replacement$execution_kind,virtual_percent,virtual_at,id,legacy_id,request_id,executor_member_id$replacement$);
SELECT pg_temp.patch_function('dqa_business.human_workflow_snapshot(uuid)'::regprocedure,$needle$SELECT id,request_id,draft_id,received_at$needle$,$replacement$SELECT execution_kind,virtual_percent,virtual_at,id,request_id,draft_id,received_at$replacement$);
SELECT pg_temp.patch_function('dqa_business.execute_request_operation(uuid,uuid,jsonb)'::regprocedure,$needle$'form_details',req.form_details-'sampleSpaceUnits'-'sample_space_units'$needle$,$replacement$'execution_kind',req.execution_kind,'form_details',req.form_details-'sampleSpaceUnits'-'sample_space_units'$replacement$);
SELECT pg_temp.patch_function('dqa_business.report_upload_intent(uuid,uuid)'::regprocedure,$needle$'request_legacy_id',(SELECT legacy_id$needle$,$replacement$'execution_kind',(SELECT execution_kind FROM dqa_business.requests WHERE id=u.request_id),'request_legacy_id',(SELECT legacy_id$replacement$);
SELECT pg_temp.patch_function('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)'::regprocedure,$needle$machine.operational_status<>'IDLE'$needle$,$replacement$(req.execution_kind='REAL' AND machine.operational_status<>'IDLE')$replacement$);
SELECT pg_temp.patch_function('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)'::regprocedure,$needle$IF EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE$needle$,$replacement$IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE$replacement$);
SELECT pg_temp.patch_function('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)'::regprocedure,$needle$IF EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE$needle$,$replacement$IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.execution_kind='REAL' AND$replacement$);
SELECT pg_temp.patch_function('dqa_business.start_due_lab_trials(uuid)'::regprocedure,$needle$AND status='BOOKED' AND received_at$needle$,$replacement$AND execution_kind='REAL' AND status='BOOKED' AND received_at$replacement$);
SELECT pg_temp.patch_function('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)'::regprocedure,$needle$FOR allocation IN SELECT v FROM jsonb_array_elements(plan->'allocations') v LOOP
   INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,s.id,(allocation->>'equipment_id')::uuid,s.reserve_from,s.reserve_until,(allocation->>'space_units')::integer,(allocation->>'quantity')::integer);
  END LOOP;$needle$,$replacement$IF q.execution_kind='REAL' THEN FOR allocation IN SELECT v FROM jsonb_array_elements(plan->'allocations') v LOOP
   INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,s.id,(allocation->>'equipment_id')::uuid,s.reserve_from,s.reserve_until,(allocation->>'space_units')::integer,(allocation->>'quantity')::integer);
  END LOOP;END IF;$replacement$);
SELECT pg_temp.patch_function('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)'::regprocedure,$needle$OR clock_timestamp()>=s.ends_at THEN RAISE EXCEPTION 'HUMAN_RECEIPT_WINDOW'$needle$,$replacement$OR (q.execution_kind='REAL' AND clock_timestamp()>=s.ends_at) THEN RAISE EXCEPTION 'HUMAN_RECEIPT_WINDOW'$replacement$);
SELECT pg_temp.patch_function('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)'::regprocedure,$needle$ELSIF action IN('RECEIVE','START','COMPLETE') THEN$needle$,$replacement$ELSIF action IN('RECEIVE','START','COMPLETE') THEN
  IF q.execution_kind='VIRTUAL' AND action<>'RECEIVE' THEN RAISE EXCEPTION 'VIRTUAL_ACCELERATOR_REQUIRED';END IF;$replacement$);
SELECT pg_temp.patch_function('dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb)'::regprocedure,$needle$  FOR eq IN SELECT * FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY x.id LOOP$needle$,$replacement$  FOR eq IN SELECT * FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND (q.execution_kind='VIRTUAL' OR x.operational_status='IDLE') AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY x.id LOOP$replacement$);
SELECT pg_temp.patch_function('dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb)'::regprocedure,$needle$   SELECT array_agg(z.id ORDER BY z.is_first DESC,z.id),jsonb_object_agg(z.id::text,z.revision) INTO ids,versions FROM (SELECT x.id,x.revision,(x.id=eq.id) is_first FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY (x.id=eq.id) DESC,x.id LIMIT count_needed) z;$needle$,$replacement$   SELECT array_agg(z.id ORDER BY z.is_first DESC,z.id),jsonb_object_agg(z.id::text,z.revision) INTO ids,versions FROM (SELECT x.id,x.revision,(x.id=eq.id) is_first FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND (q.execution_kind='VIRTUAL' OR x.operational_status='IDLE') AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY (x.id=eq.id) DESC,x.id LIMIT count_needed) z;$replacement$);
SELECT pg_temp.patch_function('dqa_business.claim_business_mail(uuid,uuid)'::regprocedure,$needle$SELECT legacy_id INTO request_code FROM dqa_business.requests$needle$,$replacement$SELECT CASE WHEN execution_kind='VIRTUAL' THEN '[虛擬委託／流程測試] ' ELSE '' END||legacy_id INTO request_code FROM dqa_business.requests$replacement$);
DROP FUNCTION pg_temp.patch_function(regprocedure,text,text);
-- The former shadow history remains readable; new accelerations operate ONLY on native VIRTUAL rows.
ALTER FUNCTION dqa_business.flow_test_run(uuid,uuid) RENAME TO historical_flow_test_run;
REVOKE ALL ON FUNCTION dqa_business.historical_flow_test_run(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.virtual_trial_authorized(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can_read_request(p_tenant,p_request) AND dqa_private.case_row_active(p_tenant,'requests',p_request)
 AND (dqa_private.is_admin(p_tenant) OR (dqa_private.can(p_tenant,'lab.execute') AND EXISTS(
 SELECT 1 FROM dqa_business.schedules s JOIN dqa_business.memberships m ON m.tenant_id=s.tenant_id AND m.id=s.executor_member_id
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
 WHERE s.tenant_id=p_tenant AND s.request_id=p_request AND s.executor_member_id=dqa_private.member_id(p_tenant)
 AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))))
$$;
REVOKE ALL ON FUNCTION dqa_private.virtual_trial_authorized(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.flow_test_run(p_tenant uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;s dqa_business.schedules;source jsonb;events jsonb;fp text;duration_seconds numeric;
BEGIN
 IF NOT dqa_private.virtual_trial_authorized(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 IF q.execution_kind<>'VIRTUAL' THEN RETURN dqa_business.historical_flow_test_run(p_tenant,p_request);END IF;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=p_request AND status NOT IN('DRAFT','CANCELLED');
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
CREATE OR REPLACE FUNCTION dqa_business.preview_flow_test(p_tenant uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run jsonb;
BEGIN
 IF NOT dqa_private.virtual_trial_authorized(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request AND execution_kind='VIRTUAL') THEN RAISE EXCEPTION 'VIRTUAL_TRIAL_REQUIRED';END IF;
 run:=dqa_business.flow_test_run(p_tenant,p_request);
 RETURN jsonb_build_object('purpose','FLOW_TEST','execution_kind','VIRTUAL','source',run->'source','source_sha256',run->>'source_sha256','can_create',false,'run',run,'native_workflow',true,'physical_reservations',false);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.execute_flow_test(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
CREATE OR REPLACE FUNCTION dqa_business.flow_test_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.flow_test_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND');END IF;
 IF NOT dqa_private.virtual_trial_authorized(p_tenant,op.request_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 RETURN op.result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.flow_test_run(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.flow_test_run(uuid,uuid) TO authenticated;
