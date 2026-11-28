-- Dates are authoritative for new plans; nominal source hours remain unchanged.
CREATE OR REPLACE FUNCTION dqa_private.apply_schedule_calendar(p_tenant uuid,p_request uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q dqa_business.requests;p jsonb;mode text;seg jsonb;pieces jsonb:='[]';next_device jsonb:='{}';begin_at timestamptz;finish timestamptz;cursor_at timestamptz;first_at timestamptz;last_at timestamptz;work_day date;minutes numeric;days_needed integer;used integer;attempt integer;compound boolean;manual boolean;repair uuid;scope_start timestamptz;scope_end timestamptz;ids uuid[];item_end timestamptz;nominal_end timestamptz;nominal_finish timestamptz;
BEGIN
 SELECT * INTO q FROM dqa_business.requests WHERE tenant_id=p_tenant AND id=p_request;
 p:=dqa_private.trial_calendar_policy(p_tenant,q.trial_id,p_plan->>'calendar');mode:=p->>'mode';compound:=p_plan ? 'compound';repair:=dqa_private.calendar_repair_id(p_tenant,p_request);
 FOR seg IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(p_plan->'segments')=0 AND p_plan->>'outsourced'='true' THEN jsonb_build_array(jsonb_build_object('start_ms',p_plan->'start_ms','end_ms',extract(epoch FROM (p_plan->>'execution_ends_at')::timestamptz)*1000,'quantity',q.quantity)) ELSE p_plan->'segments' END) LOOP
  minutes:=((seg->>'end_ms')::numeric-(seg->>'start_ms')::numeric)/60000;IF minutes<=0 OR minutes>525600 THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
  days_needed:=ceil(minutes/1440);begin_at:=((to_timestamp((seg->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';
  IF compound AND cursor_at IS NOT NULL THEN begin_at:=cursor_at;
  ELSIF NOT compound AND next_device ? coalesce(seg->>'equipment_id','OUTSOURCE') THEN begin_at:=greatest(begin_at,(next_device->>coalesce(seg->>'equipment_id','OUTSOURCE'))::timestamptz);END IF;
  manual:=compound AND seg->>'operation'='operator';
  IF compound AND mode='COMPOUND_CONTINUOUS' THEN
   -- Keep the signed stages contiguous internally. Only the whole chain's final date is rounded.
   finish:=begin_at+minutes*interval '1 minute';
   IF NOT dqa_private.calendar_open(p_tenant,(begin_at AT TIME ZONE 'Asia/Taipei')::date,CASE WHEN manual THEN false ELSE (p->>'weekends')::boolean END,CASE WHEN manual THEN false ELSE (p->>'holidays')::boolean END) OR NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,p,manual) THEN RAISE EXCEPTION 'CALENDAR_NONWORKING_DAY';END IF;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes));
  ELSIF mode IN('CONTINUOUS','WORKDAYS_CONTIGUOUS') THEN
   finish:=begin_at+days_needed*interval '1 day';
   IF NOT dqa_private.calendar_interval_open(p_tenant,begin_at,finish,p,false) THEN RAISE EXCEPTION 'CALENDAR_NONWORKING_DAY';END IF;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes,'scheduled_days',days_needed));
  ELSIF compound AND NOT manual THEN
   -- An unattended discontinuous stage keeps its exact uninterrupted exposure; its slot ends on a date boundary.
   begin_at:=((begin_at AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';attempt:=0;
   LOOP
    finish:=begin_at+days_needed*interval '1 day';EXIT WHEN dqa_private.calendar_interval_open(p_tenant,begin_at,finish,p,false);
    attempt:=attempt+1;IF attempt>366 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;begin_at:=begin_at+interval '1 day';
   END LOOP;
   pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',minutes,'scheduled_days',days_needed));
  ELSE
   finish:=((begin_at AT TIME ZONE 'Asia/Taipei')::date::timestamp) AT TIME ZONE 'Asia/Taipei';used:=0;attempt:=0;
   WHILE used<days_needed LOOP
    attempt:=attempt+1;IF attempt>1000 OR jsonb_array_length(pieces)>5000 THEN RAISE EXCEPTION 'CALENDAR_NO_WINDOW';END IF;work_day:=(finish AT TIME ZONE 'Asia/Taipei')::date;
    IF NOT dqa_private.calendar_open(p_tenant,work_day,CASE WHEN manual THEN false ELSE (p->>'weekends')::boolean END,CASE WHEN manual THEN false ELSE (p->>'holidays')::boolean END) THEN finish:=finish+interval '1 day';CONTINUE;END IF;
    begin_at:=finish;finish:=finish+interval '1 day';used:=used+1;
    pieces:=pieces||jsonb_build_array(seg||jsonb_build_object('start_ms',extract(epoch FROM begin_at)*1000,'end_ms',extract(epoch FROM finish)*1000,'starts_at',begin_at,'ends_at',finish,'nominal_minutes',least(1440,greatest(0,minutes-(used-1)*1440)),'scheduled_days',1));
   END LOOP;
  END IF;
  cursor_at:=finish;next_device:=next_device||jsonb_build_object(coalesce(seg->>'equipment_id','OUTSOURCE'),((((finish-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei');
 END LOOP;
 SELECT min(to_timestamp((x->>'start_ms')::numeric/1000)),max(to_timestamp((x->>'end_ms')::numeric/1000)),max(to_timestamp((x->>'start_ms')::numeric/1000)+(x->>'nominal_minutes')::numeric*interval '1 minute') INTO first_at,nominal_end,nominal_finish FROM jsonb_array_elements(pieces) x;
 IF first_at IS NULL OR nominal_end<=first_at THEN RAISE EXCEPTION 'CALENDAR_DURATION_INVALID';END IF;
 last_at:=((((nominal_end-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';
 -- Buffers remain conservative whole-date reservations; no hidden daily shift windows.
 scope_start:=((first_at-((p_plan->>'preparation_minutes')::int)*interval '1 minute') AT TIME ZONE 'Asia/Taipei')::date::timestamp AT TIME ZONE 'Asia/Taipei';scope_end:=((((last_at+((p_plan->>'cleanup_minutes')::int)*interval '1 minute'-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date+1)::timestamp) AT TIME ZONE 'Asia/Taipei';
 SELECT coalesce(array_agg((x->>'equipment_id')::uuid),'{}') INTO ids FROM jsonb_array_elements(p_plan->'allocations') x;
 IF q.execution_kind='REAL' AND (EXISTS(SELECT 1 FROM dqa_business.schedule_equipment a WHERE a.tenant_id=p_tenant AND a.equipment_id=ANY(ids) AND a.schedule_id IS DISTINCT FROM repair AND a.released_at IS NULL AND a.reserve_from<scope_end AND (scope_start<a.reserve_until OR EXISTS(SELECT 1 FROM dqa_business.schedules paused WHERE paused.id=a.schedule_id AND paused.tenant_id=p_tenant AND paused.status='PAUSED')) AND dqa_private.case_row_active(p_tenant,'schedules',a.schedule_id)) OR EXISTS(SELECT 1 FROM dqa_business.schedules s WHERE s.tenant_id=p_tenant AND s.id IS DISTINCT FROM repair AND s.execution_kind='REAL' AND s.executor_member_id=(p_plan->>'executor_id')::uuid AND s.status IN('PENDING_APPROVAL','BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED') AND coalesce(s.reserve_from,s.starts_at)<scope_end AND (s.status='PAUSED' OR scope_start<coalesce(s.reserve_until,s.ends_at)) AND dqa_private.case_row_active(p_tenant,'schedules',s.id)) OR EXISTS(SELECT 1 FROM dqa_private.schedule_incidents WHERE tenant_id=p_tenant AND kind='EQUIPMENT_FAULT' AND resolved_at IS NULL AND equipment_id=ANY(ids) AND first_day<=((scope_end-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date AND last_day>=(scope_start AT TIME ZONE 'Asia/Taipei')::date)) THEN RAISE EXCEPTION 'PLANNING_RESOURCE_CONFLICT';END IF;
 RETURN p_plan||jsonb_build_object('scheduling_unit','DAY','date_basis','CALENDAR_DAY_V1','segments',pieces,'starts_at',first_at,'execution_ends_at',last_at,'nominal_execution_ends_at',nominal_finish,'ends_at',last_at,'reserve_from',scope_start,'reserve_until',scope_end,'start_ms',extract(epoch FROM first_at)*1000,'end_ms',extract(epoch FROM last_at)*1000,'start_date',(first_at AT TIME ZONE 'Asia/Taipei')::date,'end_date',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date,'scheduling_days',(SELECT count(DISTINCT day) FROM jsonb_array_elements(pieces) z CROSS JOIN LATERAL generate_series((to_timestamp((z->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')::date::timestamp,((to_timestamp((z->>'end_ms')::numeric/1000)-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date::timestamp,interval '1 day') day),'calendar_days',((last_at-interval '1 microsecond') AT TIME ZONE 'Asia/Taipei')::date-(first_at AT TIME ZONE 'Asia/Taipei')::date+1,'calendar_policy',p,'calendar_source','TW_OFFICE_2026_2027','priority_rank',dqa_private.scheduling_priority(q.form_details->>'priority'));
END $$;

DO $patch$ DECLARE r record;d text;BEGIN FOR r IN SELECT * FROM (VALUES
('dqa_private.trial_calendar_policy(uuid,uuid,text)',$a$'substitution',true,'revision',0)) FROM$a$,$b$'substitution',true,'revision',0))||jsonb_build_object('work_start',0,'work_end',1440,'overtime',false,'overtime_end',1440) FROM$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF rule->>'calendar'='weekdays' AND extract(isodow FROM start_date)>5$a$,$b$IF NOT dqa_private.calendar_planning(p_tenant,req.id) AND rule->>'calendar'='weekdays' AND extract(isodow FROM start_date)>5$b$),
('dqa_private.calculate_single_schedule_draft_plan_v48(uuid,jsonb,boolean)',$a$IF hours>day_hours THEN$a$,$b$IF NOT dqa_private.calendar_planning(p_tenant,req.id) AND hours>day_hours THEN$b$)) v(sig,a,b) LOOP d:=pg_get_functiondef(r.sig::regprocedure);IF (length(d)-length(replace(d,r.a,'')))/length(r.a)<>1 THEN RAISE EXCEPTION 'DATE_RULE_BASELINE_CHANGED: %',r.sig;END IF;EXECUTE replace(d,r.a,r.b);END LOOP;END $patch$;
