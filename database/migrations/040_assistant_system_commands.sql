-- Typed assistant commands. Installation never executes cleanup or restart.
CREATE TABLE dqa_private.assistant_command_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 actor_id uuid NOT NULL,action text NOT NULL CHECK(action IN('CLEANUP','RESTART')),fingerprint text NOT NULL,
 counts jsonb NOT NULL,state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN('PLANNED','VERIFYING','REJECTED','SAVED')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes'
);
CREATE TABLE dqa_private.assistant_delete_permits(transaction_id bigint NOT NULL,table_name text NOT NULL,row_key jsonb NOT NULL,PRIMARY KEY(transaction_id,table_name,row_key));
REVOKE ALL ON dqa_private.assistant_command_plans,dqa_private.assistant_delete_permits FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE dqa_private.assistant_command_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.assistant_delete_permits ENABLE ROW LEVEL SECURITY;
-- Immutable histories retain their ordinary protection. Only an exact row selected
-- by a confirmed command in this transaction may be removed by the owner RPC.
CREATE OR REPLACE FUNCTION dqa_private.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM dqa_private.assistant_delete_permits WHERE transaction_id=txid_current() AND table_name=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME AND to_jsonb(OLD) @> row_key) THEN RETURN OLD; END IF;
 RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='APPEND_ONLY_RECORD';
END $$;
-- This explicit list excludes accounts, settings, trial/resource masters, images,
-- mail configuration, authentication and command receipts.
CREATE FUNCTION dqa_private.assistant_command_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT ARRAY[
 'dqa_business.requests','dqa_business.request_samples','dqa_business.schedules','dqa_business.schedule_equipment','dqa_business.lab_operations','dqa_business.artifacts','dqa_business.artifact_versions','dqa_business.reports','dqa_business.report_versions','dqa_business.approval_events','dqa_business.request_document_versions','dqa_business.request_signatures','dqa_business.report_signatures','dqa_business.schedule_drafts','dqa_business.quality_records','dqa_business.request_projects','dqa_business.borrows','dqa_business.material_transactions','dqa_business.resource_events','dqa_business.audit_events','dqa_business.import_rows',
 'dqa_private.flow_test_runs','dqa_private.flow_test_events','dqa_private.flow_test_operations','dqa_private.virtual_trial_events','dqa_private.virtual_permits','dqa_private.request_operations','dqa_private.request_transition_permits','dqa_private.human_operations','dqa_private.report_upload_intents','dqa_private.schedule_draft_operations','dqa_private.schedule_start_events','dqa_private.schedule_start_permits','dqa_private.project_request_operations','dqa_private.resource_operations','dqa_private.finance_links','dqa_private.finance_files','dqa_private.finance_costs','dqa_private.finance_vouchers','dqa_private.finance_events','dqa_private.finance_operations','dqa_private.business_ai_operations','dqa_private.business_ai_conversation_marks','dqa_private.business_mail_deliveries','dqa_private.business_mail_outbox','dqa_private.case_recycle_items','dqa_private.case_recycle_runs','dqa_private.case_cleanup_plans'
 ]::text[] $$;
REVOKE ALL ON FUNCTION dqa_private.assistant_command_tables() FROM PUBLIC,anon,authenticated,service_role;
-- Defer only existing NO ACTION FKs inside the operational graph, allowing its
-- document-version cycles to be deleted atomically. No trigger is disabled.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conrelid::regclass tab,conname FROM pg_constraint WHERE contype='f' AND confdeltype='a' AND conrelid=ANY(ARRAY(SELECT to_regclass(x) FROM unnest(dqa_private.assistant_command_tables()) x)) LOOP
 EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',c.tab,c.conname);
 END LOOP;
END $$;
CREATE FUNCTION dqa_business.assistant_virtual_requests(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ACCESS_DENIED'; END IF;
 WITH visible AS (SELECT r.id,r.status FROM dqa_business.requests r WHERE r.tenant_id=p_tenant AND r.execution_kind='VIRTUAL' AND dqa_private.can_read_request(p_tenant,r.id)),counts AS(SELECT status,count(*) n FROM visible GROUP BY status)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM visible),'active',(SELECT count(*) FROM visible WHERE status NOT IN('CLOSED','CANCELLED')),'running',(SELECT count(*) FROM visible WHERE status='RUNNING'),'by_status',coalesce((SELECT jsonb_object_agg(status,n) FROM counts),'{}'::jsonb),'scope',CASE WHEN dqa_private.is_admin(p_tenant) OR dqa_private.can(p_tenant,'requests.read_all') THEN 'WORKSPACE' ELSE 'PERMITTED_REQUESTS' END,'deduplicated',true,'source','DATABASE') INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.assistant_virtual_requests(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.assistant_virtual_requests(uuid) TO authenticated;
-- Build exact primary-key targets. CLEANUP starts only from immutable VIRTUAL
-- native roots, then follows real foreign keys to their dependents. Unknown and
-- legacy labels never qualify as virtual; no client-supplied record IDs are used.
CREATE FUNCTION dqa_private.assistant_command_targets(p_tenant uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE targets jsonb:='[]';batch jsonb;before_count integer;tab text;pk text;predicate text;c record;joins text;parent_key text;counts jsonb;
BEGIN
 FOREACH tab IN ARRAY dqa_private.assistant_command_tables() LOOP
 IF to_regclass(tab) IS NULL THEN RAISE EXCEPTION 'COMMAND_SCHEMA_INCOMPLETE';END IF;
 SELECT string_agg(format('%L,to_jsonb(t)->%L',a.attname,a.attname),',' ORDER BY k.ordinality) INTO pk FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=to_regclass(tab) AND i.indisprimary;
 IF pk IS NULL THEN RAISE EXCEPTION 'COMMAND_SCHEMA_INCOMPLETE'; END IF;
 predicate:=CASE WHEN p_action='CLEANUP' THEN CASE WHEN tab='dqa_business.requests' THEN 't.execution_kind=''VIRTUAL''' ELSE 'false' END ELSE 'true' END;
 IF p_action='RESTART' AND tab='dqa_business.artifacts' THEN predicate:='t.request_id IS NOT NULL'; END IF;
 IF p_action='RESTART' AND tab='dqa_business.artifact_versions' THEN predicate:='EXISTS(SELECT 1 FROM dqa_business.artifacts a WHERE a.tenant_id=t.tenant_id AND a.id=t.artifact_id AND a.request_id IS NOT NULL)'; END IF;
 IF p_action='RESTART' AND tab='dqa_business.import_rows' THEN predicate:='t.source_collection IN(''reviews'',''electronic'',''schedules'',''labOperations'',''labWorkItems'',''labAudit'',''cancellations'',''_source_envelope'')'; END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''table'',%L,''key'',jsonb_build_object(%s),''hash'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''))),''[]''::jsonb) FROM %s t WHERE t.tenant_id=$1 AND (%s)',tab,pk,tab,predicate) INTO batch USING p_tenant;
 targets:=targets||batch;
 END LOOP;
 IF p_action='CLEANUP' THEN
 LOOP
 before_count:=jsonb_array_length(targets);
 FOR c IN SELECT conrelid::regclass child,confrelid::regclass parent,conkey,confkey FROM pg_constraint WHERE contype='f' AND conrelid=ANY(ARRAY(SELECT to_regclass(x) FROM unnest(dqa_private.assistant_command_tables()) x)) AND confrelid=ANY(ARRAY(SELECT to_regclass(x) FROM unnest(dqa_private.assistant_command_tables()) x)) LOOP
 SELECT string_agg(format('t.%I=p.%I',a.attname,b.attname),' AND ') INTO joins FROM unnest(c.conkey,c.confkey) k(a,b) JOIN pg_attribute a ON a.attrelid=c.child AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=c.parent AND b.attnum=k.b;
 SELECT string_agg(format('%L,to_jsonb(p)->%L',a.attname,a.attname),',' ORDER BY k.ordinality) INTO parent_key FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=c.parent AND i.indisprimary;
 SELECT string_agg(format('%L,to_jsonb(t)->%L',a.attname,a.attname),',' ORDER BY k.ordinality) INTO pk FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=c.child AND i.indisprimary;
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''table'',%L,''key'',jsonb_build_object(%s),''hash'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''))),''[]''::jsonb) FROM %s t WHERE t.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) x WHERE x->>''table''=%L AND x->''key''=jsonb_build_object(%s)) AND EXISTS(SELECT 1 FROM %s p JOIN jsonb_array_elements($2) x ON x->>''table''=%L AND x->''key''=jsonb_build_object(%s) WHERE %s AND p.tenant_id=$1)',c.child::text,pk,c.child,c.child::text,pk,c.parent,c.parent::text,parent_key,joins) INTO batch USING p_tenant,targets;
 targets:=targets||batch;
 END LOOP;
 EXIT WHEN jsonb_array_length(targets)=before_count;
 IF jsonb_array_length(targets)>30000 THEN RAISE EXCEPTION 'COMMAND_BATCH_TOO_LARGE';END IF;
 END LOOP;
 END IF;
 IF jsonb_array_length(targets)>30000 THEN RAISE EXCEPTION 'COMMAND_BATCH_TOO_LARGE';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'table',value->'key'),'[]') INTO targets FROM jsonb_array_elements(targets);
 SELECT coalesce(jsonb_object_agg(q.tab,q.n),'{}') INTO counts FROM(SELECT value->>'table' tab,count(*) n FROM jsonb_array_elements(targets) GROUP BY 1) q;
 RETURN jsonb_build_object('targets',targets,'counts',counts,'requests',coalesce((counts->>'dqa_business.requests')::integer,0));
END $$;
REVOKE ALL ON FUNCTION dqa_private.assistant_command_targets(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.preview_assistant_command(p_tenant uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE data jsonb;plan dqa_private.assistant_command_plans;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ADMIN_REQUIRED';END IF;
 IF p_action NOT IN('CLEANUP','RESTART') OR p_action IS NULL THEN RAISE EXCEPTION 'COMMAND_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-command:'||p_tenant,0));
 IF (SELECT count(*) FROM dqa_private.assistant_command_plans WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '15 minutes' AND action=p_action)>=(CASE WHEN p_action='RESTART' THEN 5 ELSE 30 END) THEN RAISE EXCEPTION 'COMMAND_RATE_LIMITED'; END IF;
 data:=dqa_private.assistant_command_targets(p_tenant,p_action);
 INSERT INTO dqa_private.assistant_command_plans(tenant_id,actor_id,action,fingerprint,counts) VALUES(p_tenant,auth.uid(),p_action,encode(sha256(convert_to(data::text,'UTF8')),'hex'),data->'counts') RETURNING * INTO plan;
 RETURN jsonb_build_object('id',plan.id,'action',plan.action,'fingerprint',plan.fingerprint,'counts',plan.counts,'requests',data->'requests','expires_at',plan.expires_at,'state',plan.state);
END $$;
REVOKE ALL ON FUNCTION dqa_business.preview_assistant_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.preview_assistant_command(uuid,text) TO authenticated;
CREATE FUNCTION dqa_business.assistant_command_result(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE plan dqa_private.assistant_command_plans; BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ADMIN_REQUIRED';END IF;
 SELECT * INTO plan FROM dqa_private.assistant_command_plans WHERE id=p_id AND tenant_id=p_tenant AND actor_id=auth.uid();IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_NOT_FOUND';END IF;
 RETURN jsonb_build_object('id',plan.id,'action',plan.action,'state',CASE WHEN plan.state NOT IN('SAVED','REJECTED') AND plan.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE plan.state END,'result',plan.result);
END $$;
REVOKE ALL ON FUNCTION dqa_business.assistant_command_result(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.assistant_command_result(uuid,uuid) TO authenticated;
CREATE FUNCTION dqa_private.apply_assistant_command(p_tenant uuid,p_id uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan dqa_private.assistant_command_plans;data jsonb;tab text;entry jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-command:'||p_tenant,0));
 SELECT * INTO plan FROM dqa_private.assistant_command_plans WHERE id=p_id AND tenant_id=p_tenant AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_NOT_FOUND';END IF;
 IF plan.state='SAVED' THEN RETURN plan.result;END IF;
 IF plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'COMMAND_EXPIRED';END IF;
 -- Lock the explicit operational graph against concurrent writes before comparing
 -- the preview. A new/changed request makes the entire operation roll back.
 FOREACH tab IN ARRAY dqa_private.assistant_command_tables() LOOP EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',tab);END LOOP;
 IF plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'COMMAND_EXPIRED';END IF;
 data:=dqa_private.assistant_command_targets(p_tenant,plan.action);
 IF encode(sha256(convert_to(data::text,'UTF8')),'hex')<>plan.fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='COMMAND_PREVIEW_STALE';END IF;
 INSERT INTO dqa_private.assistant_delete_permits(transaction_id,table_name,row_key) SELECT txid_current(),value->>'table',value->'key' FROM jsonb_array_elements(data->'targets');
 SET CONSTRAINTS ALL DEFERRED;
 FOREACH tab IN ARRAY dqa_private.assistant_command_tables() LOOP
 EXECUTE format('DELETE FROM %s t WHERE t.tenant_id=$1 AND EXISTS(SELECT 1 FROM dqa_private.assistant_delete_permits p WHERE p.transaction_id=txid_current() AND p.table_name=$2 AND to_jsonb(t) @> p.row_key)',tab) USING p_tenant,tab;
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
 DELETE FROM dqa_private.assistant_delete_permits WHERE transaction_id=txid_current();
 data:=jsonb_build_object('id',plan.id,'action',plan.action,'state','SAVED','requests',data->'requests','counts',data->'counts','completed_at',clock_timestamp());
 UPDATE dqa_private.assistant_command_plans SET state='SAVED',result=data WHERE id=p_id;
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,p_actor,current_user,'assistant_command_plans',p_id,'INSERT',ARRAY[plan.action,'counts']);
 RETURN data;
END $$;
REVOKE ALL ON FUNCTION dqa_private.apply_assistant_command(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.execute_assistant_cleanup(p_tenant uuid,p_id uuid,p_fingerprint text,p_confirmation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan dqa_private.assistant_command_plans;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ADMIN_REQUIRED';END IF;
 SELECT * INTO plan FROM dqa_private.assistant_command_plans WHERE id=p_id AND tenant_id=p_tenant AND actor_id=auth.uid();
 IF NOT FOUND OR plan.action<>'CLEANUP' OR plan.fingerprint IS DISTINCT FROM p_fingerprint OR p_confirmation IS DISTINCT FROM '刪除所有虛擬委託' THEN RAISE EXCEPTION 'COMMAND_CONFIRMATION_INVALID';END IF;
 RETURN dqa_private.apply_assistant_command(p_tenant,p_id,auth.uid());
END $$;
REVOKE ALL ON FUNCTION dqa_business.execute_assistant_cleanup(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.execute_assistant_cleanup(uuid,uuid,text,text) TO authenticated;
CREATE FUNCTION dqa_business.prepare_assistant_restart(p_tenant uuid,p_id uuid,p_fingerprint text,p_confirmation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan dqa_private.assistant_command_plans;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ADMIN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-command:'||p_tenant,0));
 SELECT * INTO plan FROM dqa_private.assistant_command_plans WHERE id=p_id AND tenant_id=p_tenant AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR plan.action<>'RESTART' OR plan.fingerprint IS DISTINCT FROM p_fingerprint OR p_confirmation IS DISTINCT FROM '初始化系統' THEN RAISE EXCEPTION 'COMMAND_CONFIRMATION_INVALID';END IF;
 IF plan.state='SAVED' THEN RETURN plan.result;END IF;
 IF plan.state<>'PLANNED' OR plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'COMMAND_EXPIRED';END IF;
 UPDATE dqa_private.assistant_command_plans SET state='VERIFYING' WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'reauth_granted',true);
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_assistant_restart(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_assistant_restart(uuid,uuid,text,text) TO authenticated;
-- Auth password verification is performed only by the server. Browser JWTs,
-- including administrators, cannot invoke this completion RPC.
CREATE FUNCTION dqa_business.complete_assistant_restart(p_tenant uuid,p_id uuid,p_actor uuid,p_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan dqa_private.assistant_command_plans;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-command:'||p_tenant,0));
 SELECT * INTO plan FROM dqa_private.assistant_command_plans WHERE id=p_id AND tenant_id=p_tenant AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_NOT_FOUND';END IF;
 IF plan.state='SAVED' THEN RETURN plan.result;END IF;
 IF plan.state<>'VERIFYING' OR plan.action<>'RESTART' OR plan.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=p_tenant AND m.auth_user_id=p_actor AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND r.is_tenant_admin) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMAND_ADMIN_REQUIRED';END IF;
 IF p_outcome IS DISTINCT FROM 'DELETE' THEN UPDATE dqa_private.assistant_command_plans SET state='REJECTED',result=jsonb_build_object('id',p_id,'state','REJECTED','code',CASE WHEN p_outcome='PASSWORD_INVALID' THEN 'ADMIN_PASSWORD_INVALID' ELSE 'ADMIN_REAUTH_UNAVAILABLE' END) WHERE id=p_id;RETURN jsonb_build_object('id',p_id,'state','REJECTED','code',CASE WHEN p_outcome='PASSWORD_INVALID' THEN 'ADMIN_PASSWORD_INVALID' ELSE 'ADMIN_REAUTH_UNAVAILABLE' END);END IF;
 RETURN dqa_private.apply_assistant_command(p_tenant,p_id,p_actor);
END $$;
REVOKE ALL ON FUNCTION dqa_business.complete_assistant_restart(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.complete_assistant_restart(uuid,uuid,uuid,text) TO service_role;
