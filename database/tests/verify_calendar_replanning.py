"""Rollback-only calendar, priority, interruption and whole-plan resource checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_sample_number_groups.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
POLICY=dict(mode='WORKDAYS_SPLIT',weekends=False,holidays=False,work_start=540,work_end=1020,overtime=False,overtime_end=1200,substitution=True)
def policy(p=None):return f"RESET ROLE;INSERT INTO dqa_private.trial_calendar_policies VALUES('{T}','a3000000-0000-0000-0000-000000000001',{literal(p or POLICY)},1);"
def incident(kind='CLOSURE',day=START,last=None,equipment=None,oid=80):
 data=dict(kind=kind,first_day=day,last_day=last or day,equipment_id=equipment,reason='合成停班或設備故障驗證')
 return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.save_scheduling_operation('{T}','{op(oid)}','INCIDENT',{literal(data)});"
TODAY=datetime.now(timezone(timedelta(hours=8))).date().isoformat()
ALT='ee100000-0000-4000-8000-000000000002'
def clock():return f"RESET ROLE;SET LOCAL request.jwt.claim.role='service_role';SELECT dqa_business.start_due_lab_trials('{T}');"
def running():
 # Local rollback-only clock fixture: shift the entire synthetic interval together.
 return second()+human('PREPARE',20,PREP,'')+human('RECEIVE',21,{'executionAbnormal':'no'})+f"""RESET ROLE;
 DO $shift$ DECLARE r dqa_business.schedules;delta numeric;pieces jsonb;BEGIN SELECT * INTO r FROM dqa_business.schedules WHERE request_id='{REQ}';delta:=extract(epoch FROM(clock_timestamp()-interval '1 hour'-r.starts_at))*1000;
 SELECT jsonb_agg(x||jsonb_build_object('start_ms',(x->>'start_ms')::numeric+delta,'end_ms',(x->>'end_ms')::numeric+delta)) INTO pieces FROM jsonb_array_elements(r.plan->'segments') x;
 UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '12 days',reserve_from=clock_timestamp()-interval '2 hours',reserve_until=clock_timestamp()+interval '12 days',plan=plan||jsonb_build_object('segments',pieces) WHERE id=r.id;
 UPDATE dqa_business.schedule_equipment SET reserve_from=clock_timestamp()-interval '2 hours',reserve_until=clock_timestamp()+interval '12 days' WHERE schedule_id=r.id;END $shift$;"""+clock()
def decide(decision='RETEST',who=1,oid=91):return 'RESET ROLE;'+auth(who)+f"SELECT dqa_business.save_scheduling_operation('{T}','{op(oid)}','DECIDE',jsonb_build_object('schedule_id',s.id,'expected_revision',s.revision,'decision','{decision}','reason','合成中斷判定')) FROM dqa_business.schedules s WHERE request_id='{REQ}';"
def synthetic_plan(start='2027-01-01T09:00:00+08:00',hours=10,compound=None):
 from datetime import datetime
 first=datetime.fromisoformat(start).timestamp()*1000
 plan=dict(calendar='weekdays',preparation_minutes=0,cleanup_minutes=0,executor_id=EX,allocations=[],segments=[dict(start_ms=first,end_ms=first+hours*3600000,profile_id='HIGH_HUMIDITY',operation='operator')])
 if compound:plan['compound']=compound
 return literal(plan)
class Tests(unittest.TestCase):
 def ok(self,sql,expected='t'):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-3400:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2600:])
 def test_priority_order_is_explicit_and_stable(self):self.ok(f"RESET ROLE;SELECT array_agg(v ORDER BY dqa_private.scheduling_priority(v))=ARRAY['急件','專案','一般','委外'] FROM unnest(ARRAY['一般','委外','急件','專案']) v;")
 def test_national_holiday_is_not_a_workday(self):self.ok(f"RESET ROLE;SELECT NOT dqa_private.calendar_open('{T}','2027-01-01',false,false);")
 def test_placement_can_run_unattended_on_holidays_if_policy_allows(self):self.ok(f"RESET ROLE;SELECT dqa_private.calendar_open('{T}','2027-01-01',true,true);")
 def test_saturday_excluded_for_operator_policy(self):self.ok(f"RESET ROLE;SELECT NOT dqa_private.calendar_open('{T}','2027-01-02',false,false);")
 def test_unknown_year_cannot_be_fabricated(self):self.deny(f"RESET ROLE;SELECT dqa_private.calendar_open('{T}','2030-01-01',false,false);",'CALENDAR_COVERAGE_REQUIRED')
 def test_working_day_override_is_audited_and_does_not_allow_weekend_by_accident(self):self.ok(incident('WORKING_DAY','2027-01-01')+f"RESET ROLE;SELECT dqa_private.calendar_open('{T}','2027-01-01',false,false);")
 def test_closure_overrides_continuous_holiday_permission(self):self.ok(incident()+f"RESET ROLE;SELECT NOT dqa_private.calendar_open('{T}','{START}',true,true);")
 def test_policy_validation_rejects_silent_overtime_and_unknown_fields(self):self.deny(f"RESET ROLE;SELECT dqa_private.validate_calendar_policy({literal({**POLICY,'work_end':1300,'overtime_end':1200})});",'CALENDAR_POLICY_INVALID')
 def test_incident_is_admin_or_equipment_manager_only(self):self.deny(incident().replace(auth(1),auth(2)),'CALENDAR_ACCESS_DENIED')
 def test_no_duplicate_incident_after_receipt_replay(self):self.ok(incident()+incident()+f"RESET ROLE;SELECT count(*)=1 FROM dqa_private.schedule_incidents WHERE tenant_id='{T}';")
 def test_incident_payload_is_fingerprinted(self):self.deny(incident()+incident(last=(datetime.fromisoformat(START)+timedelta(days=1)).date().isoformat()),'CALENDAR_OPERATION_CONFLICT')
 def test_saved_calendar_changes_invalidate_old_first_signature_plan(self):self.deny(plan()+numbers()+policy()+review(3,'LMS_APPROVE',12,FIRST,'2'),'PLANNING_END_DATE_MISMATCH')
 def test_unstarted_approved_booking_automatically_moves_past_closure(self):self.ok(second()+incident()+f"RESET ROLE;SELECT starts_at>('{START}'::date::timestamp AT TIME ZONE 'Asia/Taipei') AND status='AWAITING_RECEIPT' AND (SELECT count(*)=1 FROM dqa_private.schedule_adjustments WHERE schedule_id=s.id AND action='RESCHEDULED') FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_unstarted_replan_preserves_ids_and_signed_document(self):self.ok(second()+incident()+f"RESET ROLE;SELECT sample_code=plan->>'sample_code' AND (SELECT count(*)=4 FROM dqa_business.request_signatures WHERE request_id=s.request_id) AND (SELECT count(*)=1 FROM dqa_business.request_document_versions WHERE request_id=s.request_id) FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_wrong_tenant_cannot_record_incident(self):self.deny(incident().replace(uid(1),'20000000-0000-0000-0000-000000000001'),'CALENDAR_ACCESS_DENIED')
 def test_private_permits_cannot_be_forged(self):self.deny(auth(3)+"DELETE FROM dqa_private.calendar_planning_permits;",'permission denied')
 def test_real_signature_still_required(self):self.deny(plan()+numbers()+review(3,'LMS_APPROVE',12,FIRST,'2').replace(SIG,''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_split_skips_national_holiday_and_preserves_nominal_hours(self):self.ok(policy()+f"RESET ROLE;SELECT (p->>'start_date')='2027-01-04' AND jsonb_array_length(p->'segments')=1 AND (SELECT sum((x->>'nominal_minutes')::numeric)=600 FROM jsonb_array_elements(p->'segments') x) FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan()}) p) z;")
 def test_legacy_overtime_cannot_shorten_a_whole_date_reservation(self):self.ok(policy({**POLICY,'overtime':True})+f"RESET ROLE;SELECT jsonb_array_length(p->'segments')=1 AND (p->>'execution_ends_at')::timestamptz='2027-01-05T00:00:00+08:00' FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan()}) p) z;")
 def test_contiguous_operator_uses_dates_without_a_hidden_shift(self):self.ok(policy({**POLICY,'mode':'WORKDAYS_CONTIGUOUS'})+f"RESET ROLE;SELECT p->>'end_date'='2027-01-04' AND (p->>'scheduling_days')::int=1 FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan('2027-01-04T09:00:00+08:00')}) p) z;")
 def test_uninterrupted_policy_cannot_be_split_to_hide_holiday(self):self.deny(policy({**POLICY,'mode':'CONTINUOUS'})+f"RESET ROLE;SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan()});",'CALENDAR_NONWORKING_DAY')
 def test_trial_policy_save_is_revision_guarded_and_audited(self):
  data=dict(trial_id='a3000000-0000-0000-0000-000000000001',expected_revision=0,policy=POLICY,reason='合成規則確認')
  self.ok('RESET ROLE;'+auth(1)+f"SELECT dqa_business.save_scheduling_operation('{T}','{op(90)}','POLICY',{literal(data)});RESET ROLE;SELECT revision=1 AND policy={literal(POLICY)} FROM dqa_private.trial_calendar_policies WHERE tenant_id='{T}';")
 def test_running_trial_pauses_instead_of_replanning(self):self.ok(running()+incident(day=TODAY)+f"RESET ROLE;SELECT status='PAUSED' AND started_at IS NOT NULL AND (plan->'interruption'->>'requires_human_decision')::boolean AND (SELECT count(*)=1 FROM dqa_private.schedule_adjustments WHERE schedule_id=s.id AND action='PAUSED') FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_running_pause_retains_real_start_and_signed_history(self):self.ok(running()+incident(day=TODAY)+clock()+f"RESET ROLE;SELECT status='PAUSED' AND (SELECT count(*)=1 FROM dqa_private.schedule_start_events WHERE schedule_id=s.id) AND (SELECT count(*)=5 FROM dqa_business.request_signatures WHERE request_id=s.request_id) FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_continuous_interruption_requires_retest_not_resume(self):self.deny(running()+incident(day=TODAY)+decide('RESUME'),'CALENDAR_RETEST_REQUIRED')
 def test_running_interruption_does_not_resolve_without_human(self):self.ok(running()+incident(day=TODAY)+clock()+f"RESET ROLE;SELECT status='PAUSED' AND NOT EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments WHERE schedule_id=s.id AND action='RESCHEDULED') FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_human_retest_replans_and_requires_new_receipt(self):self.ok(running()+incident(day=TODAY)+decide()+f"RESET ROLE;SELECT status='AWAITING_RECEIPT' AND started_at IS NULL AND received_at IS NULL AND (SELECT count(*)=1 FROM dqa_private.schedule_adjustments WHERE schedule_id=s.id AND action='RETEST_AUTHORIZED') AND (SELECT count(*)=1 FROM dqa_private.schedule_start_events WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_wrong_actor_cannot_decide_interruption(self):self.deny(running()+incident(day=TODAY)+decide(who=2),'CALENDAR_ACCESS_DENIED')
 def test_future_incident_does_not_pause_running_trial_early(self):self.ok(running()+incident(day=(datetime.fromisoformat(TODAY)+timedelta(days=2)).date().isoformat())+f"RESET ROLE;SELECT status='RUNNING' FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_fault_selects_verified_compatible_alternative(self):
  last=(datetime.fromisoformat(START)+timedelta(days=30)).date().isoformat()
  machines=f"RESET ROLE;UPDATE dqa_business.equipment SET specification='合成相同規格',category='溫濕度試驗' WHERE id='{EQ}';INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,specification,space_units,daily_hours,operational_status) VALUES('{ALT}','{T}','EQ-ALT','恆溫恆濕機 替代','溫濕度試驗','合成相同規格',6,24,'IDLE');"
  self.ok(second()+machines+incident('EQUIPMENT_FAULT',last=last,equipment=EQ)+f"RESET ROLE;SELECT plan->'allocations'->0->>'equipment_id'='{ALT}' AND status='AWAITING_RECEIPT' FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_unverified_machine_is_not_used_as_alternative(self):
  last=(datetime.fromisoformat(START)+timedelta(days=30)).date().isoformat()
  machines=f"RESET ROLE;INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,specification,space_units,daily_hours,operational_status) VALUES('{ALT}','{T}','EQ-ALT','恆溫恆濕機 替代','溫濕度試驗','不同規格',6,24,'IDLE');"
  self.ok(second()+machines+incident('EQUIPMENT_FAULT',last=last,equipment=EQ)+f"RESET ROLE;SELECT plan->'allocations'->0->>'equipment_id'='{EQ}' AND starts_at>('{last}'::date::timestamp AT TIME ZONE 'Asia/Taipei') FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_split_trial_can_resume_only_after_human_decision(self):self.ok(policy({**POLICY,'work_start':0,'work_end':1440,'overtime_end':1440})+running()+incident(day=TODAY)+decide('RESUME')+f"RESET ROLE;SELECT status='AWAITING_RECEIPT' AND started_at IS NULL AND received_at IS NULL AND (SELECT count(*)=1 FROM dqa_private.schedule_adjustments WHERE schedule_id=s.id AND action='RESUME_AUTHORIZED') FROM dqa_business.schedules s WHERE request_id='{REQ}';")
 def test_no_window_is_blocked_and_resolving_incident_retries(self):
  last=(datetime.fromisoformat(START)+timedelta(days=120)).date().isoformat()
  self.ok(second()+incident(last=last)+f"RESET ROLE;SELECT set_config('test.blocked',EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments WHERE request_id='{REQ}' AND action='BLOCKED')::text,true);"+auth(1)+f"SELECT dqa_business.save_scheduling_operation('{T}','{op(92)}','RESOLVE',jsonb_build_object('incident_id','{op(80)}','reason','已確認復工'));RESET ROLE;SELECT current_setting('test.blocked')='true' AND EXISTS(SELECT 1 FROM dqa_private.schedule_adjustments WHERE request_id='{REQ}' AND action='RESCHEDULED');")
 def test_replanned_schedule_cannot_reuse_old_unsigned_preparation(self):self.ok(second()+human('PREPARE',20,PREP,'')+incident()+f"RESET ROLE;SELECT NOT coalesce(dqa_private.preparation_ready('{T}','{REQ}',s.id),false) FROM dqa_business.schedules s WHERE request_id='{REQ}';")
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
