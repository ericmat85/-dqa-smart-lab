-- Workspace administrator acceptance rights. No memberships, roles, or case rows are rewritten.
-- Administrators act as themselves and still advance one signed stage at a time.
-- Every replacement must match once; unknown baselines fail atomically.
DO $admin_acceptance$
DECLARE patch record; definition text;
BEGIN
 FOR patch IN SELECT * FROM (VALUES
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF req.owner_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.submit') OR NOT ('request'=ANY(actor_role.systems)) THEN$old$, $new$IF req.owner_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.submit') OR (NOT dqa_private.is_admin(p_tenant) AND NOT ('request'=ANY(actor_role.systems))) THEN$new$),
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF supervisor.id IS NULL OR supervisor.id=actor_member OR NOT ('request'=ANY(supervisor_role.systems)) OR NOT(supervisor_role.is_tenant_admin OR 'requests.review_manager'=ANY(supervisor_role.permissions)) THEN$old$, $new$IF (NOT dqa_private.is_admin(p_tenant) OR actor.supervisor_member_id IS NOT NULL) AND (supervisor.id IS NULL OR supervisor.id=actor_member OR NOT (supervisor_role.is_tenant_admin OR 'request'=ANY(supervisor_role.systems)) OR NOT(supervisor_role.is_tenant_admin OR 'requests.review_manager'=ANY(supervisor_role.permissions))) THEN$new$),
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF actor_member=req.owner_member_id THEN$old$, $new$IF actor_member=req.owner_member_id AND NOT dqa_private.is_admin(p_tenant) THEN$new$),
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF req.supervisor_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.review_manager') OR NOT ('request'=ANY(actor_role.systems)) THEN$old$, $new$IF NOT dqa_private.is_admin(p_tenant) AND (req.supervisor_member_id<>actor_member OR NOT dqa_private.can(p_tenant,'requests.review_manager') OR NOT ('request'=ANY(actor_role.systems))) THEN$new$),
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$   IF NOT dqa_private.can(p_tenant,'requests.review_lms') OR NOT ('lms'=ANY(actor_role.systems)) OR NOT ('requests'=ANY(actor_role.pages)) OR actor_role.review_level<>req.request_review_level+1 OR actor_role.review_level NOT IN (1,2) THEN$old$, $new$   IF dqa_private.is_admin(p_tenant) THEN actor_role.review_level:=req.request_review_level+1;END IF;
   IF actor_role.review_level NOT IN (1,2) OR (NOT dqa_private.is_admin(p_tenant) AND (NOT dqa_private.can(p_tenant,'requests.review_lms') OR NOT ('lms'=ANY(actor_role.systems)) OR NOT ('requests'=ANY(actor_role.pages)) OR actor_role.review_level<>req.request_review_level+1)) THEN$new$),
  ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF EXISTS(SELECT 1 FROM dqa_business.approval_events a WHERE$old$, $new$IF NOT dqa_private.is_admin(p_tenant) AND EXISTS(SELECT 1 FROM dqa_business.approval_events a WHERE$new$),
  ('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)', $old$OR actor IS DISTINCT FROM q.supervisor_member_id OR$old$, $new$OR (NOT dqa_private.is_admin(p_tenant) AND actor IS DISTINCT FROM q.supervisor_member_id) OR$new$),
  ('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)', $old$  manager_return:=coalesce(action='REPORT_RETURN'$old$, $new$  IF dqa_private.is_admin(p_tenant) THEN actor_role.review_level:=CASE WHEN r.status='SUBMITTED' THEN 2 WHEN r.status='REVIEW_L3' THEN 3 ELSE -1 END;END IF;
  manager_return:=coalesce(action='REPORT_RETURN'$new$),
  ('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)', $old$AND actor=q.supervisor_member_id AND$old$, $new$AND (dqa_private.is_admin(p_tenant) OR actor=q.supervisor_member_id) AND$new$),
  ('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)', $old$IF NOT manager_return AND ( NOT dqa_private.can(p_tenant,'reports.review') OR NOT('lms'=ANY(actor_role.systems)) OR actor_role.review_level<>(CASE WHEN r.status='SUBMITTED' THEN 2 WHEN r.status='REVIEW_L3' THEN 3 ELSE -1 END) OR actor IN(q.owner_member_id,q.supervisor_member_id) OR actor=(SELECT created_by_member_id FROM dqa_business.report_versions WHERE id=r.current_version_id) ) THEN$old$, $new$IF NOT manager_return AND (actor_role.review_level NOT IN (2,3) OR (NOT dqa_private.is_admin(p_tenant) AND ( NOT dqa_private.can(p_tenant,'reports.review') OR NOT('lms'=ANY(actor_role.systems)) OR actor_role.review_level<>(CASE WHEN r.status='SUBMITTED' THEN 2 WHEN r.status='REVIEW_L3' THEN 3 ELSE -1 END) OR actor IN(q.owner_member_id,q.supervisor_member_id) OR actor=(SELECT created_by_member_id FROM dqa_business.report_versions WHERE id=r.current_version_id) ))) THEN$new$),
  ('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)', $old$IF NOT manager_return AND EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE$old$, $new$IF NOT manager_return AND NOT dqa_private.is_admin(p_tenant) AND EXISTS(SELECT 1 FROM dqa_business.approval_events e WHERE$new$),
  ('dqa_business.prepare_report_upload(uuid,uuid,uuid,text,text,integer,text,bigint,bigint)', $old$OR q.supervisor_member_id IS DISTINCT FROM dqa_private.member_id(p_tenant) OR$old$, $new$OR (NOT dqa_private.is_admin(p_tenant) AND q.supervisor_member_id IS DISTINCT FROM dqa_private.member_id(p_tenant)) OR$new$),
  ('dqa_private.preapproval_can_plan(uuid,uuid)', $old$AND q.owner_member_id<>dqa_private.member_id(p_tenant) AND$old$, $new$AND (dqa_private.is_admin(p_tenant) OR q.owner_member_id<>dqa_private.member_id(p_tenant)) AND$new$)
 ) AS changes(signature, before_text, after_text) LOOP
  definition:=pg_get_functiondef(patch.signature::regprocedure);
  IF (length(definition)-length(replace(definition,patch.before_text,'')))/length(patch.before_text)<>1 THEN
   RAISE EXCEPTION 'ADMIN_ACCEPTANCE_BASELINE_CHANGED: %',patch.signature;
  END IF;
  EXECUTE replace(definition,patch.before_text,patch.after_text);
 END LOOP;
END $admin_acceptance$;
