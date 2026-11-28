-- Ordered sub-trial conditions and equipment scopes, saved in existing editor metadata. No backfill.
CREATE OR REPLACE FUNCTION dqa_private.validate_trial_editor(p_tenant uuid,p jsonb,spec text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;b jsonb;units jsonb;seen text[]:='{}';images int:=0;txt text:='';first_text boolean:=true;bytes bytea;child jsonb;child_ids text[]:='{}';child_names text[]:='{}';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('spec-parameters:'||p_tenant,0));
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& ARRAY['conditions','equipment_ids','description']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p)k WHERE k NOT IN('conditions','equipment_ids','description','sub_trials')) OR octet_length(p::text)>520000 OR jsonb_typeof(p->'conditions') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'conditions')>12 OR jsonb_typeof(p->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'equipment_ids')>100 OR jsonb_typeof(p->'description') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'description') NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
 SELECT coalesce(jsonb_object_agg(r.kind,r.units),'{}'::jsonb) INTO units FROM dqa_private.spec_parameter_rows(p_tenant)r WHERE r.enabled;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'conditions') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['kind','unit','lower','upper']) OR (SELECT count(*) FROM jsonb_object_keys(c))<>4 OR NOT(units ? coalesce(c->>'kind','')) OR NOT((units->(c->>'kind')) ? coalesce(c->>'unit','')) OR c->>'kind'||':'||(c->>'unit')=ANY(seen) THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
  FOR b IN SELECT value FROM jsonb_each(c) WHERE key IN('lower','upper') LOOP IF jsonb_typeof(b) IS DISTINCT FROM 'null' AND (jsonb_typeof(b) IS DISTINCT FROM 'number' OR abs((b#>>'{}')::numeric)>1000000000) THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;END LOOP;
  IF (c->>'lower')::numeric>(c->>'upper')::numeric THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;seen:=array_append(seen,c->>'kind'||':'||(c->>'unit'));
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(p->'equipment_ids')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'equipment_ids') v WHERE v!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'TRIAL_EQUIPMENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'equipment_ids') v WHERE NOT EXISTS(SELECT 1 FROM dqa_business.equipment e WHERE e.tenant_id=p_tenant AND e.id=v::uuid AND e.deleted_at IS NULL)) THEN RAISE EXCEPTION 'TRIAL_EQUIPMENT_INVALID';END IF;
 IF p ? 'sub_trials' THEN
  IF jsonb_typeof(p->'sub_trials') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'sub_trials')>20 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
  IF jsonb_array_length(p->'sub_trials')>0 THEN
   IF jsonb_array_length(p->'sub_trials')<2 OR jsonb_array_length(p->'conditions')<>0 OR jsonb_array_length(p->'equipment_ids')<>0 THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
   FOR child IN SELECT value FROM jsonb_array_elements(p->'sub_trials') LOOP
    IF jsonb_typeof(child) IS DISTINCT FROM 'object' OR NOT(child ?& ARRAY['id','name','conditions','equipment_ids']) OR (SELECT count(*) FROM jsonb_object_keys(child))<>4 OR coalesce(child->>'id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR child->>'id'=ANY(child_ids) OR jsonb_typeof(child->'name') IS DISTINCT FROM 'string' OR coalesce(length(child->>'name'),0) NOT BETWEEN 1 AND 80 OR child->>'name'<>btrim(child->>'name') OR child->>'name'~'[[:cntrl:]]' OR lower(child->>'name')=ANY(child_names) THEN RAISE EXCEPTION 'TRIAL_DETAILS_INVALID';END IF;
    child_ids:=array_append(child_ids,child->>'id');child_names:=array_append(child_names,lower(child->>'name'));
    PERFORM dqa_private.validate_trial_editor(p_tenant,jsonb_build_object('conditions',child->'conditions','equipment_ids',child->'equipment_ids','description',jsonb_build_array(jsonb_build_object('type','text','text',''))),'');
   END LOOP;
  END IF;
 END IF;
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
CREATE FUNCTION dqa_private.condition_group_error(p_tenant uuid,g jsonb,p_equipment uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;caps jsonb;matches jsonb;
BEGIN
 IF jsonb_array_length(coalesce(g->'equipment_ids','[]'::jsonb))>0 AND NOT((g->'equipment_ids') ? p_equipment::text) THEN RETURN 'TRIAL_EQUIPMENT_MISMATCH';END IF;
 SELECT capabilities INTO caps FROM dqa_private.equipment_capabilities WHERE tenant_id=p_tenant AND equipment_id=p_equipment;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(g->'conditions','[]')) LOOP
  IF c->>'lower' IS NULL AND c->>'upper' IS NULL THEN CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(v),'[]') INTO matches FROM jsonb_array_elements(coalesce(caps,'[]'))v WHERE v->>'kind'=c->>'kind' AND dqa_private.capability_unit(v->>'unit')=dqa_private.capability_unit(c->>'unit');
  IF jsonb_array_length(matches)=0 THEN RETURN 'PLANNING_CONDITIONS_UNVERIFIED';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(matches)v WHERE (c->>'lower' IS NULL OR (v->>'lower')::numeric*dqa_private.capability_factor(v->>'unit')<=(c->>'lower')::numeric*dqa_private.capability_factor(c->>'unit')) AND (c->>'upper' IS NULL OR (v->>'upper')::numeric*dqa_private.capability_factor(v->>'unit')>=(c->>'upper')::numeric*dqa_private.capability_factor(c->>'unit'))) THEN RETURN 'PLANNING_CONDITIONS_EXCEEDED';END IF;
 END LOOP;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION dqa_private.condition_group_error(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION dqa_private.equipment_condition_error(p_tenant uuid,p_trial uuid,p_equipment uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d jsonb;g jsonb;issue text;last_issue text:='TRIAL_EQUIPMENT_MISMATCH';
BEGIN
 SELECT details INTO d FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=p_trial;
 IF jsonb_array_length(coalesce(d->'sub_trials','[]'::jsonb))=0 THEN RETURN dqa_private.condition_group_error(p_tenant,d,p_equipment);END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(d->'sub_trials') LOOP issue:=dqa_private.condition_group_error(p_tenant,g,p_equipment);IF issue IS NULL THEN RETURN NULL;END IF;IF issue<>'TRIAL_EQUIPMENT_MISMATCH' THEN last_issue:=issue;END IF;END LOOP;
 RETURN last_issue;
END $$;
CREATE OR REPLACE FUNCTION dqa_private.plan_capability_checks(p_tenant uuid,p_request uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item jsonb;req dqa_business.requests;chosen_trial uuid;device_id uuid;d jsonb;g jsonb;caps jsonb;issue text;checks jsonb:='[]';choices uuid[];
BEGIN
 SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN p_plan ? 'compound' THEN p_plan->'segments' ELSE p_plan->'allocations' END) LOOP
  chosen_trial:=CASE WHEN p_plan ? 'compound' THEN (item->>'trial_id')::uuid ELSE req.trial_id END;device_id:=(item->>'equipment_id')::uuid;
  issue:=dqa_private.equipment_condition_error(p_tenant,chosen_trial,device_id);IF issue IS NOT NULL THEN RAISE EXCEPTION '%',issue;END IF;
  SELECT details INTO d FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=chosen_trial;
  SELECT capabilities INTO caps FROM dqa_private.equipment_capabilities WHERE tenant_id=p_tenant AND equipment_id=device_id;
  IF jsonb_array_length(coalesce(d->'sub_trials','[]'::jsonb))>0 THEN
   IF p_plan ? 'compound' THEN choices:=ARRAY[device_id];ELSE SELECT array_agg(DISTINCT (v->>'equipment_id')::uuid) INTO choices FROM jsonb_array_elements(p_plan->'allocations')v;END IF;
   FOR g IN SELECT value FROM jsonb_array_elements(d->'sub_trials') LOOP
    IF NOT EXISTS(SELECT 1 FROM unnest(choices)x WHERE dqa_private.condition_group_error(p_tenant,g,x) IS NULL) THEN RAISE EXCEPTION 'TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED';END IF;
    IF dqa_private.condition_group_error(p_tenant,g,device_id) IS NULL THEN checks:=checks||jsonb_build_array(jsonb_build_object('trial_id',chosen_trial,'sub_trial_id',g->>'id','sub_trial_name',g->>'name','equipment_id',device_id,'requirements',g->'conditions','capabilities',coalesce(caps,'[]'),'source','SUB_TRIAL_CONDITION_TYPES_AND_UNITS'));END IF;
   END LOOP;
  ELSE checks:=checks||jsonb_build_array(jsonb_build_object('trial_id',chosen_trial,'equipment_id',device_id,'requirements',coalesce(d->'conditions','[]'),'capabilities',coalesce(caps,'[]'),'source','SHARED_CONDITION_TYPES_AND_UNITS'));END IF;
 END LOOP;RETURN checks;
END $$;

DO $patch$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM(VALUES
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$  IF payload ? 'definition_details' THEN
   PERFORM dqa_private.validate_trial_editor(p_tenant,payload->'definition_details',payload->>'specification');$a$,$b$  IF coalesce((CASE WHEN payload ? 'definition_details' THEN payload->'definition_details'->'sub_trials' ELSE (SELECT details->'sub_trials' FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=target) END) @? '$[*] ? (@.id != null)',false) AND coalesce(payload->>'test_type',(SELECT test_type FROM dqa_private.trial_type_settings WHERE tenant_id=p_tenant AND trial_id=target),'') NOT IN('COMPOUND_CONTINUOUS','COMPOUND_DISCONTINUOUS') THEN RAISE EXCEPTION 'TRIAL_SUBTRIALS_INVALID';END IF;
  IF payload ? 'definition_details' THEN
   PERFORM dqa_private.validate_trial_editor(p_tenant,payload->'definition_details',payload->>'specification');$b$),
('dqa_private.spec_parameter_references(uuid)',$a$ UNION ALL SELECT c->>'kind',c->>'unit','EQUIPMENT',s.equipment_id$a$,$b$ UNION ALL SELECT c->>'kind',c->>'unit','TRIAL',s.trial_id FROM dqa_private.trial_editor_settings s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.details->'sub_trials','[]'::jsonb))child CROSS JOIN LATERAL jsonb_array_elements(child->'conditions')c WHERE s.tenant_id=p_tenant
 UNION ALL SELECT c->>'kind',c->>'unit','EQUIPMENT',s.equipment_id$b$),
('dqa_business.preapproval_context(uuid,uuid)',$a$'trial_id',t.trial_id,'conditions',t.details->'conditions'$a$,$b$'trial_id',t.trial_id,'conditions',t.details->'conditions','equipment_ids',t.details->'equipment_ids','sub_trials',coalesce(t.details->'sub_trials','[]'::jsonb)$b$))v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'SUBTRIAL_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $patch$;
