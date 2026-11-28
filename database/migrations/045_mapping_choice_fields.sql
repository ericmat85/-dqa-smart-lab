-- Extend explicit checkbox/content mappings without rewriting existing mappings or submitted snapshots.
CREATE OR REPLACE FUNCTION dqa_private.validate_original_fields(p_details jsonb,p_signature text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b bytea; mime text;
BEGIN
 IF p_details IS NOT NULL AND (jsonb_typeof(p_details)<>'object' OR octet_length(p_details::text)>20000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN ('product','productType','project','customerPartNo','priority','testItems','purpose','purposeOther','sampleSource','sampleSourceOther','sourceInHouseContent','sourceOverseasContent','sourceCustomerContent','sourceSupplierContent','sourceCompetitorContent','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','judgementRequired','notes'))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ORIGINAL_FORM_INVALID'; END IF;
 IF p_details IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE (e.key IN ('testItems','purpose','sampleSource') AND (CASE WHEN jsonb_typeof(e.value)='array' THEN jsonb_array_length(e.value)>20 ELSE true END)) OR (e.key NOT IN ('testItems','purpose','sampleSource') AND (jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>6000))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ORIGINAL_FORM_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_details) e CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN e.key IN ('testItems','purpose','sampleSource') AND jsonb_typeof(e.value)='array' THEN e.value ELSE '[]'::jsonb END) v WHERE jsonb_typeof(v)<>'string' OR length(v#>>'{}')>300) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ORIGINAL_FORM_INVALID'; END IF;
 END IF;
 IF p_signature='' THEN RETURN; END IF;
 IF length(p_signature)>1400000 OR p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_SIGNATURE_INVALID'; END IF;
 BEGIN b:=decode(split_part(p_signature,',',2),'base64'); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_SIGNATURE_INVALID'; END;
 IF octet_length(b)>1048576 OR octet_length(b)<4 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_SIGNATURE_INVALID'; END IF;
 mime:=split_part(split_part(p_signature,';',1),':',2);
 IF (mime='image/png' AND (octet_length(b)<33 OR encode(substring(b from 1 for 8),'hex')<>'89504e470d0a1a0a')) OR (mime='image/jpeg' AND (encode(substring(b from 1 for 2),'hex')<>'ffd8' OR encode(substring(b from octet_length(b)-1 for 2),'hex')<>'ffd9')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_SIGNATURE_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION dqa_private.validate_original_fields(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_private.validate_request_choice_contents(p_details jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source text;field text;modern boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_details->'purpose','[]')) x WHERE (x LIKE '其他%' OR x ~* '^other\M')) AND coalesce(length(btrim(p_details->>'purposeOther')),0)=0 THEN RAISE EXCEPTION 'OTHER_PURPOSE_REQUIRED';END IF;
 modern:=p_details ?| ARRAY['sourceInHouseContent','sourceOverseasContent','sourceCustomerContent','sourceSupplierContent','sourceCompetitorContent'];
 FOR source IN SELECT jsonb_array_elements_text(coalesce(p_details->'sampleSource','[]')) LOOP
  field:=CASE WHEN source LIKE '社內%' THEN 'sourceInHouseContent' WHEN source LIKE '海外廠%' THEN 'sourceOverseasContent' WHEN source LIKE '客戶%' THEN 'sourceCustomerContent' WHEN source LIKE '廠商%' THEN 'sourceSupplierContent' WHEN source LIKE '競品%' THEN 'sourceCompetitorContent' END;
  IF modern THEN IF field IS NULL OR coalesce(length(btrim(p_details->>field)),0)=0 THEN RAISE EXCEPTION 'ORIGINAL_SOURCE_REQUIRED';END IF;
  ELSIF coalesce(length(btrim(p_details->>'sampleSourceOther')),0)=0 THEN RAISE EXCEPTION 'ORIGINAL_SOURCE_REQUIRED';END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION dqa_private.validate_request_choice_contents(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION dqa_business.save_document_mapping(p_tenant uuid,p_operation uuid,p_kind text,p_file uuid,p_revision integer,p_sha256 text,p_mapping jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb;fp text;op dqa_private.document_mapping_operations;old dqa_private.document_cell_mappings;result jsonb;
BEGIN
 IF NOT dqa_private.is_admin(p_tenant) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_file IS NULL OR p_kind NOT IN('REQUEST','REPORT') OR p_kind IS NULL OR p_revision IS NULL OR p_revision<0 OR p_sha256 IS NULL THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_typeof(p_mapping) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF jsonb_array_length(p_mapping) NOT BETWEEN 1 AND 80 OR octet_length(p_mapping::text)>24000 THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r WHERE jsonb_typeof(r)<>'object' OR (r-'field'-'sheet'-'cell')<>'{}' OR jsonb_typeof(r->'field') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'sheet') IS DISTINCT FROM 'string' OR length(r->>'sheet') NOT BETWEEN 1 AND 31 OR jsonb_typeof(r->'cell') IS DISTINCT FROM 'string' OR r->>'cell' !~ '^([A-Z]|A[A-V])([1-9][0-9]{0,2}|1[0-9]{3}|2000)$' OR r->>'field' NOT IN('id','productCode','productType','customer','customerPartNo','dueDate','quantity','department','requester','supervisor','priority','project','testItems','specification','judgementRequired','judgementCriteria','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','notes','sourceInHouse','sourceOverseas','sourceCustomer','sourceSupplier','sourceCompetitor','judgementRequiredCheck','judgementNotRequiredCheck','purposeNewProduct','purposeEV','purposeReproduction','purposeOtherSelected','purposeDesignChange','purposeDV','purposePeriodic','purposeMassProduct','purposePV','purposeOtherContent','sourceInHouseContent','sourceOverseasContent','sourceCustomerContent','sourceSupplierContent','sourceCompetitorContent')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_mapping) r GROUP BY r->>'sheet',r->>'cell' HAVING count(*)>1) THEN RAISE EXCEPTION 'DOCUMENT_MAPPING_INVALID';END IF;
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
CREATE OR REPLACE FUNCTION dqa_private.pin_request_trial_template() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trial uuid;file uuid;blank dqa_private.blank_request_templates;rm jsonb:='[]';tm jsonb:='[]';dept text;execution text;
BEGIN
 PERFORM dqa_private.validate_request_choice_contents(NEW.payload->'form_details');
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
