-- Controlled catalog/inventory writes. Existing workflow gates and old migrations are unchanged.
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft','catalog.manage','equipment.manage','materials.manage','materials.adjust']::text[]);
ALTER TABLE dqa_business.equipment ADD COLUMN display_details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(display_details)='object' AND octet_length(display_details::text)<=16000),ADD COLUMN service_started_at timestamptz CHECK(service_started_at IS NULL OR isfinite(service_started_at));
ALTER TABLE dqa_business.materials ADD COLUMN display_details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(display_details)='object' AND octet_length(display_details::text)<=16000);
CREATE TABLE dqa_business.resource_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 kind text NOT NULL CHECK(kind IN ('trial','equipment','material')),resource_id uuid NOT NULL,
 operation_id uuid NOT NULL,actor_member_id uuid NOT NULL,actor_label text NOT NULL,
 action text NOT NULL CHECK(action IN ('SAVE','STATUS','STOCK')),reason text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,operation_id),
 FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE INDEX resource_events_lookup ON dqa_business.resource_events(tenant_id,kind,resource_id,created_at DESC,id);
ALTER TABLE dqa_business.resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dqa_business.resource_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_business.resource_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON dqa_business.resource_events TO authenticated;
CREATE POLICY resource_event_read ON dqa_business.resource_events FOR SELECT TO authenticated USING(
 dqa_private.can(tenant_id,CASE kind WHEN 'trial' THEN 'catalog.read' WHEN 'equipment' THEN 'equipment.read' ELSE 'materials.read' END));
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON dqa_business.resource_events FOR EACH ROW EXECUTE FUNCTION dqa_private.reject_immutable_change();
CREATE TABLE dqa_private.resource_operations (
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,id uuid NOT NULL,actor_id uuid NOT NULL,fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN ('PLANNED','SAVED','EXPIRED')),result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes',PRIMARY KEY(tenant_id,id)
);
ALTER TABLE dqa_private.resource_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.resource_operations FROM PUBLIC,anon,authenticated;
CREATE INDEX resource_operations_actor ON dqa_private.resource_operations(tenant_id,actor_id,created_at);
CREATE TABLE dqa_private.resource_trial_profiles(code text PRIMARY KEY,fixed_hours numeric,calendar text NOT NULL,mode text NOT NULL,equipment_pattern text NOT NULL);
REVOKE ALL ON dqa_private.resource_trial_profiles FROM PUBLIC,anon,authenticated;
INSERT INTO dqa_private.resource_trial_profiles(code,fixed_hours,calendar,mode,equipment_pattern) VALUES
('HIGH_HUMIDITY',250,'continuous','batch','恆溫恆濕|環境試驗箱'),
('THERMAL_SHOCK',NULL,'continuous','batch','冷熱衝擊'),
('VIBRATION_DURABILITY',20,'weekdays','serial','振動'),
('HUMIDITY_CYCLE',NULL,'continuous','batch','恆溫恆濕|環境試驗箱'),
('THERMAL_CYCLE',NULL,'continuous','batch','環境試驗箱|恆溫恆濕'),
('LOW_TEMPERATURE',NULL,'continuous','batch','環境試驗箱|恆溫恆濕'),
('HIGH_TEMPERATURE',NULL,'continuous','batch','環境試驗箱|恆溫恆濕|高溫爐'),
('SALT_SPRAY',NULL,'continuous','batch','鹽霧'),
('WATER_INGRESS',NULL,'weekdays','serial','防水'),
('ESD',NULL,'weekdays','serial','ESD'),
('WEATHERING',NULL,'continuous','batch','耐候'),
('DUST',NULL,'continuous','batch','防塵'),
('TENSILE',NULL,'weekdays','serial','拉力'),
('INSPECTION',NULL,'weekdays','serial','顯微鏡'),
('MECHANICAL_SHOCK',NULL,'weekdays','serial','機械衝擊'),
('DROP',NULL,'weekdays','serial','跌落'),
('INSERTION',NULL,'continuous','serial','插拔'),
('VOLTAGE',NULL,'weekdays','serial','電源|電壓'),
('EMC',NULL,'weekdays','serial','EMC|電磁相容');
CREATE FUNCTION dqa_private.resource_permission(p_command jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['kind','action','id','expected_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('kind','action','id','expected_revision','data')) OR coalesce(p_command->>'kind','') NOT IN ('trial','equipment','material') OR coalesce(p_command->>'action','') NOT IN ('save','status','stock') OR jsonb_typeof(p_command->'data') IS DISTINCT FROM 'object' OR octet_length(p_command::text)>48000 OR coalesce(p_command->>'id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(p_command->>'expected_revision','') !~ '^[0-9]{1,15}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
 IF p_command->>'kind'='trial' AND p_command->>'action'<>'save' OR p_command->>'action'='stock' AND p_command->>'kind'<>'material' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
 RETURN CASE p_command->>'kind' WHEN 'trial' THEN 'catalog.manage' WHEN 'equipment' THEN 'equipment.manage' ELSE CASE WHEN p_command->>'action'='stock' THEN 'materials.adjust' ELSE 'materials.manage' END END;
END $$;
REVOKE ALL ON FUNCTION dqa_private.resource_permission(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dqa_business.prepare_resource_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE permission text; op dqa_private.resource_operations; fp text;
BEGIN
 permission:=dqa_private.resource_permission(p_command);
 IF NOT dqa_private.can(p_tenant,permission) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RESOURCE_WRITE_DENIED'; END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resources:'||p_tenant,0));
 fp:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO op FROM dqa_private.resource_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN
  IF op.actor_id<>auth.uid() OR op.fingerprint<>fp THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
 END IF;
 IF (SELECT count(*) FROM dqa_private.resource_operations WHERE tenant_id=p_tenant AND actor_id=auth.uid() AND created_at>clock_timestamp()-interval '10 minutes')>=100 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RATE_LIMITED'; END IF;
 INSERT INTO dqa_private.resource_operations(tenant_id,id,actor_id,fingerprint) VALUES(p_tenant,p_operation,auth.uid(),fp) RETURNING * INTO op;
 RETURN jsonb_build_object('id',op.id,'state',op.state,'expires_at',op.expires_at);
END $$;
CREATE FUNCTION dqa_business.resource_operation_result(p_tenant uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op dqa_private.resource_operations;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 SELECT * INTO op FROM dqa_private.resource_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND','id',p_operation); END IF;
 IF op.state='PLANNED' AND op.expires_at<=clock_timestamp() THEN UPDATE dqa_private.resource_operations SET state='EXPIRED' WHERE tenant_id=p_tenant AND id=p_operation RETURNING * INTO op; END IF;
 RETURN CASE WHEN op.state='SAVED' THEN op.result ELSE jsonb_build_object('state',op.state,'id',op.id,'expires_at',op.expires_at) END;
END $$;
CREATE FUNCTION dqa_business.execute_resource_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE permission text; op dqa_private.resource_operations; payload jsonb:=p_command->'data'; resource_kind text:=p_command->>'kind'; action text:=p_command->>'action'; target uuid:=(p_command->>'id')::uuid; expected bigint:=(p_command->>'expected_revision')::bigint;
 trial dqa_business.trial_definitions; eq dqa_business.equipment; mat dqa_business.materials; old_trial dqa_business.trial_definitions; old_eq dqa_business.equipment; old_mat dqa_business.materials;
 event_detail jsonb:='{}'; operation_result jsonb; reason text; actor uuid; actor_label text; reserved boolean; next_aliases text[]; hours numeric; fixed_hours numeric; scalar text; field text; quantity numeric; available numeric; total_delta numeric:=0; available_delta numeric:=0; next_state text; final_revision bigint; legacy text; txtmatch text[];
BEGIN
 permission:=dqa_private.resource_permission(p_command);
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF NOT dqa_private.can(p_tenant,permission) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RESOURCE_WRITE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resources:'||p_tenant,0));
 SELECT * INTO op FROM dqa_private.resource_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR op.fingerprint<>encode(sha256(convert_to(p_command::text,'UTF8')),'hex') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_OPERATION_CONFLICT'; END IF;
 IF op.state='SAVED' THEN RETURN op.result||jsonb_build_object('replayed',true); END IF;
 IF op.state='EXPIRED' OR op.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_OPERATION_EXPIRED'; END IF;
 actor:=dqa_private.member_id(p_tenant);SELECT display_name INTO actor_label FROM dqa_business.memberships WHERE id=actor AND tenant_id=p_tenant;
 reason:=btrim(coalesce(payload->>'reason',CASE WHEN expected=0 THEN '新增資料' ELSE '資料更新' END));
 IF (resource_kind='material' OR action='status') AND (jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR coalesce(length(btrim(payload->>'reason')),0)=0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_REASON_REQUIRED'; END IF;
 IF length(reason) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_REASON_REQUIRED'; END IF;
 IF resource_kind='trial' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('legacy_id','name','aliases','profile_code','specification','acceptance','equipment_reference','specification_version','duration_hours')) OR NOT(payload ?& ARRAY['name','aliases','profile_code','specification','acceptance','equipment_reference','specification_version','duration_hours']) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
  FOREACH field IN ARRAY ARRAY['name','profile_code','specification','acceptance','equipment_reference','specification_version'] LOOP
   IF jsonb_typeof(payload->field) IS DISTINCT FROM 'string' OR length(btrim(payload->>field))=0 OR length(payload->>field)>(CASE field WHEN 'specification' THEN 6000 WHEN 'acceptance' THEN 2000 WHEN 'equipment_reference' THEN 300 ELSE 80 END) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
  END LOOP;
  IF payload->>'name'='其他' OR payload->>'name' ~ '[、,，;]' OR jsonb_typeof(payload->'aliases') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'aliases')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'aliases') v WHERE jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 80) OR jsonb_typeof(payload->'duration_hours') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
  hours:=(payload->>'duration_hours')::numeric;
  IF hours<=0 OR hours>24000 OR hours<>round(hours,4) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_DURATION_INVALID'; END IF;
  SELECT p.fixed_hours INTO fixed_hours FROM dqa_private.resource_trial_profiles p WHERE p.code=payload->>'profile_code';
  IF NOT FOUND AND payload->>'profile_code'<>'UNVERIFIED' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_PROFILE_INVALID'; END IF;
  IF fixed_hours IS NOT NULL AND hours<>fixed_hours THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_FIXED_DURATION'; END IF;
  SELECT * INTO old_trial FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=target FOR UPDATE;
  IF expected=0 AND FOUND OR expected>0 AND (NOT FOUND OR old_trial.revision<>expected) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  IF old_trial.id IS NOT NULL AND old_trial.profile_code IS DISTINCT FROM payload->>'profile_code' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_PROFILE_IMMUTABLE'; END IF;
  SELECT coalesce(array_agg(DISTINCT value),'{}') INTO next_aliases FROM (SELECT jsonb_array_elements_text(payload->'aliases') value UNION ALL SELECT unnest(coalesce(old_trial.aliases,'{}')) UNION ALL SELECT old_trial.name WHERE old_trial.name IS NOT NULL AND old_trial.name<>payload->>'name') a;
  IF cardinality(next_aliases)>20 OR EXISTS(SELECT 1 FROM dqa_business.trial_definitions d WHERE d.tenant_id=p_tenant AND d.id<>target AND (lower(d.name)=lower(btrim(payload->>'name')) OR EXISTS(SELECT 1 FROM unnest(array_append(next_aliases,payload->>'name')) n CROSS JOIN unnest(array_append(d.aliases,d.name)) other_name WHERE lower(n)=lower(other_name)))) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='TRIAL_NAME_EXISTS'; END IF;
  IF NOT EXISTS(SELECT 1 FROM regexp_matches(payload->>'specification','([0-9]+(?:\.[0-9]+)?)[[:space:]]*(?:小時|hours?\M|hrs?\M|h\M)','gi')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_DURATION_INVALID'; END IF;
  FOR txtmatch IN SELECT regexp_matches(payload->>'specification','(-?[0-9]+(?:\.[0-9]+)?)[[:space:]]*(?:小時|hours?\M|hrs?\M|h\M)','gi') LOOP IF txtmatch[1]::numeric<>hours THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TRIAL_DURATION_INVALID'; END IF; END LOOP;
  IF expected=0 THEN
   IF (SELECT count(*) FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant)>=100 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='RESOURCE_LIMIT'; END IF;
   INSERT INTO dqa_business.trial_definitions(id,tenant_id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind) VALUES(target,p_tenant,'TRIAL-'||replace(target::text,'-',''),btrim(payload->>'name'),next_aliases,payload->>'profile_code',payload->>'specification',payload->>'acceptance',payload->>'equipment_reference',payload->>'specification_version',hours,'MANUAL') RETURNING * INTO trial;
  ELSE
   UPDATE dqa_business.trial_definitions SET name=btrim(payload->>'name'),aliases=next_aliases, specification=payload->>'specification',acceptance=payload->>'acceptance',equipment_reference=payload->>'equipment_reference',specification_version=payload->>'specification_version',duration_hours=hours WHERE tenant_id=p_tenant AND id=target RETURNING * INTO trial;
  END IF;
  final_revision:=trial.revision;legacy:=trial.legacy_id;
 ELSIF resource_kind='equipment' THEN
  SELECT * INTO old_eq FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=target FOR UPDATE;
  IF expected=0 AND FOUND OR expected>0 AND (NOT FOUND OR old_eq.revision<>expected) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  reserved:=EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=target AND a.released_at IS NULL) OR EXISTS(SELECT 1 FROM dqa_business.borrows b WHERE b.tenant_id=p_tenant AND b.equipment_id=target AND b.status IN ('REQUESTED','APPROVED'));
  IF action='status' THEN
   IF expected=0 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('status','reason')) OR payload->>'status' NOT IN ('IDLE','MAINTENANCE','CALIBRATION') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   IF reserved OR old_eq.operational_status IN ('IN_USE','ON_LOAN','PAUSED','RETIRED') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
   IF old_eq.operational_status=payload->>'status' OR old_eq.operational_status IN ('MAINTENANCE','CALIBRATION') AND payload->>'status'<>'IDLE' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_STATUS_INVALID'; END IF;
   event_detail:=jsonb_build_object('before_status',old_eq.operational_status,'after_status',payload->>'status','started_at',old_eq.service_started_at,'finished_at',CASE WHEN payload->>'status'='IDLE' THEN clock_timestamp() ELSE NULL END,'elapsed_minutes',CASE WHEN old_eq.service_started_at IS NOT NULL AND payload->>'status'='IDLE' THEN round(extract(epoch FROM clock_timestamp()-old_eq.service_started_at)/60,2) ELSE NULL END);
   UPDATE dqa_business.equipment SET display_details=old_eq.display_details||(CASE WHEN payload->>'status'='IDLE' AND old_eq.operational_status='CALIBRATION' THEN jsonb_build_object('lastCalibration',(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) WHEN payload->>'status'='IDLE' AND old_eq.operational_status='MAINTENANCE' THEN jsonb_build_object('lastMaintenance',(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) ELSE '{}'::jsonb END),operational_status=payload->>'status',service_started_at=CASE WHEN payload->>'status'='IDLE' THEN NULL ELSE clock_timestamp() END WHERE tenant_id=p_tenant AND id=target RETURNING * INTO eq;
  ELSE
   IF action<>'save' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('legacy_id','name','category','model','serial_number','space_units','daily_hours','specification','next_calibration','next_maintenance','display_details')) OR NOT(payload ?& ARRAY['legacy_id','name','category','space_units','daily_hours','specification','display_details']) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   FOREACH field IN ARRAY ARRAY['legacy_id','name','category','specification'] LOOP IF jsonb_typeof(payload->field) IS DISTINCT FROM 'string' OR length(payload->>field)>(CASE WHEN field='specification' THEN 6000 ELSE 150 END) OR field<>'specification' AND length(btrim(payload->>field))=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF; END LOOP;
   IF jsonb_typeof(payload->'space_units') IS DISTINCT FROM 'number' OR coalesce(payload->>'space_units','') !~ '^[1-9][0-9]{0,5}$' OR (payload->>'space_units')::integer>100000 OR jsonb_typeof(payload->'daily_hours') IS DISTINCT FROM 'number' OR (payload->>'daily_hours')::numeric NOT BETWEEN .5 AND 24 OR (payload->>'daily_hours')::numeric<>round((payload->>'daily_hours')::numeric,1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_SPACE_REQUIRED'; END IF;
   IF expected>0 AND payload->>'legacy_id'<>old_eq.legacy_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_ID_IMMUTABLE'; END IF;
   IF (reserved OR old_eq.operational_status IN ('IN_USE','ON_LOAN','PAUSED')) AND (old_eq.name IS DISTINCT FROM payload->>'name' OR old_eq.space_units<>(payload->>'space_units')::integer OR old_eq.daily_hours<>(payload->>'daily_hours')::numeric OR old_eq.category IS DISTINCT FROM payload->>'category' OR old_eq.specification IS DISTINCT FROM payload->>'specification') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
   IF jsonb_typeof(payload->'display_details') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload->'display_details') k WHERE k NOT IN ('manufacturer','purchasedAt','maintenancePlan','notes','location','owner')) OR EXISTS(SELECT 1 FROM jsonb_each(payload->'display_details') e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>2000) OR coalesce(length(btrim(payload->'display_details'->>'location')),0)=0 OR coalesce(length(btrim(payload->'display_details'->>'owner')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   FOREACH field IN ARRAY ARRAY['next_calibration','next_maintenance'] LOOP IF payload->>field IS NOT NULL AND (payload->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT isfinite((payload->>field)::date)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF; END LOOP;
   IF expected=0 THEN
    INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,model,serial_number,space_units,daily_hours,specification,next_calibration,next_maintenance,display_details) VALUES(target,p_tenant,btrim(payload->>'legacy_id'),btrim(payload->>'name'),payload->>'category',payload->>'model',payload->>'serial_number',(payload->>'space_units')::integer,(payload->>'daily_hours')::numeric,payload->>'specification',(payload->>'next_calibration')::date,(payload->>'next_maintenance')::date,payload->'display_details') RETURNING * INTO eq;
   ELSE
    UPDATE dqa_business.equipment SET name=btrim(payload->>'name'),category=payload->>'category',model=payload->>'model',serial_number=payload->>'serial_number',space_units=(payload->>'space_units')::integer,daily_hours=(payload->>'daily_hours')::numeric,specification=payload->>'specification',next_calibration=(payload->>'next_calibration')::date,next_maintenance=(payload->>'next_maintenance')::date,display_details=old_eq.display_details||payload->'display_details' WHERE tenant_id=p_tenant AND id=target RETURNING * INTO eq;
   END IF;
  END IF;
  final_revision:=eq.revision;legacy:=eq.legacy_id;
 ELSE
  SELECT * INTO old_mat FROM dqa_business.materials WHERE tenant_id=p_tenant AND id=target FOR UPDATE;
  IF expected=0 AND FOUND OR expected>0 AND (NOT FOUND OR old_mat.revision<>expected) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
  reserved:=EXISTS(SELECT 1 FROM dqa_business.borrows b WHERE b.tenant_id=p_tenant AND b.material_id=target AND b.status IN ('REQUESTED','APPROVED'));
  IF action='stock' THEN
   IF expected=0 OR reserved OR old_mat.status NOT IN ('AVAILABLE','OUT_OF_STOCK') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('mode','quantity','reason')) OR coalesce(payload->>'mode','') NOT IN ('RECEIVE','ISSUE') OR jsonb_typeof(payload->'quantity') IS DISTINCT FROM 'number' OR (payload->>'quantity') !~ '^[0-9]+([.][0-9]{1,6})?$' OR (payload->>'quantity')::numeric<=0 OR (payload->>'quantity')::numeric>999999999 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   total_delta:=(payload->>'quantity')::numeric*CASE WHEN payload->>'mode'='ISSUE' THEN -1 ELSE 1 END;available_delta:=total_delta;
   IF old_mat.available_quantity+available_delta<0 OR old_mat.total_quantity+total_delta<0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STOCK_INSUFFICIENT'; END IF;
   IF old_mat.total_quantity+total_delta>999999999 OR old_mat.available_quantity+available_delta>999999999 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='STOCK_INVALID'; END IF;
   UPDATE dqa_business.materials SET total_quantity=total_quantity+total_delta,available_quantity=available_quantity+available_delta,status=CASE WHEN available_quantity+available_delta=0 THEN 'OUT_OF_STOCK' WHEN status='OUT_OF_STOCK' THEN 'AVAILABLE' ELSE status END WHERE tenant_id=p_tenant AND id=target RETURNING * INTO mat;
  ELSIF action='status' THEN
   IF expected=0 OR reserved THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('status','reason')) OR payload->>'status' NOT IN ('AVAILABLE','IN_USE','CALIBRATION','OUT_OF_STOCK','RETIRED','MAINTENANCE') OR payload->>'status'=old_mat.status THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_STATUS_INVALID'; END IF;
   event_detail:=jsonb_build_object('before_status',old_mat.status,'after_status',payload->>'status');UPDATE dqa_business.materials SET status=payload->>'status' WHERE tenant_id=p_tenant AND id=target RETURNING * INTO mat;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('legacy_id','name','category','unit','total_quantity','available_quantity','min_stock','display_details','reason')) OR NOT(payload ?& ARRAY['legacy_id','name','category','unit','total_quantity','available_quantity','min_stock','display_details','reason']) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   FOREACH field IN ARRAY ARRAY['legacy_id','name','category','unit'] LOOP IF jsonb_typeof(payload->field) IS DISTINCT FROM 'string' OR length(btrim(payload->>field)) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF; END LOOP;
   FOREACH field IN ARRAY ARRAY['total_quantity','available_quantity','min_stock'] LOOP IF jsonb_typeof(payload->field) IS DISTINCT FROM 'number' OR (payload->>field) !~ '^[0-9]+([.][0-9]{1,6})?$' OR (payload->>field)::numeric>999999999 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF; END LOOP;
   quantity:=(payload->>'total_quantity')::numeric;available:=(payload->>'available_quantity')::numeric;
   IF available>quantity THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='STOCK_INVALID'; END IF;
   IF expected>0 AND payload->>'legacy_id'<>old_mat.legacy_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_ID_IMMUTABLE'; END IF;
   IF expected>0 AND payload->>'unit'<>old_mat.unit AND EXISTS(SELECT 1 FROM dqa_business.material_transactions WHERE tenant_id=p_tenant AND material_id=target) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='STOCK_UNIT_IMMUTABLE'; END IF;
   total_delta:=quantity-coalesce(old_mat.total_quantity,0);available_delta:=available-coalesce(old_mat.available_quantity,0);
   IF (total_delta<>0 OR available_delta<>0) AND NOT dqa_private.can(p_tenant,'materials.adjust') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RESOURCE_WRITE_DENIED'; END IF;
   IF reserved AND (total_delta<>0 OR available_delta<>0 OR payload->>'unit'<>old_mat.unit) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
   IF jsonb_typeof(payload->'display_details') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload->'display_details') k WHERE k NOT IN ('model','serial','manufacturer','specification','notes','purchasedAt','location','owner')) OR EXISTS(SELECT 1 FROM jsonb_each(payload->'display_details') e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>6000) OR coalesce(length(btrim(payload->'display_details'->>'location')),0)=0 OR coalesce(length(btrim(payload->'display_details'->>'owner')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   IF expected=0 THEN
    INSERT INTO dqa_business.materials(id,tenant_id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,display_details) VALUES(target,p_tenant,btrim(payload->>'legacy_id'),btrim(payload->>'name'),payload->>'category',payload->>'unit',quantity,available,(payload->>'min_stock')::numeric,payload->'display_details') RETURNING * INTO mat;
   ELSE
    UPDATE dqa_business.materials SET name=btrim(payload->>'name'),category=payload->>'category',unit=payload->>'unit',total_quantity=quantity,available_quantity=available,min_stock=(payload->>'min_stock')::numeric,display_details=old_mat.display_details||payload->'display_details' WHERE tenant_id=p_tenant AND id=target RETURNING * INTO mat;
   END IF;
  END IF;
  IF action='stock' OR action='save' AND (expected=0 OR total_delta<>0 OR available_delta<>0) THEN
   INSERT INTO dqa_business.material_transactions(tenant_id,material_id,actor_member_id,kind,total_delta,available_delta,reason) VALUES(p_tenant,target,actor,CASE WHEN expected=0 THEN 'OPENING' ELSE 'ADJUSTMENT' END,total_delta,available_delta,reason);
   event_detail:=jsonb_build_object('total_delta',total_delta,'available_delta',available_delta,'total',mat.total_quantity,'available',mat.available_quantity,'unit',mat.unit);
  END IF;
  final_revision:=mat.revision;legacy:=mat.legacy_id;
 END IF;
 INSERT INTO dqa_business.resource_events(tenant_id,kind,resource_id,operation_id,actor_member_id,actor_label,action,reason,detail) VALUES(p_tenant,resource_kind,target,p_operation,actor,actor_label,upper(action),reason,event_detail);
 operation_result:=jsonb_build_object('state','SAVED','operation_id',p_operation,'id',target,'legacy_id',legacy,'revision',final_revision,'kind',resource_kind);
 UPDATE dqa_private.resource_operations SET state='SAVED',result=operation_result WHERE tenant_id=p_tenant AND id=p_operation;
 RETURN operation_result;
EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID';
 WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='RESOURCE_DUPLICATE';
END $$;
REVOKE ALL ON FUNCTION dqa_business.prepare_resource_operation(uuid,uuid,jsonb),dqa_business.execute_resource_operation(uuid,uuid,jsonb),dqa_business.resource_operation_result(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.prepare_resource_operation(uuid,uuid,jsonb),dqa_business.execute_resource_operation(uuid,uuid,jsonb),dqa_business.resource_operation_result(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}'; cfg jsonb; historical jsonb; item record;
BEGIN
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEMBERSHIP_REQUIRED'; END IF;
 FOR definition IN SELECT * FROM (VALUES
('requests','requests','id,tenant_id,legacy_id,owner_member_id,supervisor_member_id,trial_id,product_code,customer_name,purpose,quantity,requested_date,sample_space_units,specification,acceptance,status,revision,created_at,updated_at,form_details'),
('trials','trial_definitions','id,legacy_id,name,aliases,profile_code,specification,acceptance,equipment_reference,specification_version,duration_hours,source_kind,enabled,revision'),
('equipment','equipment','id,legacy_id,name,category,model,serial_number,site_id,owner_member_id,space_units,daily_hours,operational_status,specification,next_calibration,next_maintenance,revision,display_details,service_started_at'),
('materials','materials','id,legacy_id,name,category,unit,total_quantity,available_quantity,min_stock,site_id,owner_member_id,status,revision,display_details'),
('schedules','schedules','id,legacy_id,request_id,executor_member_id,starts_at,ends_at,preparation_minutes,cleanup_minutes,status,revision'),
('members','memberships','id,legacy_id,display_name,role_id,department_id,site_id,enabled,login_email,supervisor_member_id'),
('roles','roles','id,code,name,is_tenant_admin,permissions,enabled,systems,pages,review_level'),
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
 -- Imported demonstration states remain immutable archive data, never operational workflow records.
 SELECT configuration INTO cfg FROM dqa_business.settings WHERE tenant_id=p_tenant AND module='legacy_browser_archive';
 IF cfg->>'mode'='READ_ONLY_ARCHIVE' AND dqa_private.is_admin(p_tenant) AND EXISTS(
  SELECT 1 FROM dqa_business.import_batches b WHERE b.tenant_id=p_tenant AND b.id=(cfg->>'batch_id')::uuid
  AND b.source_sha256=cfg->>'source_sha256' AND b.status='STAGED') THEN
  historical:=jsonb_build_object('metadata',cfg);
  FOR item IN SELECT * FROM (VALUES ('reviews','reviews'),('schedules','schedules'),('equipment_details','equipment'),('labAudit','labAudit')) v(name,collection) LOOP
   SELECT coalesce(jsonb_agg(r.payload ORDER BY r.legacy_id),'[]'::jsonb) INTO rows
   FROM dqa_business.import_rows r WHERE r.tenant_id=p_tenant AND r.batch_id=(cfg->>'batch_id')::uuid AND r.source_collection=item.collection;
   IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='SNAPSHOT_PAGINATION_REQUIRED'; END IF;
   historical:=historical||jsonb_build_object(item.name,rows);
  END LOOP;
  result:=result||jsonb_build_object('legacy_import',historical);
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') INTO rows FROM (SELECT * FROM dqa_business.resource_events WHERE tenant_id=p_tenant ORDER BY created_at DESC,id DESC LIMIT 200) e;
 result:=result||jsonb_build_object('resource_events',rows,'resource_events_limited',(SELECT count(*)>200 FROM dqa_business.resource_events WHERE tenant_id=p_tenant));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.original_ui_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.original_ui_snapshot(uuid) TO authenticated;
