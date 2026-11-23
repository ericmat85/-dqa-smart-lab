-- Apply after the three verified foundation migrations, in one transaction.
-- Creates server-session controls and owner-only draft commands. Workflow gates stay closed.
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft']::text[]);
CREATE TABLE dqa_private.browser_sessions (
 id uuid PRIMARY KEY, auth_user_id uuid NOT NULL REFERENCES auth.users(id),
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants(id), nonce_sha256 text NOT NULL CHECK(nonce_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)), revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON dqa_private.browser_sessions FROM PUBLIC,anon,authenticated;
CREATE INDEX browser_sessions_user_idx ON dqa_private.browser_sessions(auth_user_id,expires_at);

CREATE FUNCTION dqa_business.connection_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('user_id',auth.uid(),'memberships',coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'tenant_id',m.tenant_id,'display_name',m.display_name,'tenant_name',t.name,
  'role_name',r.name,'permissions',r.permissions,'is_admin',r.is_tenant_admin) ORDER BY t.code),'[]'::jsonb))
 FROM dqa_business.memberships m JOIN dqa_business.tenants t ON t.id=m.tenant_id
 JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
 WHERE m.auth_user_id=auth.uid() AND dqa_private.can(m.tenant_id)
$$;

CREATE FUNCTION dqa_business.open_browser_session(p_tenant uuid,p_id uuid,p_nonce_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expires timestamptz:=clock_timestamp()+interval '8 hours';
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at)
 VALUES(p_id,auth.uid(),p_tenant,p_nonce_sha256,expires);
 RETURN jsonb_build_object('id',p_id,'expires_at',expires);
END $$;
CREATE FUNCTION dqa_business.check_browser_session(p_id uuid,p_nonce_sha256 text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.tenant_id FROM dqa_private.browser_sessions s
 WHERE s.id=p_id AND s.auth_user_id=auth.uid() AND s.nonce_sha256=p_nonce_sha256
 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND dqa_private.can(s.tenant_id)
$$;
CREATE FUNCTION dqa_business.revoke_browser_session(p_id uuid,p_nonce_sha256 text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE dqa_private.browser_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp())
 WHERE id=p_id AND auth_user_id=auth.uid() AND nonce_sha256=p_nonce_sha256;
 RETURN FOUND;
END $$;

CREATE FUNCTION dqa_private.validate_draft(p_data jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>16000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('trial_id','product_code','customer_name','purpose','quantity','requested_date','sample_space_units','specification','acceptance')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE e.key IN ('product_code','customer_name','purpose','specification','acceptance','requested_date','trial_id') AND jsonb_typeof(e.value) NOT IN ('string','null')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE e.key IN ('quantity','sample_space_units') AND (jsonb_typeof(e.value) NOT IN ('number','null') OR e.value::text !~ '^(null|[1-9][0-9]{0,5})$')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF coalesce(length(p_data->>'product_code'),0)>120 OR coalesce(length(p_data->>'customer_name'),0)>200
 OR coalesce(length(p_data->>'purpose'),0)>2000 OR coalesce(length(p_data->>'specification'),0)>6000 OR coalesce(length(p_data->>'acceptance'),0)>2000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_TOO_LONG';
 END IF;
END $$;

CREATE FUNCTION dqa_business.create_request_draft(p_tenant uuid,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM dqa_private.validate_draft(p_data);
 -- Request id is an idempotency key. The first accepted payload wins; mismatched retries are rejected.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_id::text,0));
 IF EXISTS(SELECT 1 FROM dqa_business.requests WHERE id=p_id) THEN
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY';
 END IF;
 IF p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 INSERT INTO dqa_business.requests(id,tenant_id,legacy_id,owner_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,trial_snapshot)
 VALUES(p_id,p_tenant,'REQ-'||upper(replace(p_id::text,'-','')),member,trial.id,p_data->>'product_code',p_data->>'customer_name',coalesce(p_data->>'purpose',''),(p_data->>'quantity')::integer,(p_data->>'requested_date')::date,(p_data->>'sample_space_units')::integer,coalesce(p_data->>'specification',trial.specification,''),coalesce(p_data->>'acceptance',trial.acceptance,''),
 CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END)
 RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
CREATE FUNCTION dqa_business.update_request_draft(p_tenant uuid,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM dqa_private.validate_draft(p_data);
 SELECT * INTO result FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_id AND owner_member_id=member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF result.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 IF result.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF p_data ? 'trial_id' AND p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 UPDATE dqa_business.requests SET
  trial_id=CASE WHEN p_data ? 'trial_id' THEN trial.id ELSE result.trial_id END,
  product_code=CASE WHEN p_data ? 'product_code' THEN p_data->>'product_code' ELSE result.product_code END,
  customer_name=CASE WHEN p_data ? 'customer_name' THEN p_data->>'customer_name' ELSE result.customer_name END,
  purpose=CASE WHEN p_data ? 'purpose' THEN coalesce(p_data->>'purpose','') ELSE result.purpose END,
  quantity=CASE WHEN p_data ? 'quantity' THEN (p_data->>'quantity')::integer ELSE result.quantity END,
  requested_date=CASE WHEN p_data ? 'requested_date' THEN (p_data->>'requested_date')::date ELSE result.requested_date END,
  sample_space_units=CASE WHEN p_data ? 'sample_space_units' THEN (p_data->>'sample_space_units')::integer ELSE result.sample_space_units END,
  specification=CASE WHEN p_data ? 'specification' THEN coalesce(p_data->>'specification','') WHEN p_data ? 'trial_id' THEN coalesce(trial.specification,'') ELSE result.specification END,
  acceptance=CASE WHEN p_data ? 'acceptance' THEN coalesce(p_data->>'acceptance','') WHEN p_data ? 'trial_id' THEN coalesce(trial.acceptance,'') ELSE result.acceptance END,
  trial_snapshot=CASE WHEN p_data ? 'trial_id' THEN CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END ELSE result.trial_snapshot END
 WHERE tenant_id=p_tenant AND id=p_id AND revision=p_expected_revision RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;

REVOKE ALL ON FUNCTION dqa_private.validate_draft(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dqa_business.connection_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.connection_context() TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.open_browser_session(uuid,uuid,text),dqa_business.check_browser_session(uuid,text),dqa_business.revoke_browser_session(uuid,text),dqa_business.create_request_draft(uuid,uuid,jsonb),dqa_business.update_request_draft(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.open_browser_session(uuid,uuid,text),dqa_business.check_browser_session(uuid,text),dqa_business.revoke_browser_session(uuid,text),dqa_business.create_request_draft(uuid,uuid,jsonb),dqa_business.update_request_draft(uuid,uuid,bigint,jsonb) TO authenticated;
