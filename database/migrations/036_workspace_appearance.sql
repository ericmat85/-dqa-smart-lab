-- Shared UI colors only. Defaults are returned without inserting settings.
-- Existing tenant data, business state, permissions and workflow rules are untouched.
CREATE FUNCTION dqa_business.workspace_appearance(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings;
BEGIN
 IF dqa_private.member_id(p_tenant) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_APPEARANCE_ACCESS_DENIED'; END IF;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='workspace_appearance_v1';
 RETURN jsonb_build_object('configuration',coalesce(item.configuration,jsonb_build_object('tabBarColor','#142D48','tableHeaderColor','#D2DCE8')),'revision',coalesce(item.revision,0),'updated_at',item.updated_at,'can_manage',dqa_private.is_admin(p_tenant),'source','DATABASE','schema_version',1);
END $$;
CREATE FUNCTION dqa_business.save_workspace_appearance(p_tenant uuid,p_configuration jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings; normalized jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_APPEARANCE_ACCESS_DENIED'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_configuration) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_APPEARANCE_FIELDS_INVALID'; END IF;
 IF NOT p_configuration ?& ARRAY['tabBarColor','tableHeaderColor'] OR EXISTS(SELECT 1 FROM jsonb_each(p_configuration) e WHERE e.key NOT IN('tabBarColor','tableHeaderColor') OR jsonb_typeof(e.value)<>'string' OR (e.value#>>'{}')!~'^#[A-Fa-f0-9]{6}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_APPEARANCE_FIELDS_INVALID'; END IF;
 normalized:=jsonb_build_object('tabBarColor',upper(p_configuration->>'tabBarColor'),'tableHeaderColor',upper(p_configuration->>'tableHeaderColor'));
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-appearance:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_APPEARANCE_ACCESS_DENIED'; END IF;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='workspace_appearance_v1' FOR UPDATE;
 IF coalesce(item.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF item.id IS NULL THEN INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES(p_tenant,'workspace_appearance_v1',normalized);
 ELSIF item.configuration IS DISTINCT FROM normalized THEN UPDATE dqa_business.settings SET configuration=normalized WHERE id=item.id AND tenant_id=p_tenant; END IF;
 RETURN dqa_business.workspace_appearance(p_tenant);
END $$;
REVOKE ALL ON FUNCTION dqa_business.workspace_appearance(uuid),dqa_business.save_workspace_appearance(uuid,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.workspace_appearance(uuid),dqa_business.save_workspace_appearance(uuid,jsonb,bigint) TO authenticated;
