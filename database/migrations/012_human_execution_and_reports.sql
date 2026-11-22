-- Bounded, human-only continuation. Closed until the verified tenant release.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft','catalog.manage','equipment.manage','materials.manage','materials.adjust','requests.submit','requests.review_manager','requests.review_lms','schedules.plan','schedules.book','lab.execute','reports.submit','reports.review','reports.confirm']::text[]);
ALTER TABLE dqa_business.schedules ADD COLUMN draft_id uuid,ADD COLUMN plan jsonb,ADD COLUMN sample_code text,ADD COLUMN reserve_from timestamptz,ADD COLUMN reserve_until timestamptz,ADD COLUMN received_at timestamptz,ADD COLUMN started_at timestamptz,ADD COLUMN completed_at timestamptz,ADD FOREIGN KEY(tenant_id,draft_id) REFERENCES dqa_business.schedule_drafts(tenant_id,id);
CREATE UNIQUE INDEX one_live_schedule_per_request ON dqa_business.schedules(tenant_id,request_id) WHERE status NOT IN ('DRAFT','CANCELLED');
ALTER TABLE dqa_business.schedules ADD CONSTRAINT executor_reservation_exclusive EXCLUDE USING gist(tenant_id WITH =,executor_member_id WITH =,tstzrange(reserve_from,reserve_until,'[)') WITH &&) WHERE(status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED'));
ALTER TABLE dqa_business.reports ADD COLUMN current_version_id uuid,ADD COLUMN archived_artifact_version_id uuid,ADD COLUMN confirmed_at timestamptz,ADD COLUMN confirmed_by uuid,ADD COLUMN return_reason text,
 ADD FOREIGN KEY(tenant_id,current_version_id,request_id) REFERENCES dqa_business.report_versions(tenant_id,id,request_id),ADD FOREIGN KEY(tenant_id,archived_artifact_version_id) REFERENCES dqa_business.artifact_versions(tenant_id,id),ADD FOREIGN KEY(tenant_id,confirmed_by) REFERENCES dqa_business.memberships(tenant_id,id);
ALTER TABLE dqa_business.lab_operations DROP CONSTRAINT lab_operations_action_check;
ALTER TABLE dqa_business.lab_operations ADD CONSTRAINT lab_operations_action_check CHECK(action IN('RECEIVE','START','CANCEL','INTERRUPT','COMPLETE','SUBMIT_REPORT'));
CREATE TABLE dqa_private.human_workflow_policy(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,enabled boolean NOT NULL DEFAULT false,scope text NOT NULL DEFAULT 'HUMAN_BOOK_LAB_REPORT' CHECK(scope='HUMAN_BOOK_LAB_REPORT'),report_key bytea CHECK(octet_length(report_key)=32));
INSERT INTO dqa_private.human_workflow_policy(tenant_id) SELECT id FROM dqa_business.tenants;
CREATE TABLE dqa_private.human_operations(tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN('PLANNED','SAVED','EXPIRED')),result jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '2 minutes'),PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.human_permits(tenant_id uuid NOT NULL,operation_id uuid NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,table_name text NOT NULL,record_id uuid NOT NULL,from_status text,to_status text,event_id uuid,document_version_id uuid,report_version_id uuid,stage text,decision text);
CREATE TABLE dqa_private.report_upload_intents(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,request_id uuid NOT NULL,actor_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('REPORT','ARCHIVE')),object_key text NOT NULL UNIQUE,file_name text NOT NULL,mime_type text NOT NULL,byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 3145728),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),request_revision bigint NOT NULL,report_revision bigint NOT NULL,report_version_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '20 minutes'),consumed_at timestamptz,FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id));
REVOKE ALL ON dqa_private.human_workflow_policy,dqa_private.human_operations,dqa_private.human_permits,dqa_private.report_upload_intents FROM PUBLIC,anon,authenticated;
CREATE TABLE dqa_business.report_signatures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,request_id uuid NOT NULL,report_version_id uuid NOT NULL,approval_event_id uuid NOT NULL,actor_member_id uuid NOT NULL,signature_data text NOT NULL CHECK(length(signature_data)<=1400000),signature_sha256 text NOT NULL CHECK(signature_sha256~'^[a-f0-9]{64}$'),verification text NOT NULL DEFAULT 'NOT_VERIFIED' CHECK(verification='NOT_VERIFIED'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,approval_event_id),FOREIGN KEY(tenant_id,report_version_id,request_id) REFERENCES dqa_business.report_versions(tenant_id,id,request_id),FOREIGN KEY(tenant_id,approval_event_id) REFERENCES dqa_business.approval_events(tenant_id,id),FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id));
ALTER TABLE dqa_business.report_signatures ENABLE ROW LEVEL SECURITY;ALTER TABLE dqa_business.report_signatures FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_business.report_signatures FROM PUBLIC,anon,authenticated;GRANT SELECT ON dqa_business.report_signatures TO authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON dqa_business.report_signatures FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_business.report_signatures FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
CREATE FUNCTION dqa_private.human_permit(p_tenant uuid,p_operation uuid,p_table text,p_id uuid,p_from text,p_to text) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$INSERT INTO dqa_private.human_permits(tenant_id,operation_id,transaction_id,actor_id,table_name,record_id,from_status,to_status) VALUES(p_tenant,p_operation,txid_current(),auth.uid(),p_table,p_id,p_from,p_to)$$;
REVOKE ALL ON FUNCTION dqa_private.human_permit(uuid,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_private.can_read_human_report(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can_read_request(p_tenant,p_request) AND dqa_private.case_row_active(p_tenant,'requests',p_request) AND EXISTS(SELECT 1 FROM dqa_business.requests q JOIN dqa_business.reports r ON r.tenant_id=q.tenant_id AND r.request_id=q.id LEFT JOIN dqa_business.report_versions v ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id WHERE q.tenant_id=p_tenant AND q.id=p_request AND (dqa_private.is_admin(p_tenant) OR v.created_by_member_id=dqa_private.member_id(p_tenant) OR (r.status IN('AWAITING_VIEW','ARCHIVED') AND dqa_private.member_id(p_tenant) IN(q.owner_member_id,q.supervisor_member_id)) OR dqa_private.can(p_tenant,'reports.review') OR EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE e.tenant_id=p_tenant AND e.report_version_id=v.id AND e.actor_member_id=dqa_private.member_id(p_tenant))))
$$;
REVOKE ALL ON FUNCTION dqa_private.can_read_human_report(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.human_workflow_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;items jsonb;schedules jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 SELECT jsonb_build_object('human_workflow_enabled',coalesce((SELECT enabled FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant),false),'human_reports',coalesce(jsonb_agg(to_jsonb(x)),'[]')) INTO result FROM(SELECT r.*,v.version version_number,v.created_by_member_id submitter_id,v.created_at submitted_at,a.name file_name,av.id file_id,av.sha256 file_sha256,av.byte_size,av.mime_type FROM dqa_business.reports r LEFT JOIN dqa_business.report_versions v ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id LEFT JOIN dqa_business.artifact_versions av ON av.tenant_id=v.tenant_id AND av.id=v.artifact_version_id LEFT JOIN dqa_business.artifacts a ON a.tenant_id=av.tenant_id AND a.id=av.artifact_id WHERE r.tenant_id=p_tenant AND dqa_private.can_read_human_report(p_tenant,r.request_id) ORDER BY r.id LIMIT 1001)x;
 IF jsonb_array_length(result->'human_reports')>1000 THEN RAISE EXCEPTION 'SNAPSHOT_PAGINATION_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO items FROM(SELECT e.*,s.id signature_id,s.signature_sha256 FROM dqa_business.approval_events e LEFT JOIN dqa_business.report_signatures s ON s.tenant_id=e.tenant_id AND s.approval_event_id=e.id WHERE e.tenant_id=p_tenant AND e.report_version_id IS NOT NULL AND dqa_private.can_read_human_report(p_tenant,e.request_id) ORDER BY e.created_at LIMIT 2001)x;
 IF jsonb_array_length(items)>2000 THEN RAISE EXCEPTION 'SNAPSHOT_PAGINATION_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO schedules FROM(SELECT id,request_id,draft_id,received_at,started_at,completed_at,sample_code,plan-'segments' AS plan,reserve_from,reserve_until FROM dqa_business.schedules WHERE tenant_id=p_tenant AND dqa_private.can_read_request(p_tenant,request_id) AND dqa_private.case_row_active(p_tenant,'requests',request_id) AND dqa_private.case_row_active(p_tenant,'schedules',id) ORDER BY id LIMIT 1001)x;
 IF jsonb_array_length(schedules)>1000 THEN RAISE EXCEPTION 'SNAPSHOT_PAGINATION_REQUIRED';END IF;
 RETURN result||jsonb_build_object('human_report_events',items,'human_schedules',schedules);
END $$;
CREATE FUNCTION dqa_business.prepare_human_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.human_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','request_id','expected_request_revision','expected_schedule_revision','expected_report_revision','expected_draft_revision','signature_data','comment','upload_id')) OR coalesce(p_command->>'action','') NOT IN('BOOK','RECEIVE','START','COMPLETE','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE') OR coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR EXISTS(SELECT 1 FROM unnest(ARRAY['expected_schedule_revision','expected_report_revision','expected_draft_revision']) k WHERE coalesce(p_command->>k,'')!~'^(0|[1-9][0-9]{0,14})$') OR jsonb_typeof(p_command->'signature_data') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'comment') IS DISTINCT FROM 'string' OR length(p_command->>'comment')>2000 THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 IF p_command->>'action' IN('REPORT_RETURN','CONFIRM_ARCHIVE') AND p_command->>'signature_data'<>'' THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 PERFORM dqa_private.validate_original_fields(NULL,p_command->>'signature_data');
 IF NOT dqa_private.can_read_request(p_tenant,(p_command->>'request_id')::uuid) OR NOT dqa_private.case_row_active(p_tenant,'requests',(p_command->>'request_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-operations:'||p_tenant,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');SELECT * INTO op FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'HUMAN_OPERATION_CONFLICT';END IF;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);END IF;
 IF (SELECT count(*) FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION 'HUMAN_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.human_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE FUNCTION dqa_business.human_operation_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.human_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;SELECT * INTO op FROM dqa_private.human_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('id',p_operation,'state','NOT_FOUND');END IF;
 IF op.state='PLANNED' AND op.expires_at<=clock_timestamp() THEN UPDATE dqa_private.human_operations SET state='EXPIRED' WHERE tenant_id=p_tenant AND id=p_operation RETURNING * INTO op;END IF;
 RETURN CASE WHEN op.state='SAVED' THEN op.result ELSE jsonb_build_object('id',p_operation,'state',op.state,'expires_at',op.expires_at) END;
END $$;
CREATE FUNCTION dqa_business.execute_human_operation(p_tenant uuid,p_operation uuid,p_command jsonb,p_attestation text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  plan:=dqa_private.schedule_draft_plan(p_tenant,jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',d.revision,'data',jsonb_build_object('equipment_ids',data,'equipment_revisions',d.plan->'equipment_revisions','executor_id',d.plan->'executor_id','executor_revision',d.plan->'executor_revision','start_date',d.plan->'start_date','end_date',d.plan->'end_date','sample_code',d.plan->'sample_code','note',d.plan->'note','preparation_minutes',d.plan->'preparation_minutes','cleanup_minutes',d.plan->'cleanup_minutes')));
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',new_id,NULL,'AWAITING_RECEIPT');
  INSERT INTO dqa_business.schedules(id,tenant_id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,draft_id,plan,sample_code,reserve_from,reserve_until)
  VALUES(new_id,p_tenant,'SCH-'||q.legacy_id,q.id,(plan->>'executor_id')::uuid,(plan->>'starts_at')::timestamptz,(plan->>'ends_at')::timestamptz,(plan->>'preparation_minutes')::integer,(plan->>'cleanup_minutes')::integer,'AWAITING_RECEIPT',d.id,plan,plan->>'sample_code',(plan->>'starts_at')::timestamptz-(plan->>'preparation_minutes')::integer*interval '1 minute',(plan->>'ends_at')::timestamptz+(plan->>'cleanup_minutes')::integer*interval '1 minute') RETURNING * INTO s;
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
CREATE FUNCTION dqa_business.prepare_report_upload(p_tenant uuid,p_id uuid,p_request uuid,p_kind text,p_name text,p_size integer,p_sha256 text,p_request_revision bigint,p_report_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;r dqa_business.reports;key text;mime text;
BEGIN
 IF NOT dqa_private.can(p_tenant) OR NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled AND report_key IS NOT NULL) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;SELECT * INTO r FROM dqa_business.reports WHERE tenant_id=p_tenant AND request_id=p_request;
 IF q.id IS NULL OR NOT dqa_private.can_read_request(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF q.revision<>p_request_revision OR coalesce(r.revision,0)<>p_report_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF p_id IS NULL OR p_kind IS NULL OR p_name IS NULL OR p_size IS NULL OR p_sha256 IS NULL OR p_request_revision IS NULL OR p_report_revision IS NULL OR p_size NOT BETWEEN 1 AND 3145728 OR p_sha256!~'^[a-f0-9]{64}$' OR length(p_name) NOT BETWEEN 1 AND 180 OR p_name~'[/\\[:cntrl:]]' OR p_kind NOT IN('REPORT','ARCHIVE') THEN RAISE EXCEPTION 'HUMAN_FILE_INVALID';END IF;
 IF p_kind='REPORT' THEN
  IF NOT dqa_private.can(p_tenant,'reports.submit') OR q.status<>'COMPLETED' OR (r.id IS NOT NULL AND r.status<>'RETURNED') OR NOT EXISTS(SELECT 1 FROM dqa_business.schedules s JOIN dqa_business.roles role ON role.tenant_id=s.tenant_id JOIN dqa_business.memberships m ON m.id=s.executor_member_id AND m.role_id=role.id AND m.tenant_id=role.tenant_id WHERE s.tenant_id=p_tenant AND s.request_id=p_request AND s.status='COMPLETED' AND s.executor_member_id=dqa_private.member_id(p_tenant) AND 'lab'=ANY(role.systems)) OR p_name!~*'\.xlsx$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
  mime:='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 ELSE
  IF r.id IS NULL OR r.current_version_id IS NULL OR NOT dqa_private.can(p_tenant,'reports.confirm') OR r.status IS DISTINCT FROM 'AWAITING_VIEW' OR q.supervisor_member_id IS DISTINCT FROM dqa_private.member_id(p_tenant) OR p_name!~*'\.pdf$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;mime:='application/pdf';
 END IF;
 IF (SELECT count(*) FROM dqa_private.report_upload_intents WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'HUMAN_RATE_LIMITED';END IF;
 key:=p_tenant::text||'/'||p_request::text||'/'||p_id::text||CASE WHEN p_kind='REPORT' THEN '.xlsx' ELSE '.pdf' END;
 INSERT INTO dqa_private.report_upload_intents(id,tenant_id,request_id,actor_id,kind,object_key,file_name,mime_type,byte_size,sha256,request_revision,report_revision,report_version_id) VALUES(p_id,p_tenant,p_request,auth.uid(),p_kind,key,p_name,mime,p_size,p_sha256,p_request_revision,p_report_revision,r.current_version_id);
 RETURN jsonb_build_object('id',p_id,'bucket','dqa-business-reports','object_key',key,'mime_type',mime,'byte_size',p_size,'sha256',p_sha256);
END $$;
CREATE FUNCTION dqa_business.report_upload_intent(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',u.id,'request_id',u.request_id,'kind',u.kind,'bucket','dqa-business-reports','object_key',u.object_key,'mime_type',u.mime_type,'byte_size',u.byte_size,'sha256',u.sha256,'file_name',u.file_name,'request_legacy_id',(SELECT legacy_id FROM dqa_business.requests WHERE id=u.request_id),'trial_name',(SELECT t.name FROM dqa_business.trial_definitions t JOIN dqa_business.requests q ON q.trial_id=t.id AND q.tenant_id=t.tenant_id WHERE q.id=u.request_id),'product_code',(SELECT product_code FROM dqa_business.requests WHERE id=u.request_id)) FROM dqa_private.report_upload_intents u WHERE u.tenant_id=p_tenant AND u.id=p_id AND u.actor_id=auth.uid() AND u.expires_at>clock_timestamp() AND u.consumed_at IS NULL AND dqa_private.can(p_tenant) AND dqa_private.case_row_active(p_tenant,'requests',u.request_id)
$$;
CREATE FUNCTION dqa_business.human_report_file(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',v.id,'request_id',a.request_id,'file_name',a.name,'bucket',v.storage_bucket,'object_key',v.object_key,'sha256',v.sha256,'byte_size',v.byte_size,'mime_type',v.mime_type) FROM dqa_business.artifact_versions v JOIN dqa_business.artifacts a ON a.tenant_id=v.tenant_id AND a.id=v.artifact_id WHERE v.tenant_id=p_tenant AND v.id=p_id AND a.kind='REPORT' AND dqa_private.can_read_human_report(p_tenant,a.request_id)
$$;
CREATE FUNCTION dqa_business.human_report_signature(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(s) FROM dqa_business.report_signatures s WHERE s.tenant_id=p_tenant AND s.id=p_id AND dqa_private.can_read_human_report(p_tenant,s.request_id)
$$;
CREATE FUNCTION dqa_business.storage_object_allowed(p_bucket text,p_name text,p_write boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_bucket='dqa-business-reports' AND (EXISTS(SELECT 1 FROM dqa_private.report_upload_intents u WHERE u.object_key=p_name AND u.actor_id=auth.uid() AND u.consumed_at IS NULL AND u.expires_at>clock_timestamp() AND dqa_private.can(u.tenant_id) AND dqa_private.case_row_active(u.tenant_id,'requests',u.request_id)) OR (NOT p_write AND EXISTS(SELECT 1 FROM dqa_business.artifact_versions v JOIN dqa_business.artifacts a ON a.tenant_id=v.tenant_id AND a.id=v.artifact_id WHERE v.storage_bucket=p_bucket AND v.object_key=p_name AND dqa_private.can_read_human_report(v.tenant_id,a.request_id))))
$$;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='dqa-business-reports') THEN RAISE EXCEPTION 'REPORT_BUCKET_ALREADY_EXISTS_REVIEW_REQUIRED';END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('dqa-business-reports','dqa-business-reports',false,3145728,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
CREATE POLICY dqa_human_report_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(dqa_business.storage_object_allowed(bucket_id,name,true));
CREATE POLICY dqa_human_report_read ON storage.objects FOR SELECT TO authenticated USING(dqa_business.storage_object_allowed(bucket_id,name,false));
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('human_workflow_snapshot','prepare_human_operation','execute_human_operation','human_operation_result','prepare_report_upload','report_upload_intent','human_report_file','human_report_signature','storage_object_allowed') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO authenticated';END LOOP;END $$;

CREATE OR REPLACE FUNCTION dqa_private.workflow_policy_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dqa_private.human_permits p JOIN dqa_private.human_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.tenant_id=NEW.tenant_id AND p.operation_id IS NOT NULL AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.table_name=TG_TABLE_NAME AND p.record_id=NEW.id AND p.from_status IS NOT DISTINCT FROM CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END AND p.to_status=NEW.status) THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  IF TG_TABLE_SCHEMA<>'dqa_business' OR TG_TABLE_NAME<>'requests' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM dqa_private.request_transition_permits p JOIN dqa_private.request_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.tenant_id=NEW.tenant_id AND p.request_id=NEW.id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.from_status=OLD.status AND p.to_status=NEW.status) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION dqa_private.approval_policy_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dqa_private.human_permits p JOIN dqa_private.human_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.table_name='approval_events' AND p.record_id=NEW.id AND p.event_id=NEW.id AND p.operation_id=NEW.operation_id AND p.stage=NEW.stage AND p.decision=NEW.decision AND p.document_version_id IS NOT DISTINCT FROM NEW.request_document_version_id AND p.report_version_id IS NOT DISTINCT FROM NEW.report_version_id AND NEW.actor_member_id=dqa_private.member_id(NEW.tenant_id)) THEN RETURN NEW;END IF;
 IF NEW.decision<>'NOTE' AND NOT EXISTS(SELECT 1 FROM dqa_private.request_transition_permits p JOIN dqa_private.request_workflow_policy w USING(tenant_id) WHERE w.enabled AND p.tenant_id=NEW.tenant_id AND p.request_id=NEW.request_id AND p.transaction_id=txid_current() AND p.actor_id=auth.uid() AND p.event_id=NEW.id AND p.operation_id=NEW.operation_id AND p.stage=NEW.stage AND p.decision=NEW.decision AND NEW.request_document_version_id IS NOT NULL AND NEW.report_version_id IS NULL AND NEW.actor_member_id=dqa_private.member_id(NEW.tenant_id)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dqa_private.can_read_request(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND EXISTS(SELECT 1 FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND r.id=p_request AND (dqa_private.can(p_tenant,'requests.read_all') OR r.owner_member_id=dqa_private.member_id(p_tenant) OR r.supervisor_member_id=dqa_private.member_id(p_tenant) OR (dqa_private.can(p_tenant,'lab.execute') AND EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=r.id AND s.status NOT IN('DRAFT','CANCELLED') AND s.executor_member_id=dqa_private.member_id(p_tenant)))))
$$;

CREATE FUNCTION dqa_business.human_report_visible(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT dqa_private.can_read_human_report(p_tenant,p_request)$$;
REVOKE ALL ON FUNCTION dqa_business.human_report_visible(uuid,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION dqa_business.human_report_visible(uuid,uuid) TO authenticated;
CREATE POLICY report_signature_read ON dqa_business.report_signatures FOR SELECT TO authenticated USING(dqa_business.human_report_visible(tenant_id,request_id));

-- Restrictive bucket guards also constrain pre-existing permissive Storage policies.
CREATE POLICY dqa_human_report_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'dqa-business-reports' OR dqa_business.storage_object_allowed(bucket_id,name,false));
CREATE POLICY dqa_human_report_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'dqa-business-reports' OR dqa_business.storage_object_allowed(bucket_id,name,true));
CREATE POLICY dqa_human_report_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'dqa-business-reports') WITH CHECK(bucket_id<>'dqa-business-reports');
CREATE POLICY dqa_human_report_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'dqa-business-reports');
CREATE POLICY dqa_human_report_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'dqa-business-reports') WITH CHECK(bucket_id<>'dqa-business-reports');
