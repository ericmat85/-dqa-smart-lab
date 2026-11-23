-- Authenticated AI advice journal. Models cannot mutate laboratory business tables.
CREATE TABLE dqa_private.business_ai_operations(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,
 member_id uuid NOT NULL,member_revision bigint NOT NULL,role_id uuid NOT NULL,role_revision bigint NOT NULL,
 session_id uuid NOT NULL,engine text NOT NULL CHECK(engine IN('E1','E2','E3','E4')),system text NOT NULL CHECK(system IN('lms','lab','request')),
 input jsonb NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=20000),fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'PREPARED' CHECK(state IN('PREPARED','DISPATCHED','SUCCEEDED','FAILED','UNKNOWN')),
 context_sha256 text,source_data jsonb,request_refs jsonb NOT NULL DEFAULT '[]',result jsonb,error_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,PRIMARY KEY(tenant_id,id)
);
CREATE INDEX business_ai_actor_recent ON dqa_private.business_ai_operations(tenant_id,actor_id,created_at DESC);
ALTER TABLE dqa_private.business_ai_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.business_ai_operations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_private.business_ai_authorized(p_tenant uuid,p_engine text,p_system text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.id=dqa_private.member_id(p_tenant) AND m.tenant_id=p_tenant AND p_system=ANY(r.systems) AND
 (p_engine='E4' OR p_engine='E1' AND ('requests'=ANY(r.pages) OR 'reports'=ANY(r.pages)) OR p_engine='E2' AND p_system='lms' AND 'schedule'=ANY(r.pages) AND dqa_private.can(p_tenant,'schedules.plan') OR p_engine='E3' AND p_system='lms' AND 'reports'=ANY(r.pages)))
$$;
REVOKE ALL ON FUNCTION dqa_private.business_ai_authorized(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION dqa_business.prepare_business_ai(p_tenant uuid,p_operation uuid,p_engine text,p_system text,p_input jsonb,p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old dqa_private.business_ai_operations;m dqa_business.memberships;r dqa_business.roles;fp text;
BEGIN
 IF p_operation IS NULL OR p_engine IS NULL OR p_engine NOT IN('E1','E2','E3','E4') OR p_system IS NULL OR p_system NOT IN('lms','lab','request') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>20000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';END IF;
 IF NOT dqa_private.business_ai_authorized(p_tenant,p_engine,p_system) OR NOT EXISTS(SELECT 1 FROM dqa_private.browser_sessions WHERE id=p_session AND tenant_id=p_tenant AND auth_user_id=auth.uid() AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('business-ai:'||p_tenant||':'||p_operation,0));
 fp:=encode(sha256(convert_to(jsonb_build_object('engine',p_engine,'system',p_system,'input',p_input)::text,'UTF8')),'hex');
 SELECT * INTO old FROM dqa_private.business_ai_operations WHERE tenant_id=p_tenant AND id=p_operation FOR UPDATE;
 IF FOUND THEN
  IF old.actor_id<>auth.uid() OR old.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_OPERATION_CONFLICT';END IF;
  RETURN jsonb_build_object('state',old.state,'operation_id',old.id,'dispatch',old.state='PREPARED');
 END IF;
 IF (SELECT count(*) FROM dqa_private.business_ai_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '1 minute')>=6 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='AI_RATE_LIMITED';END IF;
 SELECT * INTO m FROM dqa_business.memberships WHERE id=dqa_private.member_id(p_tenant);SELECT * INTO r FROM dqa_business.roles WHERE id=m.role_id AND tenant_id=p_tenant;
 INSERT INTO dqa_private.business_ai_operations(tenant_id,id,actor_id,member_id,member_revision,role_id,role_revision,session_id,engine,system,input,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),m.id,m.revision,r.id,r.revision,p_session,p_engine,p_system,p_input,fp);
 RETURN jsonb_build_object('state','PREPARED','operation_id',p_operation,'dispatch',true);
END $$;
CREATE FUNCTION dqa_business.claim_business_ai(p_tenant uuid,p_operation uuid,p_actor uuid,p_context_sha256 text,p_request_refs jsonb,p_source_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_context_sha256 IS NULL OR p_context_sha256!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_request_refs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_request_refs)>100 OR jsonb_typeof(p_source_data) IS DISTINCT FROM 'object' OR octet_length(p_source_data::text)>200000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';END IF;
 UPDATE dqa_private.business_ai_operations o SET state='DISPATCHED',context_sha256=p_context_sha256,request_refs=p_request_refs,source_data=p_source_data WHERE o.tenant_id=p_tenant AND o.id=p_operation AND o.actor_id=p_actor AND o.state='PREPARED' AND o.created_at>clock_timestamp()-interval '2 minutes' AND EXISTS(SELECT 1 FROM dqa_private.browser_sessions s WHERE s.id=o.session_id AND s.tenant_id=p_tenant AND s.auth_user_id=p_actor AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) AND EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.id=o.member_id AND m.enabled AND m.deleted_at IS NULL AND m.revision=o.member_revision AND r.enabled AND r.revision=o.role_revision);
 RETURN FOUND;
END $$;
CREATE FUNCTION dqa_business.finish_business_ai(p_tenant uuid,p_operation uuid,p_actor uuid,p_state text,p_result jsonb,p_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_state IS NULL OR p_state NOT IN('SUCCEEDED','FAILED','UNKNOWN') OR p_result IS NOT NULL AND (jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>200000) OR p_error IS NOT NULL AND p_error!~'^[A-Z0-9_]{1,100}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';END IF;
 IF p_state='SUCCEEDED' AND (p_result IS NULL OR p_result->>'execution_mode' IS DISTINCT FROM 'LIVE_PROVIDER' OR p_result->>'provider' IS DISTINCT FROM 'openai_responses' OR p_result->'real_ai' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_PROVIDER_EVIDENCE_REQUIRED';END IF;
 UPDATE dqa_private.business_ai_operations SET state=p_state,result=p_result,error_code=p_error,finished_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=p_actor AND state IN('PREPARED','DISPATCHED','UNKNOWN');RETURN FOUND;
END $$;
CREATE FUNCTION dqa_business.business_ai_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o dqa_private.business_ai_operations;m dqa_business.memberships;r dqa_business.roles;id_text text;
BEGIN
 SELECT * INTO o FROM dqa_private.business_ai_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid();IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND');END IF;
 SELECT * INTO m FROM dqa_business.memberships WHERE id=dqa_private.member_id(p_tenant);SELECT * INTO r FROM dqa_business.roles WHERE id=m.role_id AND tenant_id=p_tenant;
 IF NOT dqa_private.business_ai_authorized(p_tenant,o.engine,o.system) OR m.id IS DISTINCT FROM o.member_id OR m.revision IS DISTINCT FROM o.member_revision OR r.revision IS DISTINCT FROM o.role_revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 FOR id_text IN SELECT jsonb_array_elements_text(o.request_refs) LOOP
  IF id_text!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR NOT dqa_private.can_read_request(p_tenant,id_text::uuid) OR NOT dqa_private.case_row_active(p_tenant,'requests',id_text::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 END LOOP;
 RETURN jsonb_build_object('state',o.state,'operation_id',o.id,'engine',o.engine,'data',o.result,'error_code',o.error_code,'created_at',o.created_at,'candidate_source',CASE WHEN o.engine='E2' THEN o.source_data->'candidates' ELSE NULL END);
END $$;
CREATE FUNCTION dqa_business.business_ai_overview(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 RETURN jsonb_build_object('source','DATABASE','records',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,engine,system,state,error_code,created_at,finished_at,result->>'model' model,result->'usage' usage,result->>'estimated_cost_usd' estimated_cost_usd,result->>'trace_id' trace_id FROM dqa_private.business_ai_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() ORDER BY created_at DESC LIMIT 40) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_business_ai(uuid,uuid,text,text,jsonb,uuid),dqa_business.business_ai_result(uuid,uuid),dqa_business.business_ai_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_business_ai(uuid,uuid,text,text,jsonb,uuid),dqa_business.business_ai_result(uuid,uuid),dqa_business.business_ai_overview(uuid) TO authenticated;
REVOKE ALL ON FUNCTION dqa_business.claim_business_ai(uuid,uuid,uuid,text,jsonb,jsonb),dqa_business.finish_business_ai(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dqa_business.claim_business_ai(uuid,uuid,uuid,text,jsonb,jsonb),dqa_business.finish_business_ai(uuid,uuid,uuid,text,jsonb,text) TO service_role;

-- Read-only candidate search delegates every feasibility check to the existing planner.
CREATE FUNCTION dqa_business.business_ai_schedule_candidates(p_tenant uuid,p_request uuid,p_options jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;t dqa_business.trial_definitions;eq dqa_business.equipment;person record;d date;e date;first_day date;last_day date;ids uuid[];versions jsonb;command jsonb;plan jsonb;items jsonb:='[]';tries integer:=0;count_needed integer;draft_revision bigint;patterns jsonb:='{"HIGH_HUMIDITY":"恆溫恆濕|環境試驗箱","HIGH_TEMPERATURE":"環境試驗箱|恆溫恆濕|高溫爐","LOW_TEMPERATURE":"環境試驗箱|恆溫恆濕","THERMAL_CYCLE":"環境試驗箱|恆溫恆濕","HUMIDITY_CYCLE":"環境試驗箱|恆溫恆濕","THERMAL_SHOCK":"冷熱衝擊","VIBRATION_DURABILITY":"振動","SALT_SPRAY":"鹽霧","WATER_INGRESS":"防水","ESD":"ESD","EMC":"EMC|電磁相容","WEATHERING":"耐候","DUST":"防塵","TENSILE":"拉力","INSPECTION":"顯微鏡","MECHANICAL_SHOCK":"機械衝擊","DROP":"跌落","INSERTION":"插拔","VOLTAGE":"電源|電壓"}';
BEGIN
 IF NOT dqa_private.business_ai_authorized(p_tenant,'E2','lms') OR NOT dqa_private.can_read_request(p_tenant,p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request AND dqa_private.case_row_active(p_tenant,'requests',id);
 IF NOT FOUND OR q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_APPROVAL_REQUIRED';END IF;
 IF jsonb_typeof(p_options) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_options) k WHERE k NOT IN('earliest','latest','equipment_count','sample_code','preparation_minutes','cleanup_minutes','preferred_equipment_ids')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';END IF;
 first_day:=coalesce(nullif(p_options->>'earliest','')::date,(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date+1);last_day:=coalesce(nullif(p_options->>'latest','')::date,first_day+13);count_needed:=coalesce((p_options->>'equipment_count')::integer,1);
 IF first_day<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR last_day<first_day OR last_day>first_day+31 OR count_needed NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_DATE_INVALID';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id AND enabled;IF NOT FOUND OR NOT(patterns?t.profile_code) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLANNING_SOURCE_INCOMPLETE';END IF;
 SELECT coalesce(max(revision),0) INTO draft_revision FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id;
 FOR d IN SELECT generate_series(first_day,last_day,interval '1 day')::date LOOP
  FOR eq IN SELECT * FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY x.id LOOP
   SELECT array_agg(z.id ORDER BY z.is_first DESC,z.id),jsonb_object_agg(z.id::text,z.revision) INTO ids,versions FROM (SELECT x.id,x.revision,(x.id=eq.id) is_first FROM dqa_business.equipment x WHERE x.tenant_id=p_tenant AND x.operational_status='IDLE' AND (x.name||' '||coalesce(x.category,'')||' '||coalesce(x.model,''))~*(patterns->>t.profile_code) ORDER BY (x.id=eq.id) DESC,x.id LIMIT count_needed) z;
   IF cardinality(ids)<>count_needed THEN CONTINUE;END IF;
   FOR person IN SELECT m.id,m.display_name,m.revision FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id JOIN auth.users u ON u.id=m.auth_user_id WHERE m.tenant_id=p_tenant AND m.enabled AND m.deleted_at IS NULL AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL ORDER BY m.id LIMIT 6 LOOP
    FOR e IN SELECT generate_series(d,last_day,interval '1 day')::date LOOP
     tries:=tries+1;IF tries>160 OR jsonb_array_length(items)>=4 THEN RETURN jsonb_build_object('candidates',items,'checks',tries-1,'complete',jsonb_array_length(items)>=4,'search_limited',tries>160);END IF;
     command:=jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',draft_revision,'data',jsonb_build_object('equipment_ids',to_jsonb(ids),'equipment_revisions',versions,'executor_id',person.id,'executor_revision',person.revision,'start_date',d,'end_date',e,'sample_code',coalesce(nullif(btrim(p_options->>'sample_code'),''),'SMP-'||coalesce(q.legacy_id,q.id::text)),'note','','preparation_minutes',coalesce((p_options->>'preparation_minutes')::integer,0),'cleanup_minutes',coalesce((p_options->>'cleanup_minutes')::integer,0)));
     BEGIN plan:=dqa_private.schedule_draft_plan(p_tenant,command);EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN CONTINUE;END;
     items:=items||jsonb_build_array(jsonb_build_object('id','C'||(jsonb_array_length(items)+1),'command',command,'plan',plan));EXIT;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('candidates',items,'checks',tries,'complete',true,'search_limited',false);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI_FIELDS_INVALID';
END $$;
CREATE FUNCTION dqa_business.validate_business_ai_schedule(p_tenant uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN dqa_private.schedule_draft_plan(p_tenant,p_command);END $$;
REVOKE ALL ON FUNCTION dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb),dqa_business.validate_business_ai_schedule(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb),dqa_business.validate_business_ai_schedule(uuid,jsonb) TO authenticated;

CREATE TABLE dqa_private.business_ai_conversation_marks(tenant_id uuid NOT NULL,actor_id uuid NOT NULL,system text NOT NULL,cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,actor_id,system));
ALTER TABLE dqa_private.business_ai_conversation_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.business_ai_conversation_marks FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.clear_business_ai_conversation(p_tenant uuid,p_system text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT dqa_private.business_ai_authorized(p_tenant,'E4',p_system) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 INSERT INTO dqa_private.business_ai_conversation_marks(tenant_id,actor_id,system) VALUES(p_tenant,auth.uid(),p_system) ON CONFLICT(tenant_id,actor_id,system) DO UPDATE SET cleared_at=clock_timestamp();RETURN true;
END $$;
CREATE FUNCTION dqa_business.business_ai_conversation(p_tenant uuid,p_system text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o record;items jsonb:='[]';mid uuid;mr bigint;rr bigint;
BEGIN
 IF NOT dqa_private.business_ai_authorized(p_tenant,'E4',p_system) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AI_ACCESS_DENIED';END IF;
 SELECT m.id,m.revision,r.revision INTO mid,mr,rr FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.id=dqa_private.member_id(p_tenant);
 FOR o IN SELECT * FROM dqa_private.business_ai_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND system=p_system AND engine='E4' AND state='SUCCEEDED' AND created_at>greatest(clock_timestamp()-interval '30 minutes',coalesce((SELECT cleared_at FROM dqa_private.business_ai_conversation_marks WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND system=p_system),'-infinity'::timestamptz)) AND member_id=mid AND member_revision=mr AND role_revision=rr ORDER BY created_at DESC LIMIT 2 LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(o.request_refs) id_text WHERE NOT dqa_private.can_read_request(p_tenant,id_text::uuid) OR NOT dqa_private.case_row_active(p_tenant,'requests',id_text::uuid)) THEN items:=items||jsonb_build_array(jsonb_build_object('question',o.input->>'question','reply',o.result->'result'->>'summary'));END IF;
 END LOOP;RETURN items;
END $$;
REVOKE ALL ON FUNCTION dqa_business.clear_business_ai_conversation(uuid,text),dqa_business.business_ai_conversation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.clear_business_ai_conversation(uuid,text),dqa_business.business_ai_conversation(uuid,text) TO authenticated;
