-- Durable, reversible case cleanup. No case payload or workflow status is deleted or rewritten.
CREATE TABLE dqa_private.case_cleanup_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 actor_auth_user_id uuid NOT NULL, selection text[], fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE dqa_private.case_recycle_runs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 actor_auth_user_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('RECYCLED','RESTORED')),
 counts jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 restored_at timestamptz, restored_by uuid, UNIQUE(tenant_id,id)
);
CREATE TABLE dqa_private.case_recycle_items (
 tenant_id uuid NOT NULL, run_id uuid NOT NULL, entity text NOT NULL,
 record_id uuid NOT NULL, category text NOT NULL, restored_at timestamptz,
 PRIMARY KEY(tenant_id,run_id,entity,record_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES dqa_private.case_recycle_runs(tenant_id,id),
 CHECK(entity IN ('requests','request_samples','schedules','schedule_equipment','lab_operations','reports','report_versions','approval_events','artifacts','artifact_versions','quality_records','import_rows'))
);
CREATE UNIQUE INDEX case_recycle_active_item ON dqa_private.case_recycle_items(tenant_id,entity,record_id) WHERE restored_at IS NULL;
REVOKE ALL ON dqa_private.case_cleanup_plans,dqa_private.case_recycle_runs,dqa_private.case_recycle_items FROM PUBLIC,anon,authenticated;
ALTER TABLE dqa_private.case_cleanup_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.case_recycle_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.case_recycle_items ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION dqa_private.case_row_active(p_tenant uuid,p_entity text,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND NOT EXISTS(
  SELECT 1 FROM dqa_private.case_recycle_items i WHERE i.tenant_id=p_tenant AND i.entity=p_entity AND i.record_id=p_id AND i.restored_at IS NULL
 ) AND NOT (p_entity='import_rows' AND EXISTS(
  SELECT 1 FROM dqa_business.import_rows envelope
  JOIN dqa_business.import_rows child ON child.tenant_id=envelope.tenant_id AND child.batch_id=envelope.batch_id
  JOIN dqa_private.case_recycle_items i ON i.tenant_id=child.tenant_id AND i.entity='import_rows' AND i.record_id=child.id AND i.restored_at IS NULL
  WHERE envelope.tenant_id=p_tenant AND envelope.id=p_id AND envelope.source_collection='_source_envelope'
 ));
$$;
REVOKE ALL ON FUNCTION dqa_private.case_row_active(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_private.case_row_active(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION dqa_private.can_read_request(p_tenant uuid,p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND dqa_private.case_row_active(p_tenant,'requests',p_request) AND EXISTS(SELECT 1 FROM dqa_business.requests r
 WHERE r.tenant_id=p_tenant AND r.id=p_request AND (
 dqa_private.can(p_tenant,'requests.read_all') OR r.owner_member_id=dqa_private.member_id(p_tenant)
 OR r.supervisor_member_id=dqa_private.member_id(p_tenant)))
$$;
CREATE OR REPLACE FUNCTION dqa_private.can_read_artifact(p_tenant uuid,p_artifact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.artifacts a WHERE a.tenant_id=p_tenant AND a.id=p_artifact
 AND dqa_private.can(p_tenant) AND dqa_private.case_row_active(p_tenant,'artifacts',a.id) AND (a.request_id IS NULL OR dqa_private.case_row_active(p_tenant,'requests',a.request_id)) AND (
   (a.request_id IS NOT NULL AND dqa_private.can_read_request(p_tenant,a.request_id))
   OR (a.request_id IS NULL AND a.kind IN ('TEMPLATE','MANUAL','SPECIFICATION') AND dqa_private.can(p_tenant,'catalog.read'))
   OR (a.request_id IS NULL AND a.owner_member_id=dqa_private.member_id(p_tenant))
   OR dqa_private.is_admin(p_tenant)))
$$;

CREATE POLICY active_case_only ON dqa_business.requests AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'requests',id));
CREATE POLICY active_case_only ON dqa_business.request_samples AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'request_samples',id));
CREATE POLICY active_case_only ON dqa_business.schedules AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'schedules',id));
CREATE POLICY active_case_only ON dqa_business.schedule_equipment AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'schedule_equipment',id));
CREATE POLICY active_case_only ON dqa_business.lab_operations AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'lab_operations',id));
CREATE POLICY active_case_only ON dqa_business.reports AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'reports',id));
CREATE POLICY active_case_only ON dqa_business.report_versions AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'report_versions',id));
CREATE POLICY active_case_only ON dqa_business.approval_events AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'approval_events',id));
CREATE POLICY active_case_only ON dqa_business.artifacts AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'artifacts',id));
CREATE POLICY active_case_only ON dqa_business.artifact_versions AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'artifact_versions',id));
CREATE POLICY active_case_only ON dqa_business.quality_records AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'quality_records',id));
CREATE POLICY active_case_only ON dqa_business.import_rows AS RESTRICTIVE FOR SELECT TO authenticated USING(dqa_private.case_row_active(tenant_id,'import_rows',id));

CREATE FUNCTION dqa_private.case_cleanup_candidates(p_tenant uuid,p_keys text[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE roots uuid[]; names text[]; entries jsonb; counts jsonb; blocked boolean; resolved integer;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 IF p_keys IS NOT NULL AND (cardinality(p_keys)<1 OR cardinality(p_keys)>200 OR cardinality(p_keys)<>(SELECT count(DISTINCT v) FROM unnest(p_keys) v) OR EXISTS(SELECT 1 FROM unnest(p_keys) v WHERE v !~ '^(request|legacy):[a-f0-9-]{36}$')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MAINTENANCE_SELECTION_INVALID'; END IF;
 SELECT count(*) INTO resolved FROM (
  SELECT 'request:'||r.id AS key FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND dqa_private.case_row_active(p_tenant,'requests',r.id)
  UNION ALL SELECT 'legacy:'||r.id FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.source_collection IN ('reviews','electronic') AND dqa_private.case_row_active(p_tenant,'import_rows',r.id)
 ) q WHERE p_keys IS NOT NULL AND q.key=ANY(p_keys);
 IF p_keys IS NOT NULL AND resolved<>cardinality(p_keys) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MAINTENANCE_SELECTION_INVALID'; END IF;
 SELECT coalesce(array_agg(DISTINCT legacy_id),'{}') INTO names FROM (
  SELECT r.legacy_id FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND dqa_private.case_row_active(p_tenant,'requests',r.id) AND (p_keys IS NULL OR ('request:'||r.id)=ANY(p_keys))
  UNION ALL SELECT r.legacy_id FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.source_collection IN ('reviews','electronic') AND dqa_private.case_row_active(p_tenant,'import_rows',r.id) AND (p_keys IS NULL OR ('legacy:'||r.id)=ANY(p_keys))
 ) q;
 SELECT coalesce(array_agg(id),'{}') INTO roots FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND dqa_private.case_row_active(p_tenant,'requests',r.id) AND (p_keys IS NULL OR r.legacy_id=ANY(names));
 SELECT EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=ANY(roots) AND (s.status IN ('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment e WHERE e.tenant_id=p_tenant AND e.schedule_id=s.id AND e.released_at IS NULL))) INTO blocked;
 WITH targets AS (
 SELECT 'requests' entity,r.id,r.revision::text version,'requests' category FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND r.id=ANY(roots)
 UNION ALL SELECT 'request_samples',r.id,r.revision::text,'samples' FROM dqa_business.request_samples r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'schedules',r.id,r.revision::text,'schedules' FROM dqa_business.schedules r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'schedule_equipment',r.id,r.revision::text,'allocations' FROM dqa_business.schedule_equipment r JOIN dqa_business.schedules s ON s.tenant_id=r.tenant_id AND s.id=r.schedule_id WHERE r.tenant_id=p_tenant AND s.request_id=ANY(roots)
 UNION ALL SELECT 'lab_operations',r.id,r.revision::text,'operations' FROM dqa_business.lab_operations r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'reports',r.id,r.revision::text,'reports' FROM dqa_business.reports r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'report_versions',r.id,r.created_at::text,'report_versions' FROM dqa_business.report_versions r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'approval_events',r.id,r.created_at::text,'approvals' FROM dqa_business.approval_events r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'artifacts',r.id,r.revision::text,'documents' FROM dqa_business.artifacts r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'artifact_versions',r.id,r.created_at::text,'document_versions' FROM dqa_business.artifact_versions r JOIN dqa_business.artifacts a ON a.tenant_id=r.tenant_id AND a.id=r.artifact_id WHERE r.tenant_id=p_tenant AND a.request_id=ANY(roots)
 UNION ALL SELECT 'quality_records',r.id,r.revision::text,'case_quality' FROM dqa_business.quality_records r WHERE r.tenant_id=p_tenant AND r.request_id=ANY(roots)
 UNION ALL SELECT 'import_rows',r.id,r.created_at::text,CASE WHEN r.source_collection IN ('reviews','electronic') THEN 'legacy_requests' WHEN r.source_collection='schedules' THEN 'legacy_schedules' ELSE 'legacy_operations' END
 FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.source_collection IN ('reviews','electronic','schedules','labOperations','labWorkItems','labAudit','cancellations')
 AND (p_keys IS NULL OR r.legacy_id=ANY(names) OR r.payload->>'requestId'=ANY(names))
 )
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY entity,id),'[]') INTO entries FROM targets t WHERE dqa_private.case_row_active(p_tenant,t.entity,t.id);
 IF jsonb_array_length(entries)>10000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='MAINTENANCE_BATCH_TOO_LARGE'; END IF;
 SELECT coalesce(jsonb_object_agg(category,n),'{}') INTO counts FROM (SELECT value->>'category' category,count(*) n FROM jsonb_array_elements(entries) GROUP BY 1) q;
 RETURN jsonb_build_object('targets',entries,'counts',counts,'blocked',blocked,'total',jsonb_array_length(entries),'selection',to_jsonb(p_keys));
END $$;
REVOKE ALL ON FUNCTION dqa_private.case_cleanup_candidates(uuid,text[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.maintenance_overview(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE choices jsonb; runs jsonb; counts jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY label),'[]') INTO choices FROM (
  SELECT 'request:'||r.id AS key,r.legacy_id||' · '||coalesce(r.product_code,'') AS label,'資料庫委託' kind FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND dqa_private.case_row_active(p_tenant,'requests',r.id)
  UNION ALL SELECT 'legacy:'||r.id,r.legacy_id||' · '||coalesce(r.payload->>'title',r.payload->>'product',''),'舊站委託' FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.source_collection IN ('reviews','electronic') AND dqa_private.case_row_active(p_tenant,'import_rows',r.id)
 ) q;
 IF jsonb_array_length(choices)>2000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='MAINTENANCE_BATCH_TOO_LARGE'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC),'[]') INTO runs FROM (SELECT r.id,r.state,r.counts,r.created_at,r.restored_at FROM dqa_private.case_recycle_runs r WHERE r.tenant_id=p_tenant AND (r.state='RECYCLED' OR r.id IN (SELECT h.id FROM dqa_private.case_recycle_runs h WHERE h.tenant_id=p_tenant AND h.state='RESTORED' ORDER BY h.created_at DESC LIMIT 30))) q;
 counts:=dqa_private.case_cleanup_candidates(p_tenant,NULL)->'counts';
 RETURN jsonb_build_object('choices',choices,'runs',runs,'counts',counts,'source','DATABASE','mode','RECYCLE_BIN');
END $$;
CREATE FUNCTION dqa_business.preview_case_cleanup(p_tenant uuid,p_selection text[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE data jsonb; plan dqa_private.case_cleanup_plans; fp text;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 IF (SELECT count(*) FROM dqa_private.case_cleanup_plans WHERE tenant_id=p_tenant AND actor_auth_user_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=30 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='MAINTENANCE_RATE_LIMITED'; END IF;
 data:=dqa_private.case_cleanup_candidates(p_tenant,p_selection);
 fp:=encode(sha256(convert_to(data::text,'UTF8')),'hex');
 INSERT INTO dqa_private.case_cleanup_plans(tenant_id,actor_auth_user_id,selection,fingerprint) VALUES(p_tenant,auth.uid(),p_selection,fp) RETURNING * INTO plan;
 RETURN jsonb_build_object('plan_id',plan.id,'fingerprint',fp,'expires_at',plan.expires_at,'counts',data->'counts','total',data->'total','blocked',data->'blocked','confirmation','移至回收區','source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.execute_case_cleanup(p_tenant uuid,p_plan uuid,p_fingerprint text,p_confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan dqa_private.case_cleanup_plans; run dqa_private.case_recycle_runs; data jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 SELECT * INTO plan FROM dqa_private.case_cleanup_plans WHERE id=p_plan AND tenant_id=p_tenant AND actor_auth_user_id=auth.uid();
 IF NOT FOUND OR p_confirmation IS DISTINCT FROM '移至回收區' OR p_fingerprint IS DISTINCT FROM plan.fingerprint THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MAINTENANCE_CONFIRMATION_INVALID'; END IF;
 SELECT * INTO run FROM dqa_private.case_recycle_runs WHERE id=p_plan AND tenant_id=p_tenant;
 IF FOUND THEN RETURN to_jsonb(run)||jsonb_build_object('replayed',true); END IF;
 IF plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='MAINTENANCE_PLAN_EXPIRED'; END IF;
 data:=dqa_private.case_cleanup_candidates(p_tenant,plan.selection);
 IF encode(sha256(convert_to(data::text,'UTF8')),'hex')<>plan.fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='MAINTENANCE_PREVIEW_STALE'; END IF;
 IF (data->>'blocked')::boolean THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='MAINTENANCE_ACTIVE_RESERVATIONS'; END IF;
 IF (data->>'total')::integer=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='MAINTENANCE_EMPTY'; END IF;
 INSERT INTO dqa_private.case_recycle_runs(id,tenant_id,actor_auth_user_id,state,counts) VALUES(p_plan,p_tenant,auth.uid(),'RECYCLED',data->'counts') RETURNING * INTO run;
 INSERT INTO dqa_private.case_recycle_items(tenant_id,run_id,entity,record_id,category) SELECT p_tenant,p_plan,value->>'entity',(value->>'id')::uuid,value->>'category' FROM jsonb_array_elements(data->'targets');
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'case_recycle_runs',p_plan,'INSERT',ARRAY['state','counts']);
 RETURN to_jsonb(run)||jsonb_build_object('replayed',false);
END $$;
CREATE FUNCTION dqa_business.restore_case_cleanup(p_tenant uuid,p_run uuid,p_confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run dqa_private.case_recycle_runs;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 IF p_confirmation IS DISTINCT FROM '還原委託資料' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MAINTENANCE_CONFIRMATION_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 SELECT * INTO run FROM dqa_private.case_recycle_runs WHERE id=p_run AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MAINTENANCE_RUN_NOT_FOUND'; END IF;
 IF run.state='RESTORED' THEN RETURN to_jsonb(run)||jsonb_build_object('replayed',true); END IF;
 UPDATE dqa_private.case_recycle_items SET restored_at=clock_timestamp() WHERE tenant_id=p_tenant AND run_id=p_run AND restored_at IS NULL;
 UPDATE dqa_private.case_recycle_runs SET state='RESTORED',restored_at=clock_timestamp(),restored_by=auth.uid() WHERE tenant_id=p_tenant AND id=p_run RETURNING * INTO run;
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'case_recycle_runs',p_run,'UPDATE',ARRAY['state','restored_at']);
 RETURN to_jsonb(run)||jsonb_build_object('replayed',false);
END $$;
CREATE FUNCTION dqa_business.case_cleanup_result(p_tenant uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run dqa_private.case_recycle_runs;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINTENANCE_ADMIN_REQUIRED'; END IF;
 SELECT * INTO run FROM dqa_private.case_recycle_runs WHERE tenant_id=p_tenant AND id=p_run;
 IF FOUND THEN RETURN to_jsonb(run); END IF;
 RETURN jsonb_build_object('id',p_run,'state','NOT_COMMITTED_OR_NOT_FOUND');
END $$;
REVOKE ALL ON FUNCTION dqa_business.maintenance_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.maintenance_overview(uuid) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.preview_case_cleanup(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.preview_case_cleanup(uuid,text[]) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.execute_case_cleanup(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.execute_case_cleanup(uuid,uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.restore_case_cleanup(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.restore_case_cleanup(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.case_cleanup_result(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.case_cleanup_result(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION dqa_business.create_request_draft(p_tenant uuid,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM dqa_private.validate_draft(p_data);
 -- Request id is an idempotency key. The first accepted payload wins; mismatched retries are rejected.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_id::text,0));
 IF EXISTS(SELECT 1 FROM dqa_business.requests WHERE id=p_id) THEN
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY';
 END IF;
 IF p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 INSERT INTO dqa_business.requests(id,tenant_id,legacy_id,owner_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,trial_snapshot,form_details,draft_signature_data)
 VALUES(p_id,p_tenant,'REQ-'||upper(replace(p_id::text,'-','')),member,trial.id,p_data->>'product_code',p_data->>'customer_name',coalesce(p_data->>'purpose',''),(p_data->>'quantity')::integer,(p_data->>'requested_date')::date,(p_data->>'sample_space_units')::integer,coalesce(p_data->>'specification',trial.specification,''),coalesce(p_data->>'acceptance',trial.acceptance,''),
 CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END,coalesce(p_data->'form_details','{}'),coalesce(p_data->>'draft_signature_data',''))
 RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION dqa_business.update_request_draft(p_tenant uuid,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM dqa_private.validate_draft(p_data);
 SELECT * INTO result FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_id AND owner_member_id=member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF NOT dqa_private.case_row_active(p_tenant,'requests',p_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF result.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 IF result.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF p_data ? 'trial_id' AND p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 UPDATE dqa_business.requests SET
  form_details=CASE WHEN p_data ? 'form_details' THEN p_data->'form_details' ELSE result.form_details END,
  draft_signature_data=CASE WHEN p_data ? 'draft_signature_data' THEN p_data->>'draft_signature_data' ELSE result.draft_signature_data END,
  trial_id=CASE WHEN p_data ? 'trial_id' THEN trial.id ELSE result.trial_id END,
  product_code=CASE WHEN p_data ? 'product_code' THEN p_data->>'product_code' ELSE result.product_code END,
  customer_name=CASE WHEN p_data ? 'customer_name' THEN p_data->>'customer_name' ELSE result.customer_name END,
  purpose=CASE WHEN p_data ? 'purpose' THEN coalesce(p_data->>'purpose','') ELSE result.purpose END,
  quantity=CASE WHEN p_data ? 'quantity' THEN (p_data->>'quantity')::integer ELSE result.quantity END,
  requested_date=CASE WHEN p_data ? 'requested_date' THEN (p_data->>'requested_date')::date ELSE result.requested_date END,
  sample_space_units=CASE WHEN p_data ? 'sample_space_units' THEN (p_data->>'sample_space_units')::integer ELSE result.sample_space_units END,
  specification=CASE WHEN p_data ? 'specification' THEN coalesce(p_data->>'specification','') WHEN p_data ? 'trial_id' THEN coalesce(trial.specification,'') ELSE result.specification END,
  acceptance=CASE WHEN p_data ? 'acceptance' THEN coalesce(p_data->>'acceptance','') WHEN p_data ? 'trial_id' THEN coalesce(trial.acceptance,'') ELSE result.acceptance END,
  trial_snapshot=CASE WHEN p_data ? 'trial_id' THEN CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END ELSE result.trial_snapshot END
 WHERE tenant_id=p_tenant AND id=p_id AND revision=p_expected_revision RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;

