-- Atomic sample groups and administrator self-supervision; no existing cases are rewritten.
-- Sequence allocation is serialized per workspace. Retired codes are never reused.
CREATE TABLE dqa_private.sample_number_sequences(tenant_id uuid PRIMARY KEY REFERENCES dqa_business.tenants,last_value bigint NOT NULL CHECK(last_value>=0));
CREATE TABLE dqa_private.sample_number_allocations(
 tenant_id uuid NOT NULL,request_id uuid NOT NULL,document_id uuid NOT NULL,operation_id uuid NOT NULL,
 group_revision integer NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),code text NOT NULL,
 actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,revoked_by uuid,
 PRIMARY KEY(tenant_id,code),UNIQUE(tenant_id,operation_id,ordinal),
 FOREIGN KEY(tenant_id,document_id,request_id) REFERENCES dqa_business.request_document_versions(tenant_id,id,request_id) ON DELETE CASCADE,
 CHECK(code~'^#[A-Z]{2}-[1-9][0-9]*$' AND substr(code,2,1)<>substr(code,3,1)));
ALTER TABLE dqa_private.sample_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_private.sample_number_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.sample_number_sequences,dqa_private.sample_number_allocations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE dqa_private.preapproval_samples DROP CONSTRAINT preapproval_samples_sample_code_check;
ALTER TABLE dqa_private.preapproval_samples ADD CONSTRAINT preapproval_samples_sample_code_check CHECK(length(btrim(sample_code)) BETWEEN 1 AND 32000);
CREATE FUNCTION dqa_private.sample_group_valid(p_tenant uuid,p_request uuid,p_document uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.requests q JOIN dqa_private.preapproval_samples n ON n.tenant_id=q.tenant_id AND n.request_id=q.id AND n.document_id=p_document
 WHERE q.tenant_id=p_tenant AND q.id=p_request AND q.request_document_version_id=p_document AND q.quantity BETWEEN 1 AND 1000
 AND (SELECT count(*)=q.quantity AND count(DISTINCT a.operation_id)=1 AND min(a.ordinal)=1 AND max(a.ordinal)=q.quantity
 AND bool_and(a.group_revision=n.revision) AND string_agg(a.code,'、' ORDER BY a.ordinal)=n.sample_code
 FROM dqa_private.sample_number_allocations a WHERE a.tenant_id=p_tenant AND a.request_id=p_request AND a.document_id=p_document AND a.revoked_at IS NULL))
$$;
CREATE FUNCTION dqa_private.frozen_admin_self_supervisor(p_tenant uuid,p_request uuid,p_document uuid,p_owner uuid,p_supervisor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_owner=p_supervisor AND EXISTS(SELECT 1 FROM dqa_business.request_document_versions d WHERE d.tenant_id=p_tenant AND d.request_id=p_request AND d.id=p_document
 AND d.submitted_by=p_owner AND d.payload->'workspace_admin_self_supervisor'='true'::jsonb
 AND d.payload->>'owner_member_id'=p_owner::text AND d.payload->>'supervisor_member_id'=p_owner::text)
$$;
ALTER TABLE dqa_business.requests DROP CONSTRAINT requests_check;
ALTER TABLE dqa_business.requests ADD CONSTRAINT requests_check CHECK(supervisor_member_id IS DISTINCT FROM owner_member_id OR dqa_private.frozen_admin_self_supervisor(tenant_id,id,request_document_version_id,owner_member_id,supervisor_member_id));
REVOKE ALL ON FUNCTION dqa_private.sample_group_valid(uuid,uuid,uuid),dqa_private.frozen_admin_self_supervisor(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dqa_business.mutate_preapproval_sample_numbers(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_plan_revision bigint,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;n dqa_private.preapproval_samples;d dqa_business.schedule_drafts;op dqa_private.preapproval_number_operations;fp text;result jsonb;codes text[];pool text[];seq bigint;rev integer;joined text;bound_plan jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 IF p_operation IS NULL OR p_document IS NULL OR p_request_revision IS NULL OR p_revision IS NULL OR p_revision<0 OR p_plan_revision IS NULL OR p_action IS NULL OR p_action NOT IN('GENERATE','DELETE') THEN RAISE EXCEPTION 'PREAPPROVAL_FIELDS_INVALID';END IF;
 IF NOT dqa_private.preapproval_can_plan(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION 'PLANNING_ACCESS_DENIED';END IF;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_request,p_document,p_request_revision,p_revision,p_plan_revision,p_action)::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.preapproval_number_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF op.actor<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION 'PREAPPROVAL_OPERATION_CONFLICT';END IF;RETURN op.result;END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request FOR UPDATE;
 IF q.request_document_version_id IS DISTINCT FROM p_document OR q.revision IS DISTINCT FROM p_request_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF NOT dqa_private.preapproval_document(p_tenant,p_document) OR q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0 THEN RAISE EXCEPTION 'PREAPPROVAL_STATE_INVALID';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=p_request FOR UPDATE;
 IF d.id IS NULL OR d.document_version_id IS DISTINCT FROM p_document OR d.request_revision IS DISTINCT FROM q.revision OR p_plan_revision IS DISTINCT FROM d.revision THEN RAISE EXCEPTION 'PREAPPROVAL_PLAN_REQUIRED';END IF;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=p_request;
 IF coalesce(n.revision,0)<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
 IF p_action='GENERATE' THEN
  IF n.request_id IS NOT NULL OR EXISTS(SELECT 1 FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND request_id=p_request AND revoked_at IS NULL) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_GROUP_EXISTS';END IF;
  IF q.quantity NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
  INSERT INTO dqa_private.sample_number_sequences VALUES(p_tenant,0) ON CONFLICT DO NOTHING;
  UPDATE dqa_private.sample_number_sequences SET last_value=last_value+q.quantity WHERE tenant_id=p_tenant RETURNING last_value-q.quantity INTO seq;
  SELECT array_agg(chr(a)||chr(b) ORDER BY random()) INTO pool FROM generate_series(65,90) a CROSS JOIN generate_series(65,90) b WHERE a<>b;
  SELECT coalesce(max(group_revision),0)+1 INTO rev FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND request_id=p_request;
  INSERT INTO dqa_private.sample_number_allocations(tenant_id,request_id,document_id,operation_id,group_revision,ordinal,code,actor)
   SELECT p_tenant,p_request,p_document,p_operation,rev,i,'#'||pool[1+(i-1)%650]||'-'||(seq+i),auth.uid() FROM generate_series(1,q.quantity) i;
  SELECT array_agg(code ORDER BY ordinal) INTO codes FROM dqa_private.sample_number_allocations WHERE tenant_id=p_tenant AND operation_id=p_operation;
  joined:=array_to_string(codes,'、');
  INSERT INTO dqa_private.preapproval_samples VALUES(p_tenant,p_request,p_document,joined,rev,auth.uid());
 ELSE
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
REVOKE ALL ON FUNCTION dqa_business.mutate_preapproval_sample_numbers(uuid,uuid,uuid,uuid,bigint,integer,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.mutate_preapproval_sample_numbers(uuid,uuid,uuid,uuid,bigint,integer,bigint,text) TO authenticated;
-- Disable free-text assignment, including old clients. Receipt lookup remains available.
CREATE OR REPLACE FUNCTION dqa_business.save_preapproval_sample_number(p_tenant uuid,p_operation uuid,p_request uuid,p_document uuid,p_request_revision bigint,p_revision integer,p_code text,p_plan_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_GENERATION_REQUIRED';END $$;
DO $sample_changes$ DECLARE patch record;definition text;BEGIN
 FOR patch IN SELECT * FROM (VALUES
 ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$id=actor.supervisor_member_id AND enabled$old$, $new$id=CASE WHEN dqa_private.is_admin(p_tenant) THEN actor_member ELSE actor.supervisor_member_id END AND enabled$new$),
 ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$IF (NOT dqa_private.is_admin(p_tenant) OR actor.supervisor_member_id IS NOT NULL) AND (supervisor.id IS NULL OR supervisor.id=actor_member$old$, $new$IF NOT dqa_private.is_admin(p_tenant) AND (supervisor.id IS NULL OR supervisor.id=actor_member$new$),
 ('dqa_business.execute_request_operation(uuid,uuid,jsonb)', $old$'supervisor_member_id',supervisor.id,'supervisor_label',supervisor.display_name$old$, $new$'supervisor_member_id',supervisor.id,'supervisor_label',supervisor.display_name,'workspace_admin_self_supervisor',dqa_private.is_admin(p_tenant)$new$),
 ('dqa_business.preapproval_context(uuid,uuid)', $old$'sample_revision',coalesce(n.revision,0)$old$, $new$'sample_revision',coalesce(n.revision,0),'quantity',q.quantity,'sample_group_exists',n.request_id IS NOT NULL,'sample_numbers',CASE WHEN n.document_id=q.request_document_version_id THEN to_jsonb(string_to_array(n.sample_code,'、')) ELSE '[]'::jsonb END,'sample_numbers_valid',dqa_private.sample_group_valid(p_tenant,p_request,q.request_document_version_id)$new$),
 ('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)', $old$IF btrim(data->>'sample_code')='' THEN number_row:=NULL;END IF;$old$, $new$-- Keep the saved group while editing the schedule.$new$),
 ('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)', $old$'sample_code',btrim(data->>'sample_code')$old$, $new$'sample_code',CASE WHEN newflow THEN coalesce(number_row.sample_code,'') ELSE btrim(data->>'sample_code') END$new$),
 ('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)', $old$NOT BETWEEN 0 AND 120$old$, $new$NOT BETWEEN 0 AND 32000$new$),
 ('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)', $old$'sample_code',btrim(data->>'sample_code')$old$, $new$'sample_code',CASE WHEN newflow THEN coalesce(n.sample_code,'') ELSE btrim(data->>'sample_code') END$new$),
 ('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)', $old$WHERE tenant_id=p_tenant AND request_id=q.id;$old$, $new$WHERE tenant_id=p_tenant AND request_id=q.id AND document_id=q.request_document_version_id;$new$),
 ('dqa_private.calculate_schedule_draft_plan(uuid,jsonb,boolean)', $old$NOT BETWEEN 0 AND 120$old$, $new$NOT BETWEEN 0 AND 32000$new$),
 ('dqa_private.preapproval_bind_plan(uuid,uuid,jsonb,jsonb,bigint,boolean)', $old$IF d.id IS NULL OR n.request_id IS NULL$old$, $new$IF NOT dqa_private.sample_group_valid(p_tenant,q.id,q.request_document_version_id) OR d.id IS NULL OR n.request_id IS NULL$new$),
 ('dqa_private.preapproval_transition(uuid,uuid,uuid,text,text)', $old$IF p_stage='LMS_1' AND p_decision='APPROVE' THEN$old$, $new$IF p_stage='LMS_1' AND p_decision='APPROVE' THEN
  IF NOT dqa_private.sample_group_valid(p_tenant,q.id,q.request_document_version_id) THEN RAISE EXCEPTION 'PREAPPROVAL_SAMPLE_REQUIRED';END IF;$new$),
 ('dqa_private.validate_template_stage_fields(text,jsonb,text[])', $old$octet_length(p_fields::text)>12000$old$, $new$octet_length(p_fields::text)>96000$new$),
 ('dqa_private.validate_template_stage_fields(text,jsonb,text[])', $old$length(v#>>'{}')>1000$old$, $new$length(v#>>'{}')>(CASE WHEN p_stage='LMS_1' AND k='sampleCode' THEN 32000 ELSE 1000 END)$new$)) AS changes(signature,before_text,after_text) LOOP
 definition:=pg_get_functiondef(patch.signature::regprocedure);
 IF (length(definition)-length(replace(definition,patch.before_text,'')))/length(patch.before_text)<>1 THEN RAISE EXCEPTION 'SAMPLE_GROUP_BASELINE_CHANGED: %',patch.signature;END IF;
 EXECUTE replace(definition,patch.before_text,patch.after_text);
 END LOOP;
END $sample_changes$;
