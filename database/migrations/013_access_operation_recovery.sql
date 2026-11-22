-- Resolve an explicitly abandoned, uncommitted account operation without retrying it.
-- Uses the same lock as save_workspace_access. A tombstone blocks a late request.
CREATE FUNCTION dqa_business.resolve_access_operation(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing dqa_private.access_operations;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ACCESS_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_ADMIN_REQUIRED';END IF;
 SELECT * INTO existing FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND id=p_operation FOR UPDATE;
 IF FOUND THEN
  IF existing.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCESS_OPERATION_CONFLICT';END IF;
  RETURN existing.result;
 END IF;
 IF (SELECT count(*) FROM dqa_private.access_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ACCESS_RATE_LIMITED';END IF;
 result:=jsonb_build_object('operation_id',p_operation,'state','CANCELLED_NO_WRITE');
 INSERT INTO dqa_private.access_operations(tenant_id,id,actor_id,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),'CANCELLED_NO_WRITE',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.resolve_access_operation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.resolve_access_operation(uuid,uuid) TO authenticated;
