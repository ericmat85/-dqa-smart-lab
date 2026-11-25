-- Immutable trial-reference originals, pinned at request submission and delivered only to the assigned executor.
CREATE TABLE dqa_private.trial_template_files(
 tenant_id uuid NOT NULL, id uuid NOT NULL, trial_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160 AND name~*'\.xlsx$' AND name!~'[\r\n/\\]'),
 version text NOT NULL CHECK(length(btrim(version)) BETWEEN 1 AND 80),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 22 AND 2097152),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,trial_id),FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id)
);
CREATE TABLE dqa_private.trial_template_bindings(
 tenant_id uuid NOT NULL,trial_id uuid NOT NULL,file_id uuid,revision integer NOT NULL CHECK(revision>0),PRIMARY KEY(tenant_id,trial_id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,file_id,trial_id) REFERENCES dqa_private.trial_template_files(tenant_id,id,trial_id)
);
CREATE TABLE dqa_private.trial_template_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.request_trial_template_pins(
 tenant_id uuid NOT NULL,document_id uuid NOT NULL,request_id uuid NOT NULL,trial_id uuid NOT NULL,file_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,document_id),
 FOREIGN KEY(tenant_id,document_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,file_id,trial_id) REFERENCES dqa_private.trial_template_files(tenant_id,id,trial_id)
);
CREATE TABLE dqa_private.trial_template_deliveries(
 tenant_id uuid NOT NULL,document_id uuid NOT NULL,member_id uuid NOT NULL,attempt uuid NOT NULL,state text NOT NULL CHECK(state IN('CLAIMED','DISPATCHED')),expires_at timestamptz NOT NULL,dispatched_at timestamptz,
 PRIMARY KEY(tenant_id,document_id,member_id),FOREIGN KEY(tenant_id,document_id) REFERENCES dqa_private.request_trial_template_pins(tenant_id,document_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['trial_template_files','trial_template_bindings','trial_template_operations','request_trial_template_pins','trial_template_deliveries'] LOOP
 EXECUTE format('ALTER TABLE dqa_private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON dqa_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP;END $$;
CREATE FUNCTION dqa_private.pin_request_trial_template() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trial uuid;file uuid;
BEGIN
 SELECT trial_id INTO trial FROM dqa_business.requests WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
 IF trial IS NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||NEW.tenant_id||':'||trial,0));
 SELECT file_id INTO file FROM dqa_private.trial_template_bindings WHERE tenant_id=NEW.tenant_id AND trial_id=trial;
 INSERT INTO dqa_private.request_trial_template_pins(tenant_id,document_id,request_id,trial_id,file_id) VALUES(NEW.tenant_id,NEW.id,NEW.request_id,trial,file);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION dqa_private.pin_request_trial_template() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pin_trial_template AFTER INSERT ON dqa_business.request_document_versions FOR EACH ROW EXECUTE FUNCTION dqa_private.pin_request_trial_template();
CREATE FUNCTION dqa_private.can_receive_trial_template(p_tenant uuid,p_document uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant,'lab.execute') AND EXISTS(
 SELECT 1 FROM dqa_private.request_trial_template_pins pin JOIN dqa_business.requests q ON q.tenant_id=pin.tenant_id AND q.id=pin.request_id AND q.request_document_version_id=pin.document_id
 JOIN dqa_business.schedules s ON s.tenant_id=q.tenant_id AND s.request_id=q.id
 JOIN dqa_business.memberships m ON m.tenant_id=s.tenant_id AND m.id=s.executor_member_id
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
 WHERE pin.tenant_id=p_tenant AND pin.document_id=p_document AND s.executor_member_id=dqa_private.member_id(p_tenant) AND m.enabled AND m.deleted_at IS NULL AND r.enabled
 AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED','COMPLETED') AND q.status IN('AWAITING_LAB_RECEIPT','RUNNING','COMPLETED','AWAITING_REPORT_REVIEW','AWAITING_VIEW_CONFIRMATION','CLOSED')
 AND dqa_private.can_read_request(p_tenant,q.id) AND dqa_private.case_row_active(p_tenant,'requests',q.id) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))
$$;
REVOKE ALL ON FUNCTION dqa_private.can_receive_trial_template(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.trial_template_catalog(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trials jsonb;files jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'legacy_id',t.legacy_id,'name',t.name,'aliases',t.aliases,'file_id',b.file_id,'revision',coalesce(b.revision,0)) ORDER BY t.id),'[]') INTO trials FROM dqa_business.trial_definitions t LEFT JOIN dqa_private.trial_template_bindings b ON b.tenant_id=t.tenant_id AND b.trial_id=t.id WHERE t.tenant_id=p_tenant AND t.enabled;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'trial_id',f.trial_id,'name',f.name,'version',f.version,'sha256',f.sha256,'byteLength',octet_length(f.content),'createdAt',f.created_at) ORDER BY f.created_at DESC,f.id),'[]') INTO files FROM dqa_private.trial_template_files f WHERE f.tenant_id=p_tenant;
 RETURN jsonb_build_object('trials',trials,'files',files,'can_manage',dqa_private.can(p_tenant,'catalog.manage'));
END $$;
CREATE FUNCTION dqa_business.save_trial_template_binding(p_tenant uuid,p_operation uuid,p_trial uuid,p_revision integer,p_file uuid,p_name text,p_version text,p_sha256 text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.trial_template_operations;old dqa_private.trial_template_bindings;file dqa_private.trial_template_files;bytes bytea;result jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_trial IS NULL OR p_revision IS NULL OR p_revision<0 OR NOT EXISTS(SELECT 1 FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=p_trial AND enabled) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 IF p_content IS NOT NULL THEN
  IF p_file IS NULL OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 160 OR p_name!~*'\.xlsx$' OR p_name~'[\r\n/\\]' OR p_version IS NULL OR length(btrim(p_version)) NOT BETWEEN 1 AND 80 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR length(p_content)>2796204 OR p_content!~'^[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
  BEGIN bytes:=decode(p_content,'base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END;
  IF octet_length(bytes) NOT BETWEEN 22 AND 2097152 OR substring(bytes FROM 1 FOR 4)<>decode('504b0304','hex') OR encode(sha256(bytes),'hex')<>p_sha256 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END IF;
 ELSE
  IF p_name IS NOT NULL OR p_version IS NOT NULL OR (p_file IS NULL AND p_sha256 IS NOT NULL) OR (p_file IS NOT NULL AND (p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_trial,p_revision,p_file,p_name,p_version,p_sha256,p_content IS NOT NULL)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-operation:'||p_tenant||':'||p_operation,0));
 SELECT * INTO op FROM dqa_private.trial_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||p_tenant||':'||p_trial,0));
 SELECT * INTO old FROM dqa_private.trial_template_bindings WHERE tenant_id=p_tenant AND trial_id=p_trial;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REVISION_CONFLICT';END IF;
 IF bytes IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-files:'||p_tenant,0));
  IF (SELECT count(*) FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant)>=100 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_LIMIT';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;
  INSERT INTO dqa_private.trial_template_files(tenant_id,id,trial_id,name,version,content,sha256,created_by) VALUES(p_tenant,p_file,p_trial,p_name,btrim(p_version),bytes,p_sha256,auth.uid());
 ELSIF p_file IS NOT NULL THEN
  SELECT * INTO file FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file AND trial_id=p_trial;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;IF file.sha256<>p_sha256 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END IF;
 END IF;
 INSERT INTO dqa_private.trial_template_bindings(tenant_id,trial_id,file_id,revision) VALUES(p_tenant,p_trial,p_file,1) ON CONFLICT(tenant_id,trial_id) DO UPDATE SET file_id=p_file,revision=dqa_private.trial_template_bindings.revision+1;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','trial_id',p_trial,'file_id',p_file,'revision',coalesce(old.revision,0)+1);
 INSERT INTO dqa_private.trial_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'trial_template_bindings',p_trial,'UPDATE',ARRAY['file_id','revision']);
 RETURN result;
END $$;
CREATE FUNCTION dqa_business.trial_template_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 SELECT o.result INTO result FROM dqa_private.trial_template_operations o WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid();RETURN coalesce(result,jsonb_build_object('id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND'));
END $$;
CREATE FUNCTION dqa_business.trial_template_file(p_tenant uuid,p_file uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f dqa_private.trial_template_files;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 SELECT * INTO f FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file;IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 RETURN jsonb_build_object('id',f.id,'name',f.name,'version',f.version,'sha256',f.sha256,'byteLength',octet_length(f.content),'content',replace(encode(f.content,'base64'),E'\n',''));
END $$;
CREATE FUNCTION dqa_business.trial_template_inbox(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'request_code',q.legacy_id,'document_id',p.document_id,'trial_name',coalesce(q.trial_snapshot->>'name',t.name),'file_id',f.id,'name',f.name,'version',f.version,'sha256',f.sha256,'dispatched',coalesce(d.state='DISPATCHED',false),'claimed',coalesce(d.state='CLAIMED' AND d.expires_at>now(),false)) ORDER BY p.created_at,p.document_id),'[]') INTO rows
 FROM dqa_private.request_trial_template_pins p JOIN dqa_private.trial_template_files f ON f.tenant_id=p.tenant_id AND f.id=p.file_id JOIN dqa_business.requests q ON q.tenant_id=p.tenant_id AND q.id=p.request_id JOIN dqa_business.trial_definitions t ON t.tenant_id=p.tenant_id AND t.id=p.trial_id
 LEFT JOIN dqa_private.trial_template_deliveries d ON d.tenant_id=p.tenant_id AND d.document_id=p.document_id AND d.member_id=dqa_private.member_id(p_tenant)
 WHERE p.tenant_id=p_tenant AND q.status<>'CLOSED' AND dqa_private.can_receive_trial_template(p_tenant,p.document_id);
 RETURN jsonb_build_object('rows',rows);
END $$;
CREATE FUNCTION dqa_business.request_trial_template_file(p_tenant uuid,p_document uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f dqa_private.trial_template_files;pin dqa_private.request_trial_template_pins;q dqa_business.requests;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND request_document_version_id=p_document;
 IF q.id IS NULL OR NOT dqa_private.can(p_tenant,'lab.execute') OR NOT dqa_private.can_read_request(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) OR NOT EXISTS(SELECT 1 FROM dqa_business.schedules s JOIN dqa_business.memberships m ON m.id=s.executor_member_id AND m.tenant_id=s.tenant_id JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.executor_member_id=dqa_private.member_id(p_tenant) AND s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED','COMPLETED') AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) OR q.status NOT IN('AWAITING_LAB_RECEIPT','RUNNING','COMPLETED','AWAITING_REPORT_REVIEW','AWAITING_VIEW_CONFIRMATION','CLOSED') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ACCESS_DENIED';END IF;
 SELECT * INTO pin FROM dqa_private.request_trial_template_pins WHERE tenant_id=p_tenant AND document_id=p_document;
 IF pin.file_id IS NULL THEN RETURN jsonb_build_object('has_template',false);END IF;
 SELECT * INTO f FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=pin.file_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 RETURN jsonb_build_object('has_template',true,'id',f.id,'document_id',p_document,'request_code',q.legacy_id,'name',f.name,'version',f.version,'sha256',f.sha256,'byteLength',octet_length(f.content),'content',replace(encode(f.content,'base64'),E'\n',''));
END $$;
CREATE FUNCTION dqa_business.claim_trial_template_delivery(p_tenant uuid,p_document uuid,p_attempt uuid,p_manual boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid;d dqa_private.trial_template_deliveries;
BEGIN
 IF p_attempt IS NULL OR NOT dqa_private.can_receive_trial_template(p_tenant,p_document) OR NOT EXISTS(SELECT 1 FROM dqa_private.request_trial_template_pins WHERE tenant_id=p_tenant AND document_id=p_document AND file_id IS NOT NULL) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ACCESS_DENIED';END IF;member:=dqa_private.member_id(p_tenant);
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-delivery:'||p_tenant||':'||p_document||':'||member,0));
 SELECT * INTO d FROM dqa_private.trial_template_deliveries WHERE tenant_id=p_tenant AND document_id=p_document AND member_id=member;
 IF d.state='DISPATCHED' OR (d.state='CLAIMED' AND d.expires_at>now() AND d.attempt<>p_attempt AND NOT p_manual) THEN RETURN jsonb_build_object('state',CASE WHEN d.state='DISPATCHED' THEN 'DISPATCHED' ELSE 'IN_PROGRESS' END,'attempt',p_attempt);END IF;
 INSERT INTO dqa_private.trial_template_deliveries(tenant_id,document_id,member_id,attempt,state,expires_at) VALUES(p_tenant,p_document,member,p_attempt,'CLAIMED',clock_timestamp()+interval '2 minutes') ON CONFLICT(tenant_id,document_id,member_id) DO UPDATE SET attempt=p_attempt,state='CLAIMED',expires_at=clock_timestamp()+interval '2 minutes';
 RETURN jsonb_build_object('state','CLAIMED','attempt',p_attempt);
END $$;
CREATE FUNCTION dqa_business.ack_trial_template_delivery(p_tenant uuid,p_document uuid,p_attempt uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT dqa_private.can_receive_trial_template(p_tenant,p_document) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ACCESS_DENIED';END IF;
 UPDATE dqa_private.trial_template_deliveries SET state='DISPATCHED',dispatched_at=coalesce(dispatched_at,clock_timestamp()) WHERE tenant_id=p_tenant AND document_id=p_document AND member_id=dqa_private.member_id(p_tenant) AND attempt=p_attempt;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_CLAIM_STALE';END IF;RETURN jsonb_build_object('state','DISPATCHED','attempt',p_attempt);
END $$;
DO $$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('trial_template_catalog','save_trial_template_binding','trial_template_result','trial_template_file','trial_template_inbox','request_trial_template_file','claim_trial_template_delivery','ack_trial_template_delivery') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END LOOP;END $$;
