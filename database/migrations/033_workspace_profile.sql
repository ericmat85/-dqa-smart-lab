-- Shared non-secret profile v1. Uses existing settings revision/audit triggers.
-- No tenant timezone, workflow, notification or report record is modified.
CREATE FUNCTION dqa_business.workspace_profile(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings; tenant_name text;
BEGIN
 IF dqa_private.member_id(p_tenant) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_PROFILE_ACCESS_DENIED'; END IF;
 SELECT name INTO tenant_name FROM dqa_business.tenants WHERE id=p_tenant;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='workspace_profile_v1';
 RETURN jsonb_build_object('configuration',coalesce(item.configuration,jsonb_build_object('workspaceName',tenant_name,'dateFormat','YYYY/MM/DD','timeZone','Asia/Taipei','labName','','address','','phone','','email','','website','','identifier','','qualityLead','','technicalLead','')),'revision',coalesce(item.revision,0),'updated_at',item.updated_at,'can_manage',dqa_private.is_admin(p_tenant),'source','DATABASE','schema_version',1);
END $$;
CREATE FUNCTION dqa_business.save_workspace_profile(p_tenant uuid,p_configuration jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings; keys text[]:=ARRAY['workspaceName','dateFormat','timeZone','labName','address','phone','email','website','identifier','qualityLead','technicalLead'];
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_PROFILE_ACCESS_DENIED'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_configuration) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_PROFILE_FIELDS_INVALID'; END IF;
 IF NOT p_configuration ?& keys OR EXISTS(SELECT 1 FROM jsonb_each(p_configuration) e WHERE NOT e.key=ANY(keys) OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>300 OR (e.value#>>'{}')~'[[:cntrl:]]')
 OR length(btrim(p_configuration->>'workspaceName'))=0
 OR p_configuration->>'dateFormat' NOT IN('YYYY/MM/DD','YYYY-MM-DD','DD/MM/YYYY')
 OR p_configuration->>'timeZone' NOT IN('Asia/Taipei','UTC','America/New_York','Europe/London','Asia/Tokyo')
 OR (p_configuration->>'email'<>'' AND p_configuration->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 OR (p_configuration->>'website'<>'' AND p_configuration->>'website'!~'^https://[^[:space:]/@]+(/[^[:space:]]*)?$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_PROFILE_FIELDS_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-profile:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_PROFILE_ACCESS_DENIED'; END IF;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='workspace_profile_v1' FOR UPDATE;
 IF coalesce(item.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF item.id IS NULL THEN INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES(p_tenant,'workspace_profile_v1',p_configuration);
 ELSIF item.configuration IS DISTINCT FROM p_configuration THEN UPDATE dqa_business.settings SET configuration=p_configuration WHERE id=item.id AND tenant_id=p_tenant; END IF;
 RETURN dqa_business.workspace_profile(p_tenant);
END $$;
REVOKE ALL ON FUNCTION dqa_business.workspace_profile(uuid),dqa_business.save_workspace_profile(uuid,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.workspace_profile(uuid),dqa_business.save_workspace_profile(uuid,jsonb,bigint) TO authenticated;
