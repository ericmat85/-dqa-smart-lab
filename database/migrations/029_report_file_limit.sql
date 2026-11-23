-- Photo-bearing reports and final archives share a 20 MiB ceiling.
-- Keep private Storage, immutable versions, RLS, grants and file attestations.
ALTER TABLE dqa_private.report_upload_intents DROP CONSTRAINT report_upload_intents_byte_size_check;
ALTER TABLE dqa_private.report_upload_intents ADD CONSTRAINT report_upload_intents_byte_size_check CHECK(byte_size BETWEEN 1 AND 20971520);
CREATE OR REPLACE FUNCTION dqa_business.prepare_report_upload(p_tenant uuid,p_id uuid,p_request uuid,p_kind text,p_name text,p_size integer,p_sha256 text,p_request_revision bigint,p_report_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;r dqa_business.reports;key text;mime text;
BEGIN
 IF NOT dqa_private.can(p_tenant) OR NOT EXISTS(SELECT 1 FROM dqa_private.human_workflow_policy WHERE tenant_id=p_tenant AND enabled AND report_key IS NOT NULL) THEN RAISE EXCEPTION 'HUMAN_RELEASE_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;SELECT * INTO r FROM dqa_business.reports WHERE tenant_id=p_tenant AND request_id=p_request;
 IF q.id IS NULL OR NOT dqa_private.can_read_request(p_tenant,p_request) OR NOT dqa_private.case_row_active(p_tenant,'requests',p_request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
 IF q.revision<>p_request_revision OR coalesce(r.revision,0)<>p_report_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF p_id IS NULL OR p_kind IS NULL OR p_name IS NULL OR p_size IS NULL OR p_sha256 IS NULL OR p_request_revision IS NULL OR p_report_revision IS NULL OR p_size NOT BETWEEN 1 AND 20971520 OR p_sha256!~'^[a-f0-9]{64}$' OR length(p_name) NOT BETWEEN 1 AND 180 OR p_name~'[/\\[:cntrl:]]' OR p_kind NOT IN('REPORT','ARCHIVE') THEN RAISE EXCEPTION 'HUMAN_FILE_INVALID';END IF;
 IF p_kind='REPORT' THEN
  IF NOT dqa_private.can(p_tenant,'reports.submit') OR q.status<>'COMPLETED' OR (r.id IS NOT NULL AND r.status<>'RETURNED') OR NOT EXISTS(SELECT 1 FROM dqa_business.schedules s JOIN dqa_business.roles role ON role.tenant_id=s.tenant_id JOIN dqa_business.memberships m ON m.id=s.executor_member_id AND m.role_id=role.id AND m.tenant_id=role.tenant_id WHERE s.tenant_id=p_tenant AND s.request_id=p_request AND s.status='COMPLETED' AND s.executor_member_id=dqa_private.member_id(p_tenant) AND 'lab'=ANY(role.systems)) OR p_name!~*'\.xlsx$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;
  mime:='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 ELSE
  IF r.id IS NULL OR r.current_version_id IS NULL OR NOT dqa_private.can(p_tenant,'reports.confirm') OR r.status IS DISTINCT FROM 'AWAITING_VIEW' OR q.supervisor_member_id IS DISTINCT FROM dqa_private.member_id(p_tenant) OR p_name!~*'\.pdf$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HUMAN_ACCESS_DENIED';END IF;mime:='application/pdf';
 END IF;
 IF (SELECT count(*) FROM dqa_private.report_upload_intents WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'HUMAN_RATE_LIMITED';END IF;
 key:=p_tenant::text||'/'||p_request::text||'/'||p_id::text||CASE WHEN p_kind='REPORT' THEN '.xlsx' ELSE '.pdf' END;
 INSERT INTO dqa_private.report_upload_intents(id,tenant_id,request_id,actor_id,kind,object_key,file_name,mime_type,byte_size,sha256,request_revision,report_revision,report_version_id) VALUES(p_id,p_tenant,p_request,auth.uid(),p_kind,key,p_name,mime,p_size,p_sha256,p_request_revision,p_report_revision,r.current_version_id);
 RETURN jsonb_build_object('id',p_id,'bucket','dqa-business-reports','object_key',key,'mime_type',mime,'byte_size',p_size,'sha256',p_sha256);
END $$;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='dqa-business-reports' AND public=false) THEN RAISE EXCEPTION 'PRIVATE_REPORT_BUCKET_REQUIRED';END IF;
 UPDATE storage.buckets SET file_size_limit=20971520 WHERE id='dqa-business-reports';
END $$;
