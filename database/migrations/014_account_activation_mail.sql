-- Account saves and mail intent commit together. Only the server may claim/send mail.
-- No changes to existing access authorization or human-workflow gates.
CREATE TABLE dqa_private.account_mail_policy(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,sender_mode text NOT NULL DEFAULT 'CUSTOM_DOMAIN' CHECK(sender_mode IN ('CUSTOM_DOMAIN','TEST_ONLY')));
INSERT INTO dqa_private.account_mail_policy(singleton,enabled) VALUES(true,false);
CREATE TABLE dqa_private.account_invitations(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,
 member_id uuid NOT NULL,email text NOT NULL,requested_by uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('QUEUED','UNKNOWN','SENT','FAILED','SKIPPED_VERIFIED','SKIPPED_DISABLED','STALE')),
 code text,dispatch_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempted_at timestamptz,completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE INDEX account_invitations_member_idx ON dqa_private.account_invitations(tenant_id,member_id,created_at DESC);
ALTER TABLE dqa_private.account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.account_mail_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.account_invitations,dqa_private.account_mail_policy FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_private.invitation_summary(p_tenant uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operation_id',i.id,'state',CASE WHEN i.state='QUEUED' AND NOT p.enabled THEN 'NOT_CONFIGURED' ELSE i.state END,'code',i.code,'attempted_at',i.attempted_at)
 FROM dqa_private.account_invitations i CROSS JOIN dqa_private.account_mail_policy p WHERE i.tenant_id=p_tenant AND i.id=p_id
$$;
REVOKE ALL ON FUNCTION dqa_private.invitation_summary(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_private.queue_account_invitation(p_tenant uuid,p_member uuid,p_operation uuid,p_force boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m dqa_business.memberships;j dqa_private.account_invitations;
BEGIN
 SELECT * INTO m FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_member;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_UNAVAILABLE';END IF;
 IF NOT m.enabled THEN RETURN jsonb_build_object('state','SKIPPED_DISABLED');END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=m.login_email AND email_confirmed_at IS NOT NULL) THEN RETURN jsonb_build_object('state','SKIPPED_VERIFIED');END IF;
 SELECT * INTO j FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND member_id=p_member AND email=m.login_email AND state IN ('QUEUED','UNKNOWN','SENT') ORDER BY created_at DESC,id DESC LIMIT 1;
 IF FOUND AND (NOT p_force OR j.state IN ('QUEUED','UNKNOWN') OR j.attempted_at>clock_timestamp()-interval '60 seconds') THEN RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 IF (SELECT count(*) FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ACCESS_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.account_invitations(tenant_id,id,member_id,email,requested_by,state) VALUES(p_tenant,p_operation,p_member,m.login_email,auth.uid(),'QUEUED');
 RETURN dqa_private.invitation_summary(p_tenant,p_operation);
END $$;
REVOKE ALL ON FUNCTION dqa_private.queue_account_invitation(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.save_access_with_invitation(p_tenant uuid,p_operation uuid,p_kind text,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved_result jsonb;invitation jsonb;
BEGIN
 saved_result:=dqa_business.save_workspace_access(p_tenant,p_operation,p_kind,p_id,p_expected_revision,p_data);
 IF p_kind='member' AND NOT coalesce((saved_result->>'replayed')::boolean,false) THEN
  invitation:=dqa_private.queue_account_invitation(p_tenant,p_id,p_operation,false);
  saved_result:=saved_result||jsonb_build_object('invitation',invitation);
  UPDATE dqa_private.access_operations SET result=saved_result WHERE tenant_id=p_tenant AND id=p_operation;
 END IF;
 IF saved_result->'invitation'->>'operation_id' IS NOT NULL THEN saved_result:=saved_result||jsonb_build_object('invitation',dqa_private.invitation_summary(p_tenant,(saved_result->'invitation'->>'operation_id')::uuid));END IF;
 RETURN saved_result;
END $$;

CREATE FUNCTION dqa_business.request_account_invitation(p_tenant uuid,p_member uuid,p_expected_revision bigint,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;fp text;existing dqa_private.access_operations;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_member IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('invite',p_member,p_expected_revision)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF existing.actor_id IS DISTINCT FROM auth.uid() OR existing.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
  RETURN existing.result||jsonb_build_object('invitation',coalesce(dqa_private.invitation_summary(p_tenant,(existing.result->'invitation'->>'operation_id')::uuid),existing.result->'invitation'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_member AND revision=p_expected_revision) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 result:=jsonb_build_object('state','SAVED','kind','invitation','id',p_member,'operation_id',p_operation,'invitation',dqa_private.queue_account_invitation(p_tenant,p_member,p_operation,true));
 INSERT INTO dqa_private.access_operations(tenant_id,id,actor_id,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result;
END $$;

CREATE FUNCTION dqa_business.access_result_with_invitation(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 result:=dqa_business.access_operation_result(p_tenant,p_operation);
 IF result->'invitation'->>'operation_id' IS NOT NULL THEN RETURN result||jsonb_build_object('invitation',dqa_private.invitation_summary(p_tenant,(result->'invitation'->>'operation_id')::uuid));END IF;
 RETURN result;
END $$;
CREATE FUNCTION dqa_business.access_directory_with_invitations(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;members jsonb;
BEGIN
 result:=dqa_business.access_directory(p_tenant);
 SELECT coalesce(jsonb_agg(m.value||jsonb_build_object('invitation',dqa_private.invitation_summary(p_tenant,i.id)) ORDER BY m.ordinality),'[]') INTO members
 FROM jsonb_array_elements(result->'members') WITH ORDINALITY m(value,ordinality)
 LEFT JOIN LATERAL (SELECT id FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND member_id=(m.value->>'id')::uuid AND email=m.value->>'email' ORDER BY created_at DESC,id DESC LIMIT 1) i ON true;
 RETURN result||jsonb_build_object('members',members,'invitation_delivery_configured',(SELECT enabled FROM dqa_private.account_mail_policy WHERE singleton),'invitation_test_mode',(SELECT sender_mode='TEST_ONLY' FROM dqa_private.account_mail_policy WHERE singleton));
END $$;

GRANT USAGE ON SCHEMA dqa_business TO service_role;
-- These service-only functions cannot be invoked by browser JWTs.
CREATE FUNCTION dqa_business.claim_account_invitation(p_tenant uuid,p_operation uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;j dqa_private.account_invitations;dispatch uuid;terminal text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.auth_user_id=p_actor AND m.enabled AND r.enabled AND r.is_tenant_admin AND 'lms'=ANY(r.systems) AND 'settings'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 SELECT o.result INTO result FROM dqa_private.access_operations o WHERE o.tenant_id=p_tenant AND o.id=p_operation AND o.actor_id=p_actor AND o.result->>'state'='SAVED';
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
 IF result->'invitation'->>'operation_id' IS NULL THEN RETURN coalesce(result->'invitation',jsonb_build_object('state','NOT_REQUIRED'));END IF;
 SELECT * INTO j FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND id=(result->'invitation'->>'operation_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
 IF j.state<>'QUEUED' THEN RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=p_tenant AND m.id=j.member_id AND m.enabled AND r.enabled AND m.login_email=j.email) THEN terminal:='SKIPPED_DISABLED';
 ELSIF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=j.email AND email_confirmed_at IS NOT NULL) THEN terminal:='SKIPPED_VERIFIED';END IF;
 IF terminal IS NOT NULL THEN UPDATE dqa_private.account_invitations SET state=terminal,completed_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=j.id;RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 IF NOT (SELECT enabled FROM dqa_private.account_mail_policy WHERE singleton) THEN RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 dispatch:=gen_random_uuid();
 UPDATE dqa_private.account_invitations SET state='UNKNOWN',dispatch_id=dispatch,attempted_at=clock_timestamp(),code='DISPATCH_IN_PROGRESS' WHERE tenant_id=p_tenant AND id=j.id;
 RETURN jsonb_build_object('state','DISPATCH_GRANTED','operation_id',j.id,'dispatch_id',dispatch,'email',j.email);
END $$;
CREATE FUNCTION dqa_business.finish_account_invitation(p_tenant uuid,p_id uuid,p_dispatch uuid,p_state text,p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_state NOT IN ('SENT','FAILED','UNKNOWN') OR p_state IS NULL OR p_code NOT IN ('ACCEPTED','EMAIL_REJECTED','RATE_LIMITED','DELIVERY_UNKNOWN') OR p_code IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';END IF;
 UPDATE dqa_private.account_invitations SET state=p_state,code=p_code,completed_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=p_id AND dispatch_id=p_dispatch AND state='UNKNOWN';
 RETURN dqa_private.invitation_summary(p_tenant,p_id);
END $$;
REVOKE ALL ON FUNCTION dqa_business.save_access_with_invitation(uuid,uuid,text,uuid,bigint,jsonb),dqa_business.request_account_invitation(uuid,uuid,bigint,uuid),dqa_business.access_result_with_invitation(uuid,uuid),dqa_business.access_directory_with_invitations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.save_access_with_invitation(uuid,uuid,text,uuid,bigint,jsonb),dqa_business.request_account_invitation(uuid,uuid,bigint,uuid),dqa_business.access_result_with_invitation(uuid,uuid),dqa_business.access_directory_with_invitations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.claim_account_invitation(uuid,uuid,uuid),dqa_business.finish_account_invitation(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.claim_account_invitation(uuid,uuid,uuid),dqa_business.finish_account_invitation(uuid,uuid,uuid,text,text) TO service_role;
