-- Opt-in business mail, transactionally queued by authoritative workflow changes.
-- Browser clients cannot choose recipients, dispatch mail or write delivery receipts.
CREATE TABLE dqa_business.notification_preferences(id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,member_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT false,revision bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,member_id),FOREIGN KEY(tenant_id,member_id) REFERENCES dqa_business.memberships(tenant_id,id));
ALTER TABLE dqa_business.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_business.notification_preferences FROM PUBLIC,anon,authenticated;
CREATE POLICY own_notification_preferences ON dqa_business.notification_preferences FOR SELECT TO authenticated USING(member_id=dqa_private.member_id(tenant_id));
GRANT SELECT ON dqa_business.notification_preferences TO authenticated;
CREATE TABLE dqa_private.business_mail_policy(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,enabled boolean NOT NULL DEFAULT false,daily_limit integer NOT NULL DEFAULT 200 CHECK(daily_limit BETWEEN 1 AND 500));
INSERT INTO dqa_private.business_mail_policy(tenant_id) SELECT id FROM dqa_business.tenants;
CREATE TABLE dqa_private.business_mail_worker(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,worker_id uuid NOT NULL,ready boolean NOT NULL,code text NOT NULL,heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE dqa_private.business_mail_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,recipient_id uuid NOT NULL,request_id uuid,actor_id uuid,kind text NOT NULL,system text NOT NULL CHECK(system IN('lms','lab','request')),permission text NOT NULL DEFAULT '',review_level integer NOT NULL DEFAULT 0,event_key text NOT NULL,event_state text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','SENDING','SENT','FAILED','UNKNOWN','SKIPPED')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),dispatch_id uuid,worker_id uuid,authorized_at timestamptz,code text,next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),sent_at timestamptz,
 UNIQUE(tenant_id,event_key,recipient_id),FOREIGN KEY(tenant_id,recipient_id) REFERENCES dqa_business.memberships(tenant_id,id),FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id));
CREATE INDEX business_mail_ready ON dqa_private.business_mail_outbox(tenant_id,state,next_attempt_at,created_at);
CREATE TABLE dqa_private.business_mail_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,message_id uuid NOT NULL REFERENCES dqa_private.business_mail_outbox,dispatch_id uuid NOT NULL,state text NOT NULL,code text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE dqa_private.business_mail_policy ENABLE ROW LEVEL SECURITY;ALTER TABLE dqa_private.business_mail_worker ENABLE ROW LEVEL SECURITY;ALTER TABLE dqa_private.business_mail_outbox ENABLE ROW LEVEL SECURITY;ALTER TABLE dqa_private.business_mail_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.business_mail_policy,dqa_private.business_mail_worker,dqa_private.business_mail_outbox,dqa_private.business_mail_deliveries FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON dqa_private.business_mail_deliveries FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();

CREATE FUNCTION dqa_private.business_mail_eligible(p_tenant uuid,p_member uuid,p_request uuid,p_kind text,p_system text,p_permission text,p_level integer) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m dqa_business.memberships;r dqa_business.roles;q dqa_business.requests;report_status text;submitter uuid;
BEGIN
 SELECT x.* INTO m FROM dqa_business.memberships x JOIN dqa_business.tenants t ON t.id=x.tenant_id AND t.enabled JOIN auth.users u ON u.id=x.auth_user_id AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=x.login_email JOIN dqa_business.notification_preferences n ON n.tenant_id=x.tenant_id AND n.member_id=x.id AND n.enabled WHERE x.tenant_id=p_tenant AND x.id=p_member AND x.enabled AND x.deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO r FROM dqa_business.roles WHERE tenant_id=p_tenant AND id=m.role_id AND enabled;
 IF NOT FOUND OR NOT(p_system=ANY(r.systems)) OR p_permission<>'' AND NOT(r.is_tenant_admin OR p_permission=ANY(r.permissions)) OR p_level>0 AND r.review_level<>p_level THEN RETURN false;END IF;
 IF p_kind='TEST' THEN RETURN p_request IS NULL;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM dqa_private.case_recycle_items WHERE tenant_id=p_tenant AND entity='requests' AND record_id=p_request AND restored_at IS NULL) THEN RETURN false;END IF;
 IF NOT(r.is_tenant_admin OR 'requests.read_all'=ANY(r.permissions) OR q.owner_member_id=m.id OR q.supervisor_member_id=m.id OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.executor_member_id=m.id)) THEN RETURN false;END IF;
 IF p_kind='REQUEST_MANAGER' THEN RETURN q.status='AWAITING_REQUEST_MANAGER' AND q.supervisor_member_id=m.id;END IF;
 IF p_kind='REQUEST_LMS' THEN RETURN q.status='AWAITING_LMS_REVIEW' AND q.request_review_level=p_level-1 AND m.id<>q.owner_member_id AND m.id IS DISTINCT FROM q.supervisor_member_id AND NOT EXISTS(SELECT 1 FROM dqa_business.approval_events WHERE tenant_id=p_tenant AND request_id=q.id AND actor_member_id=m.id AND stage IN('LMS_1','LMS_2') AND stage<>'LMS_'||p_level AND decision IN('APPROVE','RETURN'));END IF;
 IF p_kind='SCHEDULING' THEN RETURN q.status='AWAITING_SCHEDULING';END IF;
 IF p_kind='LAB_RECEIPT' THEN RETURN q.status='AWAITING_LAB_RECEIPT' AND EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.executor_member_id=m.id AND s.status='AWAITING_RECEIPT');END IF;
 IF p_kind LIKE 'REPORT_%' THEN
  SELECT status,(SELECT created_by_member_id FROM dqa_business.report_versions WHERE tenant_id=p_tenant AND id=x.current_version_id) INTO report_status,submitter FROM dqa_business.reports x WHERE tenant_id=p_tenant AND request_id=q.id;
  IF p_kind='REPORT_RETURNED' THEN RETURN q.status='COMPLETED' AND report_status='RETURNED';END IF;
  IF p_kind='REPORT_VIEW' THEN RETURN q.status='AWAITING_REPORT_VIEW' AND report_status='AWAITING_VIEW' AND q.supervisor_member_id=m.id;END IF;
  IF p_kind='REPORT_REVIEW' THEN RETURN q.status='AWAITING_REPORT_REVIEW' AND report_status=CASE p_level WHEN 2 THEN 'SUBMITTED' ELSE 'REVIEW_L3' END AND m.id<>q.owner_member_id AND m.id IS DISTINCT FROM q.supervisor_member_id AND m.id IS DISTINCT FROM submitter AND NOT EXISTS(SELECT 1 FROM dqa_business.approval_events a JOIN dqa_business.reports x ON x.tenant_id=a.tenant_id AND x.request_id=a.request_id WHERE a.tenant_id=p_tenant AND a.request_id=q.id AND a.report_version_id=x.current_version_id AND a.actor_member_id=m.id AND a.stage IN('REPORT_L2','REPORT_L3') AND a.stage<>'REPORT_L'||p_level);END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION dqa_private.business_mail_eligible(uuid,uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_private.queue_business_mail(p_tenant uuid,p_request uuid,p_member uuid,p_actor uuid,p_kind text,p_system text,p_permission text,p_level integer,p_event text,p_state text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_member IS NULL OR p_member=p_actor OR NOT EXISTS(SELECT 1 FROM dqa_private.business_mail_policy WHERE tenant_id=p_tenant AND enabled) THEN RETURN;END IF;
 -- Authorization is checked after commit too: parent rows may still be transitioning here.
 IF NOT EXISTS(SELECT 1 FROM dqa_business.notification_preferences n JOIN dqa_business.memberships m ON m.tenant_id=n.tenant_id AND m.id=n.member_id JOIN auth.users u ON u.id=m.auth_user_id JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE n.tenant_id=p_tenant AND n.member_id=p_member AND n.enabled AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=m.login_email AND p_system=ANY(r.systems) AND (p_permission='' OR r.is_tenant_admin OR p_permission=ANY(r.permissions)) AND (p_level=0 OR r.review_level=p_level)) THEN RETURN;END IF;
 INSERT INTO dqa_private.business_mail_outbox(tenant_id,recipient_id,request_id,actor_id,kind,system,permission,review_level,event_key,event_state) VALUES(p_tenant,p_member,p_request,p_actor,p_kind,p_system,p_permission,p_level,p_event,p_state) ON CONFLICT(tenant_id,event_key,recipient_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION dqa_private.queue_business_mail(uuid,uuid,uuid,uuid,text,text,text,integer,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_private.business_mail_request_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=dqa_private.member_id(NEW.tenant_id);who record;kind text;lvl integer:=0;permission text;system text;person uuid;event text:='request:'||NEW.id||':'||NEW.revision;inform boolean:=false;
BEGIN
 IF NEW.status=OLD.status AND NEW.request_review_level=OLD.request_review_level THEN RETURN NEW;END IF;
 IF NEW.status='AWAITING_REQUEST_MANAGER' THEN kind:='REQUEST_MANAGER';system:='request';permission:='requests.review_manager';person:=NEW.supervisor_member_id;
 ELSIF NEW.status='AWAITING_LMS_REVIEW' THEN kind:='REQUEST_LMS';system:='lms';permission:='requests.review_lms';lvl:=NEW.request_review_level+1;
 ELSIF NEW.status='AWAITING_SCHEDULING' THEN kind:='SCHEDULING';system:='lms';permission:='schedules.plan';inform:=true;
 ELSIF NEW.status='AWAITING_LAB_RECEIPT' THEN kind:='LAB_RECEIPT';system:='lab';permission:='lab.execute';SELECT executor_member_id INTO person FROM dqa_business.schedules WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id AND status='AWAITING_RECEIPT' ORDER BY created_at DESC LIMIT 1;
 ELSIF NEW.status IN('RUNNING','COMPLETED','RETURNED','CANCELLED','INTERRUPTED') THEN kind:=CASE NEW.status WHEN 'RUNNING' THEN 'TRIAL_STARTED' WHEN 'COMPLETED' THEN 'TRIAL_COMPLETED' WHEN 'RETURNED' THEN 'REQUEST_RETURNED' ELSE 'REQUEST_CHANGED' END;inform:=true;
 ELSE RETURN NEW;END IF;
 IF kind IN('REQUEST_LMS','SCHEDULING') THEN
  FOR who IN SELECT m.id FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=NEW.tenant_id AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND system=ANY(r.systems) AND (CASE WHEN kind='SCHEDULING' THEN 'schedule' ELSE 'requests' END)=ANY(r.pages) AND (r.is_tenant_admin OR permission=ANY(r.permissions)) AND (lvl=0 OR r.review_level=lvl) AND (kind<>'REQUEST_LMS' OR m.id<>NEW.owner_member_id AND m.id IS DISTINCT FROM NEW.supervisor_member_id) LOOP
   PERFORM dqa_private.queue_business_mail(NEW.tenant_id,NEW.id,who.id,actor,kind,system,permission,lvl,event,NEW.status);
  END LOOP;
 ELSIF person IS NOT NULL THEN PERFORM dqa_private.queue_business_mail(NEW.tenant_id,NEW.id,person,actor,kind,system,permission,lvl,event,NEW.status);END IF;
 IF inform AND NOT(NEW.status='COMPLETED' AND EXISTS(SELECT 1 FROM dqa_business.reports WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id AND status='RETURNED')) THEN
  FOR who IN SELECT m.id,r.systems FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=NEW.tenant_id AND m.id IN(NEW.owner_member_id,NEW.supervisor_member_id) LOOP
   PERFORM dqa_private.queue_business_mail(NEW.tenant_id,NEW.id,who.id,actor,CASE WHEN kind='SCHEDULING' THEN 'REQUEST_APPROVED' ELSE kind END,CASE WHEN 'request'=ANY(who.systems) THEN 'request' WHEN 'lms'=ANY(who.systems) THEN 'lms' ELSE 'lab' END,'',0,event,NEW.status);
  END LOOP;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER queue_business_email AFTER UPDATE OF status,request_review_level ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.business_mail_request_event();

CREATE FUNCTION dqa_private.business_mail_report_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;actor uuid:=dqa_private.member_id(NEW.tenant_id);who record;kind text;system text;permission text;lvl integer:=0;person uuid;event text:='report:'||NEW.id||':'||NEW.revision;
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
 IF NEW.status IN('SUBMITTED','REVIEW_L3') THEN kind:='REPORT_REVIEW';system:='lms';permission:='reports.review';lvl:=CASE WHEN NEW.status='SUBMITTED' THEN 2 ELSE 3 END;
 ELSIF NEW.status='AWAITING_VIEW' THEN kind:='REPORT_VIEW';system:='request';permission:='reports.confirm';person:=q.supervisor_member_id;
 ELSIF NEW.status='RETURNED' THEN kind:='REPORT_RETURNED';system:='lab';permission:='reports.submit';SELECT executor_member_id INTO person FROM dqa_business.schedules WHERE tenant_id=NEW.tenant_id AND request_id=q.id ORDER BY created_at DESC LIMIT 1;
 ELSIF NEW.status='ARCHIVED' THEN kind:='REPORT_ARCHIVED';system:='request';permission:='';person:=q.owner_member_id;
 ELSE RETURN NEW;END IF;
 IF kind='REPORT_REVIEW' THEN
  FOR who IN SELECT m.id FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=NEW.tenant_id AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND system=ANY(r.systems) AND 'requests'=ANY(r.pages) AND (r.is_tenant_admin OR permission=ANY(r.permissions)) AND r.review_level=lvl AND m.id<>q.owner_member_id AND m.id IS DISTINCT FROM q.supervisor_member_id LOOP
   PERFORM dqa_private.queue_business_mail(NEW.tenant_id,q.id,who.id,actor,kind,system,permission,lvl,event,NEW.status);
  END LOOP;
 ELSE PERFORM dqa_private.queue_business_mail(NEW.tenant_id,q.id,person,actor,kind,system,permission,lvl,event,NEW.status);END IF;RETURN NEW;
END $$;
CREATE TRIGGER queue_business_email AFTER UPDATE OF status ON dqa_business.reports FOR EACH ROW EXECUTE FUNCTION dqa_private.business_mail_report_event();
REVOKE ALL ON FUNCTION dqa_private.business_mail_request_event(),dqa_private.business_mail_report_event() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.notification_settings(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mid uuid:=dqa_private.member_id(p_tenant);pref dqa_business.notification_preferences;worker dqa_private.business_mail_worker;
BEGIN
 IF mid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 SELECT * INTO pref FROM dqa_business.notification_preferences WHERE tenant_id=p_tenant AND member_id=mid;SELECT * INTO worker FROM dqa_private.business_mail_worker WHERE tenant_id=p_tenant;
 RETURN jsonb_build_object('enabled',coalesce(pref.enabled,false),'revision',coalesce(pref.revision,0),'configured',pref.member_id IS NOT NULL,'service_ready',coalesce(worker.ready AND worker.heartbeat_at>clock_timestamp()-interval '3 minutes',false),'service_code',coalesce(worker.code,'NOT_CONFIGURED'),'service_enabled',coalesce((SELECT enabled FROM dqa_private.business_mail_policy WHERE tenant_id=p_tenant),false),'member_id',mid,'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.save_notification_settings(p_tenant uuid,p_member uuid,p_enabled boolean,p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mid uuid:=dqa_private.member_id(p_tenant);pref dqa_business.notification_preferences;
BEGIN
 IF mid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 IF mid IS DISTINCT FROM p_member THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 IF p_enabled IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('notification-preference:'||p_tenant||':'||mid,0));SELECT * INTO pref FROM dqa_business.notification_preferences WHERE tenant_id=p_tenant AND member_id=mid FOR UPDATE;
 IF coalesce(pref.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 INSERT INTO dqa_business.notification_preferences(tenant_id,member_id,enabled) VALUES(p_tenant,mid,p_enabled) ON CONFLICT(tenant_id,member_id) DO UPDATE SET enabled=p_enabled,revision=dqa_business.notification_preferences.revision+1,updated_at=clock_timestamp();
 IF NOT p_enabled THEN UPDATE dqa_private.business_mail_outbox SET state='SKIPPED',code='PREFERENCE_DISABLED' WHERE tenant_id=p_tenant AND recipient_id=mid AND state='QUEUED';END IF;
 RETURN dqa_business.notification_settings(p_tenant);
END $$;
CREATE FUNCTION dqa_business.test_notification_email(p_tenant uuid,p_member uuid,p_operation uuid,p_system text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mid uuid:=dqa_private.member_id(p_tenant);message_id uuid;
BEGIN
 IF mid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 IF mid IS DISTINCT FROM p_member THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('notification-test:'||p_tenant||':'||mid,0));
 IF p_operation IS NULL OR p_system IS NULL OR p_system NOT IN('lms','lab','request') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_FIELDS_INVALID';END IF;
 SELECT id INTO message_id FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND event_key='test:'||p_operation AND recipient_id=mid;IF FOUND THEN RETURN jsonb_build_object('id',message_id,'state',(SELECT state FROM dqa_private.business_mail_outbox WHERE id=message_id),'replayed',true);END IF;
 IF NOT dqa_private.business_mail_eligible(p_tenant,mid,NULL,'TEST',p_system,'',0) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_DISABLED';END IF;
 IF NOT EXISTS(SELECT 1 FROM dqa_private.business_mail_policy p JOIN dqa_private.business_mail_worker w USING(tenant_id) WHERE p.tenant_id=p_tenant AND p.enabled AND w.ready AND w.heartbeat_at>clock_timestamp()-interval '3 minutes') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NOTIFICATION_SERVICE_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND recipient_id=mid AND kind='TEST' AND created_at>clock_timestamp()-interval '1 minute') OR (SELECT count(*) FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND recipient_id=mid AND kind='TEST' AND created_at>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date AT TIME ZONE 'Asia/Taipei')>=5 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='NOTIFICATION_RATE_LIMITED';END IF;
 INSERT INTO dqa_private.business_mail_outbox(tenant_id,recipient_id,kind,system,event_key) VALUES(p_tenant,mid,'TEST',p_system,'test:'||p_operation) RETURNING id INTO message_id;RETURN jsonb_build_object('id',message_id,'state','QUEUED','replayed',false);
END $$;
CREATE FUNCTION dqa_business.notification_status(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mid uuid:=dqa_private.member_id(p_tenant);admin boolean:=dqa_private.is_admin(p_tenant);records jsonb;counts jsonb;
BEGIN
 IF mid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NOTIFICATION_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO records FROM(SELECT o.id,o.kind,o.state,o.code,o.attempts,o.created_at,o.sent_at,CASE WHEN admin OR dqa_private.can_read_request(p_tenant,o.request_id) THEN r.legacy_id ELSE NULL END request_code,m.display_name recipient FROM dqa_private.business_mail_outbox o JOIN dqa_business.memberships m ON m.id=o.recipient_id AND m.tenant_id=o.tenant_id LEFT JOIN dqa_business.requests r ON r.id=o.request_id AND r.tenant_id=o.tenant_id WHERE o.tenant_id=p_tenant AND (admin OR o.recipient_id=mid) ORDER BY o.created_at DESC,o.id LIMIT 30) x;
 SELECT coalesce(jsonb_object_agg(state,n),'{}') INTO counts FROM(SELECT state,count(*) n FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND (admin OR recipient_id=mid) GROUP BY state) x;
 RETURN jsonb_build_object('settings',dqa_business.notification_settings(p_tenant),'records',records,'counts',counts,'scope',CASE WHEN admin THEN 'WORKSPACE' ELSE 'OWN' END);
END $$;
REVOKE ALL ON FUNCTION dqa_business.notification_settings(uuid),dqa_business.save_notification_settings(uuid,uuid,boolean,bigint),dqa_business.test_notification_email(uuid,uuid,uuid,text),dqa_business.notification_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.notification_settings(uuid),dqa_business.save_notification_settings(uuid,uuid,boolean,bigint),dqa_business.test_notification_email(uuid,uuid,uuid,text),dqa_business.notification_status(uuid) TO authenticated;

CREATE FUNCTION dqa_business.business_mail_heartbeat(p_tenant uuid,p_worker uuid,p_ready boolean,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_worker IS NULL OR p_ready IS NULL OR p_code IS NULL OR p_code NOT IN('SMTP_AUTH_READY','SMTP_AUTH_REJECTED','SMTP_CONNECTION_UNAVAILABLE','MAIL_RPC_UNAVAILABLE','WORKER_STOPPED') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_FIELDS_INVALID';END IF;
 INSERT INTO dqa_private.business_mail_worker(tenant_id,worker_id,ready,code) VALUES(p_tenant,p_worker,p_ready,p_code) ON CONFLICT(tenant_id) DO UPDATE SET worker_id=p_worker,ready=p_ready,code=p_code,heartbeat_at=clock_timestamp();RETURN true;
END $$;
CREATE FUNCTION dqa_business.claim_business_mail(p_tenant uuid,p_worker uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_private.business_mail_outbox;email text;request_code text;count_skipped integer:=0;
BEGIN
 IF p_worker IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('business-mail-dispatch:'||p_tenant,0));
 UPDATE dqa_private.business_mail_outbox SET state='UNKNOWN',code='WORKER_LEASE_EXPIRED' WHERE tenant_id=p_tenant AND state='SENDING' AND lease_until<clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM dqa_private.business_mail_policy p JOIN dqa_private.business_mail_worker w USING(tenant_id) WHERE p.tenant_id=p_tenant AND p.enabled AND w.worker_id=p_worker AND w.ready AND w.heartbeat_at>clock_timestamp()-interval '3 minutes') THEN RETURN jsonb_build_object('state','PAUSED');END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND state='SENDING') THEN RETURN jsonb_build_object('state','BUSY');END IF;
 IF (SELECT count(*) FROM dqa_private.business_mail_deliveries WHERE tenant_id=p_tenant AND state='SENT' AND created_at>(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date AT TIME ZONE 'Asia/Taipei')>=(SELECT daily_limit FROM dqa_private.business_mail_policy WHERE tenant_id=p_tenant) THEN RETURN jsonb_build_object('state','DAILY_LIMIT');END IF;
 LOOP
  SELECT * INTO item FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND state='QUEUED' AND next_attempt_at<=clock_timestamp() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','EMPTY');END IF;
  IF item.created_at<clock_timestamp()-interval '7 days' OR NOT dqa_private.business_mail_eligible(p_tenant,item.recipient_id,item.request_id,item.kind,item.system,item.permission,item.review_level) THEN UPDATE dqa_private.business_mail_outbox SET state='SKIPPED',code='RECIPIENT_OR_EVENT_NO_LONGER_ELIGIBLE' WHERE id=item.id;count_skipped:=count_skipped+1;IF count_skipped>=20 THEN RETURN jsonb_build_object('state','SKIPPED_BATCH');END IF;CONTINUE;END IF;
  SELECT login_email INTO email FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=item.recipient_id;SELECT legacy_id INTO request_code FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=item.request_id;
  UPDATE dqa_private.business_mail_outbox SET state='SENDING',dispatch_id=gen_random_uuid(),worker_id=p_worker,attempts=attempts+1,lease_until=clock_timestamp()+interval '90 seconds',authorized_at=NULL WHERE id=item.id RETURNING * INTO item;
  RETURN jsonb_build_object('state','DISPATCH_GRANTED','id',item.id,'dispatch_id',item.dispatch_id,'email',email,'request_code',request_code,'kind',item.kind,'system',item.system,'event_state',item.event_state,'created_at',item.created_at);
 END LOOP;
END $$;
CREATE FUNCTION dqa_business.finish_business_mail(p_tenant uuid,p_id uuid,p_worker uuid,p_dispatch uuid,p_state text,p_code text,p_retryable boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_private.business_mail_outbox;
BEGIN
 IF p_state IS NULL OR p_state NOT IN('SENT','FAILED','UNKNOWN','SKIPPED') OR p_code IS NULL OR p_code!~'^[A-Z0-9_]{1,80}$' OR p_retryable IS NULL OR p_retryable AND p_state<>'FAILED' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_FIELDS_INVALID';END IF;
 SELECT * INTO item FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND id=p_id AND state='SENDING' AND worker_id=p_worker AND dispatch_id=p_dispatch FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;
 IF p_state='SENT' AND item.authorized_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOTIFICATION_DISPATCH_EVIDENCE_REQUIRED';END IF;
 UPDATE dqa_private.business_mail_outbox SET state=CASE WHEN p_state='FAILED' AND p_retryable AND attempts<3 THEN 'QUEUED' ELSE p_state END,code=p_code,sent_at=CASE WHEN p_state='SENT' THEN clock_timestamp() ELSE NULL END,next_attempt_at=clock_timestamp()+interval '2 minutes' WHERE id=p_id;
 INSERT INTO dqa_private.business_mail_deliveries(tenant_id,message_id,dispatch_id,state,code) VALUES(p_tenant,p_id,p_dispatch,p_state,p_code);RETURN true;
END $$;
REVOKE ALL ON FUNCTION dqa_business.business_mail_heartbeat(uuid,uuid,boolean,text),dqa_business.claim_business_mail(uuid,uuid),dqa_business.finish_business_mail(uuid,uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.business_mail_heartbeat(uuid,uuid,boolean,text),dqa_business.claim_business_mail(uuid,uuid),dqa_business.finish_business_mail(uuid,uuid,uuid,uuid,text,text,boolean) TO service_role;

-- A second durable fence immediately before SMTP DATA, after fresh opt-in/access checks.
CREATE FUNCTION dqa_business.authorize_business_mail(p_tenant uuid,p_id uuid,p_worker uuid,p_dispatch uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item dqa_private.business_mail_outbox;
BEGIN
 SELECT * INTO item FROM dqa_private.business_mail_outbox WHERE tenant_id=p_tenant AND id=p_id AND state='SENDING' AND worker_id=p_worker AND dispatch_id=p_dispatch AND authorized_at IS NULL AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM dqa_private.business_mail_policy WHERE tenant_id=p_tenant AND enabled) OR NOT dqa_private.business_mail_eligible(p_tenant,item.recipient_id,item.request_id,item.kind,item.system,item.permission,item.review_level) THEN RETURN false;END IF;
 UPDATE dqa_private.business_mail_outbox SET authorized_at=clock_timestamp() WHERE id=p_id;RETURN true;
END $$;
REVOKE ALL ON FUNCTION dqa_business.authorize_business_mail(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.authorize_business_mail(uuid,uuid,uuid,uuid) TO service_role;
CREATE FUNCTION dqa_private.business_mail_receipt_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;who record;actor uuid:=dqa_private.member_id(NEW.tenant_id);
BEGIN
 IF NEW.received_at IS NULL OR OLD.received_at IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
 FOR who IN SELECT m.id,r.systems FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=NEW.tenant_id AND m.id IN(q.owner_member_id,q.supervisor_member_id) LOOP
 PERFORM dqa_private.queue_business_mail(NEW.tenant_id,q.id,who.id,actor,'LAB_RECEIVED',CASE WHEN 'request'=ANY(who.systems) THEN 'request' WHEN 'lms'=ANY(who.systems) THEN 'lms' ELSE 'lab' END,'',0,'receipt:'||NEW.id||':'||NEW.revision,NEW.status);END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER queue_business_receipt_email AFTER UPDATE OF received_at ON dqa_business.schedules FOR EACH ROW EXECUTE FUNCTION dqa_private.business_mail_receipt_event();
REVOKE ALL ON FUNCTION dqa_private.business_mail_receipt_event() FROM PUBLIC,anon,authenticated,service_role;
