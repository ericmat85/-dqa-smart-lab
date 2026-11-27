-- Trial classification is independent of the existing method, duration and scheduling rule.
-- No existing catalog, request, signed document or schedule row is rewritten.
CREATE TABLE dqa_private.trial_type_settings(tenant_id uuid NOT NULL,trial_id uuid NOT NULL,test_type text NOT NULL CHECK(test_type IN('PLACEMENT','POWERED_PLACEMENT','COMPOUND_CONTINUOUS','COMPOUND_DISCONTINUOUS','OPERATION','OUTSOURCED','OTHER')),actor uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,trial_id),FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id) ON DELETE CASCADE);
ALTER TABLE dqa_private.trial_type_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.trial_type_settings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_private.trial_types_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN dqa_private.can(p_tenant,'catalog.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('trial_id',s.trial_id,'test_type',s.test_type) ORDER BY s.trial_id) FROM dqa_private.trial_type_settings s JOIN dqa_business.trial_definitions t ON t.tenant_id=s.tenant_id AND t.id=s.trial_id WHERE s.tenant_id=p_tenant AND t.enabled),'[]'::jsonb) ELSE '[]'::jsonb END
$$;
REVOKE ALL ON FUNCTION dqa_private.trial_types_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $trial_types$ DECLARE patch record;definition text;BEGIN
 FOR patch IN SELECT * FROM (VALUES
 ('dqa_business.execute_resource_operation(uuid,uuid,jsonb)', $old$k NOT IN ('legacy_id','name','aliases','profile_code','specification','acceptance','equipment_reference','specification_version','duration_hours')$old$, $new$k NOT IN ('test_type','legacy_id','name','aliases','profile_code','specification','acceptance','equipment_reference','specification_version','duration_hours')$new$),
 ('dqa_business.execute_resource_operation(uuid,uuid,jsonb)', $old$ELSIF resource_kind='trial' THEN$old$, $new$ELSIF resource_kind='trial' THEN
  IF payload ? 'test_type' AND (jsonb_typeof(payload->'test_type') IS DISTINCT FROM 'string' OR payload->>'test_type' NOT IN('PLACEMENT','POWERED_PLACEMENT','COMPOUND_CONTINUOUS','COMPOUND_DISCONTINUOUS','OPERATION','OUTSOURCED','OTHER')) THEN RAISE EXCEPTION 'TRIAL_TYPE_INVALID';END IF;$new$),
 ('dqa_business.execute_resource_operation(uuid,uuid,jsonb)', $old$final_revision:=trial.revision;legacy:=trial.legacy_id;$old$, $new$IF payload ? 'test_type' THEN
   INSERT INTO dqa_private.trial_type_settings VALUES(p_tenant,target,payload->>'test_type',auth.uid(),clock_timestamp()) ON CONFLICT(tenant_id,trial_id) DO UPDATE SET test_type=EXCLUDED.test_type,actor=EXCLUDED.actor,updated_at=EXCLUDED.updated_at;
   event_detail:=event_detail||jsonb_build_object('test_type',payload->>'test_type');
  END IF;
  final_revision:=trial.revision;legacy:=trial.legacy_id;$new$),
 ('dqa_business.preapproval_snapshot(uuid)', $old$RETURN result||jsonb_build_object('compound_trials',extra);$old$, $new$RETURN result||jsonb_build_object('compound_trials',extra,'trial_types',dqa_private.trial_types_snapshot(p_tenant));$new$)
 ) AS changes(signature,before_text,after_text) LOOP
 definition:=pg_get_functiondef(patch.signature::regprocedure);
 IF (length(definition)-length(replace(definition,patch.before_text,'')))/length(patch.before_text)<>1 THEN RAISE EXCEPTION 'TRIAL_TYPE_BASELINE_CHANGED: %',patch.signature;END IF;
 EXECUTE replace(definition,patch.before_text,patch.after_text);
 END LOOP;
END $trial_types$;
