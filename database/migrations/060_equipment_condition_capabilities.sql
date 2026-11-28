-- Equipment and trial conditions share the existing typed condition/unit contract.
CREATE TABLE dqa_private.equipment_capabilities(tenant_id uuid NOT NULL,equipment_id uuid NOT NULL,capabilities jsonb NOT NULL,PRIMARY KEY(tenant_id,equipment_id),FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id) ON DELETE CASCADE);
ALTER TABLE dqa_private.equipment_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.equipment_capabilities FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.capability_unit(u text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT CASE u WHEN 'kN' THEN 'N' WHEN 'kHz' THEN 'Hz' WHEN 'MPa' THEN 'kPa' ELSE u END$$;
CREATE FUNCTION dqa_private.capability_factor(u text) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT CASE WHEN u IN('kN','kHz','MPa') THEN 1000 ELSE 1 END::numeric$$;
CREATE FUNCTION dqa_private.validate_equipment_capabilities(p_tenant uuid,p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM dqa_private.validate_trial_editor(p_tenant,jsonb_build_object('conditions',p,'equipment_ids','[]'::jsonb,'description',jsonb_build_array(jsonb_build_object('type','text','text',''))),'');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p) c WHERE c->>'lower' IS NULL OR c->>'upper' IS NULL) OR (SELECT count(*)<>count(DISTINCT (c->>'kind')||':'||dqa_private.capability_unit(c->>'unit')) FROM jsonb_array_elements(p) c) THEN RAISE EXCEPTION 'EQUIPMENT_CAPABILITIES_INVALID';END IF;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'EQUIPMENT_CAPABILITIES_INVALID';
END $$;
CREATE FUNCTION dqa_private.equipment_capability_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN dqa_private.can(p_tenant,'equipment.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('equipment_id',e.id,'capabilities',c.capabilities)) FROM dqa_private.equipment_capabilities c JOIN dqa_business.equipment e ON e.tenant_id=c.tenant_id AND e.id=c.equipment_id WHERE c.tenant_id=p_tenant AND e.deleted_at IS NULL),'[]'::jsonb) ELSE '[]'::jsonb END
$$;
CREATE FUNCTION dqa_private.equipment_condition_error(p_tenant uuid,p_trial uuid,p_equipment uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;required jsonb;caps jsonb;matches jsonb;
BEGIN
 SELECT details->'conditions' INTO required FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=p_trial;
 SELECT capabilities INTO caps FROM dqa_private.equipment_capabilities WHERE tenant_id=p_tenant AND equipment_id=p_equipment;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(required,'[]')) LOOP
  IF c->>'lower' IS NULL AND c->>'upper' IS NULL THEN CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(v),'[]') INTO matches FROM jsonb_array_elements(coalesce(caps,'[]')) v WHERE v->>'kind'=c->>'kind' AND dqa_private.capability_unit(v->>'unit')=dqa_private.capability_unit(c->>'unit');
  IF jsonb_array_length(matches)=0 THEN RETURN 'PLANNING_CONDITIONS_UNVERIFIED';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(matches) v WHERE (c->>'lower' IS NULL OR (v->>'lower')::numeric*dqa_private.capability_factor(v->>'unit')<=(c->>'lower')::numeric*dqa_private.capability_factor(c->>'unit')) AND (c->>'upper' IS NULL OR (v->>'upper')::numeric*dqa_private.capability_factor(v->>'unit')>=(c->>'upper')::numeric*dqa_private.capability_factor(c->>'unit'))) THEN RETURN 'PLANNING_CONDITIONS_EXCEEDED';END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION dqa_private.plan_capability_checks(p_tenant uuid,p_request uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item jsonb;req dqa_business.requests;chosen_trial uuid;device_id uuid;required jsonb;caps jsonb;issue text;checks jsonb:='[]';
BEGIN
 SELECT * INTO req FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN p_plan ? 'compound' THEN p_plan->'segments' ELSE p_plan->'allocations' END) LOOP
  chosen_trial:=CASE WHEN p_plan ? 'compound' THEN (item->>'trial_id')::uuid ELSE req.trial_id END;device_id:=(item->>'equipment_id')::uuid;
  issue:=dqa_private.equipment_condition_error(p_tenant,chosen_trial,device_id);IF issue IS NOT NULL THEN RAISE EXCEPTION '%',issue;END IF;
  SELECT details->'conditions' INTO required FROM dqa_private.trial_editor_settings WHERE tenant_id=p_tenant AND trial_id=chosen_trial;
  SELECT capabilities INTO caps FROM dqa_private.equipment_capabilities WHERE tenant_id=p_tenant AND equipment_id=device_id;
  checks:=checks||jsonb_build_array(jsonb_build_object('trial_id',chosen_trial,'equipment_id',device_id,'requirements',coalesce(required,'[]'),'capabilities',coalesce(caps,'[]'),'source','SHARED_CONDITION_TYPES_AND_UNITS'));
 END LOOP;
 RETURN checks;
END $$;
REVOKE ALL ON FUNCTION dqa_private.capability_unit(text),dqa_private.capability_factor(text),dqa_private.validate_equipment_capabilities(uuid,jsonb),dqa_private.equipment_capability_snapshot(uuid),dqa_private.plan_capability_checks(uuid,uuid,jsonb),dqa_private.equipment_condition_error(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM (VALUES
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$'daily_hours','specification','next_calibration'$a$,$b$'daily_hours','specification','capabilities','next_calibration'$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$  final_revision:=eq.revision;legacy:=eq.legacy_id;
 ELSE
$a$,$b$  IF action='save' AND payload ? 'capabilities' THEN
   PERFORM dqa_private.validate_equipment_capabilities(p_tenant,payload->'capabilities');
   IF (reserved OR old_eq.operational_status IN('IN_USE','ON_LOAN','PAUSED')) AND coalesce((SELECT capabilities FROM dqa_private.equipment_capabilities WHERE tenant_id=p_tenant AND equipment_id=target),'[]'::jsonb) IS DISTINCT FROM payload->'capabilities' THEN RAISE EXCEPTION 'RESOURCE_RESERVED';END IF;
   INSERT INTO dqa_private.equipment_capabilities VALUES(p_tenant,target,payload->'capabilities') ON CONFLICT(tenant_id,equipment_id) DO UPDATE SET capabilities=EXCLUDED.capabilities;
   event_detail:=event_detail||jsonb_build_object('capabilities',payload->'capabilities');
  END IF;
  final_revision:=eq.revision;legacy:=eq.legacy_id;
 ELSE
$b$),
('dqa_business.preapproval_snapshot(uuid)',$a$'trial_editor_details',dqa_private.trial_editor_snapshot(p_tenant)$a$,$b$'equipment_capabilities',dqa_private.equipment_capability_snapshot(p_tenant),'trial_editor_details',dqa_private.trial_editor_snapshot(p_tenant)$b$),
('dqa_private.apply_schedule_calendar(uuid,uuid,jsonb)',$a$RETURN p_plan||jsonb_build_object('scheduling_unit'$a$,$b$RETURN p_plan||jsonb_build_object('capability_checks',dqa_private.plan_capability_checks(p_tenant,p_request,p_plan),'scheduling_unit'$b$),
('dqa_private.repair_schedule_command(uuid,dqa_business.schedules,date,boolean)',$a$AND e.space_units>=(p->>'sample_space_units')::int*q.quantity$a$,$b$AND dqa_private.equipment_condition_error(p_tenant,(stage->>'trial_id')::uuid,e.id) IS NULL AND e.space_units>=(p->>'sample_space_units')::int*q.quantity$b$),
('dqa_private.repair_schedule_command(uuid,dqa_business.schedules,date,boolean)',$a$AND e.space_units>=(a->>'space_units')::int$a$,$b$AND dqa_private.equipment_condition_error(p_tenant,q.trial_id,e.id) IS NULL AND e.space_units>=(a->>'space_units')::int$b$),
('dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb)',$a$~*(patterns->>t.profile_code) ORDER BY x.id LOOP$a$,$b$~*(patterns->>t.profile_code) AND dqa_private.equipment_condition_error(p_tenant,q.trial_id,x.id) IS NULL ORDER BY x.id LOOP$b$),
('dqa_business.business_ai_schedule_candidates(uuid,uuid,jsonb)',$a$~*(patterns->>t.profile_code) ORDER BY (x.id=eq.id)$a$,$b$~*(patterns->>t.profile_code) AND dqa_private.equipment_condition_error(p_tenant,q.trial_id,x.id) IS NULL ORDER BY (x.id=eq.id)$b$),
('dqa_business.preapproval_context(uuid,uuid)',$a$revision,display_details,specification FROM dqa_business.equipment$a$,$b$revision,display_details,specification,coalesce((SELECT capabilities FROM dqa_private.equipment_capabilities c WHERE c.tenant_id=p_tenant AND c.equipment_id=dqa_business.equipment.id),'[]'::jsonb) capabilities FROM dqa_business.equipment$b$),
('dqa_business.preapproval_context(uuid,uuid)',$a$'can_plan',canplan,'draft'$a$,$b$'trial_id',q.trial_id,'condition_sources',CASE WHEN canplan THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('trial_id',t.trial_id,'conditions',t.details->'conditions')),'[]'::jsonb) FROM dqa_private.trial_editor_settings t WHERE t.tenant_id=p_tenant AND (t.trial_id=q.trial_id OR t.trial_id IN(SELECT (x->>'trial_id')::uuid FROM jsonb_array_elements(coalesce(q.form_details->'compoundStages','[]'::jsonb)) x))) ELSE '[]'::jsonb END,'can_plan',canplan,'draft'$b$)) v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'CAPABILITY_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $patch$;
