"""Whole-day scheduling and actual-hour preservation; isolated PostgreSQL rollback fixtures."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)), 'exec'))
def fixture(kind='WATER_INGRESS',hours=1,quantity=2,capacity=2):
 title={'WATER_INGRESS':'防水試驗機','HIGH_HUMIDITY':'恆溫恆濕機','THERMAL_SHOCK':'冷熱衝擊機','INSPECTION':'數位顯微鏡'}[kind]
 setup=base_fixture()+f"UPDATE dqa_business.trial_definitions SET profile_code='{kind}' WHERE id='a3000000-0000-0000-0000-000000000001';UPDATE dqa_business.requests SET specification='試驗時間：{hours} 小時。',quantity={quantity} WHERE id='{REQ}';"
 for actor,action,revision in [(2,'SUBMIT',2),(1,'MANAGER_APPROVE',3),(3,'LMS_APPROVE',4),(4,'LMS_APPROVE',5)]:setup+=run_action(actor,command(action,revision),revision)
 setup+='RESET ROLE;'+f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(5)}','synthetic-executor@example.invalid',clock_timestamp());INSERT INTO dqa_business.roles(id,tenant_id,code,name,permissions,systems,pages) VALUES('a1000000-0000-0000-0000-000000000005','{T}','SYNTHETIC-LAB','合成執行人',ARRAY['lab.execute'],ARRAY['lab'],ARRAY['dashboard','requests']);INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('{EX}','{T}','{uid(5)}','SYNTHETIC-LAB','合成執行人','a1000000-0000-0000-0000-000000000005','synthetic-executor@example.invalid');UPDATE dqa_private.human_workflow_policy SET enabled=true WHERE tenant_id='{T}';"
 for eid in [EQ,EQ2]:setup+=f"INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,space_units,daily_hours) VALUES('{eid}','{T}','{eid}','{title} 合成','合成',{capacity},24);"
 return setup

def day_command(units=1,ids=None,**changes):
 c=plan();c['data'].update(start_date=str(START),end_date=str(START),sample_space_units=units,equipment_ids=ids or [EQ],equipment_revisions={x:1 for x in (ids or [EQ])});c['data'].update(changes);return c

def preview(c=None):return f"dqa_business.preview_schedule_draft('{T}',{literal(c or day_command())})"
def save_day(c=None):
 c=c or day_command();return 'RESET ROLE;'+auth(1)+f"SELECT set_config('test.day.command',jsonb_set({literal(c)},'{{data,end_date}}',{preview(c)}->'end_date')::text,true);SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',current_setting('test.day.command')::jsonb);SELECT dqa_business.execute_schedule_draft('{T}','{OP}',current_setting('test.day.command')::jsonb);"
def execute(sql,**options):return subprocess.run(cmd,input='BEGIN;'+fixture(**options)+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected,**options):
  r=execute(sql,**options);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code,**options):
  r=execute(sql,**options);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1900:])
 def inspect(self,expr,c=None):return 'RESET ROLE;'+auth(1)+f"WITH x AS(SELECT {preview(c)} p) SELECT {expr} FROM x"
 def test_one_hour_occupies_whole_day_but_keeps_one_hour_source(self):
  self.ok(self.inspect("p->>'scheduling_unit',p->>'scheduling_days',p->>'hours_per_batch',((p->>'ends_at')::timestamptz-(p->>'starts_at')::timestamptz)=interval '1 day',((p->>'execution_ends_at')::timestamptz-(p->>'starts_at')::timestamptz)=interval '1 hour'"),'DAY|1|1|t|t')
 def test_parallel_samples_in_one_batch_use_one_day(self):self.ok(self.inspect("jsonb_array_length(p->'segments'),p->'segments'->0->>'quantity',p->>'end_date'"),'1|2|'+str(START))
 def test_two_one_hour_batches_skip_weekend(self):self.ok(self.inspect("p->>'scheduling_days',p->>'calendar_days',p->>'end_date',jsonb_array_length(p->'segments')",day_command(2)),'2|4|'+str(START+timedelta(days=3))+'|2')
 def test_three_short_batches_need_three_operating_days(self):self.ok(self.inspect("p->>'scheduling_days',p->>'end_date'"),'3|'+str(START+timedelta(days=4)),quantity=3,capacity=1)
 def test_two_parallel_machines_still_need_only_one_day(self):self.ok(self.inspect("p->>'scheduling_days',jsonb_array_length(p->'allocations'),p->>'end_date'",day_command(ids=[EQ,EQ2])),'1|2|'+str(START),capacity=1)
 def test_quarter_hour_rounds_up_without_changing_hours(self):self.ok(self.inspect("p->>'scheduling_days',p->>'hours_per_batch'"),'1|0.25',kind='INSPECTION',hours=.25)
 def test_25_continuous_hours_use_two_days(self):self.ok(self.inspect("p->>'scheduling_days',p->>'hours_per_batch',((p->>'ends_at')::timestamptz-(p->>'starts_at')::timestamptz)=interval '2 days'"),'2|25|t',kind='THERMAL_SHOCK',hours=25)
 def test_250_fixed_hours_use11_days_without_rewriting_test_hours(self):self.ok(self.inspect("p->>'scheduling_days',p->>'hours_per_batch',((p->>'execution_ends_at')::timestamptz-(p->>'starts_at')::timestamptz)=interval '250 hours',((p->>'ends_at')::timestamptz-(p->>'starts_at')::timestamptz)=interval '264 hours'"),'11|250|t|t',kind='HIGH_HUMIDITY',hours=250)
 def test_nominal_hour_end_cannot_release_a_full_day_conflict(self):
  occupied=f"RESET ROLE;INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) SELECT '{T}',id,'{EQ}','{START}T13:00:00+08:00','{START}T14:00:00+08:00',1,1 FROM dqa_business.schedules WHERE tenant_id='{T}' ORDER BY id LIMIT 1;"
  self.deny(occupied+'RESET ROLE;'+auth(1)+f"SELECT {preview()}",'PLANNING_RESOURCE_CONFLICT')
 def test_cleanup_within_rounded_day_needs_no_extra_day(self):self.ok(self.inspect("p->>'scheduling_days',((p->>'reserve_until')::timestamptz-(p->>'starts_at')::timestamptz)=interval '1 day'",day_command(cleanup_minutes=30)),'1|t')
 def test_buffers_and_day_rounding_persist_in_booking(self):
  self.ok(save_day(day_command(preparation_minutes=30,cleanup_minutes=30))+booked()+f"RESET ROLE;SELECT s.reserve_from=(s.plan->>'reserve_from')::timestamptz,s.reserve_until=(s.plan->>'reserve_until')::timestamptz,a.reserve_from=s.reserve_from,a.reserve_until=s.reserve_until,extract(hour FROM s.reserve_until AT TIME ZONE 'Asia/Taipei')=0,s.plan->>'hours_per_batch' FROM dqa_business.schedules s JOIN dqa_business.schedule_equipment a ON a.schedule_id=s.id AND a.tenant_id=s.tenant_id WHERE s.request_id='{REQ}'",'t|t|t|t|t|1')
 def test_exactly24_hours_do_not_gain_an_extra_day(self):self.ok(self.inspect("p->>'scheduling_days',p->>'end_date'"),'1|'+str(START),kind='THERMAL_SHOCK',hours=24)
 def test_e2_candidates_use_day_unit_and_strict_round_trip(self):
  opts={'sample_space_units':2,'earliest':str(START),'latest':str(START)}
  self.ok('RESET ROLE;'+auth(1)+f"WITH x AS(SELECT dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal(opts)}) p) SELECT count(*)>0,bool_and(c->'plan'->>'scheduling_unit'='DAY'),bool_and(dqa_business.validate_business_ai_schedule('{T}',c->'command')->>'end_date'=c->'plan'->>'end_date') FROM x,LATERAL jsonb_array_elements(p->'candidates') c",'t|t|t')
 def test_short_date_cannot_bypass_whole_day_batch_rules(self):self.deny('RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',{literal(day_command(2))})",'PLANNING_END_DATE_MISMATCH')
 def test_read_only_role_cannot_preview_or_book(self):self.deny('RESET ROLE;'+auth(3)+f"SELECT {preview()}",'PLANNING_ACCESS_DENIED')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
