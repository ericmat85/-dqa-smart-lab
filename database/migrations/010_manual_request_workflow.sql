-- Manual request workflow only. Each tenant starts CLOSED pending a separate release.
-- AI, scheduling, reports and laboratory execution gates remain closed.
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft','catalog.manage','equipment.manage','materials.manage','materials.adjust','requests.submit','requests.review_manager','requests.review_lms']::text[]);
ALTER TABLE dqa_business.requests ADD COLUMN request_document_version_id uuid,ADD COLUMN request_review_level integer NOT NULL DEFAULT 0 CHECK(request_review_level BETWEEN 0 AND 2);
CREATE TABLE dqa_business.request_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 request_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 50),request_revision bigint NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<40000),
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[a-f0-9]{64}$'),submitted_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,id,request_id),UNIQUE(tenant_id,request_id,version),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),FOREIGN KEY(tenant_id,submitted_by) REFERENCES dqa_business.memberships(tenant_id,id)
);
ALTER TABLE dqa_business.requests ADD CONSTRAINT request_document_binding FOREIGN KEY(tenant_id,request_document_version_id,id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id);
ALTER TABLE dqa_business.approval_events ADD COLUMN request_document_version_id uuid,ADD COLUMN operation_id uuid,ADD COLUMN actor_label text,
 ADD CONSTRAINT approval_document_binding FOREIGN KEY(tenant_id,request_document_version_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id),ADD CONSTRAINT approval_operation_unique UNIQUE(tenant_id,operation_id);
CREATE TABLE dqa_business.request_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,request_id uuid NOT NULL,
 document_version_id uuid NOT NULL,approval_event_id uuid NOT NULL,actor_member_id uuid NOT NULL,
 signature_data text NOT NULL CHECK(length(signature_data)<=1400000),signature_sha256 text NOT NULL CHECK(signature_sha256 ~ '^[a-f0-9]{64}$'),
 verification text NOT NULL DEFAULT 'NOT_VERIFIED' CHECK(verification='NOT_VERIFIED'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,approval_event_id),FOREIGN KEY(tenant_id,document_version_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,approval_event_id) REFERENCES dqa_business.approval_events(tenant_id,id),FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE INDEX request_versions_lookup ON dqa_business.request_document_versions(tenant_id,request_id,version DESC);
CREATE INDEX request_signatures_lookup ON dqa_business.request_signatures(tenant_id,request_id,document_version_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['request_document_versions','request_signatures'] LOOP
 EXECUTE format('ALTER TABLE dqa_business.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE dqa_business.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON dqa_business.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT SELECT ON dqa_business.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY manual_request_read ON dqa_business.%I FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id) AND dqa_private.case_row_active(tenant_id,''requests'',request_id))',t);
 EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change()',t);
 EXECUTE format('CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit()',t);
END LOOP;END $$;
CREATE TABLE dqa_private.request_workflow_policy(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,enabled boolean NOT NULL DEFAULT false,scope text NOT NULL DEFAULT 'MANUAL_REQUEST_ONLY' CHECK(scope='MANUAL_REQUEST_ONLY'));
INSERT INTO dqa_private.request_workflow_policy(tenant_id) SELECT id FROM dqa_business.tenants;
CREATE TABLE dqa_private.request_operations (
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN ('PLANNED','SAVED','EXPIRED')),result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes',PRIMARY KEY(tenant_id,id)
);
CREATE INDEX request_operations_actor ON dqa_private.request_operations(tenant_id,actor_id,created_at);
CREATE TABLE dqa_private.request_transition_permits (
 tenant_id uuid NOT NULL,request_id uuid NOT NULL,transaction_id bigint NOT NULL,operation_id uuid NOT NULL,event_id uuid NOT NULL,actor_id uuid NOT NULL,
 from_status text NOT NULL,to_status text NOT NULL,stage text NOT NULL,decision text NOT NULL,PRIMARY KEY(tenant_id,request_id,transaction_id)
);
REVOKE ALL ON dqa_private.request_workflow_policy,dqa_private.request_operations,dqa_private.request_transition_permits FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.request_workflow_enabled(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND coalesce((SELECT enabled FROM dqa_private.request_workflow_policy WHERE tenant_id=p_tenant),false)
$$;
REVOKE ALL ON FUNCTION dqa_business.request_workflow_enabled(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION dqa_business.request_workflow_enabled(uuid) TO authenticated;
-- A caller-set GUC cannot open these guards. Only the scoped command can create a permit.
CREATE OR REPLACE FUNCTION dqa_private.workflow_policy_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  IF TG_TABLE_SCHEMA<>'dqa_business' OR TG_TABLE_NAME<>'requests' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM dqa_private.request_transition_permits p JOIN dqa_private.request_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.tenant_id=NEW.tenant_id AND p.request_id=NEW.id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.from_status=OLD.status AND p.to_status=NEW.status) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dqa_private.approval_policy_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.decision<>'NOTE' AND NOT EXISTS(SELECT 1 FROM dqa_private.request_transition_permits p JOIN dqa_private.request_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.tenant_id=NEW.tenant_id AND p.request_id=NEW.request_id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.event_id=NEW.id AND p.operation_id=NEW.operation_id AND p.stage=NEW.stage AND p.decision=NEW.decision AND NEW.request_document_version_id IS NOT NULL AND NEW.report_version_id IS NULL AND NEW.actor_member_id=dqa_private.member_id(NEW.tenant_id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION dqa_private.workflow_policy_gate(),dqa_private.approval_policy_gate() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_private.validate_request_command(p_command jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_revision','action','signature_data','comment']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('request_id','expected_revision','action','signature_data','comment')) OR coalesce(p_command->>'request_id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_revision','') !~ '^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'action','') NOT IN ('SUBMIT','MANAGER_APPROVE','LMS_APPROVE','RETURN') OR jsonb_typeof(p_command->'comment') IS DISTINCT FROM 'string' OR length(p_command->>'comment')>2000 OR jsonb_typeof(p_command->'signature_data') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_FIELDS_INVALID'; END IF;
 IF p_command->>'action'='RETURN' AND length(btrim(p_command->>'comment'))=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_RETURN_REASON_REQUIRED'; END IF;
 IF p_command->>'action'<>'RETURN' AND length(p_command->>'signature_data')=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_SIGNATURE_REQUIRED'; END IF;
 PERFORM dqa_private.validate_original_fields(NULL,p_command->>'signature_data');
END $$;
REVOKE ALL ON FUNCTION dqa_private.validate_request_command(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.prepare_request_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.request_operations; fp text;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED'; END IF;
 IF NOT dqa_business.request_workflow_enabled(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_RELEASE_REQUIRED'; END IF;
 PERFORM dqa_private.validate_request_command(p_command);
 IF NOT dqa_private.can_read_request(p_tenant,(p_command->>'request_id')::uuid) OR NOT dqa_private.case_row_active(p_tenant,'requests',(p_command->>'request_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED'; END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_FIELDS_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('request-operations:'||p_tenant,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.request_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_OPERATION_CONFLICT'; END IF;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);END IF;
 IF (SELECT count(*) FROM dqa_private.request_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WORKFLOW_RATE_LIMITED'; END IF;
 INSERT INTO dqa_private.request_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE FUNCTION dqa_business.request_operation_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.request_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKFLOW_ACCESS_DENIED'; END IF;
 SELECT * INTO op FROM dqa_private.request_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND','id',p_operation);END IF;
 IF op.state='PLANNED' AND op.expires_at<=clock_timestamp() THEN UPDATE dqa_private.request_operations SET state='EXPIRED' WHERE tenant_id=p_tenant AND id=p_operation RETURNING * INTO op;END IF;
 RETURN CASE WHEN op.state='SAVED' THEN op.result ELSE jsonb_build_object('state',op.state,'id',op.id,'expires_at',op.expires_at) END;
END $$;
CREATE FUNCTION dqa_business.execute_request_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  IF trial.id IS NULL OR coalesce(length(btrim(req.product_code)),0)=0 OR coalesce(length(btrim(req.customer_name)),0)=0 OR req.quantity IS NULL OR req.sample_space_units IS NULL OR req.requested_date IS NULL OR NOT isfinite(req.requested_date) OR length(btrim(req.purpose))=0 OR length(btrim(req.specification))=0 OR length(btrim(req.acceptance))=0 OR jsonb_array_length(coalesce(req.form_details->'testItems','[]'))<>1 OR NOT (req.form_details->'testItems'->>0=ANY(array_append(trial.aliases,trial.name))) OR jsonb_array_length(coalesce(req.form_details->'purpose','[]'))=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_REQUEST_INCOMPLETE';END IF;
  payload:=jsonb_build_object('tenant_id',p_tenant,'request_id',req.id,'request_legacy_id',req.legacy_id,'owner_member_id',req.owner_member_id,'owner_label',actor.display_name,'supervisor_member_id',supervisor.id,'supervisor_label',supervisor.display_name,'trial_id',req.trial_id,'trial_snapshot',req.trial_snapshot,'product_code',req.product_code,'customer_name',req.customer_name,'purpose',req.purpose,'quantity',req.quantity,'requested_date',req.requested_date,'sample_space_units',req.sample_space_units,'specification',req.specification,'acceptance',req.acceptance,'form_details',req.form_details);
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
 INSERT INTO dqa_private.request_transition_permits(tenant_id,request_id,transaction_id,operation_id,event_id,actor_id,from_status,to_status,stage,decision) VALUES(p_tenant,req.id,txid_current(),p_operation,event_id,auth.uid(),req.status,next_status,workflow_stage,workflow_decision);
 INSERT INTO dqa_business.approval_events(id,tenant_id,request_id,actor_member_id,stage,decision,comment,request_document_version_id,operation_id,actor_label) VALUES(event_id,p_tenant,req.id,actor_member,workflow_stage,workflow_decision,p_command->>'comment',doc.id,p_operation,actor.display_name);
 IF length(p_command->>'signature_data')>0 THEN INSERT INTO dqa_business.request_signatures(tenant_id,request_id,document_version_id,approval_event_id,actor_member_id,signature_data,signature_sha256) VALUES(p_tenant,req.id,doc.id,event_id,actor_member,p_command->>'signature_data',encode(sha256(decode(split_part(p_command->>'signature_data',',',2),'base64')),'hex'));END IF;
 UPDATE dqa_business.requests SET status=next_status,request_review_level=review_level,request_document_version_id=doc.id,supervisor_member_id=CASE WHEN action='SUBMIT' THEN supervisor.id ELSE req.supervisor_member_id END WHERE tenant_id=p_tenant AND id=req.id RETURNING * INTO req;
 DELETE FROM dqa_private.request_transition_permits WHERE tenant_id=p_tenant AND request_id=req.id AND transaction_id=txid_current();
 outcome:=jsonb_build_object('state','SAVED','operation_id',p_operation,'request_id',req.id,'legacy_id',req.legacy_id,'revision',req.revision,'status',req.status,'document_version_id',doc.id,'document_sha256',doc.document_sha256,'review_level',review_level);
 UPDATE dqa_private.request_operations SET state='SAVED',result=outcome WHERE tenant_id=p_tenant AND id=p_operation;RETURN outcome;
EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKFLOW_FIELDS_INVALID';
END $$;
CREATE FUNCTION dqa_business.request_document_version(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(v)||jsonb_build_object('canonical_text',v.payload::text) FROM dqa_business.request_document_versions v WHERE tenant_id=p_tenant AND id=p_id
$$;
CREATE FUNCTION dqa_business.request_supervisor(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'display_name',s.display_name,'enabled',true,'has_request_manager',true)),'[]') FROM dqa_business.memberships m JOIN dqa_business.memberships s ON s.tenant_id=m.tenant_id AND s.id=m.supervisor_member_id JOIN dqa_business.roles r ON r.tenant_id=s.tenant_id AND r.id=s.role_id WHERE m.tenant_id=p_tenant AND m.auth_user_id=auth.uid() AND dqa_private.can(p_tenant) AND s.enabled AND s.auth_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=s.auth_user_id AND u.email_confirmed_at IS NOT NULL) AND r.enabled AND 'request'=ANY(r.systems) AND (r.is_tenant_admin OR 'requests.review_manager'=ANY(r.permissions))
$$;
REVOKE ALL ON FUNCTION dqa_business.request_document_version(uuid,uuid),dqa_business.request_supervisor(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.request_document_version(uuid,uuid),dqa_business.request_supervisor(uuid) TO authenticated;
CREATE FUNCTION dqa_business.request_signature_image(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',id,'signature_data',signature_data,'signature_sha256',signature_sha256,'verification',verification) FROM dqa_business.request_signatures WHERE tenant_id=p_tenant AND id=p_id
$$;
REVOKE ALL ON FUNCTION dqa_business.prepare_request_operation(uuid,uuid,jsonb),dqa_business.execute_request_operation(uuid,uuid,jsonb),dqa_business.request_operation_result(uuid,uuid),dqa_business.request_signature_image(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_request_operation(uuid,uuid,jsonb),dqa_business.execute_request_operation(uuid,uuid,jsonb),dqa_business.request_operation_result(uuid,uuid),dqa_business.request_signature_image(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION dqa_business.update_request_draft(p_tenant uuid,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM dqa_private.validate_draft(p_data);
 SELECT * INTO result FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_id AND owner_member_id=member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF NOT dqa_private.case_row_active(p_tenant,'requests',p_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF result.status NOT IN ('DRAFT','RETURNED') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
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

CREATE OR REPLACE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}'; cfg jsonb; historical jsonb; item record;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 FOR definition IN SELECT * FROM (VALUES
('requests','requests','id,tenant_id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details,request_document_version_id,request_review_level'),
('trials','trial_definitions','id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision'),
('equipment','equipment','id,legacy_id,name,category,model,serial_number,site_id,owner_member_id,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision,display_details,service_started_at'),
('materials','materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,site_id,owner_member_id,status,revision,display_details'),
('schedules','schedules','id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,revision'),
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
 RETURN result||jsonb_build_object('request_workflow_enabled',dqa_business.request_workflow_enabled(p_tenant),'request_supervisors',dqa_business.request_supervisor(p_tenant));
END $$;
REVOKE ALL ON FUNCTION dqa_business.original_ui_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.original_ui_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION dqa_business.create_request_draft(p_tenant uuid,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
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
