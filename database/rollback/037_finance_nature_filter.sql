-- Apply only with a frontend rollback that stops sending the nature filter.
-- Preserves all finance data, ACLs, audit records and migration journal.
BEGIN;
CREATE OR REPLACE FUNCTION dqa_business.finance_snapshot(p_tenant uuid,p_filter jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
NOTIFY pgrst,'reload schema';
COMMIT;
