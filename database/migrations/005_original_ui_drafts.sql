-- Original form projection: draft content only. Existing workflow gates remain unchanged.
ALTER TABLE dqa_business.requests ADD COLUMN form_details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(form_details)='object' AND octet_length(form_details::text)<=20000);
ALTER TABLE dqa_business.requests ADD COLUMN draft_signature_data text NOT NULL DEFAULT '' CHECK(length(draft_signature_data)<=1400000);
CREATE FUNCTION dqa_private.validate_original_fields(p_details jsonb,p_signature text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b bytea; mime text;
BEGIN
 IF p_details IS NOT NULL AND (jsonb_typeof(p_details)<>'object' OR octet_length(p_details::text)>20000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN ('product','productType','project','customerPartNo','priority','testItems','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','judgementRequired','notes'))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ORIGINAL_FORM_INVALID'; END IF;
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
CREATE OR REPLACE FUNCTION dqa_private.validate_draft(p_data jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1500000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('trial_id','product_code','customer_name','purpose','quantity','requested_date','sample_space_units','specification','acceptance','form_details','draft_signature_data')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE e.key IN ('product_code','customer_name','purpose','specification','acceptance','requested_date','trial_id') AND jsonb_typeof(e.value) NOT IN ('string','null')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE e.key IN ('quantity','sample_space_units') AND (jsonb_typeof(e.value) NOT IN ('number','null') OR e.value::text !~ '^(null|[1-9][0-9]{0,5})$')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_INVALID';
 END IF;
 IF p_data ? 'draft_signature_data' AND jsonb_typeof(p_data->'draft_signature_data')<>'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_SIGNATURE_INVALID'; END IF;
 PERFORM dqa_private.validate_original_fields(p_data->'form_details',coalesce(p_data->>'draft_signature_data',''));
 IF coalesce(length(p_data->>'product_code'),0)>120 OR coalesce(length(p_data->>'customer_name'),0)>200
 OR coalesce(length(p_data->>'purpose'),0)>2000 OR coalesce(length(p_data->>'specification'),0)>6000 OR coalesce(length(p_data->>'acceptance'),0)>2000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DRAFT_FIELDS_TOO_LONG';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION dqa_business.create_request_draft(p_tenant uuid,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM dqa_private.validate_draft(p_data);
 -- Request id is an idempotency key. The first accepted payload wins; mismatched retries are rejected.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_id::text,0));
 IF EXISTS(SELECT 1 FROM dqa_business.requests WHERE id=p_id) THEN
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY';
 END IF;
 IF p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 INSERT INTO dqa_business.requests(id,tenant_id,legacy_id,owner_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,trial_snapshot,form_details,draft_signature_data)
 VALUES(p_id,p_tenant,'REQ-'||upper(replace(p_id::text,'-','')),member,trial.id,p_data->>'product_code',p_data->>'customer_name',coalesce(p_data->>'purpose',''),(p_data->>'quantity')::integer,(p_data->>'requested_date')::date,(p_data->>'sample_space_units')::integer,coalesce(p_data->>'specification',trial.specification,''),coalesce(p_data->>'acceptance',trial.acceptance,''),
 CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END,coalesce(p_data->'form_details','{}'),coalesce(p_data->>'draft_signature_data',''))
 RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION dqa_business.update_request_draft(p_tenant uuid,p_id uuid,p_expected_revision bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; result dqa_business.requests; trial dqa_business.trial_definitions;
BEGIN
 member:=dqa_private.member_id(p_tenant);
 IF member IS NULL OR NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED'; END IF;
 PERFORM dqa_private.validate_draft(p_data);
 SELECT * INTO result FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_id AND owner_member_id=member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_NOT_AVAILABLE'; END IF;
 IF result.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 IF result.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF p_data ? 'trial_id' AND p_data->>'trial_id' IS NOT NULL THEN
  SELECT * INTO trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_NOT_AVAILABLE'; END IF;
 END IF;
 UPDATE dqa_business.requests SET
  form_details=CASE WHEN p_data ? 'form_details' THEN p_data->'form_details' ELSE result.form_details END,
  draft_signature_data=CASE WHEN p_data ? 'draft_signature_data' THEN p_data->>'draft_signature_data' ELSE result.draft_signature_data END,
  trial_id=CASE WHEN p_data ? 'trial_id' THEN trial.id ELSE result.trial_id END,
  product_code=CASE WHEN p_data ? 'product_code' THEN p_data->>'product_code' ELSE result.product_code END,
  customer_name=CASE WHEN p_data ? 'customer_name' THEN p_data->>'customer_name' ELSE result.customer_name END,
  purpose=CASE WHEN p_data ? 'purpose' THEN coalesce(p_data->>'purpose','') ELSE result.purpose END,
  quantity=CASE WHEN p_data ? 'quantity' THEN (p_data->>'quantity')::integer ELSE result.quantity END,
  requested_date=CASE WHEN p_data ? 'requested_date' THEN (p_data->>'requested_date')::date ELSE result.requested_date END,
  sample_space_units=CASE WHEN p_data ? 'sample_space_units' THEN (p_data->>'sample_space_units')::integer ELSE result.sample_space_units END,
  specification=CASE WHEN p_data ? 'specification' THEN coalesce(p_data->>'specification','') WHEN p_data ? 'trial_id' THEN coalesce(trial.specification,'') ELSE result.specification END,
  acceptance=CASE WHEN p_data ? 'acceptance' THEN coalesce(p_data->>'acceptance','') WHEN p_data ? 'trial_id' THEN coalesce(trial.acceptance,'') ELSE result.acceptance END,
  trial_snapshot=CASE WHEN p_data ? 'trial_id' THEN CASE WHEN trial.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('trial_id',trial.id,'name',trial.name,'version',trial.specification_version,'source_kind',trial.source_kind) END ELSE result.trial_snapshot END
 WHERE tenant_id=p_tenant AND id=p_id AND revision=p_expected_revision RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;

CREATE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}';
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 FOR definition IN SELECT * FROM (VALUES
('requests','requests','id,tenant_id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details'),
('trials','trial_definitions','id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision'),
('equipment','equipment','id,legacy_id,name,category,model,serial_number,site_id,owner_member_id,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision'),
('materials','materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,site_id,owner_member_id,status,revision'),
('schedules','schedules','id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,revision'),
('members','memberships','id,legacy_id,display_name,role_id,department_id,site_id,enabled'),
('roles','roles','id,code,name,is_tenant_admin,permissions,enabled'),
('sites','sites','id,legacy_id,name,location'),
('departments','departments','id,legacy_id,name,parent_id'),
('borrows','borrows','id,legacy_id,borrower_member_id,equipment_id,material_id,quantity,purpose,starts_at,due_at,status'),
('operations','lab_operations','id,request_id,actor_member_id,action,reason,status,created_at'),
('allocations','schedule_equipment','id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity,released_at'),
('quality','quality_records','id,title,owner_member_id,request_id,equipment_id,trial_id,status,severity,cause,action,resolution,due_on'),
('qualifications','qualifications','id,member_id,equipment_id,trial_id,training,issued_on,expires_on,status'),
('reports','reports','id,request_id,status,revision,created_at,updated_at')
 ) t(name,table_name,columns) LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) FROM (SELECT %s FROM dqa_business.%I WHERE tenant_id=$1 ORDER BY id LIMIT 1001) r',definition.columns,definition.table_name) INTO rows USING p_tenant;
 IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED'; END IF;
 result:=result||jsonb_build_object(definition.name,rows);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.original_ui_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.original_ui_snapshot(uuid) TO authenticated;
