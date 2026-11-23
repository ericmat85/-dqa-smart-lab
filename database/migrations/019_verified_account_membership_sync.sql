-- Complete the existing verified-email binding when an admin saves or resends.
-- Keep private ACLs, membership enable/role flags, Auth verification and SMTP intact.
CREATE OR REPLACE FUNCTION dqa_private.queue_account_invitation(p_tenant uuid,p_member uuid,p_operation uuid,p_force boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m dqa_business.memberships;j dqa_private.account_invitations;verified_user uuid;
BEGIN
 SELECT * INTO m FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_member AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_MEMBER_UNAVAILABLE';END IF;
 IF NOT m.enabled THEN RETURN jsonb_build_object('state','SKIPPED_DISABLED');END IF;
 SELECT u.id INTO verified_user FROM auth.users u WHERE lower(u.email)=m.login_email AND u.email_confirmed_at IS NOT NULL ORDER BY u.created_at,u.id LIMIT 1 FOR SHARE;
 IF verified_user IS NOT NULL THEN
  -- Verification and workspace membership are separate. Bind only the already
  -- administrator-provisioned member with this exact verified email; no roles
  -- or verification/password fields are changed, and no email is dispatched.
  IF m.auth_user_id IS NOT NULL AND m.auth_user_id<>verified_user THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_EMAIL_IMMUTABLE';END IF;
  IF EXISTS(SELECT 1 FROM dqa_business.memberships x WHERE x.tenant_id=p_tenant AND x.auth_user_id=verified_user AND x.id<>p_member) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ACCESS_EMAIL_EXISTS';END IF;
  IF m.auth_user_id IS NULL THEN UPDATE dqa_business.memberships SET auth_user_id=verified_user WHERE tenant_id=p_tenant AND id=p_member AND auth_user_id IS NULL AND deleted_at IS NULL;END IF;
  RETURN jsonb_build_object('state','SKIPPED_VERIFIED');
 END IF;
 SELECT * INTO j FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND member_id=p_member AND email=m.login_email AND state IN ('QUEUED','UNKNOWN','SENT') ORDER BY created_at DESC,id DESC LIMIT 1;
 IF FOUND AND (NOT p_force OR j.state IN ('QUEUED','UNKNOWN') OR j.attempted_at>clock_timestamp()-interval '60 seconds') THEN RETURN dqa_private.invitation_summary(p_tenant,j.id);END IF;
 IF (SELECT count(*) FROM dqa_private.account_invitations WHERE tenant_id=p_tenant AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ACCESS_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.account_invitations(tenant_id,id,member_id,email,requested_by,state) VALUES(p_tenant,p_operation,p_member,m.login_email,auth.uid(),'QUEUED');
 RETURN dqa_private.invitation_summary(p_tenant,p_operation);
END $$;
REVOKE ALL ON FUNCTION dqa_private.queue_account_invitation(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;


-- A newly completed binding increments the member revision; return that revision.
CREATE OR REPLACE FUNCTION dqa_business.save_access_with_invitation(p_tenant uuid,p_operation uuid,p_kind text,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved_result jsonb;invitation jsonb;
BEGIN
 saved_result:=dqa_business.save_workspace_access(p_tenant,p_operation,p_kind,p_id,p_expected_revision,p_data);
 IF p_kind='member' AND NOT coalesce((saved_result->>'replayed')::boolean,false) THEN
  invitation:=dqa_private.queue_account_invitation(p_tenant,p_id,p_operation,false);
  saved_result:=saved_result||jsonb_build_object('invitation',invitation,'revision',(SELECT revision FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=p_id));
  UPDATE dqa_private.access_operations SET result=saved_result WHERE tenant_id=p_tenant AND id=p_operation;
 END IF;
 IF saved_result->'invitation'->>'operation_id' IS NOT NULL THEN saved_result:=saved_result||jsonb_build_object('invitation',dqa_private.invitation_summary(p_tenant,(saved_result->'invitation'->>'operation_id')::uuid));END IF;
 RETURN saved_result;
END $$;
