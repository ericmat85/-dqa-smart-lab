-- Restrict the Resend test sender before provider dispatch; no member data changes.
ALTER TABLE dqa_private.account_mail_policy ADD COLUMN test_recipient_email text CHECK(test_recipient_email IS NULL OR (test_recipient_email=lower(btrim(test_recipient_email)) AND length(test_recipient_email)<=254 AND test_recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
CREATE OR REPLACE FUNCTION dqa_private.invitation_summary(p_tenant uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operation_id',i.id,'state',CASE WHEN i.state='QUEUED' AND NOT p.enabled THEN 'NOT_CONFIGURED' WHEN i.state='QUEUED' AND p.sender_mode='TEST_ONLY' AND p.test_recipient_email IS DISTINCT FROM i.email THEN 'REQUIRES_VERIFIED_SENDER' ELSE i.state END,'code',i.code,'attempted_at',i.attempted_at)
 FROM dqa_private.account_invitations i CROSS JOIN dqa_private.account_mail_policy p WHERE i.tenant_id=p_tenant AND i.id=p_id
$$;
REVOKE ALL ON FUNCTION dqa_private.invitation_summary(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION dqa_business.claim_account_invitation(p_tenant uuid,p_operation uuid,p_actor uuid) RETURNS jsonb
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
 IF EXISTS(SELECT 1 FROM dqa_private.account_mail_policy WHERE singleton AND sender_mode='TEST_ONLY' AND test_recipient_email IS DISTINCT FROM j.email) THEN RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 dispatch:=gen_random_uuid();
 UPDATE dqa_private.account_invitations SET state='UNKNOWN',dispatch_id=dispatch,attempted_at=clock_timestamp(),code='DISPATCH_IN_PROGRESS' WHERE tenant_id=p_tenant AND id=j.id;
 RETURN jsonb_build_object('state','DISPATCH_GRANTED','operation_id',j.id,'dispatch_id',dispatch,'email',j.email);
END $$;
