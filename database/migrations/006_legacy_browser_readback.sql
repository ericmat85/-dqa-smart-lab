-- Read-only archive projection. No workflow gate or policy is weakened.
CREATE OR REPLACE FUNCTION dqa_business.original_ui_snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE definition record; rows jsonb; result jsonb:='{}'; cfg jsonb; historical jsonb; item record;
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
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dqa_business.original_ui_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dqa_business.original_ui_snapshot(uuid) TO authenticated;
