-- Shared condition/technical-specification kinds. Defaults are resolved without backfilling live rows.
CREATE TABLE dqa_private.spec_parameter_definitions(tenant_id uuid NOT NULL,kind text NOT NULL,label text NOT NULL,units jsonb NOT NULL,enabled boolean NOT NULL DEFAULT true,revision bigint NOT NULL CHECK(revision>0),PRIMARY KEY(tenant_id,kind));
CREATE TABLE dqa_private.spec_parameter_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,request_sha256 text NOT NULL,result jsonb NOT NULL,expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '5 minutes'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id));
ALTER TABLE dqa_private.spec_parameter_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.spec_parameter_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.spec_parameter_definitions,dqa_private.spec_parameter_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.spec_parameter_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT $defaults$[{"id": "TEMPERATURE", "label": "溫度", "units": ["°C"]}, {"id": "ELECTRICAL", "label": "電性", "units": ["V", "A", "Ω", "W"]}, {"id": "VIBRATION", "label": "振動", "units": ["g", "mm", "m/s²"]}, {"id": "FORCE", "label": "拉力", "units": ["N", "kN"]}, {"id": "HUMIDITY", "label": "濕度", "units": ["%RH"]}, {"id": "FREQUENCY", "label": "頻率", "units": ["Hz", "kHz"]}, {"id": "PRESSURE", "label": "壓力", "units": ["kPa", "MPa"]}, {"id": "OTHER", "label": "其他", "units": ["—"]}]$defaults$::jsonb $$;
CREATE FUNCTION dqa_private.spec_parameter_rows(p_tenant uuid) RETURNS TABLE(kind text,label text,units jsonb,revision bigint,builtin boolean,enabled boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH defaults AS(SELECT v->>'id' kind,v->>'label' label,v->'units' units FROM jsonb_array_elements(dqa_private.spec_parameter_defaults()) v)
 SELECT coalesce(x.kind,d.kind),coalesce(x.label,d.label),coalesce(x.units,d.units),coalesce(x.revision,0),d.kind IS NOT NULL,coalesce(x.enabled,true) FROM defaults d FULL JOIN(SELECT * FROM dqa_private.spec_parameter_definitions WHERE tenant_id=p_tenant)x ON x.kind=d.kind
$$;
CREATE FUNCTION dqa_private.spec_parameter_references(p_tenant uuid) RETURNS TABLE(kind text,unit text,source text,source_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH plans AS(SELECT id,plan,'DRAFT'::text source FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant UNION ALL SELECT id,plan,'SCHEDULE' FROM dqa_business.schedules WHERE tenant_id=p_tenant),checks AS(SELECT id,source,c FROM plans CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(plan->'capability_checks')='array' THEN plan->'capability_checks' ELSE '[]'::jsonb END)c)
 SELECT c->>'kind',c->>'unit','TRIAL',s.trial_id FROM dqa_private.trial_editor_settings s CROSS JOIN LATERAL jsonb_array_elements(s.details->'conditions')c WHERE s.tenant_id=p_tenant
 UNION ALL SELECT c->>'kind',c->>'unit','EQUIPMENT',s.equipment_id FROM dqa_private.equipment_capabilities s CROSS JOIN LATERAL jsonb_array_elements(s.capabilities)c WHERE s.tenant_id=p_tenant
 UNION ALL SELECT v->>'kind',v->>'unit',source,id FROM checks CROSS JOIN LATERAL jsonb_array_elements((CASE WHEN jsonb_typeof(c->'requirements')='array' THEN c->'requirements' ELSE '[]'::jsonb END)||(CASE WHEN jsonb_typeof(c->'capabilities')='array' THEN c->'capabilities' ELSE '[]'::jsonb END))v
$$;
CREATE FUNCTION dqa_private.spec_parameter_usage(p_tenant uuid,p_kind text,p_unit text DEFAULT NULL) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT count(DISTINCT (source,source_id)) FROM dqa_private.spec_parameter_references(p_tenant) WHERE kind=p_kind AND (p_unit IS NULL OR unit=p_unit) $$;
CREATE FUNCTION dqa_private.spec_parameter_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT CASE WHEN dqa_private.can(p_tenant) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',kind,'label',label,'units',units,'revision',revision,'builtin',builtin) ORDER BY builtin DESC,array_position(ARRAY['TEMPERATURE','ELECTRICAL','VIBRATION','FORCE','HUMIDITY','FREQUENCY','PRESSURE','OTHER'],kind),label,kind) FROM dqa_private.spec_parameter_rows(p_tenant) WHERE enabled),'[]'::jsonb) ELSE '[]'::jsonb END $$;
CREATE FUNCTION dqa_business.spec_parameter_context(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'SPEC_PARAMETER_ACCESS_DENIED';END IF;
 WITH refs AS MATERIALIZED(SELECT DISTINCT * FROM dqa_private.spec_parameter_references(p_tenant)) SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.kind,'label',r.label,'units',r.units,'revision',r.revision,'builtin',r.builtin,'usage',jsonb_build_object('trials',(SELECT count(DISTINCT source_id) FROM refs WHERE kind=r.kind AND source='TRIAL'),'equipment',(SELECT count(DISTINCT source_id) FROM refs WHERE kind=r.kind AND source='EQUIPMENT'),'plans',(SELECT count(DISTINCT (source,source_id)) FROM refs WHERE kind=r.kind AND source IN('DRAFT','SCHEDULE'))),'unit_usage',(SELECT coalesce(jsonb_object_agg(u,(SELECT count(DISTINCT (source,source_id)) FROM refs WHERE kind=r.kind AND unit=u)),'{}'::jsonb) FROM jsonb_array_elements_text(r.units)u)) ORDER BY r.builtin DESC,array_position(ARRAY['TEMPERATURE','ELECTRICAL','VIBRATION','FORCE','HUMIDITY','FREQUENCY','PRESSURE','OTHER'],r.kind),r.label,r.kind),'[]'::jsonb) INTO rows FROM dqa_private.spec_parameter_rows(p_tenant)r WHERE r.enabled;
 RETURN jsonb_build_object('rows',rows,'can_manage',true);
END $$;
CREATE FUNCTION dqa_business.prepare_spec_parameter(p_tenant uuid,p_operation uuid,p_member uuid,p_action text,p_kind text,p_expected bigint,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old dqa_private.spec_parameter_operations;fp text;result jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') OR p_member IS DISTINCT FROM dqa_private.member_id(p_tenant) THEN RAISE EXCEPTION 'SPEC_PARAMETER_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('SAVE','DELETE') OR p_kind IS NULL OR p_expected IS NULL OR p_expected<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SPEC_PARAMETER_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spec-parameters:'||p_tenant,0));
 fp:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'kind',p_kind,'expected',p_expected,'data',p_data)::text,'UTF8')),'hex');
 SELECT * INTO old FROM dqa_private.spec_parameter_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF old.actor IS DISTINCT FROM auth.uid() OR old.request_sha256<>fp THEN RAISE EXCEPTION 'SPEC_PARAMETER_OPERATION_CONFLICT';END IF;RETURN old.result;END IF;
 IF (SELECT count(*) FROM dqa_private.spec_parameter_operations WHERE tenant_id=p_tenant AND actor=auth.uid() AND created_at>clock_timestamp()-interval '1 hour')>=60 THEN RAISE EXCEPTION 'SPEC_PARAMETER_RATE_LIMITED';END IF;
 result:=jsonb_build_object('id',p_operation,'state','PLANNED');INSERT INTO dqa_private.spec_parameter_operations(tenant_id,id,actor,request_sha256,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);RETURN result;
END $$;
CREATE FUNCTION dqa_business.save_spec_parameter(p_tenant uuid,p_operation uuid,p_member uuid,p_action text,p_kind text,p_expected bigint,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old dqa_private.spec_parameter_operations;stored dqa_private.spec_parameter_definitions;r record;fp text;saved_result jsonb;next_revision bigint;new_label text;new_units jsonb;u text;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') OR p_member IS DISTINCT FROM dqa_private.member_id(p_tenant) THEN RAISE EXCEPTION 'SPEC_PARAMETER_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('SAVE','DELETE') OR p_kind IS NULL OR p_expected IS NULL OR p_expected<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SPEC_PARAMETER_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spec-parameters:'||p_tenant,0));
 fp:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'kind',p_kind,'expected',p_expected,'data',p_data)::text,'UTF8')),'hex');
 SELECT * INTO old FROM dqa_private.spec_parameter_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF NOT FOUND OR old.actor IS DISTINCT FROM auth.uid() OR old.request_sha256<>fp THEN RAISE EXCEPTION 'SPEC_PARAMETER_OPERATION_CONFLICT';END IF;
 IF old.result->>'state'='SAVED' THEN RETURN old.result;END IF;
 IF old.expires_at<clock_timestamp() THEN RAISE EXCEPTION 'SPEC_PARAMETER_EXPIRED';END IF;
 SELECT * INTO stored FROM dqa_private.spec_parameter_definitions WHERE tenant_id=p_tenant AND kind=p_kind FOR UPDATE;
 SELECT * INTO r FROM dqa_private.spec_parameter_rows(p_tenant) WHERE kind=p_kind;
 IF r.kind IS NULL THEN
  IF p_action<>'SAVE' OR p_kind!~'^CUSTOM_[A-F0-9]{32}$' THEN RAISE EXCEPTION 'SPEC_PARAMETER_NOT_FOUND';END IF;
  IF (SELECT count(*) FROM dqa_private.spec_parameter_rows(p_tenant) WHERE enabled)>=64 THEN RAISE EXCEPTION 'SPEC_PARAMETER_LIMIT';END IF;
 ELSIF NOT r.enabled THEN RAISE EXCEPTION 'SPEC_PARAMETER_NOT_FOUND';END IF;
 IF p_expected<>coalesce(stored.revision,0) THEN RAISE EXCEPTION 'SPEC_PARAMETER_REVISION_CONFLICT';END IF;
 IF p_action='SAVE' THEN
  IF NOT(p_data ?& ARRAY['label','units']) OR (SELECT count(*) FROM jsonb_object_keys(p_data))<>2 OR jsonb_typeof(p_data->'label') IS DISTINCT FROM 'string' OR coalesce(length(p_data->>'label'),0) NOT BETWEEN 1 AND 60 OR p_data->>'label'<>btrim(p_data->>'label') OR p_data->>'label'~'[[:cntrl:]]' OR jsonb_typeof(p_data->'units') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SPEC_PARAMETER_FIELDS_INVALID';END IF;
  new_label:=p_data->>'label';new_units:=p_data->'units';
  IF jsonb_array_length(new_units) NOT BETWEEN 1 AND 12 OR (SELECT count(*)<>count(DISTINCT v) FROM jsonb_array_elements(new_units)v) OR EXISTS(SELECT 1 FROM jsonb_array_elements(new_units)v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 20 OR (v#>>'{}')<>btrim(v#>>'{}') OR (v#>>'{}')~'[[:cntrl:]]') THEN RAISE EXCEPTION 'SPEC_PARAMETER_FIELDS_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.spec_parameter_rows(p_tenant) WHERE enabled AND kind<>p_kind AND lower(label)=lower(new_label)) THEN RAISE EXCEPTION 'SPEC_PARAMETER_NAME_EXISTS';END IF;
  FOR u IN SELECT value FROM jsonb_array_elements_text(coalesce(r.units,'[]'::jsonb)) WHERE NOT(new_units ? value) LOOP IF dqa_private.spec_parameter_usage(p_tenant,p_kind,u)>0 THEN RAISE EXCEPTION 'SPEC_PARAMETER_IN_USE';END IF;END LOOP;
 ELSE
  IF p_data<>'{}'::jsonb THEN RAISE EXCEPTION 'SPEC_PARAMETER_FIELDS_INVALID';END IF;
  IF dqa_private.spec_parameter_usage(p_tenant,p_kind)>0 THEN RAISE EXCEPTION 'SPEC_PARAMETER_IN_USE';END IF;
  new_label:=r.label;new_units:=r.units;
 END IF;
 next_revision:=coalesce(stored.revision,0)+1;
 INSERT INTO dqa_private.spec_parameter_definitions VALUES(p_tenant,p_kind,new_label,new_units,p_action='SAVE',next_revision) ON CONFLICT(tenant_id,kind) DO UPDATE SET label=EXCLUDED.label,units=EXCLUDED.units,enabled=EXCLUDED.enabled,revision=EXCLUDED.revision;
 saved_result:=jsonb_build_object('id',p_operation,'state','SAVED','parameter_id',p_kind,'revision',next_revision,'action',p_action);
 UPDATE dqa_private.spec_parameter_operations SET result=saved_result WHERE tenant_id=p_tenant AND id=p_operation;
 RETURN saved_result;
END $$;
CREATE FUNCTION dqa_business.spec_parameter_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT CASE WHEN dqa_private.can(p_tenant,'catalog.manage') THEN coalesce((SELECT CASE WHEN result->>'state'='PLANNED' AND expires_at<clock_timestamp() THEN jsonb_build_object('id',id,'state','EXPIRED') ELSE result END FROM dqa_private.spec_parameter_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid()),jsonb_build_object('id',p_operation,'state','NOT_FOUND')) ELSE jsonb_build_object('id',p_operation,'state','NOT_FOUND') END $$;
REVOKE ALL ON FUNCTION dqa_private.spec_parameter_defaults(),dqa_private.spec_parameter_rows(uuid),dqa_private.spec_parameter_references(uuid),dqa_private.spec_parameter_usage(uuid,text,text),dqa_private.spec_parameter_snapshot(uuid),dqa_business.spec_parameter_context(uuid),dqa_business.prepare_spec_parameter(uuid,uuid,uuid,text,text,bigint,jsonb),dqa_business.save_spec_parameter(uuid,uuid,uuid,text,text,bigint,jsonb),dqa_business.spec_parameter_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.spec_parameter_context(uuid),dqa_business.prepare_spec_parameter(uuid,uuid,uuid,text,text,bigint,jsonb),dqa_business.save_spec_parameter(uuid,uuid,uuid,text,text,bigint,jsonb),dqa_business.spec_parameter_result(uuid,uuid) TO authenticated;

DO $patch$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM(VALUES
('dqa_private.validate_trial_editor(uuid,jsonb,text)',$a$BEGIN
 IF jsonb_typeof(p)$a$,$b$BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('spec-parameters:'||p_tenant,0));
 IF jsonb_typeof(p)$b$),
('dqa_private.validate_trial_editor(uuid,jsonb,text)',$a$ units:='{"TEMPERATURE":["°C"],"ELECTRICAL":["V","A","Ω","W"],"VIBRATION":["g","mm","m/s²"],"FORCE":["N","kN"],"HUMIDITY":["%RH"],"FREQUENCY":["Hz","kHz"],"PRESSURE":["kPa","MPa"],"OTHER":["—"]}';$a$,$b$ SELECT coalesce(jsonb_object_agg(r.kind,r.units),'{}'::jsonb) INTO units FROM dqa_private.spec_parameter_rows(p_tenant)r WHERE r.enabled;$b$),
('dqa_business.preapproval_snapshot(uuid)',$a$'equipment_capabilities',dqa_private.equipment_capability_snapshot(p_tenant)$a$,$b$'specification_parameters',dqa_private.spec_parameter_snapshot(p_tenant),'equipment_capabilities',dqa_private.equipment_capability_snapshot(p_tenant)$b$))v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'SPEC_PARAMETER_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $patch$;
