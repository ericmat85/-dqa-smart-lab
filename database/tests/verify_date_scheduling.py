"""Rollback-only whole-date reservations, nominal effort and legacy policy compatibility."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_calendar_replanning.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
base_synthetic_plan=synthetic_plan
def synthetic_plan(*args,**kw):return '('+base_synthetic_plan(*args,**kw)+"||jsonb_build_object('calendar','continuous'))"
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2600:])
 def test_250_hours_reserves_eleven_full_dates_through_first_signature(self):
  self.ok(first()+f"RESET ROLE;SELECT plan->>'scheduling_unit'='DAY' AND (plan->>'hours_per_batch')::numeric=250 AND (plan->>'scheduling_days')::int=11 AND ends_at-starts_at=interval '11 days' AND (plan->>'end_date')::date=(plan->>'start_date')::date+10 AND (plan->>'execution_ends_at')::timestamptz=ends_at AND reserve_until=ends_at AND (SELECT sum((x->>'nominal_minutes')::numeric)=15000 FROM jsonb_array_elements(plan->'segments') x) FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_24_and_240_hours_have_no_extra_date(self):
  for hours,days in [(24,1),(240,10),(264,11)]:
   with self.subTest(hours=hours):self.ok(f"RESET ROLE;SELECT (p->>'scheduling_days')::int={days} AND (p->>'ends_at')::timestamptz-(p->>'starts_at')::timestamptz=interval '{days} days' FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan(hours=hours)}) p) z;")
 def test_partial_day_rounds_up_without_changing_nominal_minutes(self):
  for hours in [.25,.5,1,25,250]:
   with self.subTest(hours=hours):self.ok(f"RESET ROLE;SELECT (p->>'scheduling_days')::int={__import__('math').ceil(hours/24)} AND (SELECT sum((s->>'nominal_minutes')::numeric)={hours*60} FROM jsonb_array_elements(p->'segments') s) FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan(hours=hours)}) p) z;")
 def test_legacy_9_to_5_policy_cannot_create_hidden_work_hour_limits(self):
  self.ok(policy()+f"RESET ROLE;SELECT p->>'work_start'='0' AND p->>'work_end'='1440' AND p->>'overtime'='false' AND p->>'overtime_end'='1440' AND (SELECT policy={literal(POLICY)} FROM dqa_private.trial_calendar_policies WHERE tenant_id='{T}') FROM (SELECT dqa_private.trial_calendar_policy('{T}','a3000000-0000-0000-0000-000000000001','weekdays') p) z;")
 def test_250_hours_split_uses_eleven_workdays_skipping_holiday_and_weekends(self):
  self.ok(policy()+f"RESET ROLE;SELECT p->>'start_date'='2027-01-04' AND p->>'end_date'='2027-01-18' AND p->>'scheduling_days'='11' AND p->>'calendar_days'='15' AND jsonb_array_length(p->'segments')=11 AND (SELECT sum((x->>'nominal_minutes')::numeric)=15000 AND bool_and(extract(isodow FROM to_timestamp((x->>'start_ms')::numeric/1000) AT TIME ZONE 'Asia/Taipei')<6) FROM jsonb_array_elements(p->'segments') x) FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan(hours=250)}) p) z;")
 def test_contiguous_workdays_cannot_hide_a_weekend(self):
  self.deny(policy({**POLICY,'mode':'WORKDAYS_CONTIGUOUS'})+f"RESET ROLE;SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan('2027-01-04T09:00:00+08:00',250)});",'CALENDAR_NONWORKING_DAY')
 def test_legacy_clock_component_normalizes_to_midnight(self):
  self.ok(f"RESET ROLE;SELECT to_char((p->>'starts_at')::timestamptz AT TIME ZONE 'Asia/Taipei','HH24:MI')='00:00' AND to_char((p->>'ends_at')::timestamptz AT TIME ZONE 'Asia/Taipei','HH24:MI')='00:00' FROM (SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan('2027-01-04T22:59:00+08:00',250)}) p) z;")
 def test_reservation_on_padded_eleventh_date_is_a_conflict(self):
  p=synthetic_plan(START+'T00:00:00+08:00',250)
  sql=first()+f"RESET ROLE;UPDATE dqa_business.schedule_equipment SET reserve_from=('{START}'::date+10)::timestamp AT TIME ZONE 'Asia/Taipei',reserve_until=('{START}'::date+11)::timestamp AT TIME ZONE 'Asia/Taipei';UPDATE dqa_business.schedules SET executor_member_id=NULL WHERE request_id='{REQ}';SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{p}||jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('equipment_id','{EQ}'))));"
  self.deny(sql,'PLANNING_RESOURCE_CONFLICT')
 def test_preview_never_reserves_resources_and_nominal_finish_is_distinct(self):
  self.ok(plan()+f"RESET ROLE;SELECT (plan->>'nominal_execution_ends_at')::timestamptz=(plan->>'starts_at')::timestamptz+interval '250 hours' AND (plan->>'ends_at')::timestamptz>(plan->>'nominal_execution_ends_at')::timestamptz AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id='{T}' AND equipment_id='{EQ}') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';")
 def test_closure_on_final_scheduled_date_is_still_checked(self):
  self.deny(incident(day='2027-01-14')+f"RESET ROLE;SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan('2027-01-04T00:00:00+08:00',250)});",'CALENDAR_NONWORKING_DAY')
 def test_invalid_zero_duration_is_rejected(self):self.deny(f"RESET ROLE;SELECT dqa_private.apply_schedule_calendar('{T}','{REQ}',{synthetic_plan(hours=0)});",'CALENDAR_DURATION_INVALID')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
