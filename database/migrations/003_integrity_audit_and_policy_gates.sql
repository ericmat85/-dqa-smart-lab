CREATE FUNCTION dqa_private.touch_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR (to_jsonb(NEW)->>'tenant_id') IS DISTINCT FROM (to_jsonb(OLD)->>'tenant_id') THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RECORD_IDENTITY_IMMUTABLE';
 END IF;
 IF NEW.revision<>OLD.revision THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REVISION_IS_DATABASE_MANAGED'; END IF;
 NEW.revision=OLD.revision+1; NEW.created_at=OLD.created_at; NEW.updated_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.workflow_policy_gate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 ELSE
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.approval_policy_gate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.decision<>'NOTE' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RULE_NOT_APPROVED'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='APPEND_ONLY_RECORD'; END $$;
CREATE FUNCTION dqa_private.guard_artifact_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.trial_id IS DISTINCT FROM OLD.trial_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.owner_member_id IS DISTINCT FROM OLD.owner_member_id THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ARTIFACT_BINDING_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.guard_report_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM dqa_business.artifacts a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.artifact_id AND a.kind='REPORT' AND a.request_id=NEW.request_id) THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REPORT_ARTIFACT_BINDING_REQUIRED';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.guard_signature_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.signature_version_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM dqa_business.artifact_versions v JOIN dqa_business.artifacts a ON a.tenant_id=v.tenant_id AND a.id=v.artifact_id
  WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.signature_version_id AND a.kind='SIGNATURE'
  AND a.owner_member_id=NEW.actor_member_id AND (a.request_id IS NULL OR a.request_id=NEW.request_id)
 ) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SIGNATURE_ARTIFACT_BINDING_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.guard_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE units integer;
BEGIN
 SELECT e.space_units INTO units FROM dqa_business.equipment e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.equipment_id FOR UPDATE;
 IF units IS NOT NULL AND NEW.allocated_units>units THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EQUIPMENT_SPACE_EXCEEDED'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.guard_capacity_reduction() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.space_units<OLD.space_units AND EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=OLD.tenant_id AND a.equipment_id=OLD.id AND a.released_at IS NULL AND a.allocated_units>NEW.space_units) THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='EQUIPMENT_SPACE_RESERVED';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dqa_private.record_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_data jsonb; cols text[];
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' THEN SELECT array_agg(k ORDER BY k) INTO cols FROM jsonb_object_keys(row_data) k WHERE row_data->k IS DISTINCT FROM to_jsonb(OLD)->k;
 ELSE SELECT array_agg(k ORDER BY k) INTO cols FROM jsonb_object_keys(row_data) k; END IF;
 INSERT INTO dqa_business.audit_events(tenant_id,actor_auth_user_id,database_role,table_name,record_id,operation,changed_columns)
 VALUES(COALESCE((row_data->>'tenant_id')::uuid,(row_data->>'id')::uuid),(SELECT auth.uid()),COALESCE(NULLIF(current_setting('role',true),'none'),session_user),TG_TABLE_NAME,(row_data->>'id')::uuid,TG_OP,COALESCE(cols,'{}'));
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DO $triggers$
DECLARE t text;
BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='dqa_business' AND column_name='revision' LOOP
  EXECUTE format('CREATE TRIGGER revision_guard BEFORE UPDATE ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.touch_revision()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['requests','schedules','reports','borrows','lab_operations'] LOOP
  EXECUTE format('CREATE TRIGGER workflow_gate BEFORE INSERT OR UPDATE ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.workflow_policy_gate()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['artifact_versions','report_versions','approval_events','material_transactions','audit_events','import_rows'] LOOP
  EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change()',t);
 END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='dqa_business' AND tablename NOT IN ('schema_migrations','audit_events') LOOP
  EXECUTE format('CREATE TRIGGER append_audit AFTER INSERT OR UPDATE OR DELETE ON dqa_business.%I FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit()',t);
 END LOOP;
END $triggers$;
CREATE TRIGGER approval_gate BEFORE INSERT ON dqa_business.approval_events FOR EACH ROW EXECUTE FUNCTION dqa_private.approval_policy_gate();
CREATE TRIGGER artifact_binding BEFORE UPDATE ON dqa_business.artifacts FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_artifact_binding();
CREATE TRIGGER report_binding BEFORE INSERT ON dqa_business.report_versions FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_report_version();
CREATE TRIGGER signature_binding BEFORE INSERT ON dqa_business.approval_events FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_signature_binding();
CREATE TRIGGER capacity_guard BEFORE INSERT OR UPDATE ON dqa_business.schedule_equipment FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_capacity();
CREATE TRIGGER capacity_reduction BEFORE UPDATE ON dqa_business.equipment FOR EACH ROW EXECUTE FUNCTION dqa_private.guard_capacity_reduction();

ALTER TABLE dqa_business.trial_definitions ADD CHECK(duration_hours IS NULL OR duration_hours::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE dqa_business.materials ADD CHECK(total_quantity::text NOT IN ('NaN','Infinity','-Infinity') AND available_quantity::text NOT IN ('NaN','Infinity','-Infinity') AND min_stock::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE dqa_business.material_transactions ADD CHECK(total_delta::text NOT IN ('NaN','Infinity','-Infinity') AND available_delta::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE dqa_business.schedule_equipment ADD CHECK(isfinite(reserve_from) AND isfinite(reserve_until));
ALTER TABLE dqa_business.schedules ADD CHECK((starts_at IS NULL OR isfinite(starts_at)) AND (ends_at IS NULL OR isfinite(ends_at)));
ALTER TABLE dqa_business.requests ADD CHECK(requested_date IS NULL OR isfinite(requested_date));
ALTER TABLE dqa_business.quality_records ADD CHECK(status<>'RESOLVED' OR COALESCE(length(btrim(resolution)),0)>0);

-- Explicit ACL sealing is required: per-schema default privileges cannot override a global PUBLIC function grant.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dqa_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dqa_private.member_id(uuid),dqa_private.can(uuid,text),dqa_private.is_admin(uuid),dqa_private.can_read_request(uuid,uuid),dqa_private.can_read_artifact(uuid,uuid) TO authenticated;
