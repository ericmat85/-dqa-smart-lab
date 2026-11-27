-- Retire uploaded report originals from the library without destroying pinned cases.
CREATE TABLE dqa_private.report_template_file_deletions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,file_id uuid NOT NULL,deleted_by uuid NOT NULL,deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,file_id),FOREIGN KEY(tenant_id,file_id) REFERENCES dqa_private.trial_template_files(tenant_id,id)
);
ALTER TABLE dqa_private.report_template_file_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.report_template_file_deletions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_deletion BEFORE UPDATE OR DELETE ON dqa_private.report_template_file_deletions FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TRIGGER audit_metadata AFTER INSERT ON dqa_private.report_template_file_deletions FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
ALTER FUNCTION dqa_business.trial_template_catalog(uuid) RENAME TO trial_template_catalog_v50;
CREATE FUNCTION dqa_business.trial_template_catalog(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;files jsonb;
BEGIN
 result:=dqa_business.trial_template_catalog_v50(p_tenant);
 SELECT coalesce(jsonb_agg(f.value||jsonb_build_object('binding_revision',coalesce(b.revision,0)) ORDER BY f.ordinality),'[]') INTO files
 FROM jsonb_array_elements(result->'files') WITH ORDINALITY f(value,ordinality)
 LEFT JOIN dqa_private.trial_template_bindings b ON b.tenant_id=p_tenant AND b.trial_id=(f.value->>'trial_id')::uuid
 WHERE NOT EXISTS(SELECT 1 FROM dqa_private.report_template_file_deletions d WHERE d.tenant_id=p_tenant AND d.file_id=(f.value->>'id')::uuid);
 RETURN result||jsonb_build_object('files',files);
END $$;
ALTER FUNCTION dqa_business.save_trial_template_binding(uuid,uuid,uuid,integer,uuid,text,text,text,text) RENAME TO save_trial_template_binding_v50;
CREATE FUNCTION dqa_business.save_trial_template_binding(p_tenant uuid,p_operation uuid,p_trial uuid,p_revision integer,p_file uuid,p_name text,p_version text,p_sha256 text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-operation:'||p_tenant||':'||p_operation,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||p_tenant||':'||p_trial,0));
 IF NOT EXISTS(SELECT 1 FROM dqa_private.trial_template_operations WHERE tenant_id=p_tenant AND id=p_operation)
 AND EXISTS(SELECT 1 FROM dqa_private.report_template_file_deletions WHERE tenant_id=p_tenant AND file_id=p_file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 RETURN dqa_business.save_trial_template_binding_v50(p_tenant,p_operation,p_trial,p_revision,p_file,p_name,p_version,p_sha256,p_content);
END $$;
CREATE OR REPLACE FUNCTION dqa_business.trial_template_file(p_tenant uuid,p_file uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f dqa_private.trial_template_files;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 SELECT * INTO f FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file AND NOT EXISTS(SELECT 1 FROM dqa_private.report_template_file_deletions d WHERE d.tenant_id=p_tenant AND d.file_id=p_file);
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 RETURN jsonb_build_object('id',f.id,'name',f.name,'version',f.version,'sha256',f.sha256,'byteLength',octet_length(f.content),'content',replace(encode(f.content,'base64'),E'\n',''));
END $$;
CREATE FUNCTION dqa_business.delete_report_template_file(p_tenant uuid,p_operation uuid,p_file uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.trial_template_operations;f dqa_private.trial_template_files;b dqa_private.trial_template_bindings;result jsonb;unbound boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_file IS NULL OR p_revision IS NULL OR p_revision<0 OR p_revision>2147483646 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('DELETE_REPORT_FILE',p_file,p_revision)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-operation:'||p_tenant||':'||p_operation,0));
 SELECT * INTO op FROM dqa_private.trial_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO f FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||p_tenant||':'||f.trial_id,0));
 SELECT * INTO b FROM dqa_private.trial_template_bindings WHERE tenant_id=p_tenant AND trial_id=f.trial_id;
 IF coalesce(b.revision,0)<>p_revision THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REVISION_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.report_template_file_deletions WHERE tenant_id=p_tenant AND file_id=p_file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;
 unbound:=coalesce(b.file_id=p_file,false);
 IF unbound THEN
  UPDATE dqa_private.trial_template_bindings SET file_id=NULL,revision=revision+1 WHERE tenant_id=p_tenant AND trial_id=f.trial_id;
  INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'trial_template_bindings',f.trial_id,'UPDATE',ARRAY['file_id','revision']);
 END IF;
 INSERT INTO dqa_private.report_template_file_deletions(tenant_id,file_id,deleted_by) VALUES(p_tenant,p_file,auth.uid());
 result:=jsonb_build_object('id',p_operation,'state','SAVED','file_id',p_file,'trial_id',f.trial_id,'deleted',true,'unbound',unbound,'revision',coalesce(b.revision,0)+CASE WHEN unbound THEN 1 ELSE 0 END);
 INSERT INTO dqa_private.trial_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.trial_template_catalog_v50(uuid),dqa_business.save_trial_template_binding_v50(uuid,uuid,uuid,integer,uuid,text,text,text,text),dqa_business.trial_template_catalog(uuid),dqa_business.save_trial_template_binding(uuid,uuid,uuid,integer,uuid,text,text,text,text),dqa_business.trial_template_file(uuid,uuid),dqa_business.delete_report_template_file(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.trial_template_catalog(uuid),dqa_business.save_trial_template_binding(uuid,uuid,uuid,integer,uuid,text,text,text,text),dqa_business.trial_template_file(uuid,uuid),dqa_business.delete_report_template_file(uuid,uuid,uuid,integer) TO authenticated;
