-- Server clock starts acknowledged bookings. This never completes a trial or signs for a person.
CREATE TABLE dqa_private.schedule_start_permits (
 tenant_id uuid NOT NULL, schedule_id uuid NOT NULL, request_id uuid NOT NULL,
 transaction_id bigint NOT NULL, PRIMARY KEY(tenant_id,schedule_id,transaction_id)
);
CREATE TABLE dqa_private.schedule_start_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 schedule_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,executor_member_id uuid NOT NULL,
 scheduled_at timestamptz NOT NULL,started_at timestamptz NOT NULL,
 source text NOT NULL DEFAULT 'SERVER_SCHEDULE_CLOCK' CHECK(source='SERVER_SCHEDULE_CLOCK'),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES dqa_business.schedules(tenant_id,id)
);
REVOKE ALL ON dqa_private.schedule_start_permits,dqa_private.schedule_start_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON dqa_private.schedule_start_events FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_private.schedule_start_events FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();

-- A same-day acknowledgement may still start within its original reserved window.
-- Expired bookings remain blocked and must be rescheduled by the supervisor.
DO $patch$ DECLARE body text;needle text;BEGIN
 SELECT pg_get_functiondef('dqa_business.execute_human_operation(uuid,uuid,jsonb,text)'::regprocedure) INTO body;
 needle:='OR clock_timestamp()>=s.starts_at THEN RAISE EXCEPTION ''HUMAN_RECEIPT_WINDOW''';
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'AUTOSTART_RECEIPT_BASELINE_CHANGED';END IF;
 EXECUTE replace(body,needle,'OR clock_timestamp()>=s.ends_at THEN RAISE EXCEPTION ''HUMAN_RECEIPT_WINDOW''');
END $patch$;

-- Preserve all existing manual workflow gates, adding only the private clock permit.
DO $patch$ DECLARE body text;needle text;BEGIN
 SELECT pg_get_functiondef('dqa_private.workflow_policy_gate()'::regprocedure) INTO body;
 needle:='BEGIN'||chr(10);
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'AUTOSTART_GATE_BASELINE_CHANGED';END IF;
 body:=replace(body,needle,needle||$gate$
 IF TG_OP='UPDATE' AND NEW.status='RUNNING' AND
  EXISTS(SELECT 1 FROM dqa_private.schedule_start_permits p
    WHERE p.tenant_id=NEW.tenant_id AND p.transaction_id=txid_current()
      AND ((TG_TABLE_NAME='schedules' AND p.schedule_id=NEW.id AND OLD.status='BOOKED')
        OR (TG_TABLE_NAME='requests' AND p.request_id=NEW.id AND OLD.status='AWAITING_LAB_RECEIPT')))
 THEN RETURN NEW;END IF;
$gate$);
 EXECUTE body;
END $patch$;

CREATE FUNCTION dqa_business.start_due_lab_trials(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s dqa_business.schedules;q dqa_business.requests;at_time timestamptz:=clock_timestamp();
 started integer:=0;blocked integer:=0;lock_id uuid;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
 AND coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTOSTART_SERVICE_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled)
 THEN RETURN jsonb_build_object('started',0,'blocked',0,'state','DISABLED');END IF;
 -- Same lock order as booking, account maintenance and recycle operations.
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 FOR lock_id IN SELECT id FROM dqa_business.schedules WHERE tenant_id=p_tenant
  AND status='BOOKED' AND received_at IS NOT NULL AND starts_at<=at_time AND ends_at>at_time
  ORDER BY starts_at,id LIMIT 1000
 LOOP
  SELECT r.* INTO q FROM dqa_business.requests r JOIN dqa_business.schedules z
   ON z.tenant_id=r.tenant_id AND z.request_id=r.id WHERE z.id=lock_id FOR UPDATE OF r;
  SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND id=lock_id FOR UPDATE;
  IF s.status<>'BOOKED' OR q.status<>'AWAITING_LAB_RECEIPT' OR s.received_at IS NULL
   OR EXISTS(SELECT 1 FROM dqa_private.case_recycle_items i WHERE i.tenant_id=p_tenant AND i.restored_at IS NULL
     AND ((i.entity='requests' AND i.record_id=q.id) OR (i.entity='schedules' AND i.record_id=s.id))) THEN CONTINUE;END IF;
  -- Lock devices in stable order; state transitions are atomic with the booking.
  PERFORM e.id FROM dqa_business.equipment e JOIN dqa_business.schedule_equipment a
   ON a.tenant_id=e.tenant_id AND a.equipment_id=e.id
   WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND a.released_at IS NULL ORDER BY e.id FOR UPDATE OF e;
  IF NOT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r
   ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN auth.users u ON u.id=m.auth_user_id
   WHERE m.tenant_id=p_tenant AND m.id=s.executor_member_id AND m.enabled AND m.deleted_at IS NULL AND r.enabled
   AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND 'lab.execute'=ANY(r.permissions)
   AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=m.login_email AND (u.banned_until IS NULL OR u.banned_until<=at_time))
   OR NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL)
   OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.equipment e
    ON e.tenant_id=a.tenant_id AND e.id=a.equipment_id WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND a.released_at IS NULL
     AND (e.operational_status<>'IDLE' OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment other
      JOIN dqa_business.schedules z ON z.tenant_id=other.tenant_id AND z.id=other.schedule_id
      WHERE other.tenant_id=p_tenant AND other.equipment_id=e.id AND other.schedule_id<>s.id
      AND other.released_at IS NULL AND z.status IN('RUNNING','PAUSED'))))
  THEN blocked:=blocked+1;CONTINUE;END IF;
  INSERT INTO dqa_private.schedule_start_permits VALUES(p_tenant,s.id,q.id,txid_current());
  UPDATE dqa_business.schedules SET status='RUNNING',started_at=at_time WHERE id=s.id;
  UPDATE dqa_business.requests SET status='RUNNING' WHERE id=q.id;
  UPDATE dqa_business.equipment SET operational_status='IN_USE' WHERE tenant_id=p_tenant
   AND id IN(SELECT equipment_id FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL);
  INSERT INTO dqa_private.schedule_start_events(tenant_id,schedule_id,request_id,executor_member_id,scheduled_at,started_at)
   VALUES(p_tenant,s.id,q.id,s.executor_member_id,s.starts_at,at_time);
  DELETE FROM dqa_private.schedule_start_permits WHERE tenant_id=p_tenant AND schedule_id=s.id AND transaction_id=txid_current();
  started:=started+1;
 END LOOP;
 RETURN jsonb_build_object('started',started,'blocked',blocked,'state','READY');
END $$;
REVOKE ALL ON FUNCTION dqa_business.start_due_lab_trials(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.start_due_lab_trials(uuid) TO service_role;
