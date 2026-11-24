-- Independent finance v1. 034 belongs to a separate AI branch; no dependency on it.
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_permissions_check CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read','requests.draft','catalog.manage','equipment.manage','materials.manage','materials.adjust','requests.submit','requests.review_manager','requests.review_lms','schedules.plan','schedules.book','lab.execute','reports.submit','reports.review','reports.confirm','finance.read','finance.write']::text[]);
ALTER TABLE dqa_business.roles DROP CONSTRAINT roles_pages_check;
ALTER TABLE dqa_business.roles ADD CONSTRAINT roles_pages_check CHECK(pages <@ ARRAY['dashboard','requests','schedule','equipment','maintenance','finance','reports','archive','settings']::text[] AND 'dashboard'=ANY(pages));
CREATE FUNCTION dqa_private.finance_allowed(t uuid,w boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM dqa_business.memberships m JOIN dqa_business.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.id=dqa_private.member_id(t) AND m.tenant_id=t AND r.enabled AND 'lms'=ANY(r.systems) AND (r.is_tenant_admin OR ('finance'=ANY(r.pages) AND 'finance.read'=ANY(r.permissions) AND (NOT w OR 'finance.write'=ANY(r.permissions)))))
$$;
CREATE TABLE dqa_private.finance_costs(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants(id),id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,
 occurred_on date NOT NULL,phase text NOT NULL CHECK(phase IN('ESTIMATE','ACTUAL')),category text NOT NULL CHECK(category IN('LABOR','EQUIPMENT','MATERIAL','SUBCONTRACT','OTHER')),
 equipment_kind text CHECK(equipment_kind IN('USE','CALIBRATION','MAINTENANCE','REPAIR')),scope text NOT NULL CHECK(scope IN('CASE','EQUIPMENT','WORKSPACE')),
 request_id uuid,project_id uuid,equipment_id uuid,service_event_id uuid,iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 1000),
 nature text NOT NULL CHECK(nature IN('INTERNAL','EXTERNAL')),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 pricing text NOT NULL CHECK(pricing IN('FIXED','RATE')),amount numeric(18,2) CHECK(amount>=0 AND amount<1000000000000),rate numeric(18,4) CHECK(rate>=0 AND rate<1000000000000),rate_label text NOT NULL DEFAULT '' CHECK(length(rate_label)<=100),
 quantity numeric(12,4) CHECK(quantity>=0 AND quantity<1000000000000),planned_test_hours numeric(12,4) CHECK(planned_test_hours>=0 AND planned_test_hours<1000000000000),reserved_hours numeric(12,4) CHECK(reserved_hours>=0 AND reserved_hours<1000000000000),confirmed_run_hours numeric(12,4) CHECK(confirmed_run_hours>=0 AND confirmed_run_hours<1000000000000),labor_hours numeric(12,4) CHECK(labor_hours>=0 AND labor_hours<1000000000000),
 includes_service boolean NOT NULL DEFAULT false,note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),voided boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),FOREIGN KEY(tenant_id,project_id) REFERENCES dqa_business.request_projects(tenant_id,id),FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id),
 CHECK((category='EQUIPMENT' AND equipment_kind IS NOT NULL AND equipment_id IS NOT NULL) OR (category<>'EQUIPMENT' AND equipment_kind IS NULL)),
 CHECK(scope='CASE' OR (project_id IS NULL AND request_id IS NULL)),CHECK(scope<>'CASE' OR request_id IS NOT NULL OR project_id IS NOT NULL),CHECK(scope<>'EQUIPMENT' OR equipment_id IS NOT NULL)
);
CREATE TABLE dqa_private.finance_vouchers(
 tenant_id uuid NOT NULL REFERENCES dqa_business.tenants(id),id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,
 supplier text NOT NULL CHECK(length(btrim(supplier)) BETWEEN 1 AND 150),kind text NOT NULL CHECK(kind IN('INVOICE','RECEIPT')),number text NOT NULL CHECK(length(btrim(number)) BETWEEN 1 AND 100),
 occurred_on date NOT NULL,currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),amount numeric(18,2) NOT NULL CHECK(amount>=0 AND amount<1000000000000),finance_number text NOT NULL CHECK(length(btrim(finance_number)) BETWEEN 1 AND 100),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),voided boolean NOT NULL DEFAULT false,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id)
);
CREATE UNIQUE INDEX finance_voucher_duplicate ON dqa_private.finance_vouchers(tenant_id,lower(btrim(supplier)),kind,lower(btrim(number))) WHERE NOT voided;
CREATE UNIQUE INDEX finance_number_duplicate ON dqa_private.finance_vouchers(tenant_id,lower(btrim(finance_number))) WHERE NOT voided;
CREATE TABLE dqa_private.finance_links(tenant_id uuid NOT NULL,voucher_id uuid NOT NULL,cost_id uuid NOT NULL,PRIMARY KEY(tenant_id,cost_id),FOREIGN KEY(tenant_id,voucher_id) REFERENCES dqa_private.finance_vouchers(tenant_id,id),FOREIGN KEY(tenant_id,cost_id) REFERENCES dqa_private.finance_costs(tenant_id,id));
CREATE TABLE dqa_private.finance_events(tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),record_id uuid NOT NULL,kind text NOT NULL,action text NOT NULL,actor uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),revision integer NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.finance_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.finance_files(tenant_id uuid NOT NULL,voucher_id uuid NOT NULL,name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 8 AND 262144),sha256 text NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,voucher_id),FOREIGN KEY(tenant_id,voucher_id) REFERENCES dqa_private.finance_vouchers(tenant_id,id));
CREATE INDEX finance_cost_filter ON dqa_private.finance_costs(tenant_id,occurred_on,project_id) WHERE NOT voided;
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['finance_costs','finance_vouchers','finance_links','finance_events','finance_operations','finance_files'] LOOP EXECUTE format('ALTER TABLE dqa_private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON dqa_private.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END$$;
CREATE FUNCTION dqa_business.finance_context(p_tenant uuid,p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT dqa_private.finance_allowed(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;
 IF length(p_search)>100 THEN RAISE EXCEPTION 'FINANCE_FIELDS_INVALID';END IF;
 RETURN jsonb_build_object('can_edit',dqa_private.finance_allowed(p_tenant,true),
 'service_events',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,resource_id,action AS name,created_at FROM dqa_business.resource_events WHERE tenant_id=p_tenant AND kind='equipment' AND (id::text=p_search OR resource_id::text=p_search) ORDER BY created_at DESC LIMIT 50) x),
 'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,legacy_id,project_group_id FROM dqa_business.requests WHERE tenant_id=p_tenant AND (legacy_id ILIKE '%'||p_search||'%' OR id::text=p_search) ORDER BY legacy_id LIMIT 50) x),
 'projects',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,name FROM dqa_business.request_projects WHERE tenant_id=p_tenant AND (name ILIKE '%'||p_search||'%' OR id::text=p_search) ORDER BY name LIMIT 50) x),
 'equipment',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,legacy_id,name FROM dqa_business.equipment WHERE tenant_id=p_tenant AND (name ILIKE '%'||p_search||'%' OR legacy_id ILIKE '%'||p_search||'%' OR id::text=p_search) ORDER BY name LIMIT 50) x));
END$$;
CREATE FUNCTION dqa_business.finance_snapshot(p_tenant uuid,p_filter jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; lo date;hi date;project uuid;request uuid;filter_category text;page integer;year_no integer;
BEGIN
 IF NOT dqa_private.finance_allowed(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;
 IF jsonb_typeof(p_filter)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filter) k WHERE k NOT IN('from','to','project_id','request_id','category','page','year')) THEN RAISE EXCEPTION 'FINANCE_FIELDS_INVALID';END IF;
 lo=nullif(p_filter->>'from','')::date;hi=nullif(p_filter->>'to','')::date;project=nullif(p_filter->>'project_id','')::uuid;request=nullif(p_filter->>'request_id','')::uuid;filter_category=nullif(p_filter->>'category','');page=coalesce((p_filter->>'page')::integer,0);year_no=coalesce((p_filter->>'year')::integer,extract(year from current_date)::integer);
 IF page<0 OR page>100000 OR year_no NOT BETWEEN 2000 AND 2200 OR lo>hi THEN RAISE EXCEPTION 'FINANCE_FIELDS_INVALID';END IF;
 WITH filtered AS (SELECT * FROM dqa_private.finance_costs c WHERE tenant_id=p_tenant AND (lo IS NULL OR occurred_on>=lo) AND (hi IS NULL OR occurred_on<=hi) AND (project IS NULL OR project_id=project) AND (request IS NULL OR request_id=request) AND (filter_category IS NULL OR c.category=filter_category)),
 totals AS(SELECT currency,phase,nature,count(*) AS rows,count(*) FILTER(WHERE amount IS NULL) AS unestimated,sum(amount)::text AS known_amount FROM filtered WHERE NOT voided GROUP BY currency,phase,nature),
 annual AS(SELECT currency,phase,nature,count(*) AS rows,count(*) FILTER(WHERE amount IS NULL) AS unestimated,sum(amount)::text AS known_amount FROM dqa_private.finance_costs WHERE tenant_id=p_tenant AND NOT voided AND extract(year FROM occurred_on)=year_no AND (project IS NULL OR project_id=project) GROUP BY currency,phase,nature)
 SELECT jsonb_build_object('costs',(SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount',x.amount::text,'rate',x.rate::text,'quantity',x.quantity::text,'planned_test_hours',x.planned_test_hours::text,'reserved_hours',x.reserved_hours::text,'confirmed_run_hours',x.confirmed_run_hours::text,'labor_hours',x.labor_hours::text)),'[]') FROM (SELECT * FROM filtered ORDER BY occurred_on DESC,id LIMIT 50 OFFSET page*50)x),'count',(SELECT count(*) FROM filtered),'totals',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM totals t),'annual',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM annual a),'year',year_no,
 'vouchers',(SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount',x.amount::text)),'[]') FROM (SELECT v.*,ARRAY(SELECT cost_id FROM dqa_private.finance_links l WHERE l.tenant_id=v.tenant_id AND l.voucher_id=v.id) AS cost_ids,EXISTS(SELECT 1 FROM dqa_private.finance_files f WHERE f.tenant_id=v.tenant_id AND f.voucher_id=v.id) AS has_file FROM dqa_private.finance_vouchers v WHERE tenant_id=p_tenant AND (lo IS NULL OR occurred_on>=lo) AND (hi IS NULL OR occurred_on<=hi) ORDER BY occurred_on DESC,id LIMIT 50 OFFSET page*50)x),'voucher_count',(SELECT count(*) FROM dqa_private.finance_vouchers WHERE tenant_id=p_tenant AND (lo IS NULL OR occurred_on>=lo) AND (hi IS NULL OR occurred_on<=hi))) INTO result;
 RETURN result;
END$$;
CREATE FUNCTION dqa_business.finance_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;BEGIN IF NOT dqa_private.finance_allowed(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;SELECT result INTO r FROM dqa_private.finance_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid();RETURN coalesce(r,'{"state":"NOT_FOUND"}');END$$;
CREATE FUNCTION dqa_business.finance_save(p_tenant uuid,p_operation uuid,p_kind text,p_id uuid,p_revision integer,p_data jsonb,p_void boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c dqa_private.finance_costs;v dqa_private.finance_vouchers;fp text;prior dqa_private.finance_operations;outcome jsonb;oldrev integer;rid uuid;derived uuid;count_links integer;linked uuid;allowed text[];
BEGIN
 IF NOT dqa_private.finance_allowed(p_tenant,true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;
 IF p_operation IS NULL OR p_id IS NULL OR p_revision IS NULL OR p_revision<0 OR p_void IS NULL OR p_kind NOT IN('cost','voucher') OR p_kind IS NULL OR jsonb_typeof(p_data)<>'object' OR p_data IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FINANCE_FIELDS_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('finance:'||p_tenant,0));
 fp=md5(jsonb_build_array(p_kind,p_id,p_revision,p_data,p_void)::text);SELECT * INTO prior FROM dqa_private.finance_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.fingerprint<>fp THEN RAISE EXCEPTION 'FINANCE_OPERATION_CONFLICT';END IF;RETURN prior.result;END IF;
 IF p_kind='cost' THEN
  allowed=ARRAY['occurred_on','phase','category','equipment_kind','scope','request_id','project_id','equipment_id','service_event_id','iteration','nature','currency','pricing','amount','rate','rate_label','quantity','planned_test_hours','reserved_hours','confirmed_run_hours','labor_hours','includes_service','note'];
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'FINANCE_FIELDS_INVALID';END IF;
  SELECT revision INTO oldrev FROM dqa_private.finance_costs WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;
  IF coalesce(oldrev,0)<>p_revision OR (p_void AND oldrev IS NULL) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.finance_costs WHERE tenant_id=p_tenant AND id=p_id AND voided) THEN RAISE EXCEPTION 'FINANCE_VOIDED';END IF;
  IF p_void THEN
   IF EXISTS(SELECT 1 FROM dqa_private.finance_links WHERE tenant_id=p_tenant AND cost_id=p_id) THEN RAISE EXCEPTION 'FINANCE_LINKED_COST';END IF;
   UPDATE dqa_private.finance_costs SET voided=true,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=p_id;
  ELSE
   c=jsonb_populate_record(NULL::dqa_private.finance_costs,p_data);c.tenant_id=p_tenant;c.id=p_id;c.revision=p_revision+1;c.note=coalesce(c.note,'');c.rate_label=coalesce(c.rate_label,'');c.includes_service=coalesce(c.includes_service,false);c.voided=false;c.created_by=auth.uid();c.updated_by=auth.uid();c.created_at=clock_timestamp();c.updated_at=c.created_at;
   IF c.request_id IS NOT NULL THEN SELECT project_group_id INTO derived FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=c.request_id;IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_SOURCE_INVALID';END IF;IF c.project_id IS NOT NULL AND c.project_id IS DISTINCT FROM derived THEN RAISE EXCEPTION 'FINANCE_PROJECT_MISMATCH';END IF;c.project_id=derived;END IF;
   IF c.service_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dqa_business.resource_events WHERE tenant_id=p_tenant AND id=c.service_event_id AND kind='equipment' AND resource_id=c.equipment_id) THEN RAISE EXCEPTION 'FINANCE_SOURCE_INVALID';END IF;
   IF c.pricing='RATE' THEN IF c.rate_label='' THEN RAISE EXCEPTION 'FINANCE_RATE_LABEL_REQUIRED';END IF;c.amount=round(c.rate*(CASE WHEN c.category='LABOR' THEN c.labor_hours WHEN c.category='EQUIPMENT' AND c.equipment_kind='USE' THEN CASE WHEN c.phase='ESTIMATE' THEN c.planned_test_hours ELSE c.confirmed_run_hours END ELSE c.quantity END),2);END IF;
   IF oldrev IS NULL THEN INSERT INTO dqa_private.finance_costs SELECT c.*;
   ELSE SELECT created_at,created_by INTO c.created_at,c.created_by FROM dqa_private.finance_costs WHERE tenant_id=p_tenant AND id=p_id;UPDATE dqa_private.finance_costs SET (occurred_on,phase,category,equipment_kind,scope,request_id,project_id,equipment_id,service_event_id,iteration,nature,currency,pricing,amount,rate,rate_label,quantity,planned_test_hours,reserved_hours,confirmed_run_hours,labor_hours,includes_service,note,revision,updated_by,updated_at)=(c.occurred_on,c.phase,c.category,c.equipment_kind,c.scope,c.request_id,c.project_id,c.equipment_id,c.service_event_id,c.iteration,c.nature,c.currency,c.pricing,c.amount,c.rate,c.rate_label,c.quantity,c.planned_test_hours,c.reserved_hours,c.confirmed_run_hours,c.labor_hours,c.includes_service,c.note,c.revision,c.updated_by,c.updated_at) WHERE tenant_id=p_tenant AND id=p_id;END IF;
  END IF;
 ELSE
  allowed=ARRAY['supplier','kind','number','occurred_on','currency','amount','finance_number','note','cost_ids'];IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'FINANCE_FIELDS_INVALID';END IF;
  SELECT revision INTO oldrev FROM dqa_private.finance_vouchers WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;IF coalesce(oldrev,0)<>p_revision OR (p_void AND oldrev IS NULL) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF EXISTS(SELECT 1 FROM dqa_private.finance_vouchers WHERE tenant_id=p_tenant AND id=p_id AND voided) THEN RAISE EXCEPTION 'FINANCE_VOIDED';END IF;
  DELETE FROM dqa_private.finance_links WHERE tenant_id=p_tenant AND voucher_id=p_id;
  IF p_void THEN UPDATE dqa_private.finance_vouchers SET voided=true,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=p_id;
  ELSE
   v=jsonb_populate_record(NULL::dqa_private.finance_vouchers,p_data-'cost_ids');v.tenant_id=p_tenant;v.id=p_id;v.revision=p_revision+1;v.note=coalesce(v.note,'');v.voided=false;v.created_by=auth.uid();v.updated_by=auth.uid();v.created_at=clock_timestamp();v.updated_at=v.created_at;
   IF oldrev IS NULL THEN INSERT INTO dqa_private.finance_vouchers SELECT v.*;
   ELSE UPDATE dqa_private.finance_vouchers SET (supplier,kind,number,occurred_on,currency,amount,finance_number,note,revision,updated_by,updated_at)=(v.supplier,v.kind,v.number,v.occurred_on,v.currency,v.amount,v.finance_number,v.note,v.revision,v.updated_by,v.updated_at) WHERE tenant_id=p_tenant AND id=p_id;END IF;
   IF jsonb_typeof(p_data->'cost_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'cost_ids')>100 THEN RAISE EXCEPTION 'FINANCE_LINKS_INVALID';END IF;
   FOR rid IN SELECT value::uuid FROM jsonb_array_elements_text(p_data->'cost_ids') LOOP
    IF NOT EXISTS(SELECT 1 FROM dqa_private.finance_costs WHERE tenant_id=p_tenant AND id=rid AND NOT voided AND phase='ACTUAL' AND nature='EXTERNAL' AND currency=v.currency AND amount IS NOT NULL) THEN RAISE EXCEPTION 'FINANCE_LINKS_INVALID';END IF;
    INSERT INTO dqa_private.finance_links VALUES(p_tenant,p_id,rid);
   END LOOP;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.finance_links l JOIN dqa_private.finance_costs cost_row ON cost_row.tenant_id=l.tenant_id AND cost_row.id=l.cost_id JOIN dqa_private.finance_vouchers voucher_row ON voucher_row.tenant_id=l.tenant_id AND voucher_row.id=l.voucher_id WHERE l.tenant_id=p_tenant AND (cost_row.voided OR cost_row.phase<>'ACTUAL' OR cost_row.nature<>'EXTERNAL' OR cost_row.currency<>voucher_row.currency OR cost_row.amount IS NULL)) OR EXISTS(SELECT 1 FROM dqa_private.finance_vouchers voucher_row JOIN dqa_private.finance_links l ON l.tenant_id=voucher_row.tenant_id AND l.voucher_id=voucher_row.id JOIN dqa_private.finance_costs cost_row ON cost_row.tenant_id=l.tenant_id AND cost_row.id=l.cost_id WHERE voucher_row.tenant_id=p_tenant GROUP BY voucher_row.id,voucher_row.amount HAVING sum(cost_row.amount)>voucher_row.amount) THEN RAISE EXCEPTION 'FINANCE_LINK_TOTAL_INVALID';END IF;
 INSERT INTO dqa_private.finance_events(tenant_id,record_id,kind,action,actor,revision) VALUES(p_tenant,p_id,p_kind,CASE WHEN p_void THEN 'VOID' WHEN p_revision=0 THEN 'CREATE' ELSE 'CORRECT' END,auth.uid(),p_revision+1);
 outcome=jsonb_build_object('state','SAVED','id',p_id,'revision',p_revision+1,'operation_id',p_operation);INSERT INTO dqa_private.finance_operations VALUES(p_tenant,p_operation,auth.uid(),fp,outcome);RETURN outcome;
END$$;
CREATE FUNCTION dqa_business.finance_events(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF NOT dqa_private.finance_allowed(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;RETURN (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY occurred_at,id),'[]') FROM dqa_private.finance_events e WHERE tenant_id=p_tenant AND record_id=p_id);END$$;
CREATE FUNCTION dqa_business.finance_file(p_tenant uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r dqa_private.finance_files;BEGIN IF NOT dqa_private.finance_allowed(p_tenant) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;SELECT * INTO r FROM dqa_private.finance_files WHERE tenant_id=p_tenant AND voucher_id=p_id;IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_FILE_NOT_FOUND';END IF;RETURN jsonb_build_object('name',r.name,'mime',r.mime,'sha256',r.sha256,'content',encode(r.bytes,'base64'));END$$;
CREATE FUNCTION dqa_business.finance_attach(p_tenant uuid,p_id uuid,p_revision integer,p_name text,p_mime text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b bytea; prior dqa_private.finance_files; rev integer;
BEGIN
 IF NOT dqa_private.finance_allowed(p_tenant,true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINANCE_ACCESS_DENIED';END IF;
 IF p_content IS NULL OR length(p_content)>350000 OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 100 OR p_name ~ '[[:cntrl:]/\\]' OR p_mime IS NULL OR p_mime NOT IN('application/pdf','image/png','image/jpeg') THEN RAISE EXCEPTION 'FINANCE_FILE_INVALID';END IF;
 b=decode(p_content,'base64');IF octet_length(b) NOT BETWEEN 8 AND 262144 OR NOT (p_mime='application/pdf' AND substring(b FROM 1 FOR 5)=decode('255044462d','hex') OR p_mime='image/png' AND substring(b FROM 1 FOR 8)=decode('89504e470d0a1a0a','hex') OR p_mime='image/jpeg' AND substring(b FROM 1 FOR 3)=decode('ffd8ff','hex')) THEN RAISE EXCEPTION 'FINANCE_FILE_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('finance:'||p_tenant,0));SELECT revision INTO rev FROM dqa_private.finance_vouchers WHERE tenant_id=p_tenant AND id=p_id AND NOT voided;
 IF rev IS NULL OR p_revision IS DISTINCT FROM rev THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO prior FROM dqa_private.finance_files WHERE tenant_id=p_tenant AND voucher_id=p_id;
 IF FOUND THEN IF prior.bytes=b AND prior.name=p_name AND prior.mime=p_mime THEN RETURN jsonb_build_object('state','SAVED','sha256',prior.sha256);END IF;RAISE EXCEPTION 'FINANCE_FILE_EXISTS';END IF;
 INSERT INTO dqa_private.finance_files VALUES(p_tenant,p_id,p_name,p_mime,b,encode(sha256(b),'hex'),auth.uid(),clock_timestamp());
 INSERT INTO dqa_private.finance_events(tenant_id,record_id,kind,action,actor,revision) VALUES(p_tenant,p_id,'voucher','ATTACH',auth.uid(),rev);
 RETURN jsonb_build_object('state','SAVED','sha256',encode(sha256(b),'hex'));
END$$;
REVOKE ALL ON FUNCTION dqa_private.finance_allowed(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND p.proname IN('finance_context','finance_snapshot','finance_result','finance_save','finance_events','finance_file','finance_attach') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END LOOP;END$$;
