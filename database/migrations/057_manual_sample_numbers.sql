-- Manual, whole-group sample entry. Existing saved groups and signed cases are preserved.
CREATE FUNCTION dqa_business.save_preapproval_sample_numbers(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_plan_revision bigint,p_action text,p_codes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;n dqa_private.preapproval_samples;d dqa_business.schedule_drafts;op dqa_private.preapproval_number_operations;fp text;result jsonb;codes text[];rev integer;joined text;bound_plan jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF p_operation IS NULL OR p_document IS NULL OR p_request_revision IS NULL OR p_revision IS NULL OR p_revision<0 OR p_plan_revision IS NULL OR p_action IS NULL OR p_action NOT IN('SAVE','DELETE') THEN RAISE EXCEPTION 'PREAPPROVAL_FIELDS_INVALID';END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_request,p_document,p_request_revision,p_revision,p_plan_revision,p_action,p_codes)::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.preapproval_number_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request FOR UPDATE;
 IF q.request_document_version_id IS DISTINCT FROM p_document OR q.revision IS DISTINCT FROM p_request_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF NOT dqa_private.preapproval_document(p_tenant,p_document) OR q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0 THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=p_request FOR UPDATE;
 IF d.id IS NULL OR d.document_version_id IS DISTINCT FROM p_document OR d.request_revision IS DISTINCT FROM q.revision OR p_plan_revision IS DISTINCT FROM d.revision THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
 IF coalesce(n.revision,0)<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF p_action='SAVE' THEN
  IF n.request_id IS NOT NULL OR EXISTS(SELECT 1 FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND request_id=p_request AND revoked_at IS NULL) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_GROUP_EXISTS';END IF;
  IF q.quantity NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
  IF jsonb_typeof(p_codes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_codes)<>q.quantity OR octet_length(p_codes::text)>64000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_codes) x WHERE jsonb_typeof(x)<>'string' OR length(btrim(x#>>'{}')) NOT BETWEEN 4 AND 30) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_COUNT_INVALID';END IF;
  SELECT array_agg(CASE WHEN left(btrim(x#>>'{}'),1)='#' THEN upper(btrim(x#>>'{}')) ELSE '#'||upper(btrim(x#>>'{}')) END ORDER BY i) INTO codes FROM jsonb_array_elements(p_codes) WITH ORDINALITY v(x,i);
  IF EXISTS(SELECT 1 FROM unnest(codes) code WHERE code!~'^#[A-Z]{2}-[1-9][0-9]{0,17}$' OR substr(code,2,1)=substr(code,3,1)) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_FORMAT_INVALID';END IF;
  IF cardinality(codes)<>(SELECT count(DISTINCT code) FROM unnest(codes) code) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_DUPLICATE';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND code=ANY(codes)) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_ALREADY_USED';END IF;
  SELECT coalesce(max(group_revision),0)+1 INTO rev FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND request_id=p_request;
  INSERT INTO dqa_private.sample_number_allocations(tenant_id,request_id,document_id,operation_id,group_revision,ordinal,code,actor)
   SELECT p_tenant,p_request,p_document,p_operation,rev,i,codes[i],auth.uid() FROM generate_series(1,q.quantity) i;
  SELECT array_agg(code ORDER BY ordinal) INTO codes FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND operation_id=p_operation;
  joined:=array_to_string(codes,'、');
  INSERT INTO dqa_private.preapproval_samples VALUES(p_tenant,p_request,p_document,joined,rev,auth.uid());
 ELSE
  IF p_codes IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'PREAPPROVAL_FIELDS_INVALID';END IF;
  IF n.request_id IS NULL THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_REQUIRED';END IF;
  UPDATE dqa_private.sample_number_allocations SET revoked_at=clock_timestamp(),revoked_by=auth.uid() WHERE tenant_id=p_tenant AND request_id=p_request AND revoked_at IS NULL;
  DELETE FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
  joined:='';rev:=0;codes:='{}';
 END IF;
 bound_plan:=dqa_private.schedule_draft_plan(p_tenant,jsonb_set(dqa_private.preapproval_plan_command(p_tenant,p_request,d.plan,d.revision),'{data,sample_code}',to_jsonb(joined)));
 UPDATE dqa_business.schedule_drafts SET plan=bound_plan,actor_member_id=dqa_private.member_id(p_tenant) WHERE tenant_id=p_tenant AND id=d.id RETURNING * INTO d;
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns) VALUES(p_tenant,auth.uid(),current_user,'preapproval_samples',p_request,CASE WHEN p_action='DELETE' THEN 'DELETE' ELSE 'INSERT' END,ARRAY['sample_code','revision']);
 result:=jsonb_build_object('id',p_operation,'state','SAVED','action',p_action,'revision',rev,'draft_revision',d.revision,'sample_numbers',to_jsonb(codes));
 INSERT INTO dqa_private.preapproval_number_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result,p_request);RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.save_preapproval_sample_numbers(uuid,uuid,uuid,uuid,bigint,integer,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.save_preapproval_sample_numbers(uuid,uuid,uuid,uuid,bigint,integer,bigint,text,jsonb) TO authenticated;
-- Older clients may delete a group, but automatic generation is disabled server-side.
CREATE OR REPLACE FUNCTION dqa_business.mutate_preapproval_sample_numbers(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_plan_revision bigint,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_action IS DISTINCT FROM 'DELETE' THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_MANUAL_REQUIRED';END IF;
 RETURN dqa_business.save_preapproval_sample_numbers(p_tenant,p_operation,p_request,p_document,p_request_revision,p_revision,p_plan_revision,'DELETE','[]');
END $$;
-- Revalidate format, per-group uniqueness and quantity again at each first approval.
CREATE OR REPLACE FUNCTION dqa_private.sample_group_valid(p_tenant uuid,p_request uuid,p_document uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.requests q JOIN dqa_private.preapproval_samples n ON n.tenant_id=q.tenant_id AND n.request_id=q.id AND n.document_id=p_document
 WHERE q.tenant_id=p_tenant AND q.id=p_request AND q.request_document_version_id=p_document AND q.quantity BETWEEN 1 AND 1000
 AND (SELECT count(*)=q.quantity AND count(DISTINCT a.code)=q.quantity AND count(DISTINCT a.operation_id)=1 AND min(a.ordinal)=1 AND max(a.ordinal)=q.quantity
 AND bool_and(a.code~'^#[A-Z]{2}-[1-9][0-9]{0,17}$' AND substr(a.code,2,1)<>substr(a.code,3,1) AND a.group_revision=n.revision) AND string_agg(a.code,'、' ORDER BY a.ordinal)=n.sample_code
 FROM dqa_private.sample_number_allocations a WHERE a.tenant_id=p_tenant AND a.request_id=p_request AND a.document_id=p_document AND a.revoked_at IS NULL))
$$;
