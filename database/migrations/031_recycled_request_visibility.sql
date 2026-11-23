-- Preserve the recycle-bin boundary when the native executor access path is used.
-- The human-workflow migration added executor visibility and unintentionally lost
-- this existing guard. Keep the original owner/supervisor/reviewer permissions.
CREATE OR REPLACE FUNCTION dqa_private.can_read_request(p_tenant uuid,p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant)
 AND dqa_private.case_row_active(p_tenant,'requests',p_request)
 AND EXISTS(SELECT 1 FROM dqa_business.requests r
  WHERE r.tenant_id=p_tenant AND r.id=p_request AND (
   dqa_private.can(p_tenant,'requests.read_all')
   OR r.owner_member_id=dqa_private.member_id(p_tenant)
   OR r.supervisor_member_id=dqa_private.member_id(p_tenant)
   OR (dqa_private.can(p_tenant,'lab.execute') AND EXISTS(
    SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant
     AND s.request_id=r.id AND s.status NOT IN('DRAFT','CANCELLED')
     AND s.executor_member_id=dqa_private.member_id(p_tenant)))))
$$;
