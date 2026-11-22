-- Workspace directory commands only. Workflow and case gates remain unchanged.
ALTER TABLE dqa_business.roles ADD COLUMN systems text[] NOT NULL DEFAULT ARRAY['lms','lab','request'] CHECK(systems <@ ARRAY['lms','lab','request']::text[]);
ALTER TABLE dqa_business.roles ADD COLUMN pages text[] NOT NULL DEFAULT ARRAY['dashboard','requests','schedule','equipment','maintenance','reports','archive','settings'] CHECK(pages <@ ARRAY['dashboard','requests','schedule','equipment','maintenance','reports','archive','settings']::text[] AND 'dashboard'=ANY(pages));
ALTER TABLE dqa_business.roles ADD COLUMN review_level integer NOT NULL DEFAULT 0 CHECK(review_level BETWEEN 0 AND 3);
ALTER TABLE dqa_business.memberships ADD COLUMN login_email text;
ALTER TABLE dqa_business.memberships ADD COLUMN supervisor_member_id uuid;
ALTER TABLE dqa_business.memberships ADD CONSTRAINT membership_supervisor_fk FOREIGN KEY(tenant_id,supervisor_member_id) REFERENCES dqa_business.memberships(tenant_id,id);
ALTER TABLE dqa_business.memberships ADD CONSTRAINT membership_no_self_supervisor CHECK(supervisor_member_id IS DISTINCT FROM id);
ALTER TABLE dqa_business.memberships ADD CONSTRAINT membership_email_format CHECK(login_email IS NULL OR (length(login_email)<=254 AND login_email=lower(btrim(login_email)) AND login_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
UPDATE dqa_business.memberships m SET login_email=lower(u.email) FROM auth.users u WHERE u.id=m.auth_user_id AND u.email IS NOT NULL;
CREATE UNIQUE INDEX memberships_email_per_tenant ON dqa_business.memberships(tenant_id,login_email) WHERE login_email IS NOT NULL;
CREATE INDEX membership_supervisor_idx ON dqa_business.memberships(tenant_id,supervisor_member_id);
CREATE TABLE dqa_private.access_operations (
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,
 fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id)
);
ALTER TABLE dqa_private.access_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.access_operations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION dqa_business.access_directory(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE members jsonb; roles jsonb; departments jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'email',m.login_email,'role_id',m.role_id,'department',coalesce(d.name,''),'department_id',m.department_id,'supervisor_id',m.supervisor_member_id,'enabled',m.enabled,'revision',m.revision,'activation',CASE WHEN m.auth_user_id IS NOT NULL AND u.email_confirmed_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING' END) ORDER BY m.created_at,m.id),'[]') INTO members
 FROM dqa_business.memberships m LEFT JOIN auth.users u ON u.id=m.auth_user_id LEFT JOIN dqa_business.departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id WHERE m.tenant_id=p_tenant;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.name),'[]') INTO roles FROM (SELECT id,code,name,enabled,is_tenant_admin,permissions,systems,pages,review_level,revision FROM dqa_business.roles WHERE tenant_id=p_tenant) r;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.name),'[]') INTO departments FROM (SELECT id,name FROM dqa_business.departments WHERE tenant_id=p_tenant) d;
 IF jsonb_array_length(members)>2000 OR jsonb_array_length(roles)>200 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='ACCESS_DIRECTORY_LIMIT'; END IF;
 RETURN jsonb_build_object('members',members,'roles',roles,'departments',departments,'source','DATABASE');
END $$;

CREATE FUNCTION dqa_business.access_operation_result(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED'; END IF;
 SELECT o.result INTO result FROM dqa_private.access_operations o WHERE o.tenant_id=p_tenant AND o.id=p_operation AND o.actor_id=auth.uid();
 RETURN coalesce(result,jsonb_build_object('operation_id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND'));
END $$;

CREATE FUNCTION dqa_business.save_workspace_access(p_tenant uuid,p_operation uuid,p_kind text,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text; existing dqa_private.access_operations; m dqa_business.memberships; r dqa_business.roles; target_role dqa_business.roles; result jsonb; actor uuid; target_email text; auth_id uuid; dep uuid; supervisor uuid; admin_survives boolean;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 -- Check again after the lock: another administrator may have revoked this caller.
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED'; END IF;
 actor:=dqa_private.member_id(p_tenant);
 IF p_kind NOT IN ('member','role') OR p_kind IS NULL OR p_operation IS NULL OR p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>16000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_id,p_expected_revision,p_data)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF existing.actor_id<>auth.uid() OR existing.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_OPERATION_CONFLICT'; END IF;
  RETURN existing.result||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(*) FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ACCESS_RATE_LIMITED'; END IF;
 IF p_kind='member' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('name','email','role_id','department','supervisor_id','enabled')) OR NOT (p_data ?& ARRAY['name','email','role_id','department','supervisor_id','enabled']) OR jsonb_typeof(p_data->'name')<>'string' OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_data->'email')<>'string' OR jsonb_typeof(p_data->'department')<>'string' OR length(p_data->>'department')>100 OR jsonb_typeof(p_data->'enabled')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
  target_email:=lower(btrim(p_data->>'email'));
  IF length(target_email)>254 OR target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
  SELECT * INTO target_role FROM dqa_business.roles WHERE tenant_id=p_tenant AND id=(p_data->>'role_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_ROLE_UNAVAILABLE'; END IF;
  SELECT * INTO m FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;
  IF (p_expected_revision=0 AND FOUND) OR (p_expected_revision>0 AND (NOT FOUND OR m.revision<>p_expected_revision)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.memberships WHERE id=p_id AND tenant_id<>p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_MEMBER_UNAVAILABLE'; END IF;
  IF m.id=actor AND (NOT (p_data->>'enabled')::boolean OR NOT target_role.is_tenant_admin) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SELF_LOCKOUT'; END IF;
  IF m.auth_user_id IS NOT NULL AND m.login_email IS DISTINCT FROM target_email THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_EMAIL_IMMUTABLE'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.memberships x WHERE x.tenant_id=p_tenant AND x.login_email=target_email AND x.id<>p_id) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ACCESS_EMAIL_EXISTS'; END IF;
  IF p_data->>'supervisor_id' IS NOT NULL THEN
   supervisor:=(p_data->>'supervisor_id')::uuid;
   IF supervisor=p_id OR NOT EXISTS(SELECT 1 FROM dqa_business.memberships s JOIN dqa_business.roles sr ON sr.id=s.role_id AND sr.tenant_id=s.tenant_id WHERE s.tenant_id=p_tenant AND s.id=supervisor AND s.enabled AND sr.enabled) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SUPERVISOR_INVALID'; END IF;
  END IF;
  IF NOT (p_data->>'enabled')::boolean AND EXISTS(SELECT 1 FROM dqa_business.memberships WHERE tenant_id=p_tenant AND supervisor_member_id=p_id AND enabled) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SUPERVISOR_IN_USE'; END IF;
  IF btrim(p_data->>'department')<>'' THEN
   SELECT id INTO dep FROM dqa_business.departments WHERE tenant_id=p_tenant AND name=btrim(p_data->>'department') ORDER BY id LIMIT 1;
   IF dep IS NULL THEN INSERT INTO dqa_business.departments(tenant_id,legacy_id,name) VALUES(p_tenant,'DEPT-'||replace(gen_random_uuid()::text,'-',''),btrim(p_data->>'department')) RETURNING id INTO dep; END IF;
  END IF;
  SELECT u.id INTO auth_id FROM auth.users u WHERE lower(u.email)=target_email AND u.email_confirmed_at IS NOT NULL ORDER BY u.created_at,u.id LIMIT 1;
  IF p_expected_revision=0 THEN
   INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,login_email,role_id,department_id,supervisor_member_id,enabled) VALUES(p_id,p_tenant,auth_id,'MEMBER-'||replace(p_id::text,'-',''),btrim(p_data->>'name'),target_email,target_role.id,dep,supervisor,(p_data->>'enabled')::boolean) RETURNING * INTO m;
  ELSE
   IF m.role_id<>target_role.id OR m.enabled IS DISTINCT FROM (p_data->>'enabled')::boolean THEN UPDATE dqa_private.browser_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=p_tenant AND auth_user_id=m.auth_user_id; END IF;
   UPDATE dqa_business.memberships SET display_name=btrim(p_data->>'name'),login_email=target_email,role_id=target_role.id,department_id=dep,supervisor_member_id=supervisor,enabled=(p_data->>'enabled')::boolean WHERE tenant_id=p_tenant AND id=p_id RETURNING * INTO m;
  END IF;
  result:=jsonb_build_object('id',m.id,'revision',m.revision,'kind','member','operation_id',p_operation,'state','SAVED');
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('name','enabled','is_tenant_admin','permissions','systems','pages','review_level')) OR NOT (p_data ?& ARRAY['name','enabled','is_tenant_admin','permissions','systems','pages','review_level']) OR jsonb_typeof(p_data->'name')<>'string' OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_data->'enabled')<>'boolean' OR jsonb_typeof(p_data->'is_tenant_admin')<>'boolean' OR jsonb_typeof(p_data->'permissions')<>'array' OR jsonb_typeof(p_data->'systems')<>'array' OR jsonb_typeof(p_data->'pages')<>'array' OR (p_data->>'review_level') !~ '^[0-3]$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'permissions') v WHERE jsonb_typeof(v)<>'string') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'systems') v WHERE jsonb_typeof(v)<>'string') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'pages') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
  SELECT * INTO r FROM dqa_business.roles WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;
  IF (p_expected_revision=0 AND FOUND) OR (p_expected_revision>0 AND (NOT FOUND OR r.revision<>p_expected_revision)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.roles WHERE id=p_id AND tenant_id<>p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ROLE_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.roles WHERE tenant_id=p_tenant AND lower(name)=lower(btrim(p_data->>'name')) AND id<>p_id) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ACCESS_ROLE_EXISTS'; END IF;
  IF r.id IS NOT NULL AND EXISTS(SELECT 1 FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=actor AND role_id=r.id) AND (NOT (p_data->>'enabled')::boolean OR NOT (p_data->>'is_tenant_admin')::boolean OR NOT (p_data->'systems' ? 'lms') OR NOT (p_data->'pages' ? 'settings')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SELF_LOCKOUT'; END IF;
  IF (p_data->>'is_tenant_admin')::boolean AND (NOT (p_data->'systems' ? 'lms') OR NOT (p_data->'pages' ? 'settings')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID'; END IF;
  IF p_expected_revision=0 THEN
   INSERT INTO dqa_business.roles(id,tenant_id,code,name,enabled,is_tenant_admin,permissions,systems,pages,review_level) VALUES(p_id,p_tenant,'role-'||replace(p_id::text,'-',''),btrim(p_data->>'name'),(p_data->>'enabled')::boolean,(p_data->>'is_tenant_admin')::boolean,ARRAY(SELECT jsonb_array_elements_text(p_data->'permissions')),ARRAY(SELECT jsonb_array_elements_text(p_data->'systems')),ARRAY(SELECT jsonb_array_elements_text(p_data->'pages')),(p_data->>'review_level')::integer) RETURNING * INTO r;
  ELSE
   IF r.enabled IS DISTINCT FROM (p_data->>'enabled')::boolean OR r.is_tenant_admin IS DISTINCT FROM (p_data->>'is_tenant_admin')::boolean OR to_jsonb(r.permissions) IS DISTINCT FROM p_data->'permissions' OR to_jsonb(r.systems) IS DISTINCT FROM p_data->'systems' OR to_jsonb(r.pages) IS DISTINCT FROM p_data->'pages' OR r.review_level IS DISTINCT FROM (p_data->>'review_level')::integer THEN
    UPDATE dqa_private.browser_sessions bs SET revoked_at=coalesce(bs.revoked_at,clock_timestamp()) FROM dqa_business.memberships assigned_member WHERE bs.tenant_id=p_tenant AND assigned_member.tenant_id=p_tenant AND assigned_member.role_id=r.id AND bs.auth_user_id=assigned_member.auth_user_id;
   END IF;
   UPDATE dqa_business.roles SET name=btrim(p_data->>'name'),enabled=(p_data->>'enabled')::boolean,is_tenant_admin=(p_data->>'is_tenant_admin')::boolean,permissions=ARRAY(SELECT jsonb_array_elements_text(p_data->'permissions')),systems=ARRAY(SELECT jsonb_array_elements_text(p_data->'systems')),pages=ARRAY(SELECT jsonb_array_elements_text(p_data->'pages')),review_level=(p_data->>'review_level')::integer WHERE tenant_id=p_tenant AND id=p_id RETURNING * INTO r;
  END IF;
  result:=jsonb_build_object('id',r.id,'revision',r.revision,'kind','role','operation_id',p_operation,'state','SAVED');
 END IF;
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships active_member JOIN dqa_business.roles active_role ON active_role.tenant_id=active_member.tenant_id AND active_role.id=active_member.role_id JOIN auth.users auth_member ON auth_member.id=active_member.auth_user_id WHERE active_member.tenant_id=p_tenant AND active_member.enabled AND active_role.enabled AND active_role.is_tenant_admin AND auth_member.email_confirmed_at IS NOT NULL AND 'lms'=ANY(active_role.systems) AND 'settings'=ANY(active_role.pages)) INTO admin_survives;
 IF NOT admin_survives THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_LAST_ADMIN'; END IF;
 INSERT INTO dqa_private.access_operations(tenant_id,id,actor_id,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result;
EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';
END $$;

CREATE FUNCTION dqa_business.claim_pending_memberships() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE email text; n integer;
BEGIN
 SELECT lower(u.email) INTO email FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL THEN RETURN 0; END IF;
 -- Pending workspace access is granted by an administrator, then claimed by a verified email owner.
 PERFORM pg_advisory_xact_lock(hashtextextended('claim-member:'||auth.uid(),0));
 UPDATE dqa_business.memberships m SET auth_user_id=auth.uid() FROM dqa_business.roles r,dqa_business.tenants t WHERE m.auth_user_id IS NULL AND m.login_email=email AND m.enabled AND r.id=m.role_id AND r.tenant_id=m.tenant_id AND r.enabled AND t.id=m.tenant_id AND t.enabled;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.connection_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('user_id',auth.uid(),'memberships',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'display_name',m.display_name,'tenant_name',t.name,'role_name',r.name,'permissions',r.permissions,'is_admin',r.is_tenant_admin,'systems',r.systems,'pages',r.pages,'review_level',r.review_level) ORDER BY t.code),'[]'))
 FROM dqa_business.memberships m JOIN dqa_business.tenants t ON t.id=m.tenant_id JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.auth_user_id=auth.uid() AND dqa_private.can(m.tenant_id)
$$;
REVOKE ALL ON FUNCTION dqa_business.access_directory(uuid),dqa_business.access_operation_result(uuid,uuid),dqa_business.save_workspace_access(uuid,uuid,text,uuid,bigint,jsonb),dqa_business.claim_pending_memberships() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.access_directory(uuid),dqa_business.access_operation_result(uuid,uuid),dqa_business.save_workspace_access(uuid,uuid,text,uuid,bigint,jsonb),dqa_business.claim_pending_memberships() TO authenticated;

CREATE OR REPLACE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}'; cfg jsonb; historical jsonb; item record;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 FOR definition IN SELECT * FROM (VALUES
('requests','requests','id,tenant_id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details'),
('trials','trial_definitions','id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision'),
('equipment','equipment','id,legacy_id,name,category,model,serial_number,site_id,owner_member_id,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision'),
('materials','materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,site_id,owner_member_id,status,revision'),
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
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.original_ui_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.original_ui_snapshot(uuid) TO authenticated;
-- Honor the explicit cross-request report-read grant without opening request records.
ALTER POLICY report_read ON dqa_business.reports USING(dqa_private.can(tenant_id,'reports.read_all') OR dqa_private.can_read_request(tenant_id,request_id));
ALTER POLICY report_version_read ON dqa_business.report_versions USING(dqa_private.can(tenant_id,'reports.read_all') OR dqa_private.can_read_request(tenant_id,request_id));
CREATE OR REPLACE FUNCTION dqa_private.can_read_artifact(p_tenant uuid,p_artifact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.artifacts a WHERE a.tenant_id=p_tenant AND a.id=p_artifact
 AND dqa_private.can(p_tenant) AND dqa_private.case_row_active(p_tenant,'artifacts',a.id) AND (a.request_id IS NULL OR dqa_private.case_row_active(p_tenant,'requests',a.request_id)) AND (
   (a.request_id IS NOT NULL AND dqa_private.can_read_request(p_tenant,a.request_id))
   OR (a.kind='REPORT' AND dqa_private.can(p_tenant,'reports.read_all'))
   OR (a.request_id IS NULL AND a.kind IN ('TEMPLATE','MANUAL','SPECIFICATION') AND dqa_private.can(p_tenant,'catalog.read'))
   OR (a.request_id IS NULL AND a.owner_member_id=dqa_private.member_id(p_tenant))
   OR dqa_private.is_admin(p_tenant)))
$$;
-- Serialize sign-in with access changes, so a concurrent disable cannot miss a new session.
CREATE OR REPLACE FUNCTION dqa_business.open_browser_session(p_tenant uuid,p_id uuid,p_nonce_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expires timestamptz:=clock_timestamp()+interval '8 hours';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES(p_id,auth.uid(),p_tenant,p_nonce_sha256,expires);
 RETURN jsonb_build_object('id',p_id,'expires_at',expires);
END $$;
