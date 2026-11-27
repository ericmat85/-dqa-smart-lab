-- Generated reference templates have no stored source file to physically delete.
-- An immutable workspace tombstone removes only the generated reference entry;
-- trial definitions, uploaded bindings and pinned case documents remain intact.
CREATE TABLE dqa_private.builtin_trial_template_deletions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 trial_id uuid NOT NULL,legacy_id text NOT NULL,deleted_by uuid NOT NULL,deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,trial_id)
);
ALTER TABLE dqa_private.builtin_trial_template_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.builtin_trial_template_deletions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_deletion BEFORE UPDATE OR DELETE ON dqa_private.builtin_trial_template_deletions FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_private.builtin_trial_template_deletions FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
ALTER FUNCTION dqa_business.trial_template_catalog(uuid) RENAME TO trial_template_catalog_v49;
CREATE FUNCTION dqa_business.trial_template_catalog(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;hidden jsonb;
BEGIN
 result:=dqa_business.trial_template_catalog_v49(p_tenant);
 SELECT coalesce(jsonb_agg(legacy_id ORDER BY legacy_id),'[]') INTO hidden FROM dqa_private.builtin_trial_template_deletions WHERE tenant_id=p_tenant;
 RETURN result||jsonb_build_object('hidden_builtin_template_ids',hidden);
END $$;
CREATE FUNCTION dqa_business.delete_builtin_trial_template(p_tenant uuid,p_operation uuid,p_trial uuid,p_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.trial_template_operations;t dqa_business.trial_definitions;result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_trial IS NULL OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('DELETE_BUILTIN',p_trial,p_revision)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-operation:'||p_tenant||':'||p_operation,0));
 SELECT * INTO op FROM dqa_private.trial_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||p_tenant||':'||p_trial,0));
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=p_trial AND enabled FOR SHARE;
 IF NOT FOUND OR t.profile_code='COMPOUND_ENVIRONMENT' OR t.duration_hours IS NULL OR t.duration_hours<=0 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REVISION_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.builtin_trial_template_deletions WHERE tenant_id=p_tenant AND trial_id=p_trial) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 INSERT INTO dqa_private.builtin_trial_template_deletions(tenant_id,trial_id,legacy_id,deleted_by) VALUES(p_tenant,p_trial,t.legacy_id,auth.uid());
 result:=jsonb_build_object('id',p_operation,'state','SAVED','action','DELETE_BUILTIN','trial_id',p_trial,'deleted',true);
 INSERT INTO dqa_private.trial_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.trial_template_catalog_v49(uuid),dqa_business.trial_template_catalog(uuid),dqa_business.delete_builtin_trial_template(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.trial_template_catalog(uuid),dqa_business.delete_builtin_trial_template(uuid,uuid,uuid,bigint) TO authenticated;
