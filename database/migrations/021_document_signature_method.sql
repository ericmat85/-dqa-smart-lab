-- Signature method belongs to existing document/report settings; never stores keys.
CREATE FUNCTION dqa_business.signature_method_settings(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings;
BEGIN
 IF dqa_private.member_id(p_tenant) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_SETTINGS_ACCESS_DENIED';END IF;
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='signature_method';
 IF FOUND AND item.configuration IS DISTINCT FROM '{"method":"IMAGE"}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_CONFIGURATION_INVALID';END IF;
 RETURN jsonb_build_object('method','IMAGE','digital_ready',false,'digital_status','CERTIFICATE_AND_SIGNING_SERVICE_NOT_CONFIGURED','can_manage',dqa_private.is_admin(p_tenant),'revision',coalesce(item.revision,0),'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.save_signature_method_settings(p_tenant uuid,p_method text,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_business.settings;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SIGNATURE_SETTINGS_ACCESS_DENIED';END IF;
 IF p_method IS NULL OR p_method NOT IN('IMAGE','DIGITAL') OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_FIELDS_INVALID';END IF;
 IF p_method='DIGITAL' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SIGNATURE_DIGITAL_NOT_CONFIGURED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('signature-method:'||p_tenant,0));
 SELECT * INTO item FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='signature_method' FOR UPDATE;
 IF coalesce(item.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF item.id IS NULL THEN INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES(p_tenant,'signature_method','{"method":"IMAGE"}'::jsonb);END IF;
 RETURN dqa_business.signature_method_settings(p_tenant);
END $$;
REVOKE ALL ON FUNCTION dqa_business.signature_method_settings(uuid),dqa_business.save_signature_method_settings(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.signature_method_settings(uuid),dqa_business.save_signature_method_settings(uuid,text,bigint) TO authenticated;
