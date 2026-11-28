-- Per-item signed compound protocols in an atomic mixed project. Existing project and review transactions are reused.
CREATE OR REPLACE FUNCTION dqa_private.project_child_data(p_command jsonb, p_item jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT (p_command->'common')||jsonb_build_object('trial_id',p_item->'trial_id','quantity',p_item->'quantity','specification',p_item->>'specification','acceptance',p_item->>'acceptance','form_details',(p_command->'common'->'form_details')||CASE WHEN p_item ? 'compound' THEN jsonb_build_object('compoundStages',p_item->'compound'->'stages','compoundVersion',1,'compoundLabel',p_item->'compound'->>'label') ELSE '{}'::jsonb END||jsonb_build_object('priority','專案','project',p_command->>'name','testItems',jsonb_build_array(p_item->>'name'),'judgementRequired',p_item->>'judgementRequired'))
$function$
;
CREATE OR REPLACE FUNCTION dqa_private.validate_original_fields(p_details jsonb, p_signature text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF p_details IS NOT NULL AND octet_length(p_details::text)>20000 THEN RAISE EXCEPTION 'ORIGINAL_FORM_INVALID';END IF;
 IF p_details ? 'compoundStages' AND (jsonb_typeof(p_details->'compoundStages') IS DISTINCT FROM 'array' OR p_details->>'compoundVersion' IS DISTINCT FROM '1') THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF NOT(p_details ? 'compoundStages') AND p_details ? 'compoundVersion' THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 IF p_details ? 'compoundLabel' AND (NOT(p_details ? 'compoundStages') OR jsonb_typeof(p_details->'compoundLabel') IS DISTINCT FROM 'string' OR length(btrim(p_details->>'compoundLabel')) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
 PERFORM dqa_private.validate_single_original_fields_v48(p_details-ARRAY['compoundStages','compoundVersion','compoundLabel'],p_signature);
END $function$
;
CREATE OR REPLACE FUNCTION dqa_private.validate_project_request(p_tenant uuid, p_command jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE item jsonb;data jsonb;t dqa_business.trial_definitions;
BEGIN
 IF NOT dqa_private.can(p_tenant,'requests.draft') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='DRAFT_WRITE_DENIED';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['name','execution_kind','submit','common','items']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('name','execution_kind','submit','common','items'))
 OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'name')) NOT BETWEEN 1 AND 100 OR coalesce(p_command->>'execution_kind','') NOT IN('REAL','VIRTUAL') OR jsonb_typeof(p_command->'submit') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_command->'common') IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
 IF jsonb_array_length(p_command->'items') NOT BETWEEN 1 AND 100 OR octet_length(p_command::text)>4194304 THEN RAISE EXCEPTION 'PROJECT_LIMIT';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_command->'items') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['trial_id','name','quantity','specification','acceptance','judgementRequired']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('trial_id','name','quantity','specification','acceptance','judgementRequired','compound')) OR coalesce(item->>'trial_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(item->>'judgementRequired','') NOT IN('需作判定','不作判定') OR jsonb_typeof(item->'specification')<>'string' OR jsonb_typeof(item->'acceptance')<>'string' OR length(item->>'specification')>3000 OR length(item->>'acceptance')>3000 THEN RAISE EXCEPTION 'PROJECT_FIELDS_INVALID';END IF;
  SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(item->>'trial_id')::uuid AND enabled;
  IF NOT FOUND OR item->>'name' IS DISTINCT FROM t.name THEN RAISE EXCEPTION 'TRIAL_NOT_AVAILABLE';END IF;
  IF item ? 'compound' THEN
   IF p_command->'common'->'form_details' ? 'compoundStages' OR t.profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT' OR jsonb_typeof(item->'compound') IS DISTINCT FROM 'object' OR NOT(item->'compound' ?& ARRAY['version','label','stages']) OR (SELECT count(*) FROM jsonb_object_keys(item->'compound'))<>3 OR item->'compound'->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(item->'compound'->'label') IS DISTINCT FROM 'string' OR length(btrim(item->'compound'->>'label')) NOT BETWEEN 1 AND 100 OR coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,3}$' OR (item->>'quantity')::int>1000 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_INVALID';END IF;
   PERFORM dqa_private.validate_compound_protocol(p_tenant,item->'compound'->'stages');
  ELSIF t.profile_code='COMPOUND_ENVIRONMENT' THEN
   IF jsonb_array_length(p_command->'items')<>1 THEN RAISE EXCEPTION 'COMPOUND_PROTOCOL_REQUIRED';END IF;
   PERFORM dqa_private.validate_compound_protocol(p_tenant,p_command->'common'->'form_details'->'compoundStages');
  ELSIF p_command->'common'->'form_details' ? 'compoundStages' THEN RAISE EXCEPTION 'COMPOUND_TRIAL_REQUIRED';END IF;
  data:=dqa_private.project_child_data(p_command,item);PERFORM dqa_private.validate_draft(data);
  IF (p_command->>'submit')::boolean AND (coalesce(length(btrim(item->>'specification')),0)=0 OR coalesce(length(btrim(item->>'acceptance')),0)=0 OR coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,5}$') THEN RAISE EXCEPTION 'WORKFLOW_REQUEST_INCOMPLETE';END IF;
 END LOOP;
END $function$
;