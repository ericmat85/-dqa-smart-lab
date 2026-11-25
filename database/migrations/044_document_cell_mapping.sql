-- Explicit request/report mapping, captured with the submitted document. Existing records are not rewritten.
CREATE TABLE dqa_private.document_cell_mappings(tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,kind text NOT NULL CHECK(kind IN('REQUEST','REPORT')),file_id uuid NOT NULL,sha256 text NOT NULL,revision integer NOT NULL CHECK(revision>0),mapping jsonb NOT NULL,PRIMARY KEY(tenant_id,kind,file_id));
CREATE TABLE dqa_private.document_mapping_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.mapped_document_pins(tenant_id uuid NOT NULL,document_id uuid NOT NULL,request_id uuid NOT NULL,payload jsonb NOT NULL,department text NOT NULL,execution_kind text NOT NULL,request_file_id uuid,request_name text,request_content bytea,request_sha256 text,request_mapping jsonb NOT NULL,report_mapping jsonb NOT NULL,PRIMARY KEY(tenant_id,document_id),FOREIGN KEY(tenant_id,document_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id) ON DELETE CASCADE);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['document_cell_mappings','document_mapping_operations','mapped_document_pins'] LOOP EXECUTE format('ALTER TABLE dqa_private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON dqa_private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
CREATE OR REPLACE FUNCTION dqa_business.save_trial_template_binding(p_tenant uuid,p_operation uuid,p_trial uuid,p_revision integer,p_file uuid,p_name text,p_version text,p_sha256 text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fp text;op dqa_private.trial_template_operations;old dqa_private.trial_template_bindings;file dqa_private.trial_template_files;bytes bytea;result jsonb;
BEGIN
 IF NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_ADMIN_REQUIRED';END IF;
 IF p_operation IS NULL OR p_trial IS NULL OR p_revision IS NULL OR p_revision<0 OR NOT EXISTS(SELECT 1 FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=p_trial AND enabled) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 IF p_content IS NOT NULL THEN
  IF p_file IS NULL OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 160 OR p_name!~*'\.xlsx$' OR p_name~'[\r\n/\\]' OR p_version IS NULL OR length(btrim(p_version)) NOT BETWEEN 1 AND 80 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR length(p_content)>2796204 OR p_content!~'^[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
  BEGIN bytes:=decode(p_content,'base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END;
  IF octet_length(bytes) NOT BETWEEN 22 AND 2097152 OR substring(bytes FROM 1 FOR 4)<>decode('504b0304','hex') OR encode(sha256(bytes),'hex')<>p_sha256 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END IF;
 ELSE
  IF p_name IS NOT NULL OR p_version IS NOT NULL OR (p_file IS NULL AND p_sha256 IS NOT NULL) OR (p_file IS NOT NULL AND (p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FIELDS_INVALID';END IF;
 END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_trial,p_revision,p_file,p_name,p_version,p_sha256,p_content IS NOT NULL)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-operation:'||p_tenant||':'||p_operation,0));
 SELECT * INTO op FROM dqa_private.trial_template_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||p_tenant||':'||p_trial,0));
 SELECT * INTO old FROM dqa_private.trial_template_bindings WHERE tenant_id=p_tenant AND trial_id=p_trial;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REVISION_CONFLICT';END IF;
 IF p_file IS NOT NULL AND EXISTS(SELECT 1 FROM dqa_private.blank_request_templates x WHERE x.tenant_id=p_tenant AND x.sha256=p_sha256) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REQUEST_FORM_DENIED';END IF;
 IF bytes IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('trial-template-files:'||p_tenant,0));
  IF (SELECT count(*) FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant)>=100 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_LIMIT';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_OPERATION_CONFLICT';END IF;
  INSERT INTO dqa_private.trial_template_files(tenant_id,id,trial_id,name,version,content,sha256,created_by) VALUES(p_tenant,p_file,p_trial,p_name,btrim(p_version),bytes,p_sha256,auth.uid());
 ELSIF p_file IS NOT NULL THEN
  SELECT * INTO file FROM dqa_private.trial_template_files WHERE tenant_id=p_tenant AND id=p_file AND trial_id=p_trial;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_NOT_FOUND';END IF;IF file.sha256<>p_sha256 THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_FILE_INVALID';END IF;
 END IF;
 INSERT INTO dqa_private.trial_template_bindings(tenant_id,trial_id,file_id,revision) VALUES(p_tenant,p_trial,p_file,1) ON CONFLICT(tenant_id,trial_id) DO UPDATE SET file_id=p_file,revision=dqa_private.trial_template_bindings.revision+1;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','trial_id',p_trial,'file_id',p_file,'revision',coalesce(old.revision,0)+1);
 INSERT INTO dqa_private.trial_template_operations(tenant_id,id,actor,fingerprint,result) VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'trial_template_bindings',p_trial,'UPDATE',ARRAY['file_id','revision']);
 RETURN result;
END $$;
CREATE FUNCTION dqa_business.document_mapping_source(p_tenant uuid,p_kind text,p_file uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f record;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 IF p_kind='REQUEST' THEN
  SELECT t.id,t.name,t.version,t.content,t.sha256 INTO f FROM dqa_private.blank_request_templates t JOIN dqa_private.blank_request_template_state s ON s.tenant_id=t.tenant_id AND s.default_template_id=t.id WHERE t.tenant_id=p_tenant AND t.id=p_file;
 ELSIF p_kind='REPORT' THEN
  SELECT t.id,t.name,t.version,t.content,t.sha256 INTO f FROM dqa_private.trial_template_files t JOIN dqa_private.trial_template_bindings b ON b.tenant_id=t.tenant_id AND b.file_id=t.id AND b.trial_id=t.trial_id WHERE t.tenant_id=p_tenant AND t.id=p_file AND NOT EXISTS(SELECT 1 FROM dqa_private.blank_request_templates x WHERE x.tenant_id=t.tenant_id AND x.sha256=t.sha256);
 ELSE RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF f.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_NOT_FOUND';END IF;
 RETURN jsonb_build_object('id',f.id,'name',f.name,'version',f.version,'sha256',f.sha256,'byteLength',octet_length(f.content),'content',replace(encode(f.content,'base64'),E'\n',''));
END $$;
CREATE FUNCTION dqa_business.document_mapping_catalog(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE targets jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('mapping',coalesce(m.mapping,'[]'),'revision',coalesce(m.revision,0)) ORDER BY x.kind,x.label),'[]') INTO targets FROM(
 SELECT 'REQUEST'::text kind,t.id file_id,t.name,t.version,t.sha256,'工作區預設委託單'::text label FROM dqa_private.blank_request_templates t JOIN dqa_private.blank_request_template_state s ON s.tenant_id=t.tenant_id AND s.default_template_id=t.id WHERE t.tenant_id=p_tenant
 UNION ALL
 SELECT 'REPORT',f.id,f.name,f.version,f.sha256,t.name FROM dqa_private.trial_template_files f JOIN dqa_private.trial_template_bindings b ON b.tenant_id=f.tenant_id AND b.file_id=f.id JOIN dqa_business.trial_definitions t ON t.tenant_id=b.tenant_id AND t.id=b.trial_id WHERE f.tenant_id=p_tenant AND t.enabled AND NOT EXISTS(SELECT 1 FROM dqa_private.blank_request_templates x WHERE x.tenant_id=f.tenant_id AND x.sha256=f.sha256)
 )x LEFT JOIN dqa_private.document_cell_mappings m ON m.tenant_id=p_tenant AND m.kind=x.kind AND m.file_id=x.file_id;
 RETURN jsonb_build_object('targets',targets);
END $$;
CREATE FUNCTION dqa_business.save_document_mapping(p_tenant uuid,p_operation uuid,p_kind text,p_file uuid,p_revision integer,p_sha256 text,p_mapping jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb;fp text;op dqa_private.document_mapping_operations;old dqa_private.document_cell_mappings;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_file IS NULL OR p_kind NOT IN('REQUEST','REPORT') OR p_kind IS NULL OR p_revision IS NULL OR p_revision<0 OR p_sha256 IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_typeof(p_mapping) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_array_length(p_mapping) NOT BETWEEN 1 AND 80 OR octet_length(p_mapping::text)>24000 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r WHERE jsonb_typeof(r)<>'object' OR (r-'field'-'sheet'-'cell')<>'{}' OR jsonb_typeof(r->'field') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'sheet') IS DISTINCT FROM 'string' OR length(r->>'sheet') NOT BETWEEN 1 AND 31 OR jsonb_typeof(r->'cell') IS DISTINCT FROM 'string' OR r->>'cell' !~ '^([A-Z]|A[A-V])([1-9][0-9]{0,2}|1[0-9]{3}|2000)$' OR r->>'field' NOT IN('id','productCode','productType','customer','customerPartNo','dueDate','quantity','department','requester','supervisor','priority','project','testItems','specification','judgementRequired','judgementCriteria','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','notes','sourceInHouse','sourceOverseas','sourceCustomer','sourceSupplier','sourceCompetitor')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r GROUP BY r->>'sheet',r->>'cell' HAVING count(*)>1) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_file,p_revision,p_sha256,p_mapping)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('mapping-op:'||p_tenant||':'||p_operation,0));SELECT * INTO op FROM dqa_private.document_mapping_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('document-mapping:'||p_tenant,0));s:=dqa_business.document_mapping_source(p_tenant,p_kind,p_file);
 IF s->>'sha256'<>p_sha256 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;
 SELECT * INTO old FROM dqa_private.document_cell_mappings WHERE tenant_id=p_tenant AND kind=p_kind AND file_id=p_file;
 IF coalesce(old.revision,0)<>p_revision THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_CONFLICT';END IF;
 INSERT INTO dqa_private.document_cell_mappings(tenant_id,kind,file_id,sha256,revision,mapping) VALUES(p_tenant,p_kind,p_file,p_sha256,1,p_mapping) ON CONFLICT(tenant_id,kind,file_id) DO UPDATE SET mapping=p_mapping,revision=dqa_private.document_cell_mappings.revision+1;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','revision',coalesce(old.revision,0)+1);INSERT INTO dqa_private.document_mapping_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result);
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'document_cell_mappings',p_file,'UPDATE',ARRAY['mapping','revision']);RETURN result;
END $$;
CREATE FUNCTION dqa_business.document_mapping_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;BEGIN IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;SELECT o.result INTO result FROM dqa_private.document_mapping_operations o WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid();RETURN coalesce(result,jsonb_build_object('id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND'));END $$;
CREATE OR REPLACE FUNCTION dqa_private.pin_request_trial_template() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trial uuid;file uuid;blank dqa_private.blank_request_templates;rm jsonb:='[]';tm jsonb:='[]';dept text;execution text;
BEGIN
 IF coalesce(jsonb_array_length(NEW.payload->'form_details'->'sampleSource'),0)>0 AND coalesce(length(btrim(NEW.payload->'form_details'->>'sampleSourceOther')),0)=0 THEN RAISE EXCEPTION 'ORIGINAL_SOURCE_REQUIRED';END IF;
 SELECT trial_id,execution_kind INTO trial,execution FROM dqa_business.requests WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
 IF trial IS NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('trial-template:'||NEW.tenant_id||':'||trial,0));
 SELECT file_id INTO file FROM dqa_private.trial_template_bindings WHERE tenant_id=NEW.tenant_id AND trial_id=trial;
 PERFORM pg_advisory_xact_lock(hashtextextended('document-mapping:'||NEW.tenant_id,0));
 SELECT t.* INTO blank FROM dqa_private.blank_request_templates t JOIN dqa_private.blank_request_template_state s ON s.tenant_id=t.tenant_id AND s.default_template_id=t.id WHERE t.tenant_id=NEW.tenant_id;
 IF blank.id IS NOT NULL THEN SELECT mapping INTO rm FROM dqa_private.document_cell_mappings WHERE tenant_id=NEW.tenant_id AND kind='REQUEST' AND file_id=blank.id AND sha256=blank.sha256;IF rm IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_REQUIRED';END IF;END IF;
 IF file IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM dqa_private.blank_request_templates b JOIN dqa_private.trial_template_files f ON f.tenant_id=b.tenant_id AND f.sha256=b.sha256 WHERE f.tenant_id=NEW.tenant_id AND f.id=file) THEN RAISE EXCEPTION 'TRIAL_TEMPLATE_REQUEST_FORM_DENIED';END IF;
  SELECT mapping INTO tm FROM dqa_private.document_cell_mappings WHERE tenant_id=NEW.tenant_id AND kind='REPORT' AND file_id=file;IF tm IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_REQUIRED';END IF;
 END IF;
 SELECT d.name INTO dept FROM dqa_business.memberships m LEFT JOIN dqa_business.departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.submitted_by;
 INSERT INTO dqa_private.request_trial_template_pins(tenant_id,document_id,request_id,trial_id,file_id) VALUES(NEW.tenant_id,NEW.id,NEW.request_id,trial,file);
 INSERT INTO dqa_private.mapped_document_pins VALUES(NEW.tenant_id,NEW.id,NEW.request_id,NEW.payload,coalesce(dept,''),execution,blank.id,blank.name,blank.content,blank.sha256,coalesce(rm,'[]'),coalesce(tm,'[]'));
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_business.document_mapping_case(p_tenant uuid,p_kind text,p_document uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pin dqa_private.mapped_document_pins;r jsonb;q dqa_business.requests;
BEGIN
 IF p_kind NOT IN('REQUEST','REPORT') OR p_kind IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND request_document_version_id=p_document;
 IF q.id IS NULL OR NOT dqa_private.can(p_tenant) OR NOT dqa_private.can_read_request(p_tenant,q.id) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 SELECT * INTO pin FROM dqa_private.mapped_document_pins WHERE tenant_id=p_tenant AND document_id=p_document;
 IF p_kind='REPORT' THEN
  r:=dqa_business.request_trial_template_file(p_tenant,p_document);IF r->>'has_template'='false' THEN RETURN r;END IF;
  IF pin.document_id IS NULL OR jsonb_array_length(pin.report_mapping)=0 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_REQUIRED';END IF;
  r:=r||jsonb_build_object('mapping',pin.report_mapping);
 ELSE
  IF pin.request_file_id IS NULL THEN RETURN jsonb_build_object('has_template',false);END IF;
  r:=jsonb_build_object('has_template',true,'id',pin.request_file_id,'document_id',p_document,'name',pin.request_name,'sha256',pin.request_sha256,'byteLength',octet_length(pin.request_content),'content',replace(encode(pin.request_content,'base64'),E'\n',''),'mapping',pin.request_mapping);
 END IF;
 RETURN r||jsonb_build_object('kind',p_kind,'request_code',q.legacy_id,'payload',pin.payload,'department',pin.department,'execution_kind',pin.execution_kind);
END $$;
DO $$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('document_mapping_source','document_mapping_catalog','save_document_mapping','document_mapping_result','document_mapping_case') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END LOOP;END $$;
CREATE FUNCTION dqa_business.document_mapping_report_context(p_tenant uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE doc uuid;BEGIN SELECT request_document_version_id INTO doc FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;RETURN dqa_business.document_mapping_case(p_tenant,'REPORT',doc);END $$;
REVOKE ALL ON FUNCTION dqa_business.document_mapping_report_context(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.document_mapping_report_context(uuid,uuid) TO authenticated;
