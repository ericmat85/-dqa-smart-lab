-- Bind the workspace blank-form source to an immutable uploaded version.
ALTER TABLE dqa_private.blank_request_template_state ADD COLUMN default_template_id uuid;
ALTER TABLE dqa_private.blank_request_template_state ADD CONSTRAINT blank_template_default_fk FOREIGN KEY(tenant_id,default_template_id) REFERENCES dqa_private.blank_request_templates(tenant_id,id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION dqa_business.blank_request_template_library(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;state dqa_private.blank_request_template_state;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ACCESS_DENIED';END IF;
 SELECT * INTO state FROM dqa_private.blank_request_template_state WHERE tenant_id=p_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'version',t.version,'trialId','BLANK','synthetic',true,'createdBy',t.created_by,'createdAt',t.created_at,'revision',t.revision,'sha256',t.sha256,'byteLength',octet_length(t.content),'trialBinding',jsonb_build_object('status','BLANK')) ORDER BY t.created_at DESC,t.id),'[]') INTO rows FROM dqa_private.blank_request_templates t WHERE tenant_id=p_tenant;
 RETURN jsonb_build_object('rows',rows,'builtin_visible',NOT coalesce(state.builtin_hidden,false),'revision',coalesce(state.revision,0),'default_template_id',coalesce(state.default_template_id::text,'BLANK'),'can_manage',dqa_private.is_admin(p_tenant),'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.set_blank_request_template_default(p_tenant uuid,p_operation uuid,p_id text,p_revision integer,p_sha256 text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.blank_request_template_operations;result jsonb;s dqa_private.blank_request_template_state;t dqa_private.blank_request_templates;target uuid;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_id IS NULL OR (p_id<>'BLANK' AND p_id !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') OR p_revision IS NULL OR p_revision<0 OR (p_id='BLANK' AND p_sha256 IS NOT NULL) OR (p_id<>'BLANK' AND (p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'TEMPLATE_FIELDS_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('DEFAULT',p_id,p_revision,p_sha256)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('blank-templates:'||p_tenant,0));
 SELECT * INTO op FROM dqa_private.blank_request_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO s FROM dqa_private.blank_request_template_state WHERE tenant_id=p_tenant;
 IF coalesce(s.revision,0)<>p_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF p_id<>'BLANK' THEN
  SELECT * INTO t FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=p_id::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND';END IF;
  IF t.sha256<>p_sha256 THEN RAISE EXCEPTION 'TEMPLATE_FILE_INVALID';END IF;target:=t.id;
 END IF;
 INSERT INTO dqa_private.blank_request_template_state(tenant_id,default_template_id,revision) VALUES(p_tenant,target,1)
 ON CONFLICT(tenant_id) DO UPDATE SET default_template_id=target,revision=dqa_private.blank_request_template_state.revision+1;
 result:=jsonb_build_object('id',p_operation,'state','DEFAULT_SET','template_id',p_id,'revision',coalesce(s.revision,0)+1);
 INSERT INTO dqa_private.blank_request_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'blank_request_template_state',p_tenant,'UPDATE',ARRAY['default_template_id']);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.set_blank_request_template_default(uuid,uuid,text,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.set_blank_request_template_default(uuid,uuid,text,integer,text) TO authenticated;
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
