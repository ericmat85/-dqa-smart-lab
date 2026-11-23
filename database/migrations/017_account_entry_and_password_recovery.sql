-- Anonymous entry exposes only whether self-activation is available, never directory data.
CREATE FUNCTION dqa_business.public_account_entry_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('activation_available',NOT EXISTS(
  SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id JOIN dqa_business.tenants t ON t.id=m.tenant_id JOIN auth.users u ON u.id=m.auth_user_id
  WHERE m.enabled AND m.deleted_at IS NULL AND r.enabled AND r.is_tenant_admin AND t.enabled AND u.email_confirmed_at IS NOT NULL
 ))
$$;
REVOKE ALL ON FUNCTION dqa_business.public_account_entry_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.public_account_entry_status() TO service_role;

CREATE TABLE dqa_private.password_recovery_requests(
 id uuid PRIMARY KEY,email_hash text NOT NULL CHECK(email_hash~'^[a-f0-9]{64}$'),client_hash text NOT NULL CHECK(client_hash~'^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('SUPPRESSED','UNKNOWN','SENT','FAILED')),code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz
);
CREATE INDEX password_recovery_email_rate ON dqa_private.password_recovery_requests(email_hash,created_at DESC);
CREATE INDEX password_recovery_client_rate ON dqa_private.password_recovery_requests(client_hash,created_at DESC);
ALTER TABLE dqa_private.password_recovery_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.password_recovery_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.prepare_password_recovery(p_operation uuid,p_email text,p_client_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE normalized_email text;digest text;eligible boolean;
BEGIN
 normalized_email:=lower(btrim(p_email));
 IF p_operation IS NULL OR normalized_email IS NULL OR length(normalized_email)>254 OR normalized_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_client_hash IS NULL OR p_client_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RECOVERY_FIELDS_INVALID';END IF;
 digest:=encode(sha256(convert_to(normalized_email,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('password-recovery-budget',0));
 IF EXISTS(SELECT 1 FROM dqa_private.password_recovery_requests WHERE id=p_operation) THEN RETURN jsonb_build_object('dispatch',false);END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.password_recovery_requests WHERE email_hash=digest AND created_at>clock_timestamp()-interval '60 seconds') OR
 (SELECT count(*) FROM dqa_private.password_recovery_requests WHERE email_hash=digest AND created_at>clock_timestamp()-interval '1 hour')>=3 OR
 (SELECT count(*) FROM dqa_private.password_recovery_requests WHERE client_hash=p_client_hash AND created_at>clock_timestamp()-interval '1 hour')>=10 OR
 (SELECT count(*) FROM dqa_private.password_recovery_requests WHERE state<>'SUPPRESSED' AND created_at>clock_timestamp()-interval '1 hour')>=10 THEN RETURN jsonb_build_object('dispatch',false);END IF;
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id JOIN dqa_business.tenants t ON t.id=m.tenant_id JOIN auth.users u ON u.id=m.auth_user_id AND lower(u.email)=normalized_email AND u.email_confirmed_at IS NOT NULL WHERE m.login_email=normalized_email AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND t.enabled) INTO eligible;
 INSERT INTO dqa_private.password_recovery_requests(id,email_hash,client_hash,state) VALUES(p_operation,digest,p_client_hash,CASE WHEN eligible THEN 'UNKNOWN' ELSE 'SUPPRESSED' END);
 RETURN CASE WHEN eligible THEN jsonb_build_object('dispatch',true,'email',normalized_email,'operation_id',p_operation) ELSE jsonb_build_object('dispatch',false) END;
END $$;
CREATE FUNCTION dqa_business.finish_password_recovery(p_operation uuid,p_state text,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('SENT','FAILED','UNKNOWN') OR p_code IS NULL OR p_code NOT IN ('ACCEPTED','PROVIDER_REJECTED','DELIVERY_UNKNOWN') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RECOVERY_FIELDS_INVALID';END IF;
 UPDATE dqa_private.password_recovery_requests SET state=p_state,code=p_code,completed_at=clock_timestamp() WHERE id=p_operation AND state='UNKNOWN';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_password_recovery(uuid,text,text),dqa_business.finish_password_recovery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_password_recovery(uuid,text,text),dqa_business.finish_password_recovery(uuid,text,text) TO service_role;

-- Own-account scope only. Used before recovery password update; other browser
-- sessions are revoked while the current verified recovery session stays usable.
CREATE FUNCTION dqa_business.revoke_other_own_browser_sessions(p_keep uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM dqa_private.browser_sessions WHERE id=p_keep AND auth_user_id=auth.uid() AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHENTICATION_REQUIRED';END IF;
 UPDATE dqa_private.browser_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE auth_user_id=auth.uid() AND id<>p_keep AND revoked_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION dqa_business.revoke_other_own_browser_sessions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.revoke_other_own_browser_sessions(uuid) TO authenticated;
