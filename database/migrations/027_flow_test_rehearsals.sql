-- Isolated execution rehearsals in the business database. No production row is changed.
CREATE TABLE dqa_private.flow_test_runs(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,request_id uuid NOT NULL,source jsonb NOT NULL,
 source_sha256 text NOT NULL,created_by uuid NOT NULL,reason text NOT NULL,
 purpose text NOT NULL DEFAULT 'FLOW_TEST' CHECK(purpose='FLOW_TEST'),
 percent integer NOT NULL DEFAULT 0 CHECK(percent IN(0,50,100)),revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),started_at timestamptz,completed_at timestamptz,
 UNIQUE(tenant_id,request_id),FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id)
);
CREATE TABLE dqa_private.flow_test_operations(
 tenant_id uuid NOT NULL,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,
 request_id uuid NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE dqa_private.flow_test_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,run_id uuid NOT NULL REFERENCES dqa_private.flow_test_runs,
 actor_member_id uuid NOT NULL,operation_id uuid NOT NULL,action text NOT NULL CHECK(action IN('CREATE','ADVANCE')),
 percent integer NOT NULL,virtual_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,operation_id)
);
REVOKE ALL ON dqa_private.flow_test_runs,dqa_private.flow_test_operations,dqa_private.flow_test_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON dqa_private.flow_test_events FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON dqa_private.flow_test_operations FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT OR UPDATE ON dqa_private.flow_test_runs FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_private.flow_test_events FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();

CREATE FUNCTION dqa_private.flow_test_authorized(p_tenant uuid,p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can_read_request(p_tenant,p_request) AND dqa_private.case_row_active(p_tenant,'requests',p_request)
 AND EXISTS(SELECT 1 FROM dqa_business.requests q WHERE q.tenant_id=p_tenant AND q.id=p_request AND q.status NOT IN('DRAFT','RETURNED','CANCELLED','CLOSED'))
 AND (dqa_private.is_admin(p_tenant) OR (dqa_private.can(p_tenant,'lab.execute') AND EXISTS(
  SELECT 1 FROM dqa_business.schedules s JOIN dqa_business.memberships m ON m.tenant_id=s.tenant_id AND m.id=s.executor_member_id
  JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
  WHERE s.tenant_id=p_tenant AND s.request_id=p_request AND s.executor_member_id=dqa_private.member_id(p_tenant)
   AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))))
$$;
REVOKE ALL ON FUNCTION dqa_private.flow_test_authorized(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.flow_test_run(p_tenant uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r dqa_private.flow_test_runs;events jsonb;duration_seconds numeric;virtual_at timestamptz;
BEGIN
 IF NOT dqa_private.flow_test_authorized(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM dqa_private.flow_test_runs WHERE tenant_id=p_tenant AND request_id=p_request;
 IF NOT FOUND THEN RETURN NULL;END IF;
 duration_seconds:=extract(epoch FROM (r.source->>'ends_at')::timestamptz-(r.source->>'starts_at')::timestamptz);
 virtual_at:=(r.source->>'starts_at')::timestamptz+duration_seconds*r.percent/100*interval '1 second';
 SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.action,'percent',e.percent,'virtual_at',e.virtual_at,'actual_at',e.created_at,'actor_member_id',e.actor_member_id) ORDER BY e.created_at,e.id),'[]') INTO events
 FROM dqa_private.flow_test_events e WHERE e.tenant_id=p_tenant AND e.run_id=r.id;
 RETURN jsonb_build_object('id',r.id,'purpose',r.purpose,'source',r.source,'source_sha256',r.source_sha256,'reason',r.reason,
 'revision',r.revision,'percent',r.percent,'virtual_at',virtual_at,'scheduled_seconds',duration_seconds,
 'virtual_elapsed_seconds',duration_seconds*r.percent/100,'actual_created_at',r.created_at,'actual_started_at',r.started_at,'actual_completed_at',r.completed_at,
 'state',CASE r.percent WHEN 0 THEN 'READY' WHEN 50 THEN 'RUNNING' ELSE 'COMPLETED' END,'events',events);
END $$;

CREATE FUNCTION dqa_business.preview_flow_test(p_tenant uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;s dqa_business.schedules;source jsonb;run jsonb;
BEGIN
 IF NOT dqa_private.flow_test_authorized(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 run:=dqa_business.flow_test_run(p_tenant,p_request);
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND request_id=p_request AND status NOT IN('DRAFT','CANCELLED');
 IF s.id IS NULL OR s.received_at IS NULL OR NOT dqa_private.case_row_active(p_tenant,'schedules',s.id)
 OR s.status NOT IN('BOOKED','RUNNING','COMPLETED') OR s.ends_at<=s.starts_at
 OR jsonb_typeof(s.plan->'hours_per_batch') IS DISTINCT FROM 'number' OR (s.plan->>'hours_per_batch')::numeric<=0
 THEN RAISE EXCEPTION 'FLOW_TEST_RECEIPT_REQUIRED';END IF;
 source:=jsonb_build_object('request_id',q.id,'legacy_id',q.legacy_id,'request_revision',q.revision,'document_version_id',q.request_document_version_id,
 'trial_name',q.trial_snapshot->>'name','product_code',q.product_code,'quantity',q.quantity,'schedule_id',s.id,'schedule_revision',s.revision,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'nominal_hours',s.plan->'hours_per_batch','scheduling_unit',s.plan->'scheduling_unit',
 'executor_id',s.executor_member_id,'sample_code',s.sample_code,'allocations',s.plan->'allocations','received_at',s.received_at);
 RETURN jsonb_build_object('purpose','FLOW_TEST','source',source,'source_sha256',encode(sha256(convert_to(source::text,'UTF8')),'hex'),
 'can_create',dqa_private.is_admin(p_tenant),'run',run,'production_mutations',false);
END $$;

CREATE FUNCTION dqa_business.execute_flow_test(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.flow_test_operations;r dqa_private.flow_test_runs;preview jsonb;result jsonb;fp text;req uuid;
 action text:=p_command->>'action';at_time timestamptz:=clock_timestamp();duration_seconds numeric;
BEGIN
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['action','request_id','run_id','expected_revision','source_sha256','reason','confirmation'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','request_id','run_id','expected_revision','source_sha256','reason','confirmation'))
 OR coalesce(action,'') NOT IN('CREATE','ADVANCE') OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR coalesce(p_command->>'run_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR jsonb_typeof(p_command->'expected_revision')<>'number' OR coalesce(p_command->>'expected_revision','')!~'^[0-9]{1,12}$'
 OR coalesce(p_command->>'source_sha256','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_command->'reason')<>'string'
 OR jsonb_typeof(p_command->'confirmation')<>'string' OR length(p_command->>'reason')>500 OR length(p_command->>'confirmation')>100
 THEN RAISE EXCEPTION 'FLOW_TEST_FIELDS_INVALID';END IF;
 req:=(p_command->>'request_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('flow-test:'||p_tenant||':'||req,0));
 IF NOT dqa_private.flow_test_authorized(p_tenant,req) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'FLOW_TEST_OPERATION_CONFLICT';END IF;
  RETURN op.result||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(*) FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>at_time-interval '10 minutes')>=100 THEN RAISE EXCEPTION 'FLOW_TEST_RATE_LIMITED';END IF;
 SELECT * INTO r FROM dqa_private.flow_test_runs WHERE tenant_id=p_tenant AND request_id=req FOR UPDATE;
 IF action='CREATE' THEN
  IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ADMIN_REQUIRED';END IF;
  IF r.id IS NOT NULL THEN RAISE EXCEPTION 'FLOW_TEST_ALREADY_EXISTS';END IF;
  preview:=dqa_business.preview_flow_test(p_tenant,req);
  IF p_command->>'source_sha256'<>preview->>'source_sha256' OR (p_command->>'expected_revision')::bigint<>0 THEN RAISE EXCEPTION 'FLOW_TEST_SOURCE_CHANGED';END IF;
  IF length(btrim(p_command->>'reason'))=0 OR p_command->>'confirmation'<>'FLOW TEST '||(preview->'source'->>'legacy_id') THEN RAISE EXCEPTION 'FLOW_TEST_CONFIRMATION_REQUIRED';END IF;
  INSERT INTO dqa_private.flow_test_runs(id,tenant_id,request_id,source,source_sha256,created_by,reason)
   VALUES((p_command->>'run_id')::uuid,p_tenant,req,preview->'source',preview->>'source_sha256',dqa_private.member_id(p_tenant),p_command->>'reason') RETURNING * INTO r;
 ELSE
  IF r.id IS NULL OR r.id<>(p_command->>'run_id')::uuid OR r.source_sha256<>p_command->>'source_sha256' THEN RAISE EXCEPTION 'FLOW_TEST_SOURCE_CHANGED';END IF;
  IF r.revision<>(p_command->>'expected_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF r.percent>=100 THEN RAISE EXCEPTION 'FLOW_TEST_COMPLETED';END IF;
  UPDATE dqa_private.flow_test_runs SET percent=percent+50,revision=revision+1,
   started_at=coalesce(started_at,at_time),completed_at=CASE WHEN percent=50 THEN at_time ELSE NULL END WHERE id=r.id RETURNING * INTO r;
 END IF;
 duration_seconds:=extract(epoch FROM (r.source->>'ends_at')::timestamptz-(r.source->>'starts_at')::timestamptz);
 INSERT INTO dqa_private.flow_test_events(tenant_id,run_id,actor_member_id,operation_id,action,percent,virtual_at)
  VALUES(p_tenant,r.id,dqa_private.member_id(p_tenant),p_operation,action,r.percent,(r.source->>'starts_at')::timestamptz+duration_seconds*r.percent/100*interval '1 second');
 result:=jsonb_build_object('state','SAVED','operation_id',p_operation,'request_id',req,'run',dqa_business.flow_test_run(p_tenant,req),'production_mutations',false);
 INSERT INTO dqa_private.flow_test_operations VALUES(p_tenant,p_operation,auth.uid(),fp,req,result,at_time);
 RETURN result;
END $$;

CREATE FUNCTION dqa_business.flow_test_result(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.flow_test_operations;BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.flow_test_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND');END IF;
 IF NOT dqa_private.flow_test_authorized(p_tenant,op.request_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TEST_ACCESS_DENIED';END IF;
 RETURN op.result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.preview_flow_test(uuid,uuid),dqa_business.flow_test_run(uuid,uuid),dqa_business.execute_flow_test(uuid,uuid,jsonb),dqa_business.flow_test_result(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.preview_flow_test(uuid,uuid),dqa_business.flow_test_run(uuid,uuid),dqa_business.execute_flow_test(uuid,uuid,jsonb),dqa_business.flow_test_result(uuid,uuid) TO authenticated;
