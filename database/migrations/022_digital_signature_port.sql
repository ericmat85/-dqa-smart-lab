-- Public endpoint references only; no keys, credentials, network calls or signing here.
CREATE FUNCTION dqa_business.digital_signature_port_settings(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_PORT_ADMIN_REQUIRED';END IF;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='digital_signature_port';
 RETURN jsonb_build_object('scope_member_id',dqa_private.member_id(p_tenant),'config',item.configuration,'revision',coalesce(item.revision,0),'configured',item.id IS NOT NULL,'can_manage',true,'digital_ready',false,'signing_enabled',false,'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.save_digital_signature_port(p_tenant uuid,p_member uuid,p_config jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings;key_count integer;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_PORT_ADMIN_REQUIRED';END IF;
 IF dqa_private.member_id(p_tenant) IS DISTINCT FROM p_member THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_PORT_ADMIN_REQUIRED';END IF;
 IF p_config IS NULL OR jsonb_typeof(p_config)<>'object' OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_PORT_FIELDS_INVALID';END IF;
 SELECT count(*) INTO key_count FROM jsonb_object_keys(p_config);
 IF key_count<>9 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE k<>ALL(ARRAY['name','connection_type','base_url','auth_mode','credential_ref','certificate_ref','timeout_seconds','timestamp_mode','allow_checks'])) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_PORT_FIELDS_INVALID';END IF;
 IF jsonb_typeof(p_config->'name')<>'string' OR length(btrim(p_config->>'name')) NOT BETWEEN 1 AND 80 OR (p_config->>'name')~'[[:cntrl:]]'
 OR (p_config->>'connection_type') NOT IN('HTTPS_GATEWAY','INTRANET_GATEWAY') OR jsonb_typeof(p_config->'connection_type')<>'string'
 OR jsonb_typeof(p_config->'base_url')<>'string' OR length(p_config->>'base_url')>500 OR (p_config->>'base_url')!~'^https://[A-Za-z0-9.\[\]:-]+(/[A-Za-z0-9/_-]*)?$'
 OR jsonb_typeof(p_config->'auth_mode')<>'string' OR (p_config->>'auth_mode') NOT IN('NONE','BEARER_TOKEN')
 OR jsonb_typeof(p_config->'credential_ref')<>'string' OR ((p_config->>'auth_mode')='BEARER_TOKEN' AND (p_config->>'credential_ref')!~'^DQA_SIGNATURE_PORT_[A-Z0-9_]{1,48}$') OR ((p_config->>'auth_mode')='NONE' AND (p_config->>'credential_ref')<>'')
 OR jsonb_typeof(p_config->'certificate_ref')<>'string' OR length(p_config->>'certificate_ref')>100 OR ((p_config->>'certificate_ref')<>'' AND (p_config->>'certificate_ref')!~'^[A-Za-z0-9_.:-]+$')
 OR jsonb_typeof(p_config->'timeout_seconds')<>'number' OR (p_config->>'timeout_seconds')!~'^[0-9]{1,2}$'
 OR jsonb_typeof(p_config->'timestamp_mode')<>'string' OR (p_config->>'timestamp_mode') NOT IN('NONE','PROVIDER_MANAGED')
 OR jsonb_typeof(p_config->'allow_checks')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_PORT_FIELDS_INVALID';END IF;
 IF (p_config->>'timeout_seconds')::integer NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_PORT_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('digital-signature-port:'||p_tenant,0));
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='digital_signature_port' FOR UPDATE;
 IF coalesce(item.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF item.id IS NULL THEN INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES(p_tenant,'digital_signature_port',p_config);
 ELSIF item.configuration IS DISTINCT FROM p_config THEN UPDATE dqa_business.settings SET configuration=p_config WHERE id=item.id;END IF;
 RETURN dqa_business.digital_signature_port_settings(p_tenant);
END $$;
CREATE FUNCTION dqa_business.digital_signature_verification_targets(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_PORT_ADMIN_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT v.id,a.name,v.sha256,v.version,a.request_id,v.created_at FROM dqa_business.artifact_versions v JOIN dqa_business.artifacts a ON a.tenant_id=v.tenant_id AND a.id=v.artifact_id WHERE v.tenant_id=p_tenant AND a.kind='REPORT' AND v.mime_type='application/pdf' AND dqa_private.can_read_human_report(p_tenant,a.request_id) ORDER BY v.created_at DESC,v.id LIMIT 100)x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION dqa_business.digital_signature_port_settings(uuid),dqa_business.save_digital_signature_port(uuid,uuid,jsonb,bigint),dqa_business.digital_signature_verification_targets(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.digital_signature_port_settings(uuid),dqa_business.save_digital_signature_port(uuid,uuid,jsonb,bigint),dqa_business.digital_signature_verification_targets(uuid) TO authenticated;
