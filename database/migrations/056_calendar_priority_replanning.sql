-- Tenant-authorized calendar rules; deterministic repairs never invent trial results or signatures.
CREATE TABLE dqa_private.office_calendar(day date PRIMARY KEY,is_holiday boolean NOT NULL,label text NOT NULL,source text NOT NULL);
CREATE TABLE dqa_private.trial_calendar_policies(tenant_id uuid NOT NULL,trial_id uuid NOT NULL,policy jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant_id,trial_id),FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id) ON DELETE CASCADE);
CREATE TABLE dqa_private.schedule_incidents(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,kind text NOT NULL CHECK(kind IN('CLOSURE','WORKING_DAY','EQUIPMENT_FAULT')),equipment_id uuid,first_day date NOT NULL,last_day date NOT NULL,reason text NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),resolved_at timestamptz,CHECK(last_day>=first_day AND last_day<=first_day+366),FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id));
CREATE TABLE dqa_private.schedule_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,schedule_id uuid NOT NULL,request_id uuid NOT NULL,incident_id uuid,action text NOT NULL CHECK(action IN('RESCHEDULED','PAUSED','BLOCKED','RESUME_AUTHORIZED','RETEST_AUTHORIZED')),before_plan jsonb NOT NULL,after_plan jsonb,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,schedule_id) REFERENCES dqa_business.schedules(tenant_id,id) ON DELETE CASCADE);
CREATE TABLE dqa_private.scheduling_operations(tenant_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE dqa_private.calendar_planning_permits(tenant_id uuid NOT NULL,request_id uuid NOT NULL,transaction_id bigint NOT NULL,repair_schedule uuid,PRIMARY KEY(tenant_id,request_id,transaction_id));
CREATE TABLE dqa_private.schedule_repair_permits(tenant_id uuid NOT NULL,schedule_id uuid NOT NULL,request_id uuid NOT NULL,transaction_id bigint NOT NULL,PRIMARY KEY(tenant_id,schedule_id,transaction_id));
CREATE TABLE dqa_private.schedule_repair_attempts(tenant_id uuid NOT NULL,schedule_id uuid NOT NULL,last_attempt timestamptz NOT NULL,PRIMARY KEY(tenant_id,schedule_id),FOREIGN KEY(tenant_id,schedule_id) REFERENCES dqa_business.schedules(tenant_id,id) ON DELETE CASCADE);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['schedule_repair_attempts','office_calendar','trial_calendar_policies','schedule_incidents','schedule_adjustments','scheduling_operations','calendar_planning_permits','schedule_repair_permits'] LOOP EXECUTE format('ALTER TABLE dqa_private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON dqa_private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
CREATE FUNCTION dqa_private.scheduling_priority(v text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT CASE v WHEN '急件' THEN 0 WHEN '高' THEN 0 WHEN '專案' THEN 1 WHEN '專案關鍵' THEN 1 WHEN '一般' THEN 2 WHEN '委外' THEN 3 ELSE 2 END $$;
CREATE FUNCTION dqa_private.calendar_repair_id(p_tenant uuid,p_request uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT schedule_id FROM dqa_private.schedule_repair_permits WHERE tenant_id=p_tenant AND request_id=p_request AND transaction_id=txid_current() LIMIT 1 $$;
CREATE FUNCTION dqa_private.calendar_planning(p_tenant uuid,p_request uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM dqa_private.calendar_planning_permits WHERE tenant_id=p_tenant AND request_id=p_request AND transaction_id=txid_current()) $$;
CREATE FUNCTION dqa_private.validate_calendar_policy(p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$ BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& ARRAY['mode','weekends','holidays','work_start','work_end','overtime','overtime_end','substitution']) OR (SELECT count(*) FROM jsonb_object_keys(p))<>8 OR p->>'mode' NOT IN('CONTINUOUS','WORKDAYS_SPLIT','WORKDAYS_CONTIGUOUS','COMPOUND_CONTINUOUS','COMPOUND_DISCONTINUOUS') OR EXISTS(SELECT 1 FROM unnest(ARRAY['weekends','holidays','overtime','substitution']) k WHERE jsonb_typeof(p->k) IS DISTINCT FROM 'boolean') OR EXISTS(SELECT 1 FROM unnest(ARRAY['work_start','work_end','overtime_end']) k WHERE jsonb_typeof(p->k) IS DISTINCT FROM 'number' OR (p->>k)!~'^(0|[1-9][0-9]{0,3})$') THEN RAISE EXCEPTION 'CALENDAR_POLICY_INVALID';END IF;
 IF (p->>'work_start')::int<0 OR (p->>'work_end')::int>(p->>'overtime_end')::int OR (p->>'work_end')::int<=(p->>'work_start')::int OR (p->>'overtime_end')::int>1440 THEN RAISE EXCEPTION 'CALENDAR_POLICY_INVALID';END IF;
END $$;
CREATE FUNCTION dqa_private.trial_calendar_policy(p_tenant uuid,p_trial uuid,p_calendar text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT policy||jsonb_build_object('revision',revision) FROM dqa_private.trial_calendar_policies WHERE tenant_id=p_tenant AND trial_id=p_trial),jsonb_build_object('mode',CASE WHEN t.profile_code='COMPOUND_ENVIRONMENT' THEN 'COMPOUND_CONTINUOUS' WHEN coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)='weekdays' THEN 'WORKDAYS_SPLIT' ELSE 'CONTINUOUS' END,'weekends',coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)<>'weekdays','holidays',coalesce(p_calendar,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END)<>'weekdays','work_start',0,'work_end',1440,'overtime',false,'overtime_end',1440,'substitution',true,'revision',0)) FROM dqa_business.trial_definitions t WHERE t.tenant_id=p_tenant AND t.id=p_trial
$$;
CREATE FUNCTION dqa_private.calendar_open(p_tenant uuid,p_day date,p_weekends boolean,p_holidays boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE holiday boolean;BEGIN
 SELECT is_holiday INTO holiday FROM dqa_private.office_calendar WHERE day=p_day;IF NOT FOUND THEN RAISE EXCEPTION 'CALENDAR_COVERAGE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND resolved_at IS NULL AND kind='CLOSURE' AND p_day BETWEEN first_day AND last_day) THEN RETURN false;END IF;
 IF NOT p_weekends AND extract(isodow FROM p_day)>5 THEN RETURN false;END IF;
 RETURN p_holidays OR NOT holiday OR EXISTS(SELECT 1 FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND resolved_at IS NULL AND kind='WORKING_DAY' AND p_day BETWEEN first_day AND last_day);
END $$;
CREATE FUNCTION dqa_private.calendar_interval_open(p_tenant uuid,a timestamptz,b timestamptz,p jsonb,manual boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT bool_and(dqa_private.calendar_open(p_tenant,d::date,CASE WHEN manual THEN false ELSE (p->>'weekends')::boolean END,CASE WHEN manual THEN false ELSE (p->>'holidays')::boolean END)) FROM generate_series((a AT TIME ZONE 'Asia/Taipei')::date::timestamp,((b-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date::timestamp,interval '1 day') d
$$;
CREATE FUNCTION dqa_private.apply_schedule_calendar(p_tenant uuid,p_request uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;p jsonb;mode text;seg jsonb;piece jsonb;pieces jsonb:='[]';ends_by_device jsonb:='{}';begin_at timestamptz;finish timestamptz;cursor_at timestamptz;window_start timestamptz;window_end timestamptz;first_at timestamptz;last_at timestamptz;work_day date;minutes numeric;take numeric;work_end integer;manual boolean;compound boolean;continuous boolean;repair uuid;scope_start timestamptz;scope_end timestamptz;i integer;stage_index integer:=0;ids uuid[];
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;p:=dqa_private.trial_calendar_policy(p_tenant,q.trial_id,p_plan->>'calendar');mode:=p->>'mode';compound:=p_plan ? 'compound';repair:=dqa_private.calendar_repair_id(p_tenant,p_request);work_end:=CASE WHEN (p->>'overtime')::boolean THEN (p->>'overtime_end')::int ELSE (p->>'work_end')::int END;cursor_at:=NULL;
 FOR seg IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(p_plan->'segments')=0 AND p_plan->>'outsourced'='true' THEN jsonb_build_array(jsonb_build_object('start_ms',p_plan->'start_ms','end_ms',extract(epoch FROM (p_plan->>'execution_ends_at')::timestamptz)*1000,'quantity',q.quantity)) ELSE p_plan->'segments' END) LOOP
  begin_at:=to_timestamp((seg->>'start_ms')::numeric/1000);minutes:=((seg->>'end_ms')::numeric-(seg->>'start_ms')::numeric)/60000;
  IF minutes<=0 OR minutes>525600 THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
  IF compound AND cursor_at IS NOT NULL THEN begin_at:=cursor_at;ELSIF NOT compound AND ends_by_device ? coalesce(seg->>'equipment_id','OUTSOURCE') THEN begin_at:=greatest(begin_at,(ends_by_device->>coalesce(seg->>'equipment_id','OUTSOURCE'))::timestamptz);END IF;
  stage_index:=stage_index+1;
  IF compound THEN
   work_day:=(begin_at AT TIME ZONE 'Asia/Taipei')::date;window_start:=(work_day::timestamp+((p_plan->'compound'->>'shift_start')::time-time '00:00')) AT TIME ZONE 'Asia/Taipei';window_end:=(work_day::timestamp+((p_plan->'compound'->>'shift_end')::time-time '00:00')) AT TIME ZONE 'Asia/Taipei';
   IF mode='COMPOUND_DISCONTINUOUS' THEN
    i:=0;WHILE NOT dqa_private.calendar_open(p_tenant,work_day,false,false) OR begin_at>=window_end LOOP i:=i+1;IF i>366 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;work_day:=work_day+1;window_start:=(work_day::timestamp+((p_plan->'compound'->>'shift_start')::time-time '00:00')) AT TIME ZONE 'Asia/Taipei';window_end:=(work_day::timestamp+((p_plan->'compound'->>'shift_end')::time-time '00:00')) AT TIME ZONE 'Asia/Taipei';begin_at:=window_start;END LOOP;begin_at:=greatest(begin_at,window_start);
   ELSIF NOT(stage_index=1 AND seg->>'profile_id'='HIGH_TEMPERATURE' AND p_plan->'compound'->>'preloaded_weekend'='true' AND extract(isodow FROM work_day)>5) AND (NOT dqa_private.calendar_open(p_tenant,work_day,false,false) OR begin_at<window_start OR begin_at>=window_end) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
  END IF;
  manual:=compound AND seg->>'operation'='operator';continuous:=mode IN('CONTINUOUS','WORKDAYS_CONTIGUOUS','COMPOUND_CONTINUOUS') OR compound AND NOT manual;
  IF continuous THEN
   IF mode='WORKDAYS_CONTIGUOUS' THEN begin_at:=((begin_at AT TIME ZONE 'Asia/Taipei')::date::timestamp+((p->>'work_start')::int)*interval '1 minute') AT TIME ZONE 'Asia/Taipei';END IF;
   finish:=begin_at+minutes*interval '1 minute';
   IF mode='COMPOUND_DISCONTINUOUS' AND compound AND NOT manual THEN
    i:=0;WHILE NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,p,false) LOOP i:=i+1;IF i>366 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;begin_at:=((((begin_at AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp)+((p_plan->'compound'->>'shift_start')::time-time '00:00')) AT TIME ZONE 'Asia/Taipei';finish:=begin_at+minutes*interval '1 minute';END LOOP;
   END IF;
   IF NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,p,manual) THEN IF compound AND manual THEN RAISE EXCEPTION 'COMPOUND_OPERATOR_WINDOW';ELSE RAISE EXCEPTION 'CALENDAR_NONWORKING_DAY';END IF;END IF;
   IF manual OR mode='WORKDAYS_CONTIGUOUS' THEN
    work_day:=(begin_at AT TIME ZONE 'Asia/Taipei')::date;
    window_start:=(work_day::timestamp+CASE WHEN compound THEN ((p_plan->'compound'->>'shift_start')::time-time '00:00') ELSE ((p->>'work_start')::int)*interval '1 minute' END) AT TIME ZONE 'Asia/Taipei';
    window_end:=(work_day::timestamp+CASE WHEN compound AND NOT(p->>'overtime')::boolean THEN ((p_plan->'compound'->>'shift_end')::time-time '00:00') ELSE work_end*interval '1 minute' END) AT TIME ZONE 'Asia/Taipei';
    IF mode='WORKDAYS_CONTIGUOUS' AND NOT manual AND (p->>'work_start')::int=0 AND work_end=1440 THEN window_end:=((((finish-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';END IF;
    IF begin_at<window_start OR finish>window_end THEN IF compound AND manual THEN RAISE EXCEPTION 'COMPOUND_OPERATOR_WINDOW';ELSE RAISE EXCEPTION 'CALENDAR_CONTIGUOUS_WINDOW';END IF;END IF;
   END IF;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish));
  ELSE
   finish:=begin_at;i:=0;
   WHILE minutes>0 LOOP
    i:=i+1;IF i>1000 OR jsonb_array_length(pieces)>5000 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;work_day:=(finish AT TIME ZONE 'Asia/Taipei')::date;
    window_start:=(work_day::timestamp+((p->>'work_start')::int)*interval '1 minute') AT TIME ZONE 'Asia/Taipei';window_end:=(work_day::timestamp+work_end*interval '1 minute') AT TIME ZONE 'Asia/Taipei';
    IF NOT dqa_private.calendar_open(p_tenant,work_day,(p->>'weekends')::boolean,(p->>'holidays')::boolean) OR finish>=window_end THEN finish:=((work_day+1)::timestamp) AT TIME ZONE 'Asia/Taipei';CONTINUE;END IF;
    begin_at:=greatest(finish,window_start);take:=least(minutes,extract(epoch FROM(window_end-begin_at))/60);IF take<=0 THEN RAISE EXCEPTION 'CALENDAR_POLICY_INVALID';END IF;finish:=begin_at+take*interval '1 minute';minutes:=minutes-take;
    pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish));
   END LOOP;
  END IF;
  cursor_at:=finish;ends_by_device:=ends_by_device||jsonb_build_object(coalesce(seg->>'equipment_id','OUTSOURCE'),((((finish-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei');
 END LOOP;
 SELECT min(to_timestamp((x->>'start_ms')::numeric/1000)),max(to_timestamp((x->>'end_ms')::numeric/1000)) INTO first_at,last_at FROM jsonb_array_elements(pieces) x;
 IF first_at IS NULL OR last_at<=first_at THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
 IF compound AND mode='COMPOUND_CONTINUOUS' AND (NOT dqa_private.calendar_open(p_tenant,(last_at AT TIME ZONE 'Asia/Taipei')::date,false,false) OR (last_at AT TIME ZONE 'Asia/Taipei')::time<(p_plan->'compound'->>'shift_start')::time OR (last_at AT TIME ZONE 'Asia/Taipei')::time>(p_plan->'compound'->>'shift_end')::time) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
 scope_start:=((first_at-((p_plan->>'preparation_minutes')::int)*interval '1 minute') AT TIME ZONE 'Asia/Taipei')::date::timestamp AT TIME ZONE 'Asia/Taipei';scope_end:=((((last_at+((p_plan->>'cleanup_minutes')::int)*interval '1 minute'-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';
 SELECT coalesce(array_agg((x->>'equipment_id')::uuid),'{}') INTO ids FROM jsonb_array_elements(p_plan->'allocations') x;
 IF q.execution_kind='REAL' AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.schedule_id IS DISTINCT FROM repair AND a.released_at IS NULL AND a.reserve_from<scope_end AND (scope_start<a.reserve_until OR EXISTS(SELECT 1 FROM dqa_business.schedules paused WHERE paused.id=a.schedule_id AND paused.tenant_id=p_tenant AND paused.status='PAUSED')) AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.id IS DISTINCT FROM repair AND s.execution_kind='REAL' AND s.executor_member_id=(p_plan->>'executor_id')::uuid AND s.status IN('PENDING_APPROVAL','BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND coalesce(s.reserve_from,s.starts_at)<scope_end AND (s.status='PAUSED' OR scope_start<coalesce(s.reserve_until,s.ends_at)) AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) OR EXISTS(SELECT 1 FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND kind='EQUIPMENT_FAULT' AND resolved_at IS NULL AND equipment_id=ANY(ids) AND first_day<=(scope_end AT TIME ZONE 'Asia/Taipei')::date AND last_day>=(scope_start AT TIME ZONE 'Asia/Taipei')::date)) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN p_plan||jsonb_build_object('segments',pieces,'starts_at',first_at,'execution_ends_at',last_at,'ends_at',CASE WHEN compound THEN last_at ELSE scope_end END,'reserve_from',scope_start,'reserve_until',scope_end,'start_ms',extract(epoch FROM first_at)*1000,'end_ms',extract(epoch FROM CASE WHEN compound THEN last_at ELSE scope_end END)*1000,'start_date',(first_at AT TIME ZONE 'Asia/Taipei')::date,'end_date',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date,'scheduling_days',(SELECT count(DISTINCT day) FROM jsonb_array_elements(pieces) z CROSS JOIN LATERAL generate_series((to_timestamp((z->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')::date::timestamp,((to_timestamp((z->>'end_ms')::numeric/1000)-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date::timestamp,interval '1 day') day),'calendar_days',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date-(first_at AT TIME ZONE 'Asia/Taipei')::date+1,'calendar_policy',p,'calendar_source','TW_OFFICE_2026_2027','priority_rank',dqa_private.scheduling_priority(q.form_details->>'priority'));
END $$;

INSERT INTO dqa_private.office_calendar VALUES
('2026-01-01',true,'開國紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-10',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-01-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-01',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-15',true,'小年夜','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-16',true,'農曆除夕','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-17',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-18',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-19',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-20',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-27',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-02-28',true,'和平紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-01',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-15',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-29',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-03-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-03',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-04',true,'兒童節','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-05',true,'清明節','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-06',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-04-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-01',true,'勞動節','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-02',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-09',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-10',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-16',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-23',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-30',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-05-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-19',true,'端午節','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-06-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-07-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-01',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-02',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-09',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-15',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-16',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-23',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-29',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-30',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-08-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-25',true,'中秋節','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-28',true,'孔子誕辰紀念日/教師節','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-09-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-09',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-10',true,'國慶日','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-25',true,'臺灣光復暨金門古寧頭大捷紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-26',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-10-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-01',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-15',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-29',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-11-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-25',true,'行憲紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2026-12-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-01',true,'開國紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-02',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-09',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-10',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-16',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-23',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-30',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-01-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-04',true,'小年夜','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-05',true,'農曆除夕','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-06',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-07',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-08',true,'春節','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-09',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-10',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-02-28',true,'和平紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-01',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-03-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-04',true,'兒童節','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-05',true,'清明節','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-06',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-10',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-04-30',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-01',true,'勞動節','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-02',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-09',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-15',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-16',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-23',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-29',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-30',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-05-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-09',true,'端午節','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-06-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-10',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-07-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-01',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-08',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-15',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-22',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-29',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-08-31',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-15',true,'中秋節','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-25',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-28',true,'孔子誕辰紀念日/教師節','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-09-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-02',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-03',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-09',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-10',true,'國慶日','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-11',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-16',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-17',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-23',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-24',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-25',true,'臺灣光復暨金門古寧頭大捷紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-30',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-10-31',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-04',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-05',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-06',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-07',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-11',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-12',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-13',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-14',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-18',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-19',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-20',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-21',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-24',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-25',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-26',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-27',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-28',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-11-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-01',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-02',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-03',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-04',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-05',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-06',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-07',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-08',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-09',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-10',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-11',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-12',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-13',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-14',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-15',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-16',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-17',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-18',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-19',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-20',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-21',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-22',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-23',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-24',true,'補假','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-25',true,'行憲紀念日','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-26',true,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-27',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-28',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-29',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-30',false,'','TaiwanCalendar / data.gov.tw/14718'),
('2027-12-31',true,'補假','TaiwanCalendar / data.gov.tw/14718');
CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan_v55(p_tenant uuid, p_command jsonb, p_check_end boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;t dqa_business.trial_definitions;m dqa_business.equipment;person dqa_business.memberships;n dqa_private.preapproval_samples;
 data jsonb:=p_command->'data';c jsonb;stages jsonb;stage jsonb;rule jsonb;ids uuid[];stage_ids uuid[];device uuid;eq_versions jsonb:='{}';allocations jsonb:='[]';segments jsonb:='[]';
 starts timestamptz;ends timestamptz;cursor_at timestamptz;stage_end timestamptz;shift_start time;shift_end time;units integer;idx integer:=0;duration integer:=0;newflow boolean;end_date date;
BEGIN
 IF coalesce(p_command->>'request_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant) AND dqa_private.calendar_repair_id(p_tenant,(p_command->>'request_id')::uuid) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=(p_command->>'request_id')::uuid;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id;
 IF t.profile_code IS DISTINCT FROM 'COMPOUND_ENVIRONMENT' THEN RETURN dqa_private.calculate_single_schedule_draft_plan_v48(p_tenant,p_command,p_check_end);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));
 IF (NOT dqa_private.preapproval_can_plan(p_tenant,q.id) AND dqa_private.calendar_repair_id(p_tenant,q.id) IS NULL) OR NOT dqa_private.case_row_active(p_tenant,'requests',q.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLANNING_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=q.id FOR UPDATE;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT(p_command ?& ARRAY['request_id','expected_request_revision','expected_draft_revision','data']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('request_id','expected_request_revision','expected_draft_revision','data')) OR coalesce(p_command->>'expected_request_revision','')!~'^[1-9][0-9]{0,14}$' OR coalesce(p_command->>'expected_draft_revision','')!~'^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.revision<>(p_command->>'expected_request_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 SELECT * INTO t FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id FOR SHARE;
 newflow:=dqa_private.preapproval_document(p_tenant,q.request_document_version_id);
 IF q.request_document_version_id IS NULL OR q.quantity NOT BETWEEN 1 AND 1000 OR q.form_details->>'priority' IS DISTINCT FROM '專案' OR NOT t.enabled OR coalesce(q.trial_snapshot->>'version','')<>t.specification_version THEN RAISE EXCEPTION 'PLANNING_SOURCE_INCOMPLETE';END IF;
 IF ((newflow AND (q.status<>'AWAITING_LMS_REVIEW' OR q.request_review_level<>0)) OR (NOT newflow AND (q.status<>'AWAITING_SCHEDULING' OR q.request_review_level<>2)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.request_id=q.id AND s.status NOT IN('DRAFT','CANCELLED'))) AND dqa_private.calendar_repair_id(p_tenant,q.id) IS NULL THEN RAISE EXCEPTION 'PLANNING_APPROVAL_REQUIRED';END IF;
 SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id FOR UPDATE;
 IF coalesce(d.revision,0)<>(p_command->>'expected_draft_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& ARRAY['equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN('equipment_ids','equipment_revisions','executor_id','executor_revision','start_date','end_date','sample_code','note','preparation_minutes','cleanup_minutes','sample_space_units','compound')) OR jsonb_typeof(data->'equipment_revisions') IS DISTINCT FROM 'object' OR jsonb_typeof(data->'equipment_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'sample_space_units') IS DISTINCT FROM 'number' OR coalesce(data->>'sample_space_units','')!~'^[1-9][0-9]{0,5}$' OR coalesce(data->>'executor_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(data->>'executor_revision','')!~'^[1-9][0-9]{0,14}$' OR data->>'preparation_minutes' IS DISTINCT FROM '0' OR data->>'cleanup_minutes' IS DISTINCT FROM '0' OR jsonb_typeof(data->'note') IS DISTINCT FROM 'string' OR length(data->>'note')>2000 OR jsonb_typeof(data->'sample_code') IS DISTINCT FROM 'string' OR length(btrim(data->>'sample_code')) NOT BETWEEN 0 AND 32000 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 units:=(data->>'sample_space_units')::integer;IF units>100000 THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 c:=CASE WHEN data ? 'compound' THEN data->'compound' ELSE d.plan->'compound' END;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN('start_local','shift_start','shift_end','preloaded_weekend','stage_equipment_ids')) OR coalesce(c->>'start_local','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-2][0-9]:[0-5][0-9]$' OR coalesce(c->>'shift_start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(c->>'shift_end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR jsonb_typeof(c->'preloaded_weekend') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'stage_equipment_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'COMPOUND_PLAN_REQUIRED';END IF;
 starts:=(c->>'start_local')::timestamp AT TIME ZONE 'Asia/Taipei';shift_start:=(c->>'shift_start')::time;shift_end:=(c->>'shift_end')::time;
 IF shift_start>=shift_end OR (starts AT TIME ZONE 'Asia/Taipei')::date<=((clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date) OR starts>clock_timestamp()+interval '366 days' OR data->>'start_date' IS DISTINCT FROM to_char(starts AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD') THEN RAISE EXCEPTION 'PLANNING_DATE_INVALID';END IF;
 stages:=q.form_details->'compoundStages';PERFORM dqa_private.validate_compound_protocol(p_tenant,stages);
 IF jsonb_array_length(c->'stage_equipment_ids')<>jsonb_array_length(stages) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'stage_equipment_ids') v WHERE v!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
 SELECT array_agg(v::uuid ORDER BY ord),array_agg(DISTINCT v::uuid ORDER BY v::uuid) INTO stage_ids,ids FROM jsonb_array_elements_text(c->'stage_equipment_ids') WITH ORDINALITY x(v,ord);
 IF cardinality(ids) NOT BETWEEN 1 AND 4 OR data->'equipment_ids' IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v) FROM unnest(ids) v) AND (SELECT array_agg(v::uuid ORDER BY v::uuid) FROM jsonb_array_elements_text(data->'equipment_ids') v) IS DISTINCT FROM ids THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
 SELECT * INTO person FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=(data->>'executor_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT person.enabled OR person.revision<>(data->>'executor_revision')::bigint OR NOT EXISTS(SELECT 1 FROM dqa_business.roles r JOIN auth.users u ON u.id=person.auth_user_id WHERE r.id=person.role_id AND r.tenant_id=p_tenant AND r.enabled AND 'lab'=ANY(r.systems) AND 'requests'=ANY(r.pages) AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())) THEN RAISE EXCEPTION 'PLANNING_EXECUTOR_REQUIRED';END IF;
 FOREACH device IN ARRAY ids LOOP
  SELECT * INTO m FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=device FOR SHARE;
  IF NOT FOUND OR q.execution_kind='REAL' AND m.operational_status<>'IDLE' THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
  IF coalesce(data->'equipment_revisions'->>m.id::text,'')<>m.revision::text THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
  IF m.space_units<q.quantity*units THEN RAISE EXCEPTION 'PLANNING_SPACE_INSUFFICIENT';END IF;
  eq_versions:=eq_versions||jsonb_build_object(m.id::text,m.revision);allocations:=allocations||jsonb_build_array(jsonb_build_object('equipment_id',m.id,'equipment_name',m.name,'quantity',q.quantity,'space_units',q.quantity*units));
 END LOOP;
 cursor_at:=starts;
 FOR stage IN SELECT v FROM jsonb_array_elements(stages) v LOOP
  idx:=idx+1;SELECT * INTO m FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=stage_ids[idx];rule:=dqa_private.compound_trial_rules()->(stage->>'profile_id');
  IF m.name!~*(rule->>'equipment_pattern') OR stage->>'operation'='continuous' AND m.daily_hours<24 THEN RAISE EXCEPTION 'PLANNING_EQUIPMENT_REQUIRED';END IF;
  duration:=duration+(stage->>'duration_minutes')::integer;stage_end:=cursor_at+(stage->>'duration_minutes')::integer*interval '1 minute';
  IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND NOT dqa_private.compound_working(cursor_at,shift_start,shift_end) AND NOT(idx=1 AND stage->>'profile_id'='HIGH_TEMPERATURE' AND stage->>'operation'='continuous' AND (c->>'preloaded_weekend')::boolean AND extract(isodow FROM cursor_at AT TIME ZONE 'Asia/Taipei')>5) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
  IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND stage->>'operation'='operator' AND (NOT dqa_private.compound_working(stage_end,shift_start,shift_end,true) OR (cursor_at AT TIME ZONE 'Asia/Taipei')::date<>(stage_end AT TIME ZONE 'Asia/Taipei')::date) THEN RAISE EXCEPTION 'COMPOUND_OPERATOR_WINDOW';END IF;
  segments:=segments||jsonb_build_array(stage||jsonb_build_object('equipment_id',m.id,'equipment_name',m.name,'quantity',q.quantity,'start_ms',extract(epoch FROM cursor_at)*1000,'end_ms',extract(epoch FROM stage_end)*1000,'starts_at',cursor_at,'ends_at',stage_end));cursor_at:=stage_end;
 END LOOP;
 ends:=cursor_at;end_date:=((ends-interval '1 millisecond') AT TIME ZONE 'Asia/Taipei')::date;
 IF NOT dqa_private.calendar_planning(p_tenant,q.id) AND NOT dqa_private.compound_working(ends,shift_start,shift_end,true) THEN RAISE EXCEPTION 'COMPOUND_HANDOFF_WINDOW';END IF;
 IF p_check_end AND data->>'end_date' IS DISTINCT FROM end_date::text THEN RAISE EXCEPTION 'PLANNING_END_DATE_MISMATCH';END IF;
 IF NOT newflow AND btrim(data->>'sample_code')='' THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';END IF;
 IF q.execution_kind='REAL' AND NOT dqa_private.calendar_planning(p_tenant,q.id) AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.released_at IS NULL AND a.reserve_from<ends AND starts<a.reserve_until AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.execution_kind='REAL' AND s.executor_member_id=person.id AND (s.status IN('BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') OR s.status='PENDING_APPROVAL' AND s.plan->>'flow_version'='PREAPPROVAL_V2') AND coalesce(s.reserve_from,s.starts_at)<ends AND starts<coalesce(s.reserve_until,s.ends_at) AND dqa_private.case_row_active(p_tenant,'schedules',s.id))) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 SELECT * INTO n FROM dqa_private.preapproval_samples WHERE tenant_id=p_tenant AND request_id=q.id AND document_id=q.request_document_version_id;
 RETURN jsonb_build_object('scheduling_unit','MINUTE','scheduling_days',ceil(duration::numeric/1440),'calendar_days',end_date-(starts AT TIME ZONE 'Asia/Taipei')::date+1,'scope','DRAFT_ONLY','reserved',false,'profile_id','COMPOUND_ENVIRONMENT','calendar','continuous','hours_per_batch',duration::numeric/60,'execution_ends_at',ends,'sample_space_units',units,'trial_revision',t.revision,'equipment_revisions',eq_versions,'executor_id',person.id,'executor_label',person.display_name,'executor_revision',person.revision,'start_date',(starts AT TIME ZONE 'Asia/Taipei')::date,'end_date',end_date,'starts_at',starts,'ends_at',ends,'start_ms',extract(epoch FROM starts)*1000,'end_ms',extract(epoch FROM ends)*1000,'reserve_from',starts,'reserve_until',ends,'segments',segments,'allocations',allocations,'compound',c,'sample_code',CASE WHEN newflow THEN coalesce(n.sample_code,'') ELSE btrim(data->>'sample_code') END,'note',data->>'note','preparation_minutes',0,'cleanup_minutes',0,'physical_feasibility','HUMAN_REVIEW_REQUIRED','operating_conditions','SIGNED_COMPOUND_PROTOCOL')||CASE WHEN newflow THEN jsonb_build_object('flow_version','PREAPPROVAL_V2','outsourced',false,'equipment_label','','sample_revision',n.revision,'document_id',q.request_document_version_id) ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'PLANNING_FIELDS_INVALID';
END $function$;
REVOKE ALL ON FUNCTION dqa_private.calculate_schedule_draft_plan_v55(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
DO $p$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM (VALUES
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$NOT dqa_private.can_read_request(p_tenant,req.id)$a$,$b$(NOT dqa_private.can_read_request(p_tenant,req.id) AND dqa_private.calendar_repair_id(p_tenant,req.id) IS NULL)$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF NOT dqa_private.preapproval_can_plan(p_tenant,req.id) THEN$a$,$b$IF NOT dqa_private.preapproval_can_plan(p_tenant,req.id) AND dqa_private.calendar_repair_id(p_tenant,req.id) IS NULL THEN$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF req.status<>'AWAITING_LMS_REVIEW' OR req.request_review_level<>0 THEN$a$,$b$IF (req.status<>'AWAITING_LMS_REVIEW' OR req.request_review_level<>0) AND dqa_private.calendar_repair_id(p_tenant,req.id) IS NULL THEN$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$ELSIF req.status<>'AWAITING_SCHEDULING' OR req.request_review_level<>2 OR req.request_document_version_id IS NULL THEN$a$,$b$ELSIF (req.status<>'AWAITING_SCHEDULING' OR req.request_review_level<>2 OR req.request_document_version_id IS NULL) AND dqa_private.calendar_repair_id(p_tenant,req.id) IS NULL THEN$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedule_equipment$a$,$b$IF req.execution_kind='REAL' AND NOT dqa_private.calendar_planning(p_tenant,req.id) AND EXISTS(SELECT 1 FROM dqa_business.schedule_equipment$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF req.execution_kind='REAL' AND EXISTS(SELECT 1 FROM dqa_business.schedules$a$,$b$IF req.execution_kind='REAL' AND NOT dqa_private.calendar_planning(p_tenant,req.id) AND EXISTS(SELECT 1 FROM dqa_business.schedules$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF rule->>'calendar'='weekdays' AND (EXISTS($a$,$b$IF NOT dqa_private.calendar_planning(p_tenant,req.id) AND rule->>'calendar'='weekdays' AND (EXISTS($b$)) v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'CALENDAR_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $p$;
CREATE OR REPLACE FUNCTION dqa_private.calculate_schedule_draft_plan(p_tenant uuid,p_command jsonb,p_check_end boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb;r uuid:=(p_command->>'request_id')::uuid;BEGIN
 INSERT INTO dqa_private.calendar_planning_permits VALUES(p_tenant,r,txid_current(),dqa_private.calendar_repair_id(p_tenant,r)) ON CONFLICT DO NOTHING;
 p:=dqa_private.calculate_schedule_draft_plan_v55(p_tenant,p_command,false);p:=dqa_private.apply_schedule_calendar(p_tenant,r,p);
 DELETE FROM dqa_private.calendar_planning_permits WHERE tenant_id=p_tenant AND request_id=r AND transaction_id=txid_current();
 IF p_check_end AND p_command->'data'->>'end_date' IS DISTINCT FROM p->>'end_date' THEN RAISE EXCEPTION 'PLANNING_END_DATE_MISMATCH';END IF;RETURN p;
EXCEPTION WHEN OTHERS THEN DELETE FROM dqa_private.calendar_planning_permits WHERE tenant_id=p_tenant AND request_id=r AND transaction_id=txid_current();RAISE;
END $$;
CREATE FUNCTION dqa_private.trial_calendar_snapshot(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT CASE WHEN dqa_private.can(p_tenant,'catalog.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('trial_id',trial_id,'calendar_policy',policy,'revision',revision)) FROM dqa_private.trial_calendar_policies WHERE tenant_id=p_tenant),'[]') ELSE '[]'::jsonb END $$;
CREATE FUNCTION dqa_business.scheduling_context(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE events jsonb;incidents jsonb;equipment jsonb;paused jsonb;trials jsonb;BEGIN
 IF NOT dqa_private.can(p_tenant) OR NOT(dqa_private.is_admin(p_tenant) OR dqa_private.can(p_tenant,'schedules.read_all') OR dqa_private.can(p_tenant,'schedules.plan') OR dqa_private.can(p_tenant,'equipment.manage') OR dqa_private.can(p_tenant,'lab.execute') OR dqa_private.can(p_tenant,'catalog.manage')) THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO incidents FROM(SELECT id,kind,equipment_id,first_day,last_day,reason,resolved_at FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant ORDER BY created_at DESC,id LIMIT 200)x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO events FROM(SELECT e.id,e.action,e.reason,e.created_at,q.legacy_id request_code,e.schedule_id,e.before_plan->>'start_date' previous_start,e.before_plan->>'end_date' previous_end,e.after_plan->>'start_date' current_start,e.after_plan->>'end_date' current_end,e.after_plan->'calendar_adjustment'->'late' late FROM dqa_private.schedule_adjustments e JOIN dqa_business.requests q ON q.tenant_id=e.tenant_id AND q.id=e.request_id WHERE e.tenant_id=p_tenant AND dqa_private.can_read_request(p_tenant,q.id) ORDER BY e.created_at DESC,e.id LIMIT 100)x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') INTO equipment FROM dqa_business.equipment WHERE tenant_id=p_tenant AND deleted_at IS NULL AND dqa_private.can(p_tenant,'equipment.read');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'request_code',q.legacy_id,'reason',s.plan->'interruption'->>'reason','can_decide',dqa_private.is_admin(p_tenant) OR s.executor_member_id=dqa_private.member_id(p_tenant) AND dqa_private.can(p_tenant,'lab.execute'),'can_resume',dqa_private.trial_calendar_policy(p_tenant,q.trial_id,s.plan->>'calendar')->>'mode' IN('WORKDAYS_SPLIT','COMPOUND_DISCONTINUOUS'))),'[]') INTO paused FROM dqa_business.schedules s JOIN dqa_business.requests q ON q.tenant_id=s.tenant_id AND q.id=s.request_id WHERE s.tenant_id=p_tenant AND s.status='PAUSED' AND s.plan ? 'interruption' AND dqa_private.can_read_request(p_tenant,q.id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'calendar_policy',dqa_private.trial_calendar_policy(p_tenant,t.id,CASE WHEN t.profile_code IN('VIBRATION_DURABILITY','WATER_INGRESS','ESD','TENSILE','INSPECTION','MECHANICAL_SHOCK','DROP','VOLTAGE','EMC') THEN 'weekdays' ELSE 'continuous' END))),'[]') INTO trials FROM dqa_business.trial_definitions t WHERE t.tenant_id=p_tenant AND t.enabled AND dqa_private.can(p_tenant,'catalog.read');
 RETURN jsonb_build_object('can_manage_policy',dqa_private.can(p_tenant,'catalog.manage'),'trials',trials,'priority_order',jsonb_build_array('急件','專案','一般','委外'),'calendar_from',(SELECT min(day) FROM dqa_private.office_calendar),'calendar_until',(SELECT max(day) FROM dqa_private.office_calendar),'calendar_source','政府資料開放平台14718；TaiwanCalendar整理，2026–2027','calendar_source_url','https://data.gov.tw/dataset/14718','can_manage_calendar',dqa_private.is_admin(p_tenant),'can_report_fault',dqa_private.can(p_tenant,'equipment.manage'),'equipment',equipment,'incidents',incidents,'events',events,'paused',paused,'events_limit',100,'incidents_limit',200);
END $$;
CREATE FUNCTION dqa_business.scheduling_result(p_tenant uuid,p_operation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT coalesce((SELECT result FROM dqa_private.scheduling_operations WHERE tenant_id=p_tenant AND id=p_operation AND actor=auth.uid() AND dqa_private.can(p_tenant)),jsonb_build_object('id',p_operation,'state','NOT_COMMITTED_OR_NOT_FOUND')) $$;
CREATE FUNCTION dqa_business.save_scheduling_operation(p_tenant uuid,p_operation uuid,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old dqa_private.scheduling_operations;fp text;result jsonb;kind text;first_day date;last_day date;chosen_equipment uuid;incident dqa_private.schedule_incidents;s dqa_business.schedules;q dqa_business.requests;policy jsonb;remaining jsonb;paused_at timestamptz;
BEGIN
 IF p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('INCIDENT','RESOLVE','DECIDE','POLICY') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>6000 OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
 IF NOT dqa_private.can(p_tenant) THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 fp:=encode(sha256(convert_to(jsonb_build_array(p_action,p_data)::text,'UTF8')),'hex');SELECT * INTO old FROM dqa_private.scheduling_operations WHERE tenant_id=p_tenant AND id=p_operation;
 IF FOUND THEN IF old.actor<>auth.uid() OR old.fingerprint<>fp THEN RAISE EXCEPTION 'CALENDAR_OPERATION_CONFLICT';END IF;RETURN old.result;END IF;
 IF p_action='INCIDENT' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('kind','first_day','last_day','equipment_id','reason')) OR NOT(p_data ?& ARRAY['kind','first_day','last_day','equipment_id','reason']) OR p_data->>'kind' NOT IN('CLOSURE','WORKING_DAY','EQUIPMENT_FAULT') OR coalesce(p_data->>'first_day','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_data->>'last_day','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
  kind:=p_data->>'kind';first_day:=(p_data->>'first_day')::date;last_day:=(p_data->>'last_day')::date;chosen_equipment:=nullif(p_data->>'equipment_id','')::uuid;
  IF last_day<first_day OR last_day>first_day+366 OR first_day<(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date OR NOT EXISTS(SELECT 1 FROM dqa_private.office_calendar WHERE day=last_day) THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
  IF kind='EQUIPMENT_FAULT' THEN IF NOT dqa_private.can(p_tenant,'equipment.manage') OR chosen_equipment IS NULL OR NOT EXISTS(SELECT 1 FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=chosen_equipment AND deleted_at IS NULL) THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
  ELSIF NOT dqa_private.is_admin(p_tenant) OR chosen_equipment IS NOT NULL THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
  DELETE FROM dqa_private.schedule_repair_attempts WHERE tenant_id=p_tenant;
  INSERT INTO dqa_private.schedule_incidents VALUES(p_operation,p_tenant,kind,chosen_equipment,first_day,last_day,btrim(p_data->>'reason'),auth.uid(),clock_timestamp(),NULL);
 ELSIF p_action='RESOLVE' THEN
  IF NOT(p_data ?& ARRAY['incident_id','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('incident_id','reason')) THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
  SELECT * INTO incident FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND id=(p_data->>'incident_id')::uuid FOR UPDATE;
  IF NOT FOUND OR incident.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
  IF NOT(dqa_private.is_admin(p_tenant) OR incident.kind='EQUIPMENT_FAULT' AND dqa_private.can(p_tenant,'equipment.manage')) THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
  UPDATE dqa_private.schedule_incidents SET resolved_at=clock_timestamp() WHERE id=incident.id;DELETE FROM dqa_private.schedule_repair_attempts WHERE tenant_id=p_tenant;
 ELSIF p_action='POLICY' THEN
  IF NOT(p_data ?& ARRAY['trial_id','expected_revision','policy','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('trial_id','expected_revision','policy','reason')) OR NOT dqa_private.can(p_tenant,'catalog.manage') THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
  PERFORM 1 FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=(p_data->>'trial_id')::uuid AND enabled FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
  PERFORM dqa_private.validate_calendar_policy(p_data->'policy');
  IF coalesce((SELECT revision FROM dqa_private.trial_calendar_policies WHERE tenant_id=p_tenant AND trial_id=(p_data->>'trial_id')::uuid),0) IS DISTINCT FROM (p_data->>'expected_revision')::bigint THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
  INSERT INTO dqa_private.trial_calendar_policies VALUES(p_tenant,(p_data->>'trial_id')::uuid,p_data->'policy',1) ON CONFLICT(tenant_id,trial_id) DO UPDATE SET policy=EXCLUDED.policy,revision=dqa_private.trial_calendar_policies.revision+1;
 ELSE
  IF NOT(p_data ?& ARRAY['schedule_id','expected_revision','decision','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('schedule_id','expected_revision','decision','reason')) OR p_data->>'decision' NOT IN('RESUME','RETEST') THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';END IF;
  SELECT * INTO s FROM dqa_business.schedules WHERE tenant_id=p_tenant AND id=(p_data->>'schedule_id')::uuid FOR UPDATE;
  IF NOT FOUND OR s.revision IS DISTINCT FROM (p_data->>'expected_revision')::bigint OR s.status<>'PAUSED' OR NOT(s.plan ? 'interruption') THEN RAISE EXCEPTION 'REVISION_CONFLICT';END IF;
  IF NOT(dqa_private.is_admin(p_tenant) OR s.executor_member_id=dqa_private.member_id(p_tenant) AND dqa_private.can(p_tenant,'lab.execute')) THEN RAISE EXCEPTION 'CALENDAR_ACCESS_DENIED';END IF;
  SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=s.request_id FOR UPDATE;policy:=dqa_private.trial_calendar_policy(p_tenant,q.trial_id,s.plan->>'calendar');
  IF p_data->>'decision'='RESUME' AND policy->>'mode' NOT IN('WORKDAYS_SPLIT','COMPOUND_DISCONTINUOUS') THEN RAISE EXCEPTION 'CALENDAR_RETEST_REQUIRED';END IF;
  paused_at:=(s.plan->'interruption'->>'at')::timestamptz;SELECT coalesce(jsonb_agg(x||jsonb_build_object('start_ms',greatest((x->>'start_ms')::numeric,extract(epoch FROM paused_at)*1000))),'[]') INTO remaining FROM jsonb_array_elements(s.plan->'segments') x WHERE (x->>'end_ms')::numeric>extract(epoch FROM paused_at)*1000;
  IF p_data->>'decision'='RESUME' AND jsonb_array_length(remaining)=0 THEN RAISE EXCEPTION 'CALENDAR_NO_REMAINING_WORK';END IF;
  INSERT INTO dqa_private.schedule_repair_permits VALUES(p_tenant,s.id,q.id,txid_current());
  UPDATE dqa_business.schedules SET status='AWAITING_RECEIPT',started_at=NULL,received_at=NULL,plan=(plan-'interruption')||jsonb_build_object('interruption_decision',jsonb_build_object('decision',p_data->>'decision','actor',dqa_private.member_id(p_tenant),'at',clock_timestamp(),'reason',p_data->>'reason','pause_ms',extract(epoch FROM paused_at)*1000,'remaining_segments',remaining)) WHERE id=s.id;
  UPDATE dqa_business.requests SET status='AWAITING_LAB_RECEIPT' WHERE tenant_id=p_tenant AND id=q.id;
  UPDATE dqa_business.equipment SET operational_status='IDLE' WHERE tenant_id=p_tenant AND operational_status IN('IN_USE','PAUSED') AND id IN(SELECT equipment_id FROM dqa_business.schedule_equipment WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL) AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a JOIN dqa_business.schedules z ON z.tenant_id=a.tenant_id AND z.id=a.schedule_id WHERE a.tenant_id=p_tenant AND a.equipment_id=dqa_business.equipment.id AND a.schedule_id<>s.id AND a.released_at IS NULL AND z.status IN('RUNNING','PAUSED'));
  INSERT INTO dqa_private.schedule_adjustments(tenant_id,schedule_id,request_id,action,before_plan,reason) VALUES(p_tenant,s.id,q.id,CASE p_data->>'decision' WHEN 'RESUME' THEN 'RESUME_AUTHORIZED' ELSE 'RETEST_AUTHORIZED' END,s.plan,p_data->>'reason');
  DELETE FROM dqa_private.schedule_repair_permits WHERE tenant_id=p_tenant AND schedule_id=s.id AND transaction_id=txid_current();
 END IF;
 result:=jsonb_build_object('id',p_operation,'state','SAVED','adjustments',dqa_private.process_schedule_incidents(p_tenant));
 INSERT INTO dqa_private.scheduling_operations VALUES(p_tenant,p_operation,auth.uid(),fp,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CALENDAR_FIELDS_INVALID';
END $$;
REVOKE ALL ON FUNCTION dqa_business.scheduling_context(uuid),dqa_business.scheduling_result(uuid,uuid),dqa_business.save_scheduling_operation(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.scheduling_context(uuid),dqa_business.scheduling_result(uuid,uuid),dqa_business.save_scheduling_operation(uuid,uuid,text,jsonb) TO authenticated;
CREATE FUNCTION dqa_private.repair_schedule_command(p_tenant uuid,s dqa_business.schedules,start_day date,alternative boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;d dqa_business.schedule_drafts;p jsonb:=s.plan;c jsonb;a jsonb;ids uuid[]:='{}';stage_ids uuid[]:='{}';versions jsonb:='{}';machine dqa_business.equipment;old_machine dqa_business.equipment;person dqa_business.memberships;profile text;pattern text;stage jsonb;policy jsonb;target uuid;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=s.request_id;SELECT * INTO d FROM dqa_business.schedule_drafts WHERE tenant_id=p_tenant AND request_id=q.id;SELECT * INTO person FROM dqa_business.memberships WHERE tenant_id=p_tenant AND id=s.executor_member_id;
 c:=dqa_private.preapproval_plan_command(p_tenant,q.id,p,coalesce(d.revision,0));c:=jsonb_set(c,'{expected_request_revision}',to_jsonb(q.revision));c:=jsonb_set(c,'{data,start_date}',to_jsonb(start_day));c:=jsonb_set(c,'{data,end_date}',to_jsonb(start_day));c:=jsonb_set(c,'{data,executor_revision}',to_jsonb(person.revision));
 IF p ? 'compound' THEN
  FOR stage IN SELECT value FROM jsonb_array_elements(q.form_details->'compoundStages') WITH ORDINALITY x(value,n) ORDER BY n LOOP
   profile:=stage->>'profile_id';pattern:=dqa_private.compound_trial_rules()->profile->>'equipment_pattern';target:=((p->'compound'->'stage_equipment_ids')->>cardinality(stage_ids))::uuid;
   SELECT * INTO machine FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=target;old_machine:=machine;
   IF alternative THEN SELECT * INTO machine FROM dqa_business.equipment e WHERE e.tenant_id=p_tenant AND e.deleted_at IS NULL AND e.operational_status='IDLE' AND e.name~*pattern AND (e.id=target OR length(btrim(coalesce(old_machine.specification,'')))>0 AND e.specification=old_machine.specification AND e.category=old_machine.category) AND e.space_units>=(p->>'sample_space_units')::int*q.quantity AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_incidents i WHERE i.tenant_id=p_tenant AND i.resolved_at IS NULL AND i.kind='EQUIPMENT_FAULT' AND i.equipment_id=e.id AND start_day BETWEEN i.first_day AND i.last_day) ORDER BY (e.id=target) DESC,e.id LIMIT 1;END IF;
   IF machine.id IS NULL THEN RAISE EXCEPTION 'CALENDAR_NO_MACHINE';END IF;stage_ids:=array_append(stage_ids,machine.id);IF NOT machine.id=ANY(ids) THEN ids:=array_append(ids,machine.id);END IF;versions:=versions||jsonb_build_object(machine.id::text,machine.revision);
  END LOOP;
  c:=jsonb_set(c,'{data,compound,stage_equipment_ids}',to_jsonb(stage_ids));c:=jsonb_set(c,'{data,compound,start_local}',to_jsonb(start_day::text||substr(p->'compound'->>'start_local',11)));
 ELSE
  FOR a IN SELECT value FROM jsonb_array_elements(p->'allocations') LOOP
   target:=(a->>'equipment_id')::uuid;SELECT * INTO machine FROM dqa_business.equipment WHERE tenant_id=p_tenant AND id=target;old_machine:=machine;
   IF alternative THEN
    SELECT profile_code INTO profile FROM dqa_business.trial_definitions WHERE tenant_id=p_tenant AND id=q.trial_id;pattern:=dqa_private.compound_trial_rules()->profile->>'equipment_pattern';
    SELECT * INTO machine FROM dqa_business.equipment e WHERE e.tenant_id=p_tenant AND e.deleted_at IS NULL AND e.operational_status='IDLE' AND NOT e.id=ANY(ids) AND e.name~*pattern AND (e.id=target OR length(btrim(coalesce(old_machine.specification,'')))>0 AND e.specification=old_machine.specification AND e.category=old_machine.category) AND e.space_units>=(a->>'space_units')::int AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_incidents i WHERE i.tenant_id=p_tenant AND i.resolved_at IS NULL AND i.kind='EQUIPMENT_FAULT' AND i.equipment_id=e.id AND start_day BETWEEN i.first_day AND i.last_day) ORDER BY (e.id=target) DESC,e.id LIMIT 1;
   END IF;
   IF machine.id IS NULL THEN RAISE EXCEPTION 'CALENDAR_NO_MACHINE';END IF;ids:=array_append(ids,machine.id);versions:=versions||jsonb_build_object(machine.id::text,machine.revision);
  END LOOP;
 END IF;
 c:=jsonb_set(c,'{data,equipment_ids}',to_jsonb(ids));c:=jsonb_set(c,'{data,equipment_revisions}',versions);RETURN c;
END $$;
CREATE FUNCTION dqa_private.process_schedule_incidents(p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s dqa_business.schedules;q dqa_business.requests;i dqa_private.schedule_incidents;issue uuid;reason text;policy jsonb;candidate jsonb;c jsonb;before jsonb;a jsonb;start_day date;offset_day integer;variant integer;found_plan boolean;count_fixed int:=0;count_paused int:=0;count_blocked int:=0;last_error text;at_time timestamptz:=clock_timestamp();adjustment uuid;remaining jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('workspace-access:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('case-maintenance:'||p_tenant,0));PERFORM pg_advisory_xact_lock(hashtextextended('schedule-drafts:'||p_tenant,0));
 FOR s IN SELECT z.* FROM dqa_business.schedules z JOIN dqa_business.requests r ON r.tenant_id=z.tenant_id AND r.id=z.request_id WHERE z.tenant_id=p_tenant AND z.execution_kind='REAL' AND z.status IN('PENDING_APPROVAL','AWAITING_RECEIPT','BOOKED','RUNNING') AND dqa_private.case_row_active(p_tenant,'schedules',z.id) AND (z.plan ? 'interruption_decision' OR EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments blocked WHERE blocked.tenant_id=p_tenant AND blocked.schedule_id=z.id AND blocked.action='BLOCKED' AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments newer WHERE newer.tenant_id=p_tenant AND newer.schedule_id=z.id AND newer.created_at>blocked.created_at AND newer.action='RESCHEDULED')) OR EXISTS(SELECT 1 FROM dqa_business.schedules paused WHERE paused.tenant_id=p_tenant AND paused.id<>z.id AND paused.status='PAUSED' AND (paused.executor_member_id=z.executor_member_id OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment x JOIN dqa_business.schedule_equipment y ON y.tenant_id=x.tenant_id AND y.equipment_id=x.equipment_id WHERE x.tenant_id=p_tenant AND x.schedule_id=paused.id AND y.schedule_id=z.id AND x.released_at IS NULL AND y.released_at IS NULL))) OR EXISTS(SELECT 1 FROM dqa_private.schedule_incidents n WHERE n.tenant_id=p_tenant AND n.resolved_at IS NULL AND n.kind<>'WORKING_DAY' AND n.first_day<=((coalesce(z.reserve_until,z.ends_at)-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date AND n.last_day>=(coalesce(z.reserve_from,z.starts_at) AT TIME ZONE 'Asia/Taipei')::date AND (n.equipment_id IS NULL OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.schedule_id=z.id AND a.equipment_id=n.equipment_id AND a.released_at IS NULL)))) ORDER BY coalesce((SELECT last_attempt FROM dqa_private.schedule_repair_attempts retry WHERE retry.tenant_id=p_tenant AND retry.schedule_id=z.id),'-infinity'::timestamptz),dqa_private.scheduling_priority(r.form_details->>'priority'),z.starts_at,z.id LIMIT 10 FOR UPDATE OF z LOOP
  IF clock_timestamp()>at_time+interval '6 seconds' THEN EXIT;END IF;
  INSERT INTO dqa_private.schedule_repair_attempts VALUES(p_tenant,s.id,at_time) ON CONFLICT(tenant_id,schedule_id) DO UPDATE SET last_attempt=EXCLUDED.last_attempt;
  SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=s.request_id FOR UPDATE;before:=s.plan;last_error:='CALENDAR_NO_WINDOW';
  SELECT * INTO i FROM dqa_private.schedule_incidents n WHERE n.tenant_id=p_tenant AND n.resolved_at IS NULL AND n.kind<>'WORKING_DAY' AND n.first_day<=((s.ends_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date AND n.last_day>=(s.starts_at AT TIME ZONE 'Asia/Taipei')::date AND (n.equipment_id IS NULL OR EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.schedule_id=s.id AND a.equipment_id=n.equipment_id AND a.released_at IS NULL)) ORDER BY n.first_day,n.id LIMIT 1;
  issue:=i.id;reason:=coalesce(i.reason,'人員確認中斷處理');
  INSERT INTO dqa_private.schedule_repair_permits VALUES(p_tenant,s.id,q.id,txid_current()) ON CONFLICT DO NOTHING;
  IF s.status='RUNNING' OR s.started_at IS NOT NULL THEN
   IF i.first_day>(at_time AT TIME ZONE 'Asia/Taipei')::date THEN DELETE FROM dqa_private.schedule_repair_permits WHERE tenant_id=p_tenant AND schedule_id=s.id AND transaction_id=txid_current();CONTINUE;END IF;
   UPDATE dqa_business.schedules SET status='PAUSED',plan=plan||jsonb_build_object('interruption',jsonb_build_object('at',at_time,'incident_id',issue,'reason',reason,'requires_human_decision',true)) WHERE tenant_id=p_tenant AND id=s.id;
   INSERT INTO dqa_private.schedule_adjustments(tenant_id,schedule_id,request_id,incident_id,action,before_plan,after_plan,reason) VALUES(p_tenant,s.id,q.id,issue,'PAUSED',before,NULL,reason);count_paused:=count_paused+1;
  ELSE
   policy:=dqa_private.trial_calendar_policy(p_tenant,q.trial_id,s.plan->>'calendar');found_plan:=false;
   <<search>> FOR offset_day IN 0..59 LOOP
    start_day:=greatest((s.starts_at AT TIME ZONE 'Asia/Taipei')::date,(at_time AT TIME ZONE 'Asia/Taipei')::date+1)+offset_day;
    IF clock_timestamp()>at_time+interval '6 seconds' THEN last_error:='CALENDAR_SEARCH_LIMIT';EXIT search;END IF;
    FOR variant IN 0..CASE WHEN (policy->>'substitution')::boolean AND coalesce(s.plan->'interruption_decision'->>'decision','')<>'RESUME' THEN 1 ELSE 0 END LOOP
     BEGIN
      c:=dqa_private.repair_schedule_command(p_tenant,s,start_day,variant=1);candidate:=dqa_private.calculate_schedule_draft_plan(p_tenant,c,false);
      IF s.plan->'interruption_decision'->>'decision'='RESUME' THEN
       SELECT coalesce(jsonb_agg(x||jsonb_build_object('start_ms',(candidate->>'start_ms')::numeric+greatest(0,(x->>'start_ms')::numeric-(s.plan->'interruption_decision'->>'pause_ms')::numeric),'end_ms',(candidate->>'start_ms')::numeric+(x->>'end_ms')::numeric-(s.plan->'interruption_decision'->>'pause_ms')::numeric)),'[]') INTO remaining FROM jsonb_array_elements(s.plan->'interruption_decision'->'remaining_segments') x;
       IF jsonb_array_length(remaining)=0 THEN RAISE EXCEPTION 'CALENDAR_NO_REMAINING_WORK';END IF;candidate:=dqa_private.apply_schedule_calendar(p_tenant,q.id,candidate||jsonb_build_object('segments',remaining));
      END IF;
      IF (candidate->>'starts_at')::timestamptz<s.starts_at THEN RAISE EXCEPTION 'CALENDAR_EARLIER_START';END IF;
      found_plan:=true;EXIT search;
     EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' OR SQLSTATE '40001' THEN GET STACKED DIAGNOSTICS last_error=MESSAGE_TEXT;END;
    END LOOP;
   END LOOP;
   IF found_plan THEN
    candidate:=candidate||jsonb_build_object('calendar_adjustment',jsonb_build_object('at',at_time,'incident_id',issue,'reason',reason,'original_due_date',q.requested_date,'late',((candidate->>'end_date')::date>q.requested_date),'previous_start',s.starts_at,'previous_end',s.ends_at));
    UPDATE dqa_business.schedule_equipment SET released_at=at_time WHERE tenant_id=p_tenant AND schedule_id=s.id AND released_at IS NULL;
    UPDATE dqa_business.schedules SET starts_at=(candidate->>'starts_at')::timestamptz,ends_at=(candidate->>'ends_at')::timestamptz,reserve_from=(candidate->>'reserve_from')::timestamptz,reserve_until=(candidate->>'reserve_until')::timestamptz,plan=candidate,received_at=NULL,status=CASE WHEN status='PENDING_APPROVAL' THEN status ELSE 'AWAITING_RECEIPT' END WHERE tenant_id=p_tenant AND id=s.id;
    FOR a IN SELECT value FROM jsonb_array_elements(candidate->'allocations') LOOP INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) VALUES(p_tenant,s.id,(a->>'equipment_id')::uuid,(candidate->>'reserve_from')::timestamptz,(candidate->>'reserve_until')::timestamptz,(a->>'space_units')::int,(a->>'quantity')::int) ON CONFLICT(tenant_id,schedule_id,equipment_id) DO UPDATE SET reserve_from=EXCLUDED.reserve_from,reserve_until=EXCLUDED.reserve_until,allocated_units=EXCLUDED.allocated_units,sample_quantity=EXCLUDED.sample_quantity,released_at=NULL;END LOOP;
    INSERT INTO dqa_private.schedule_adjustments(tenant_id,schedule_id,request_id,incident_id,action,before_plan,after_plan,reason) VALUES(p_tenant,s.id,q.id,issue,'RESCHEDULED',before,candidate,reason);count_fixed:=count_fixed+1;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments blocked WHERE blocked.tenant_id=p_tenant AND blocked.schedule_id=s.id AND blocked.incident_id IS NOT DISTINCT FROM issue AND blocked.action='BLOCKED' AND blocked.reason=last_error) THEN INSERT INTO dqa_private.schedule_adjustments(tenant_id,schedule_id,request_id,incident_id,action,before_plan,reason) VALUES(p_tenant,s.id,q.id,issue,'BLOCKED',before,last_error);END IF;count_blocked:=count_blocked+1;
   END IF;
  END IF;
  DELETE FROM dqa_private.schedule_repair_permits WHERE tenant_id=p_tenant AND schedule_id=s.id AND transaction_id=txid_current();
 END LOOP;
 RETURN jsonb_build_object('rescheduled',count_fixed,'paused',count_paused,'blocked',count_blocked);
END $$;
DO $integration$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM (VALUES
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$'test_type','legacy_id','name'$a$,$b$'calendar_policy','test_type','legacy_id','name'$b$),
('dqa_business.execute_resource_operation(uuid,uuid,jsonb)',$a$  final_revision:=trial.revision;legacy:=trial.legacy_id;$a$,$b$  IF payload ? 'calendar_policy' THEN
   PERFORM dqa_private.validate_calendar_policy(payload->'calendar_policy');
   INSERT INTO dqa_private.trial_calendar_policies VALUES(p_tenant,target,payload->'calendar_policy',1) ON CONFLICT(tenant_id,trial_id) DO UPDATE SET policy=EXCLUDED.policy,revision=dqa_private.trial_calendar_policies.revision+1 WHERE dqa_private.trial_calendar_policies.policy IS DISTINCT FROM EXCLUDED.policy;
  END IF;
  final_revision:=trial.revision;legacy:=trial.legacy_id;$b$),
('dqa_business.preapproval_context(uuid,uuid)',$a$'quantity',q.quantity$a$,$b$'quantity',q.quantity,'calendar_policy',dqa_private.trial_calendar_policy(p_tenant,q.trial_id,d.plan->>'calendar')$b$),
('dqa_business.preapproval_snapshot(uuid)',$a$'trial_types',dqa_private.trial_types_snapshot(p_tenant)$a$,$b$'trial_types',dqa_private.trial_types_snapshot(p_tenant),'trial_calendar_policies',dqa_private.trial_calendar_snapshot(p_tenant)$b$),
('dqa_private.workflow_policy_gate()',$a$BEGIN
$a$,$b$BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM dqa_private.schedule_repair_permits p WHERE p.tenant_id=NEW.tenant_id AND p.transaction_id=txid_current() AND ((TG_TABLE_NAME='schedules' AND p.schedule_id=NEW.id) OR (TG_TABLE_NAME='requests' AND p.request_id=NEW.id))) THEN RETURN NEW;END IF;
$b$),
('dqa_business.start_due_lab_trials(uuid)',$a$ FOR lock_id IN SELECT id FROM dqa_business.schedules$a$,$b$ PERFORM dqa_private.process_schedule_incidents(p_tenant);
 FOR lock_id IN SELECT id FROM dqa_business.schedules$b$),
('dqa_business.start_due_lab_trials(uuid)',$a$AND status='BOOKED' AND received_at IS NOT NULL AND starts_at<=at_time AND ends_at>at_time$a$,$b$AND status='BOOKED' AND received_at IS NOT NULL AND starts_at<=at_time AND ends_at>at_time AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments e WHERE e.tenant_id=p_tenant AND e.schedule_id=dqa_business.schedules.id AND e.action='BLOCKED' AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments newer WHERE newer.tenant_id=p_tenant AND newer.schedule_id=e.schedule_id AND newer.created_at>e.created_at AND newer.action='RESCHEDULED'))$b$),
('dqa_business.start_due_lab_trials(uuid)',$a$VALUES(p_tenant,s.id,q.id,s.executor_member_id,s.starts_at,at_time);$a$,$b$VALUES(p_tenant,s.id,q.id,s.executor_member_id,s.starts_at,at_time) ON CONFLICT(schedule_id) DO NOTHING;$b$),
('dqa_private.preparation_ready(uuid,uuid,uuid)',$a$t.stage='LAB_PREPARE'$a$,$b$t.stage='LAB_PREPARE' AND e.created_at>=coalesce((SELECT max(created_at) FROM dqa_private.schedule_adjustments WHERE tenant_id=p_tenant AND schedule_id=p_schedule AND action='RESCHEDULED'),'-infinity'::timestamptz)$b$)) v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'CALENDAR_INTEGRATION_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $integration$;

DO $$ DECLARE p record;BEGIN FOR p IN SELECT oid::regprocedure::text sig FROM pg_proc WHERE pronamespace='dqa_private'::regnamespace AND proname IN('scheduling_priority','calendar_repair_id','calendar_planning','validate_calendar_policy','trial_calendar_policy','calendar_open','calendar_interval_open','apply_schedule_calendar','trial_calendar_snapshot','process_schedule_incidents','repair_schedule_command') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||p.sig||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
