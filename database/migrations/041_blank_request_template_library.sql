-- A reference-template library, independent of submitted requests and signatures.
CREATE TABLE dqa_private.blank_request_templates(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160 AND name ~* '\.xlsx$' AND name !~ '[\r\n/\\]'),
 version text NOT NULL CHECK(length(btrim(version)) BETWEEN 1 AND 80),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 22 AND 2097152),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revision integer NOT NULL DEFAULT 1 CHECK(revision=1),
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE dqa_private.blank_request_template_state(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,builtin_hidden boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 0);
CREATE TABLE dqa_private.blank_request_template_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id));
REVOKE ALL ON dqa_private.blank_request_templates,dqa_private.blank_request_template_state,dqa_private.blank_request_template_operations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE dqa_private.blank_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.blank_request_template_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.blank_request_template_operations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION dqa_business.blank_request_template_library(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;state dqa_private.blank_request_template_state;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ACCESS_DENIED';END IF;
 SELECT * INTO state FROM dqa_private.blank_request_template_state WHERE tenant_id=p_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'version',t.version,'trialId','BLANK','synthetic',true,'createdBy',t.created_by,'createdAt',t.created_at,'revision',t.revision,'sha256',t.sha256,'byteLength',octet_length(t.content),'trialBinding',jsonb_build_object('status','BLANK')) ORDER BY t.created_at DESC,t.id),'[]') INTO rows FROM dqa_private.blank_request_templates t WHERE tenant_id=p_tenant;
 RETURN jsonb_build_object('rows',rows,'builtin_visible',NOT coalesce(state.builtin_hidden,false),'revision',coalesce(state.revision,0),'can_manage',dqa_private.is_admin(p_tenant),'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.blank_request_template_file(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t dqa_private.blank_request_templates;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ACCESS_DENIED';END IF;
 SELECT * INTO t FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND';END IF;
 RETURN jsonb_build_object('id',t.id,'name',t.name,'version',t.version,'trialId','BLANK','synthetic',true,'createdBy',t.created_by,'createdAt',t.created_at,'revision',t.revision,'sha256',t.sha256,'byteLength',octet_length(t.content),'content',replace(encode(t.content,'base64'),E'\n',''));
END $$;
CREATE FUNCTION dqa_business.blank_request_template_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ADMIN_REQUIRED';END IF;
 SELECT o.result INTO result FROM dqa_private.blank_request_template_operations o WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid();
 RETURN coalesce(result,jsonb_build_object('id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND'));
END $$;
CREATE FUNCTION dqa_business.save_blank_request_template(p_tenant uuid,p_operation uuid,p_id uuid,p_name text,p_version text,p_sha256 text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bytes bytea;fp text;op dqa_private.blank_request_template_operations;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_id IS NULL OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 160 OR p_name !~* '\.xlsx$' OR p_name ~ '[\r\n/\\]' OR p_version IS NULL OR length(btrim(p_version)) NOT BETWEEN 1 AND 80 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_content IS NULL OR length(p_content)>2796204 OR p_content !~ '^[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION 'TEMPLATE_FIELDS_INVALID';END IF;
 BEGIN bytes:=decode(p_content,'base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TEMPLATE_FIELDS_INVALID';END;
 IF octet_length(bytes) NOT BETWEEN 22 AND 2097152 OR substring(bytes FROM 1 FOR 4)<>decode('504b0304','hex') OR encode(sha256(bytes),'hex')<>p_sha256 THEN RAISE EXCEPTION 'TEMPLATE_FILE_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array('SAVE',p_id,p_name,btrim(p_version),p_sha256)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('blank-templates:'||p_tenant,0));
 SELECT * INTO op FROM dqa_private.blank_request_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 IF (SELECT count(*) FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant)>=50 THEN RAISE EXCEPTION 'TEMPLATE_LIMIT';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=p_id) THEN RAISE EXCEPTION 'TEMPLATE_OPERATION_CONFLICT';END IF;
 INSERT INTO dqa_private.blank_request_templates(tenant_id,id,name,version,content,sha256,created_by) VALUES(p_tenant,p_id,p_name,btrim(p_version),bytes,p_sha256,auth.uid());
 result:=jsonb_build_object('id',p_operation,'template_id',p_id,'state','SAVED');
 INSERT INTO dqa_private.blank_request_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'blank_request_templates',p_id,'INSERT',ARRAY['name','version','sha256']);
 RETURN result;
END $$;
CREATE FUNCTION dqa_business.delete_blank_request_template(p_tenant uuid,p_operation uuid,p_id text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 DELETE FROM dqa_private.blank_request_templates WHERE tenant_id=p_tenant AND id=t.id;record_id:=t.id;
 END IF;
 result:=jsonb_build_object('id',p_operation,'template_id',p_id,'state','DELETED');
 INSERT INTO dqa_private.blank_request_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'blank_request_templates',record_id,'DELETE',ARRAY['library_entry']);
 RETURN result;
END $$;
DO $$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('blank_request_template_library','blank_request_template_file','blank_request_template_result','save_blank_request_template','delete_blank_request_template') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END LOOP;END $$;
