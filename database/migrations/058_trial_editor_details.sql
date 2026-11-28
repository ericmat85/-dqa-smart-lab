-- Trial editor metadata and soft deletion preserve historical references.
CREATE TABLE dqa_private.trial_editor_settings(tenant_id uuid NOT NULL,trial_id uuid NOT NULL,details jsonb NOT NULL,PRIMARY KEY(tenant_id,trial_id),FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id) ON DELETE CASCADE);
ALTER TABLE dqa_private.trial_editor_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.trial_editor_settings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.validate_trial_editor(p_tenant uuid,p jsonb,spec text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;b jsonb;units jsonb;seen text[]:='{}';images int:=0;txt text:='';first_text boolean:=true;bytes bytea;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& ARRAY['conditions','equipment_ids','description']) OR (SELECT count(*) FROM jsonb_object_keys(p))<>3 OR octet_length(p::text)>520000 OR jsonb_typeof(p->'conditions') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'conditions')>12 OR jsonb_typeof(p->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'equipment_ids')>100 OR jsonb_typeof(p->'description') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'description') NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
 units:='{"TEMPERATURE":["°C"],"ELECTRICAL":["V","A","Ω","W"],"VIBRATION":["g","mm","m/s²"],"FORCE":["N","kN"],"HUMIDITY":["%RH"],"FREQUENCY":["Hz","kHz"],"PRESSURE":["kPa","MPa"],"OTHER":["—"]}';
 FOR c IN SELECT value FROM jsonb_array_elements(p->'conditions') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['kind','unit','lower','upper']) OR (SELECT count(*) FROM jsonb_object_keys(c))<>4 OR NOT(units ? coalesce(c->>'kind','')) OR NOT((units->(c->>'kind')) ? coalesce(c->>'unit','')) OR c->>'kind'||':'||(c->>'unit')=ANY(seen) THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
  FOR b IN SELECT value FROM jsonb_each(c) WHERE key IN('lower','upper') LOOP IF jsonb_typeof(b) IS DISTINCT FROM 'null' AND (jsonb_typeof(b) IS DISTINCT FROM 'number' OR abs((b#>>'{}')::numeric)>1000000000) THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;END LOOP;
  IF (c->>'lower')::numeric>(c->>'upper')::numeric THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;seen:=array_append(seen,c->>'kind'||':'||(c->>'unit'));
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(p->'equipment_ids')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'equipment_ids') v WHERE v!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'TRIAL_EQUIPMENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'equipment_ids') v WHERE NOT EXISTS(SELECT 1 FROM dqa_business.equipment e WHERE e.tenant_id=p_tenant AND e.id=v::uuid AND e.deleted_at IS NULL)) THEN RAISE EXCEPTION 'TRIAL_EQUIPMENT_INVALID';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p->'description') LOOP
  IF b->>'type'='text' THEN IF (SELECT count(*) FROM jsonb_object_keys(b))<>2 OR NOT(b ? 'text') OR jsonb_typeof(b->'text') IS DISTINCT FROM 'string' OR length(b->>'text')>6000 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;txt:=txt||CASE WHEN first_text THEN '' ELSE E'\n' END||(b->>'text');first_text:=false;
  ELSIF b->>'type'='image' THEN
   images:=images+1;IF (SELECT count(*) FROM jsonb_object_keys(b))<>3 OR NOT(b ?& ARRAY['data','caption']) OR jsonb_typeof(b->'caption') IS DISTINCT FROM 'string' OR length(b->>'caption')>200 OR length(b->>'data')>120000 OR coalesce(b->>'data','')!~'^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$' THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
   BEGIN bytes:=decode(substr(b->>'data',23),'base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END;
   IF octet_length(bytes)<24 OR encode(substring(bytes FROM 1 FOR 8),'hex')<>'89504e470d0a1a0a' THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
  ELSE RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
 END LOOP;
 IF images>4 OR txt IS DISTINCT FROM spec OR length(txt)>6000 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
END $$;
CREATE FUNCTION dqa_private.trial_editor_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN dqa_private.can(p_tenant,'catalog.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('trial_id',t.id,'details',s.details||jsonb_build_object('description',jsonb_build_array(jsonb_build_object('type','text','text',t.specification))))) FROM dqa_private.trial_editor_settings s JOIN dqa_business.trial_definitions t ON t.tenant_id=s.tenant_id AND t.id=s.trial_id WHERE s.tenant_id=p_tenant AND t.enabled),'[]'::jsonb) ELSE '[]'::jsonb END
$$;
CREATE FUNCTION dqa_business.trial_editor_detail(p_tenant uuid,p_trial uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t dqa_business.trial_definitions;BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.read') THEN RAISE EXCEPTION 'RESOURCE_WRITE_DENIED';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=p_trial AND enabled;IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_DELETED';END IF;
 RETURN jsonb_build_object('trial_id',t.id,'revision',t.revision,'details',coalesce((SELECT details FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=t.id),jsonb_build_object('conditions','[]'::jsonb,'equipment_ids','[]'::jsonb,'description',jsonb_build_array(jsonb_build_object('type','text','text',t.specification)))));
END $$;
REVOKE ALL ON FUNCTION dqa_private.validate_trial_editor(uuid,jsonb,text),dqa_private.trial_editor_snapshot(uuid),dqa_business.trial_editor_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.trial_editor_detail(uuid,uuid) TO authenticated;
DO $patch$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM (VALUES
('dqa_private.resource_permission(jsonb)',$a$octet_length(p_command::text)>48000$a$,$b$octet_length(p_command::text)>(CASE WHEN p_command->>'kind'='trial' THEN 540000 ELSE 48000 END)$b$),
('dqa_private.resource_permission(jsonb)',$a$p_command->>'kind'='trial' AND p_command->>'action'<>'save'$a$,$b$p_command->>'kind'='trial' AND p_command->>'action' NOT IN('save','delete')$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$IF resource_kind='equipment' THEN
   SELECT * INTO old_eq$a$,$b$IF resource_kind='trial' THEN
   SELECT * INTO old_trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=target FOR UPDATE;
   IF NOT FOUND OR old_trial.revision<>expected OR NOT old_trial.enabled THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
   UPDATE dqa_business.trial_definitions SET enabled=false WHERE tenant_id=p_tenant AND id=target RETURNING * INTO trial;
   final_revision := trial.revision;legacy := trial.legacy_id;event_detail:=jsonb_build_object('name',old_trial.name,'history_retained',true);
  ELSIF resource_kind='equipment' THEN
   SELECT * INTO old_eq$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$'calendar_policy','test_type','legacy_id'$a$,$b$'definition_details','calendar_policy','test_type','legacy_id'$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$IF hours<=0 OR hours>24000$a$,$b$IF (hours<=0 AND NOT(hours=0 AND expected>0 AND payload->>'profile_code'='COMPOUND_ENVIRONMENT')) OR hours>24000$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$IF NOT FOUND AND payload->>'profile_code'<>'UNVERIFIED'$a$,$b$IF NOT FOUND AND payload->>'profile_code'<>'UNVERIFIED' AND NOT(expected>0 AND payload->>'profile_code'='COMPOUND_ENVIRONMENT')$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$IF NOT EXISTS(SELECT 1 FROM regexp_matches(payload->>'specification'$a$,$b$IF payload->>'profile_code'<>'COMPOUND_ENVIRONMENT' AND NOT EXISTS(SELECT 1 FROM regexp_matches(payload->>'specification'$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$  final_revision:=trial.revision;legacy:=trial.legacy_id;$a$,$b$  IF payload ? 'definition_details' THEN
   PERFORM dqa_private.validate_trial_editor(p_tenant,payload->'definition_details',payload->>'specification');
   INSERT INTO dqa_private.trial_editor_settings VALUES(p_tenant,target,payload->'definition_details') ON CONFLICT(tenant_id,trial_id) DO UPDATE SET details=EXCLUDED.details;
  END IF;
  final_revision:=trial.revision;legacy:=trial.legacy_id;$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$IF old_trial.id IS NOT NULL AND old_trial.profile_code$a$,$b$IF old_trial.id IS NOT NULL AND NOT old_trial.enabled THEN RAISE EXCEPTION 'TRIAL_DELETED';END IF;
  IF old_trial.id IS NOT NULL AND old_trial.profile_code$b$),
('dqa_business.preapproval_snapshot(uuid)',$a$'trial_calendar_policies',dqa_private.trial_calendar_snapshot(p_tenant)$a$,$b$'trial_editor_details',dqa_private.trial_editor_snapshot(p_tenant),'trial_calendar_policies',dqa_private.trial_calendar_snapshot(p_tenant)$b$)) v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'TRIAL_EDITOR_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $patch$;
