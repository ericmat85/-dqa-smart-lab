-- Authenticated browser clients are read-only in this database phase.
-- Directory helpers intentionally run as their schema owner; clients cannot edit membership/roles.
CREATE FUNCTION dqa_private.member_id(p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.id FROM dqa_business.memberships m
 JOIN dqa_business.tenants t ON t.id=m.tenant_id AND t.enabled
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id AND r.enabled
 WHERE m.tenant_id=p_tenant AND m.auth_user_id=(SELECT auth.uid()) AND m.enabled
$$;
CREATE FUNCTION dqa_private.can(p_tenant uuid,p_permission text DEFAULT '') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships m
 JOIN dqa_business.tenants t ON t.id=m.tenant_id AND t.enabled
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id AND r.enabled
 WHERE m.tenant_id=p_tenant AND m.auth_user_id=(SELECT auth.uid()) AND m.enabled
 AND (p_permission='' OR r.is_tenant_admin OR p_permission=ANY(r.permissions)))
$$;
CREATE FUNCTION dqa_private.is_admin(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships m
 JOIN dqa_business.tenants t ON t.id=m.tenant_id AND t.enabled
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id AND r.enabled AND r.is_tenant_admin
 WHERE m.tenant_id=p_tenant AND m.auth_user_id=(SELECT auth.uid()) AND m.enabled)
$$;
CREATE FUNCTION dqa_private.can_read_request(p_tenant uuid,p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant) AND EXISTS(SELECT 1 FROM dqa_business.requests r
 WHERE r.tenant_id=p_tenant AND r.id=p_request AND (
 dqa_private.can(p_tenant,'requests.read_all') OR r.owner_member_id=dqa_private.member_id(p_tenant)
 OR r.supervisor_member_id=dqa_private.member_id(p_tenant)))
$$;
-- The request lookup helper owns this table and bypasses its RLS to avoid recursive policies.
-- No client owns any table or has BYPASSRLS. It is never a tenant-admin wildcard.
CREATE FUNCTION dqa_private.can_read_artifact(p_tenant uuid,p_artifact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.artifacts a WHERE a.tenant_id=p_tenant AND a.id=p_artifact
 AND dqa_private.can(p_tenant) AND (
   (a.request_id IS NOT NULL AND dqa_private.can_read_request(p_tenant,a.request_id))
   OR (a.request_id IS NULL AND a.kind IN ('TEMPLATE','MANUAL','SPECIFICATION') AND dqa_private.can(p_tenant,'catalog.read'))
   OR (a.request_id IS NULL AND a.owner_member_id=dqa_private.member_id(p_tenant))
   OR dqa_private.is_admin(p_tenant)))
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA dqa_business FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dqa_business FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dqa_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA dqa_business,dqa_private TO authenticated;
GRANT EXECUTE ON FUNCTION dqa_private.member_id(uuid),dqa_private.can(uuid,text),dqa_private.is_admin(uuid),dqa_private.can_read_request(uuid,uuid),dqa_private.can_read_artifact(uuid,uuid) TO authenticated;

DO $rls$
DECLARE t text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='dqa_business' AND tablename<>'schema_migrations' LOOP
  EXECUTE format('ALTER TABLE dqa_business.%I ENABLE ROW LEVEL SECURITY',t);
  -- Tables read inside directory/visibility definer helpers keep owner bypass, preventing recursion.
  IF t NOT IN ('tenants','roles','memberships','requests','artifacts') THEN
   EXECUTE format('ALTER TABLE dqa_business.%I FORCE ROW LEVEL SECURITY',t);
  END IF;
  EXECUTE format('GRANT SELECT ON dqa_business.%I TO authenticated',t);
 END LOOP;
END $rls$;

CREATE POLICY tenant_read ON dqa_business.tenants FOR SELECT TO authenticated USING(dqa_private.can(id));
CREATE POLICY site_read ON dqa_business.sites FOR SELECT TO authenticated USING(dqa_private.can(tenant_id));
CREATE POLICY department_read ON dqa_business.departments FOR SELECT TO authenticated USING(dqa_private.can(tenant_id));
CREATE POLICY role_read ON dqa_business.roles FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'members.read'));
CREATE POLICY member_read ON dqa_business.memberships FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,'members.read') OR id=dqa_private.member_id(tenant_id));
CREATE POLICY catalog_read ON dqa_business.trial_definitions FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'catalog.read'));
CREATE POLICY equipment_read ON dqa_business.equipment FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'equipment.read'));
CREATE POLICY material_read ON dqa_business.materials FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'materials.read'));
CREATE POLICY request_read ON dqa_business.requests FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,id));
CREATE POLICY sample_read ON dqa_business.request_samples FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY schedule_read ON dqa_business.schedules FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,'schedules.read_all') OR dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY allocation_read ON dqa_business.schedule_equipment FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,'schedules.read_all') OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=schedule_equipment.tenant_id AND s.id=schedule_equipment.schedule_id));
CREATE POLICY borrow_read ON dqa_business.borrows FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,'requests.read_all') OR borrower_member_id=dqa_private.member_id(tenant_id));
CREATE POLICY inventory_audit_read ON dqa_business.material_transactions FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'materials.read'));
CREATE POLICY operation_read ON dqa_business.lab_operations FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY artifact_read ON dqa_business.artifacts FOR SELECT TO authenticated USING(dqa_private.can_read_artifact(tenant_id,id));
CREATE POLICY artifact_version_read ON dqa_business.artifact_versions FOR SELECT TO authenticated USING(dqa_private.can_read_artifact(tenant_id,artifact_id));
CREATE POLICY report_read ON dqa_business.reports FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY report_version_read ON dqa_business.report_versions FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY approval_read ON dqa_business.approval_events FOR SELECT TO authenticated USING(dqa_private.can_read_request(tenant_id,request_id));
CREATE POLICY qualification_read ON dqa_business.qualifications FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,'qualifications.read') OR member_id=dqa_private.member_id(tenant_id));
CREATE POLICY quality_read ON dqa_business.quality_records FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'quality.read'));
CREATE POLICY port_read ON dqa_business.equipment_ports FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'settings.read'));
CREATE POLICY port_point_read ON dqa_business.equipment_port_points FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'settings.read'));
CREATE POLICY setting_read ON dqa_business.settings FOR SELECT TO authenticated USING(dqa_private.is_admin(tenant_id));
CREATE POLICY audit_read ON dqa_business.audit_events FOR SELECT TO authenticated USING(dqa_private.can(tenant_id,'audit.read'));
CREATE POLICY import_batch_read ON dqa_business.import_batches FOR SELECT TO authenticated USING(dqa_private.is_admin(tenant_id));
CREATE POLICY import_row_read ON dqa_business.import_rows FOR SELECT TO authenticated USING(dqa_private.is_admin(tenant_id));

-- Index every tenant-scoped foreign key prefix; RLS and joins must not depend on browser filtering.
DO $indexes$
DECLARE c record; cols text;
BEGIN
 FOR c IN SELECT con.oid,con.conrelid,con.conkey,con.conname,t.relname FROM pg_constraint con
 JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='dqa_business' AND con.contype='f' LOOP
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY v.ordinality) INTO cols
  FROM unnest(c.conkey) WITH ORDINALITY v(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=v.attnum;
  EXECUTE format('CREATE INDEX %I ON %s (%s)', 'fk_'||c.relname||'_'||left(md5(c.conname),10),c.conrelid::regclass,cols);
 END LOOP;
END $indexes$;
CREATE INDEX requests_owner_idx ON dqa_business.requests(tenant_id,owner_member_id,status);
CREATE INDEX requests_supervisor_idx ON dqa_business.requests(tenant_id,supervisor_member_id,status);
CREATE INDEX schedules_window_idx ON dqa_business.schedules(tenant_id,starts_at,ends_at);
CREATE INDEX memberships_auth_idx ON dqa_business.memberships(auth_user_id,tenant_id) WHERE enabled;
CREATE INDEX audit_created_idx ON dqa_business.audit_events(tenant_id,created_at DESC,id DESC);
