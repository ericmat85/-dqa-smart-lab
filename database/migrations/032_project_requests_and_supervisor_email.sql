-- Project entry creates independent ordinary workflow requests, never combined approval.
CREATE TABLE dqa_business.request_projects(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants(id),id uuid NOT NULL,
 owner_member_id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 item_count integer NOT NULL CHECK(item_count BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
ALTER TABLE dqa_business.requests ADD COLUMN project_group_id uuid,ADD COLUMN project_item_index integer;
ALTER TABLE dqa_business.requests ADD FOREIGN KEY(tenant_id,project_group_id) REFERENCES dqa_business.request_projects(tenant_id,id),
 ADD CONSTRAINT project_item_index_valid CHECK((project_group_id IS NULL AND project_item_index IS NULL) OR (project_group_id IS NOT NULL AND project_item_index BETWEEN 1 AND 100));
CREATE UNIQUE INDEX project_request_index ON dqa_business.requests(tenant_id,project_group_id,project_item_index) WHERE project_group_id IS NOT NULL;
ALTER TABLE dqa_business.request_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_read ON dqa_business.request_projects FOR SELECT TO authenticated USING(dqa_private.can(tenant_id) AND (owner_member_id=dqa_private.member_id(tenant_id) OR EXISTS(SELECT 1 FROM dqa_business.requests r WHERE r.tenant_id=request_projects.tenant_id AND r.project_group_id=request_projects.id)));
GRANT SELECT ON dqa_business.request_projects TO authenticated;
REVOKE ALL ON dqa_business.request_projects FROM anon;
CREATE TABLE dqa_private.project_request_operations(
 tenant_id uuid NOT NULL,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,command jsonb NOT NULL,
 state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN('PLANNED','BUILDING','SAVED')),transaction_id bigint,result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
 PRIMARY KEY(tenant_id,id)
);
REVOKE ALL ON dqa_private.project_request_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.project_child_id(p_group uuid,p_index integer,p_operation boolean DEFAULT false) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT md5((CASE WHEN p_operation THEN 'project-submit:' ELSE 'project-item:' END)||p_group::text||':'||p_index)::uuid $$;
CREATE FUNCTION dqa_private.project_batch_allowed(p_tenant uuid,p_operation uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_private.project_request_operations o CROSS JOIN LATERAL generate_series(1,jsonb_array_length(o.command->'items')) n WHERE o.tenant_id=p_tenant AND o.actor_id=auth.uid() AND o.state='BUILDING' AND o.transaction_id=txid_current() AND p_request=dqa_private.project_child_id(o.id,n) AND p_operation=dqa_private.project_child_id(o.id,n,true))
$$;
CREATE FUNCTION dqa_private.project_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o dqa_private.project_request_operations;n integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.project_group_id IS DISTINCT FROM OLD.project_group_id OR NEW.project_item_index IS DISTINCT FROM OLD.project_item_index THEN RAISE EXCEPTION 'PROJECT_LINK_IMMUTABLE';END IF;
  IF OLD.project_group_id IS NOT NULL AND NEW.form_details->>'priority' IS DISTINCT FROM '專案' THEN RAISE EXCEPTION 'PROJECT_LINK_IMMUTABLE';END IF;
  IF OLD.project_group_id IS NULL AND NEW.form_details->>'priority'='專案' AND coalesce(OLD.form_details->>'priority','') NOT IN('專案','專案關鍵') THEN RAISE EXCEPTION 'PROJECT_GROUP_REQUIRED';END IF;
  RETURN NEW;
 END IF;
 IF NEW.form_details->>'priority'='專案' THEN
  SELECT q.* INTO o FROM dqa_private.project_request_operations q WHERE q.tenant_id=NEW.tenant_id AND q.actor_id=auth.uid() AND q.state='BUILDING' AND q.transaction_id=txid_current() AND EXISTS(SELECT 1 FROM generate_series(1,jsonb_array_length(q.command->'items')) i WHERE NEW.id=dqa_private.project_child_id(q.id,i));
  SELECT i INTO n FROM generate_series(1,jsonb_array_length(o.command->'items')) i WHERE NEW.id=dqa_private.project_child_id(o.id,i);
  IF o.id IS NULL THEN RAISE EXCEPTION 'PROJECT_GROUP_REQUIRED';END IF;
  NEW.project_group_id:=o.id;NEW.project_item_index:=n;
 ELSIF NEW.project_group_id IS NOT NULL OR NEW.project_item_index IS NOT NULL THEN RAISE EXCEPTION 'PROJECT_GROUP_REQUIRED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_request_guard BEFORE INSERT OR UPDATE ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.project_request_guard();
CREATE FUNCTION dqa_private.project_child_data(p_command jsonb,p_item jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (p_command->'common')||jsonb_build_object('trial_id',p_item->'trial_id','quantity',p_item->'quantity','specification',p_item->>'specification','acceptance',p_item->>'acceptance','form_details',(p_command->'common'->'form_details')||jsonb_build_object('priority','專案','project',p_command->>'name','testItems',jsonb_build_array(p_item->>'name'),'judgementRequired',p_item->>'judgementRequired'))
$$;
CREATE FUNCTION dqa_private.validate_project_request(p_tenant uuid,p_command jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item jsonb;data jsonb;t dqa_business.trial_definitions;
BEGIN
 IF NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['name','execution_kind','submit','common','items']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('name','execution_kind','submit','common','items'))
 OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'name')) NOT BETWEEN 1 AND 100 OR coalesce(p_command->>'execution_kind','') NOT IN('REAL','VIRTUAL') OR jsonb_typeof(p_command->'submit') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_command->'common') IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
 IF jsonb_array_length(p_command->'items') NOT BETWEEN 1 AND 100 OR octet_length(p_command::text)>4194304 THEN RAISE EXCEPTION 'PROJECT_LIMIT';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_command->'items') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['trial_id','name','quantity','specification','acceptance','judgementRequired']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('trial_id','name','quantity','specification','acceptance','judgementRequired')) OR coalesce(item->>'trial_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(item->>'judgementRequired','') NOT IN('需作判定','不作判定') OR jsonb_typeof(item->'specification')<>'string' OR jsonb_typeof(item->'acceptance')<>'string' OR length(item->>'specification')>3000 OR length(item->>'acceptance')>3000 THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
  SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(item->>'trial_id')::uuid AND enabled;
  IF NOT FOUND OR item->>'name' IS DISTINCT FROM t.name THEN RAISE EXCEPTION 'TRIAL_NOT_AVAILABLE';END IF;
  data:=dqa_private.project_child_data(p_command,item);PERFORM dqa_private.validate_draft(data);
  IF (p_command->>'submit')::boolean AND (coalesce(length(btrim(item->>'specification')),0)=0 OR coalesce(length(btrim(item->>'acceptance')),0)=0 OR coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,5}$') THEN RAISE EXCEPTION 'WORKFLOW_REQUEST_INCOMPLETE';END IF;
 END LOOP;
END $$;
CREATE FUNCTION dqa_business.prepare_project_request(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.project_request_operations;fp text;
BEGIN
 PERFORM dqa_private.validate_project_request(p_tenant,p_command);
 IF p_operation IS NULL THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project-request:'||p_tenant||':'||p_operation,0));fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.project_request_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'PROJECT_OPERATION_CONFLICT';END IF;
  IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
  IF op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PROJECT_OPERATION_EXPIRED';END IF;
  RETURN jsonb_build_object('state',op.state,'id',op.id);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('project-rate:'||p_tenant||':'||auth.uid(),0));
 IF (SELECT count(*) FROM dqa_private.project_request_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=2 THEN RAISE EXCEPTION 'PROJECT_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.project_request_operations(tenant_id,id,actor_id,fingerprint,command) VALUES(p_tenant,p_operation,auth.uid(),fp,jsonb_build_object('items',p_command->'items'));
 RETURN jsonb_build_object('state','PLANNED','id',p_operation);
END $$;
CREATE FUNCTION dqa_business.execute_project_request(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.project_request_operations;item jsonb;row_data jsonb;created jsonb;command jsonb;child uuid;child_op uuid;n integer:=0;saved_result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM dqa_private.validate_project_request(p_tenant,p_command);
 SELECT * INTO op FROM dqa_private.project_request_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'PROJECT_OPERATION_CONFLICT';END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true);END IF;
 IF op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PROJECT_OPERATION_EXPIRED';END IF;
 UPDATE dqa_private.project_request_operations SET state='BUILDING',transaction_id=txid_current() WHERE tenant_id=p_tenant AND id=p_operation;
 INSERT INTO dqa_business.request_projects VALUES(p_tenant,p_operation,dqa_private.member_id(p_tenant),p_command->>'name',jsonb_array_length(p_command->'items'),clock_timestamp());
 FOR item IN SELECT * FROM jsonb_array_elements(p_command->'items') LOOP
  n:=n+1;child:=dqa_private.project_child_id(p_operation,n);row_data:=dqa_private.project_child_data(p_command,item);
  created:=dqa_business.create_classified_request_draft(p_tenant,child,row_data,p_command->>'execution_kind');
  IF (p_command->>'submit')::boolean THEN
   child_op:=dqa_private.project_child_id(p_operation,n,true);command:=jsonb_build_object('request_id',child,'expected_revision',(created->>'revision')::bigint,'action','SUBMIT','signature_data',p_command->'common'->>'draft_signature_data','comment','專案分項送簽');
   PERFORM dqa_business.prepare_request_operation(p_tenant,child_op,command);PERFORM dqa_business.execute_request_operation(p_tenant,child_op,command);
  END IF;
 END LOOP;
 saved_result:=jsonb_build_object('state','SAVED','id',p_operation,'project_id',p_operation,'project_code','PRJ-'||upper(replace(p_operation::text,'-','')),'count',n,'submitted',(p_command->>'submit')::boolean,'request_ids',(SELECT jsonb_agg(id ORDER BY project_item_index) FROM dqa_business.requests WHERE tenant_id=p_tenant AND project_group_id=p_operation));
 -- Do not retain the batch's signature payload after the atomic result is saved.
 UPDATE dqa_private.project_request_operations SET state='SAVED',result=saved_result,command=jsonb_build_object('item_count',n),transaction_id=NULL WHERE tenant_id=p_tenant AND id=p_operation;
 RETURN saved_result;
END $$;
CREATE FUNCTION dqa_business.project_request_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.project_request_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED';END IF;
 SELECT * INTO op FROM dqa_private.project_request_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND','id',p_operation);END IF;
 RETURN CASE WHEN op.state='SAVED' THEN op.result ELSE jsonb_build_object('state',CASE WHEN op.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE op.state END,'id',op.id) END;
END $$;
-- Batch exception is valid only for server-created child IDs in this transaction.
DO $$ DECLARE body text:=pg_get_functiondef('dqa_business.prepare_request_operation(uuid,uuid,jsonb)'::regprocedure);needle text:='>=100 THEN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''WORKFLOW_RATE_LIMITED''';BEGIN
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'PROJECT_WORKFLOW_BASELINE_CHANGED';END IF;
 EXECUTE replace(body,needle,'>=100 AND NOT dqa_private.project_batch_allowed(p_tenant,p_operation,(p_command->>''request_id'')::uuid) THEN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''WORKFLOW_RATE_LIMITED''');END $$;
-- Preserve every existing snapshot field, including recycle and execution-kind guards.
DO $$ DECLARE body text:=pg_get_functiondef('dqa_business.original_ui_snapshot(uuid)'::regprocedure);needle text:='execution_kind,id,tenant_id,legacy_id,owner_member_id';BEGIN
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'PROJECT_SNAPSHOT_BASELINE_CHANGED';END IF;
 EXECUTE replace(body,needle,'project_group_id,project_item_index,execution_kind,id,tenant_id,legacy_id,owner_member_id');END $$;
-- Expose only the caller's assigned, verified supervisor email, not a directory.
CREATE OR REPLACE FUNCTION dqa_business.request_supervisor(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'display_name',s.display_name,'login_email',coalesce(nullif(btrim(s.login_email),''),u.email),'enabled',true,'has_request_manager',true)),'[]') FROM dqa_business.memberships m JOIN dqa_business.memberships s ON s.tenant_id=m.tenant_id AND s.id=m.supervisor_member_id JOIN dqa_business.roles r ON r.tenant_id=s.tenant_id AND r.id=s.role_id JOIN auth.users u ON u.id=s.auth_user_id AND u.email_confirmed_at IS NOT NULL WHERE m.tenant_id=p_tenant AND m.auth_user_id=auth.uid() AND m.enabled AND m.deleted_at IS NULL AND s.deleted_at IS NULL AND dqa_private.can(p_tenant) AND s.enabled AND r.enabled AND 'request'=ANY(r.systems) AND (r.is_tenant_admin OR 'requests.review_manager'=ANY(r.permissions))
$$;
REVOKE ALL ON FUNCTION dqa_private.project_child_id(uuid,integer,boolean),dqa_private.project_batch_allowed(uuid,uuid,uuid),dqa_private.project_request_guard(),dqa_private.project_child_data(jsonb,jsonb),dqa_private.validate_project_request(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION dqa_business.prepare_project_request(uuid,uuid,jsonb),dqa_business.execute_project_request(uuid,uuid,jsonb),dqa_business.project_request_result(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_project_request(uuid,uuid,jsonb),dqa_business.execute_project_request(uuid,uuid,jsonb),dqa_business.project_request_result(uuid,uuid) TO authenticated;
