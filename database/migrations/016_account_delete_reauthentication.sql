-- Workspace account deletion retains historical foreign keys and global Auth users.
ALTER TABLE dqa_business.memberships ADD COLUMN deleted_at timestamptz;
ALTER TABLE dqa_business.memberships ADD COLUMN deleted_by uuid;
ALTER TABLE dqa_business.memberships ADD CONSTRAINT membership_deleted_disabled CHECK(deleted_at IS NULL OR NOT enabled);
ALTER TABLE dqa_business.memberships DROP CONSTRAINT memberships_tenant_id_auth_user_id_key;
CREATE UNIQUE INDEX memberships_live_auth_per_tenant ON dqa_business.memberships(tenant_id,auth_user_id) WHERE deleted_at IS NULL;
DROP INDEX dqa_business.memberships_email_per_tenant;
CREATE UNIQUE INDEX memberships_email_per_tenant ON dqa_business.memberships(tenant_id,login_email) WHERE login_email IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE dqa_private.account_delete_intents(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,member_id uuid NOT NULL,
 expected_revision bigint NOT NULL,state text NOT NULL CHECK(state IN ('AUTHENTICATING','FAILED','DELETED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
ALTER TABLE dqa_private.account_delete_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.account_delete_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION dqa_business.access_directory(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE members jsonb; roles jsonb; departments jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'email',m.login_email,'role_id',m.role_id,'department',coalesce(d.name,''),'department_id',m.department_id,'supervisor_id',m.supervisor_member_id,'enabled',m.enabled,'revision',m.revision,'activation',CASE WHEN m.auth_user_id IS NOT NULL AND u.email_confirmed_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING' END) ORDER BY m.created_at,m.id),'[]') INTO members
 FROM dqa_business.memberships m LEFT JOIN auth.users u ON u.id=m.auth_user_id LEFT JOIN dqa_business.departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id WHERE m.tenant_id=p_tenant AND m.deleted_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.name),'[]') INTO roles FROM (SELECT id,code,name,enabled,is_tenant_admin,permissions,systems,pages,review_level,revision FROM dqa_business.roles WHERE tenant_id=p_tenant) r;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.name),'[]') INTO departments FROM (SELECT id,name FROM dqa_business.departments WHERE tenant_id=p_tenant) d;
 IF jsonb_array_length(members)>2000 OR jsonb_array_length(roles)>200 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='ACCESS_DIRECTORY_LIMIT'; END IF;
 RETURN jsonb_build_object('members',members,'roles',roles,'departments',departments,'source','DATABASE');
END $$;

CREATE OR REPLACE FUNCTION dqa_business.save_workspace_access(p_tenant uuid,p_operation uuid,p_kind text,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
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
  IF m.deleted_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_DELETED';END IF;
  IF (p_expected_revision=0 AND FOUND) OR (p_expected_revision>0 AND (NOT FOUND OR m.revision<>p_expected_revision)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.memberships WHERE id=p_id AND tenant_id<>p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_MEMBER_UNAVAILABLE'; END IF;
  IF m.id=actor AND (NOT (p_data->>'enabled')::boolean OR NOT target_role.is_tenant_admin) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SELF_LOCKOUT'; END IF;
  IF m.auth_user_id IS NOT NULL AND m.login_email IS DISTINCT FROM target_email THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_EMAIL_IMMUTABLE'; END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.memberships x WHERE x.tenant_id=p_tenant AND x.login_email=target_email AND x.id<>p_id AND x.deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ACCESS_EMAIL_EXISTS'; END IF;
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

CREATE OR REPLACE FUNCTION dqa_business.claim_pending_memberships() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE email text; n integer;
BEGIN
 SELECT lower(u.email) INTO email FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL THEN RETURN 0; END IF;
 -- Pending workspace access is granted by an administrator, then claimed by a verified email owner.
 PERFORM pg_advisory_xact_lock(hashtextextended('claim-member:'||auth.uid(),0));
 UPDATE dqa_business.memberships m SET auth_user_id=auth.uid() FROM dqa_business.roles r,dqa_business.tenants t WHERE m.auth_user_id IS NULL AND m.login_email=email AND m.deleted_at IS NULL AND m.enabled AND r.id=m.role_id AND r.tenant_id=m.tenant_id AND r.enabled AND t.id=m.tenant_id AND t.enabled;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.connection_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('user_id',auth.uid(),'memberships',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'display_name',m.display_name,'tenant_name',t.name,'role_name',r.name,'permissions',r.permissions,'is_admin',r.is_tenant_admin,'systems',r.systems,'pages',r.pages,'review_level',r.review_level) ORDER BY t.code),'[]'))
 FROM dqa_business.memberships m JOIN dqa_business.tenants t ON t.id=m.tenant_id JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.auth_user_id=auth.uid() AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND t.enabled AND dqa_private.can(m.tenant_id)
$$;

CREATE FUNCTION dqa_private.account_delete_guard(p_tenant uuid,p_member uuid,p_revision bigint,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m dqa_business.memberships;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships a JOIN dqa_business.roles r ON r.id=a.role_id AND r.tenant_id=a.tenant_id JOIN auth.users u ON u.id=a.auth_user_id JOIN dqa_business.tenants t ON t.id=a.tenant_id WHERE a.tenant_id=p_tenant AND a.auth_user_id=p_actor AND a.enabled AND a.deleted_at IS NULL AND r.enabled AND r.is_tenant_admin AND 'lms'=ANY(r.systems) AND 'settings'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND t.enabled) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 SELECT * INTO m FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_member FOR UPDATE;
 IF NOT FOUND OR m.deleted_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_DELETED';END IF;
 IF m.auth_user_id=p_actor THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_DELETE_SELF_DENIED';END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships a JOIN dqa_business.roles r ON r.tenant_id=a.tenant_id AND r.id=a.role_id JOIN auth.users u ON u.id=a.auth_user_id WHERE a.tenant_id=p_tenant AND a.id<>p_member AND a.enabled AND a.deleted_at IS NULL AND r.enabled AND r.is_tenant_admin AND 'lms'=ANY(r.systems) AND 'settings'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_LAST_ADMIN';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.memberships WHERE tenant_id=p_tenant AND supervisor_member_id=p_member AND enabled AND deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_SUPERVISOR_IN_USE';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.requests WHERE tenant_id=p_tenant AND (owner_member_id=p_member OR supervisor_member_id=p_member) AND status NOT IN ('CLOSED','CANCELLED')) OR EXISTS(SELECT 1 FROM dqa_business.schedules WHERE tenant_id=p_tenant AND executor_member_id=p_member AND status NOT IN ('COMPLETED','CANCELLED')) OR EXISTS(SELECT 1 FROM dqa_business.borrows WHERE tenant_id=p_tenant AND borrower_member_id=p_member AND status NOT IN ('RETURNED','REJECTED','CANCELLED')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_WORK_IN_USE';END IF;
 IF EXISTS(SELECT 1 FROM dqa_business.equipment WHERE tenant_id=p_tenant AND owner_member_id=p_member AND operational_status<>'RETIRED') OR EXISTS(SELECT 1 FROM dqa_business.materials WHERE tenant_id=p_tenant AND owner_member_id=p_member AND status<>'RETIRED') OR EXISTS(SELECT 1 FROM dqa_business.quality_records WHERE tenant_id=p_tenant AND owner_member_id=p_member AND status<>'RESOLVED') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_RESOURCE_IN_USE';END IF;
END $$;
REVOKE ALL ON FUNCTION dqa_private.account_delete_guard(uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.prepare_account_deletion(p_tenant uuid,p_operation uuid,p_member uuid,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing dqa_private.access_operations;fp text;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_member IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('member_delete',p_member,p_expected_revision)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF existing.actor_id IS DISTINCT FROM auth.uid() OR existing.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
  RETURN existing.result||jsonb_build_object('reauth_granted',false);
 END IF;
 IF (SELECT count(*) FROM dqa_private.account_delete_intents WHERE actor_id=auth.uid() AND created_at>clock_timestamp()-interval '15 minutes')>=5 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ACCESS_RATE_LIMITED';END IF;
 PERFORM dqa_private.account_delete_guard(p_tenant,p_member,p_expected_revision,auth.uid());
 result:=jsonb_build_object('operation_id',p_operation,'kind','member_delete','id',p_member,'state','DELETION_PENDING');
 INSERT INTO dqa_private.account_delete_intents(tenant_id,id,actor_id,member_id,expected_revision,state) VALUES(p_tenant,p_operation,auth.uid(),p_member,p_expected_revision,'AUTHENTICATING');
 INSERT INTO dqa_private.access_operations(tenant_id,id,actor_id,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result||jsonb_build_object('reauth_granted',true);
END $$;

-- Only the BFF can complete a prepared deletion, after fresh Auth password verification.
CREATE FUNCTION dqa_business.complete_account_deletion(p_tenant uuid,p_operation uuid,p_actor uuid,p_outcome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE intent dqa_private.account_delete_intents;receipt jsonb;target_auth uuid;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('DELETE','PASSWORD_INVALID','REAUTH_UNAVAILABLE') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 SELECT * INTO intent FROM dqa_private.account_delete_intents WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
 SELECT o.result INTO receipt FROM dqa_private.access_operations o WHERE o.tenant_id=p_tenant AND o.id=p_operation AND o.actor_id=p_actor;
 IF intent.state<>'AUTHENTICATING' THEN RETURN receipt;END IF;
 IF intent.expires_at<=clock_timestamp() THEN
  receipt:=receipt||jsonb_build_object('state','CANCELLED_NO_WRITE','code','ACCESS_DELETE_EXPIRED');
  UPDATE dqa_private.account_delete_intents SET state='CANCELLED' WHERE tenant_id=p_tenant AND id=p_operation;
 ELSIF p_outcome<>'DELETE' THEN
  receipt:=receipt||jsonb_build_object('state','REJECTED_NO_WRITE','code',CASE WHEN p_outcome='PASSWORD_INVALID' THEN 'ADMIN_PASSWORD_INVALID' ELSE 'ADMIN_REAUTH_UNAVAILABLE' END);
  UPDATE dqa_private.account_delete_intents SET state='FAILED' WHERE tenant_id=p_tenant AND id=p_operation;
 ELSE
  PERFORM dqa_private.account_delete_guard(p_tenant,intent.member_id,intent.expected_revision,p_actor);
  SELECT auth_user_id INTO target_auth FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=intent.member_id;
  UPDATE dqa_business.memberships SET enabled=false,deleted_at=clock_timestamp(),deleted_by=p_actor WHERE tenant_id=p_tenant AND id=intent.member_id;
  UPDATE dqa_private.browser_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=p_tenant AND auth_user_id=target_auth;
  UPDATE dqa_private.account_invitations SET state='SKIPPED_DISABLED',completed_at=clock_timestamp() WHERE tenant_id=p_tenant AND member_id=intent.member_id AND state='QUEUED';
  UPDATE dqa_private.account_delete_intents SET state='DELETED' WHERE tenant_id=p_tenant AND id=p_operation;
  receipt:=receipt||jsonb_build_object('state','SAVED','deleted',true);
 END IF;
 UPDATE dqa_private.access_operations o SET result=receipt WHERE o.tenant_id=p_tenant AND o.id=p_operation;
 RETURN receipt;
END $$;

CREATE FUNCTION dqa_business.resolve_access_with_deletion(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE intent dqa_private.account_delete_intents;receipt jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 SELECT * INTO intent FROM dqa_private.account_delete_intents WHERE tenant_id=p_tenant AND id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RETURN dqa_business.resolve_access_operation(p_tenant,p_operation);END IF;
 IF intent.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
 SELECT o.result INTO receipt FROM dqa_private.access_operations o WHERE o.tenant_id=p_tenant AND o.id=p_operation;
 IF intent.state='AUTHENTICATING' THEN
  receipt:=receipt||jsonb_build_object('state','CANCELLED_NO_WRITE');
  UPDATE dqa_private.account_delete_intents SET state='CANCELLED' WHERE tenant_id=p_tenant AND id=p_operation;
  UPDATE dqa_private.access_operations o SET result=receipt WHERE o.tenant_id=p_tenant AND o.id=p_operation;
 END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_account_deletion(uuid,uuid,uuid,bigint),dqa_business.resolve_access_with_deletion(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_account_deletion(uuid,uuid,uuid,bigint),dqa_business.resolve_access_with_deletion(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.complete_account_deletion(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.complete_account_deletion(uuid,uuid,uuid,text) TO service_role;

-- New assignments take a key-share lock on the member. This serializes them
-- with deletion's FOR UPDATE lock and rejects a member deleted while waiting.
CREATE FUNCTION dqa_private.guard_deleted_member_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE field text;member uuid;found_member uuid;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)->field) IS NOT DISTINCT FROM (to_jsonb(OLD)->field) THEN CONTINUE;END IF;
  member:=(to_jsonb(NEW)->>field)::uuid;
  IF member IS NULL THEN CONTINUE;END IF;
  SELECT m.id INTO found_member FROM dqa_business.memberships m WHERE m.tenant_id=NEW.tenant_id AND m.id=member AND m.deleted_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_DELETED';END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION dqa_private.guard_deleted_member_reference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF owner_member_id,supervisor_member_id ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('owner_member_id','supervisor_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF executor_member_id ON dqa_business.schedules FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('executor_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF borrower_member_id ON dqa_business.borrows FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('borrower_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF owner_member_id ON dqa_business.equipment FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('owner_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF owner_member_id ON dqa_business.materials FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('owner_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF owner_member_id ON dqa_business.quality_records FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('owner_member_id');
CREATE TRIGGER prevent_deleted_member_assignment BEFORE INSERT OR UPDATE OF supervisor_member_id ON dqa_business.memberships FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_deleted_member_reference('supervisor_member_id');
