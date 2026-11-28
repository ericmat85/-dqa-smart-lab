-- Bound originals must be explicitly unbound before library removal.
CREATE OR REPLACE FUNCTION dqa_business.delete_report_template_file(p_tenant uuid,p_operation uuid,p_file uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.trial_template_operations;f dqa_private.trial_template_files;b dqa_private.trial_template_bindings;result jsonb;
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
 IF EXISTS(SELECT 1 FROM dqa_private.trial_template_bindings WHERE tenant_id=p_tenant AND file_id=p_file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_IN_USE';END IF;
 INSERT INTO dqa_private.report_template_file_deletions(tenant_id,file_id,deleted_by) VALUES(p_tenant,p_file,auth.uid());
 result:=jsonb_build_object('id',p_operation,'state','SAVED','file_id',p_file,'trial_id',f.trial_id,'deleted',true,'unbound',false,'revision',coalesce(b.revision,0));
 INSERT INTO dqa_private.trial_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION dqa_business.delete_blank_request_template(p_tenant uuid,p_operation uuid,p_id text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.blank_request_template_operations;result jsonb;t dqa_private.blank_request_templates;s dqa_private.blank_request_template_state;record_id uuid;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_id IS NULL OR (p_id<>'BLANK' AND p_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'TEMPLATE_FIELDS_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('DELETE',p_id,p_revision)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('blank-templates:'||p_tenant,0));
 SELECT * INTO op FROM dqa_private.blank_request_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 IF p_id='BLANK' THEN
 SELECT * INTO s FROM dqa_private.blank_request_template_state WHERE tenant_id=p_tenant;
 IF coalesce(s.revision,0)<>p_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF coalesce(s.builtin_hidden,false) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND';END IF;
 IF s.default_template_id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_IN_USE';END IF;
 INSERT INTO dqa_private.blank_request_template_state(tenant_id,builtin_hidden,revision) VALUES(p_tenant,true,1) ON CONFLICT(tenant_id) DO UPDATE SET builtin_hidden=true,revision=dqa_private.blank_request_template_state.revision+1;
 record_id:=p_tenant;
 ELSE
 SELECT * INTO t FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=p_id::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND';END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.blank_request_template_state WHERE tenant_id=p_tenant AND default_template_id=t.id) THEN RAISE EXCEPTION 'TEMPLATE_IN_USE';END IF;
 DELETE FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=t.id;record_id:=t.id;
 END IF;
 result:=jsonb_build_object('id',p_operation,'template_id',p_id,'state','DELETED');
 INSERT INTO dqa_private.blank_request_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'blank_request_templates',record_id,'DELETE',ARRAY['library_entry']);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION dqa_business.delete_report_template_file(uuid,uuid,uuid,integer),dqa_business.delete_blank_request_template(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.delete_report_template_file(uuid,uuid,uuid,integer),dqa_business.delete_blank_request_template(uuid,uuid,text,integer) TO authenticated;
