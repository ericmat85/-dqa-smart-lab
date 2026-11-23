-- Permit equipment managers to clear an unallocated IN_USE label to IDLE.
-- Existing authorization, revision locks, operation receipts and append-only audit remain in force.
-- No equipment, allocation, borrow or request rows are changed by this migration.

CREATE OR REPLACE FUNCTION dqa_business.execute_resource_operation(p_tenant uuid,p_operation uuid,p_command jsonb) RETURNS jsonb
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
  reserved:=EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=target AND a.released_at IS NULL) OR EXISTS(SELECT 1 FROM dqa_business.borrows b WHERE b.tenant_id=p_tenant AND b.equipment_id=target AND b.status IN ('PENDING','REQUESTED','APPROVED','ON_LOAN'));
  IF action='status' THEN
   IF expected=0 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('status','reason')) OR payload->>'status' NOT IN ('IDLE','MAINTENANCE','CALIBRATION') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESOURCE_FIELDS_INVALID'; END IF;
   -- A stale usage label may be cleared only to IDLE after checking every unreleased allocation and active borrow.
   IF reserved OR old_eq.operational_status IN ('ON_LOAN','PAUSED','RETIRED') OR (old_eq.operational_status='IN_USE' AND payload->>'status'<>'IDLE') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RESOURCE_RESERVED'; END IF;
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
