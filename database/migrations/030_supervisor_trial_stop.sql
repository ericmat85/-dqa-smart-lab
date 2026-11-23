-- Supervisor stop uses the same immutable, revision-checked human-operation receipt.
CREATE FUNCTION dqa_private.can_stop_scheduled_trial(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT dqa_private.can(p_tenant,'schedules.book') AND EXISTS(
  SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
  WHERE m.tenant_id=p_tenant AND m.id=dqa_private.member_id(p_tenant)
   AND 'lms'=ANY(r.systems) AND 'schedule'=ANY(r.pages) AND (r.is_tenant_admin OR r.review_level=1))
$$;
REVOKE ALL ON FUNCTION dqa_private.can_stop_scheduled_trial(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION pg_temp.patch_stop_function(target regprocedure,needle text,replacement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE source text;
BEGIN source:=pg_get_functiondef(target);
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'STOP_PATCH_BASELINE_MISMATCH: %',target;END IF;
 EXECUTE replace(source,needle,replacement);
END $$;
SELECT pg_temp.patch_stop_function('dqa_business.prepare_human_operation(uuid,uuid,jsonb)'::regprocedure,$needle$NOT IN('BOOK','RECEIVE','START','COMPLETE','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE')$needle$,$replacement$NOT IN('BOOK','RECEIVE','START','COMPLETE','STOP','REPORT_SUBMIT','REPORT_APPROVE','REPORT_RETURN','CONFIRM_ARCHIVE')$replacement$);
SELECT pg_temp.patch_stop_function('dqa_business.prepare_human_operation(uuid,uuid,jsonb)'::regprocedure,$needle$ PERFORM pg_advisory_xact_lock(hashtextextended('human-operations:'||p_tenant,0));$needle$,$replacement$ IF p_command->>'action'='STOP' THEN
  IF NOT dqa_private.can_stop_scheduled_trial(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_STOP_DENIED';END IF;
  IF p_command->>'signature_data'<>'' OR p_command->'upload_id' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-operations:'||p_tenant,0));$replacement$);
SELECT pg_temp.patch_stop_function('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)'::regprocedure,$needle$ ELSIF action IN('RECEIVE','START','COMPLETE') THEN$needle$,$replacement$ ELSIF action='STOP' THEN
  IF NOT dqa_private.can_stop_scheduled_trial(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_STOP_DENIED';END IF;
  IF p_command->>'signature_data'<>'' OR p_command->'upload_id' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'HUMAN_FIELDS_INVALID';END IF;
  IF q.status NOT IN('AWAITING_LAB_RECEIPT','RUNNING') OR s.id IS NULL OR s.status NOT IN('AWAITING_RECEIPT','BOOKED','RUNNING','PAUSED') OR r.id IS NOT NULL THEN RAISE EXCEPTION 'HUMAN_STOP_STATE_INVALID';END IF;
  -- Capture existing draft revision as well; a stop never rewrites planning inputs.
  SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
  IF coalesce(d.revision,0)<>(p_command->>'expected_draft_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  FOR data IN SELECT to_jsonb(z) FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.request_id=q.id AND z.status NOT IN('COMPLETED','CANCELLED') ORDER BY z.id FOR UPDATE OF z LOOP
   PERFORM dqa_private.human_permit(p_tenant,p_operation,'schedules',(data->>'id')::uuid,data->>'status','CANCELLED');
   UPDATE dqa_business.schedules z SET status='CANCELLED',plan=coalesce(z.plan,'{}'::jsonb)||jsonb_build_object('stopped_at',clock_timestamp(),'stopped_by_member_id',actor,'stop_reason',coalesce(nullif(btrim(p_command->>'comment'),''),'主管確認中止排程並取消委託')) WHERE z.tenant_id=p_tenant AND z.id=(data->>'id')::uuid;
  END LOOP;
  SELECT * INTO s FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.id=s.id;
  IF q.execution_kind='REAL' THEN
   UPDATE dqa_business.schedule_equipment a SET released_at=clock_timestamp() WHERE a.tenant_id=p_tenant AND a.schedule_id IN(SELECT z.id FROM dqa_business.schedules z WHERE z.tenant_id=p_tenant AND z.request_id=q.id AND z.status='CANCELLED') AND a.released_at IS NULL;
   UPDATE dqa_business.equipment e SET operational_status='IDLE' WHERE e.tenant_id=p_tenant AND e.operational_status IN('IN_USE','PAUSED')
    AND e.id IN(SELECT a.equipment_id FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND z.request_id=q.id AND z.status='CANCELLED')
    AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND a.equipment_id=e.id AND a.released_at IS NULL AND z.status IN('RUNNING','PAUSED'));
  END IF;
  PERFORM dqa_private.human_permit(p_tenant,p_operation,'lab_operations',new_id,NULL,'APPROVED');
  INSERT INTO dqa_business.lab_operations(id,tenant_id,request_id,actor_member_id,action,reason,status) VALUES(new_id,p_tenant,q.id,actor,CASE WHEN old_s IN('RUNNING','PAUSED') THEN 'INTERRUPT' ELSE 'CANCEL' END,coalesce(nullif(btrim(p_command->>'comment'),''),'主管確認中止排程並取消委託'),'APPROVED');
  stage:='LAB_STOP';decision:='NOTE';next_q:='CANCELLED';
 ELSIF action IN('RECEIVE','START','COMPLETE') THEN$replacement$);
DROP FUNCTION pg_temp.patch_stop_function(regprocedure,text,text);
