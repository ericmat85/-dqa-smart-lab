"""Rollback-only shared scheduling draft verification. Formal booking remains gated."""
from pathlib import Path
# Reuse the existing synthetic owner/manager/two-level review setup, without executing its suite.
exec(compile((Path(__file__).with_name('verify_request_workflow.py')).read_text().split('class Tests',1)[0],str(Path(__file__)), 'exec'))
base_fixture=fixture
EQ='ef100000-0000-4000-8000-000000000001';EQ2='ef100000-0000-4000-8000-000000000002';EX='a2000000-0000-0000-0000-000000000005';OP='ef200000-0000-4000-8000-000000000001'
from datetime import datetime,timedelta,timezone
now=datetime.now(timezone(timedelta(hours=8))).date();START=now+timedelta(days=7)
while START.weekday()!=4:START+=timedelta(days=1)
END=START+timedelta(days=10)
def fixture(kind='HIGH_HUMIDITY'):
 spec='試驗時間：250 小時。' if kind=='HIGH_HUMIDITY' else '試驗時間：20 小時。';title='恆溫恆濕機 合成' if kind=='HIGH_HUMIDITY' else '振動耐久機 合成'
 setup=base_fixture()+f"UPDATE dqa_business.trial_definitions SET profile_code='{kind}' WHERE id='a3000000-0000-0000-0000-000000000001';UPDATE dqa_business.requests SET specification='{spec}' WHERE id='{REQ}';"
 # The update above increments the draft revision, so all four review commands must capture it.
 for actor,action,revision in [(2,'SUBMIT',2),(1,'MANAGER_APPROVE',3),(3,'LMS_APPROVE',4),(4,'LMS_APPROVE',5)]:setup+=run_action(actor,command(action,revision),revision)
 setup+='RESET ROLE;'+f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(5)}','synthetic-executor@example.invalid',clock_timestamp());INSERT INTO dqa_business.roles(id,tenant_id,code,name,permissions,systems,pages) VALUES('a1000000-0000-0000-0000-000000000005','{T}','SYNTHETIC-LAB','合成執行人','{{}}',ARRAY['lab'],ARRAY['dashboard','requests']);INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('{EX}','{T}','{uid(5)}','SYNTHETIC-LAB','合成執行人','a1000000-0000-0000-0000-000000000005','synthetic-executor@example.invalid');"
 for eid in [EQ,EQ2]:setup+=f"INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,space_units,daily_hours) VALUES('{eid}','{T}','{eid}','{title}','合成',20,24);"
 return setup

def plan(kind='HIGH_HUMIDITY',**kw):
 end=END if kind=='HIGH_HUMIDITY' else START+timedelta(days=4)
 c=dict(request_id=REQ,expected_request_revision=6,expected_draft_revision=0,data=dict(equipment_ids=[EQ],equipment_revisions={EQ:1},executor_id=EX,executor_revision=1,start_date=str(START),end_date=str(end),sample_code='SYNTHETIC-SAMPLE',note='合成排程草稿',preparation_minutes=0,cleanup_minutes=0));c.update(kw);return c

def run_plan(c=None,operation=OP):
 q=literal(c or plan());return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{operation}',{q});SELECT dqa_business.execute_schedule_draft('{T}','{operation}',{q});"
def execute(sql,kind='HIGH_HUMIDITY'):
 return subprocess.run(cmd,input='BEGIN;'+fixture(kind)+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected,kind='HIGH_HUMIDITY'):
  r=execute(sql,kind);self.assertEqual(r.returncode,0,r.stderr[-1600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,c,code,kind='HIGH_HUMIDITY',prefix=''):
  r=execute(prefix+run_plan(c),kind);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1700:])
 def test_humidity_250h_crosses_weekend_without_booking(self):self.ok(run_plan()+f"RESET ROLE;SELECT plan->>'scope',plan->>'reserved',plan->>'hours_per_batch',(SELECT count(*) FROM dqa_business.schedules),(SELECT status FROM dqa_business.requests WHERE id='{REQ}') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'DRAFT_ONLY|false|250|2|AWAITING_SCHEDULING')
 def test_vibration_three_samples_need_three_weekdays(self):self.ok(run_plan(plan('VIBRATION_DURABILITY'))+f"SELECT jsonb_array_length(plan->'segments'),plan->>'end_date' FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'3|'+str(START+timedelta(days=4)),'VIBRATION_DURABILITY')
 def test_read_only_actor_denied(self):
  q=literal(plan());r=execute('RESET ROLE;'+auth(3)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',{q})");self.assertIn('PLANNING_ACCESS_DENIED',r.stderr)
 def test_request_revision_is_captured(self):self.deny(plan(expected_request_revision=5),'REVISION_CONFLICT')
 def test_missing_units_not_invented(self):self.deny(plan(expected_request_revision=7),'PLANNING_SOURCE_INCOMPLETE',prefix=f"UPDATE dqa_business.requests SET sample_space_units=NULL WHERE id='{REQ}';".replace('NULL','NULL')+ 'SELECT 1;')
 def test_unknown_fields_rejected(self):self.deny({**plan(),'status':'BOOKED'},'PLANNING_FIELDS_INVALID')
 def test_equipment_type_checked(self):self.deny(plan(),'PLANNING_EQUIPMENT_REQUIRED',prefix=f"UPDATE dqa_business.equipment SET name='振動機' WHERE id='{EQ}';")
 def test_disabled_equipment_checked(self):self.deny(plan(),'PLANNING_EQUIPMENT_REQUIRED',prefix=f"UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQ}';")
 def test_stale_equipment_rejected(self):self.deny(plan(),'REVISION_CONFLICT',prefix=f"UPDATE dqa_business.equipment SET name=name||' changed' WHERE id='{EQ}';")
 def test_capacity_checked(self):
  c=plan();c['data']['equipment_revisions'][EQ]=2;self.deny(c,'PLANNING_SPACE_INSUFFICIENT',prefix=f"UPDATE dqa_business.equipment SET space_units=1 WHERE id='{EQ}';")
 def test_duplicate_devices_rejected(self):
  c=plan();c['data']['equipment_ids']=[EQ,EQ];self.deny(c,'PLANNING_FIELDS_INVALID')
 def test_missing_executor_rejected(self):
  c=plan();c['data']['executor_id']='ef999999-0000-4000-8000-000000000001';self.deny(c,'PLANNING_EXECUTOR_REQUIRED')
 def test_unconfirmed_executor_rejected(self):self.deny(plan(),'PLANNING_EXECUTOR_REQUIRED',prefix=f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{uid(5)}';")
 def test_disabled_executor_rejected(self):self.deny(plan(),'PLANNING_EXECUTOR_REQUIRED',prefix=f"UPDATE dqa_business.memberships SET enabled=false WHERE id='{EX}';")
 def test_bad_end_date_rejected(self):
  c=plan();c['data']['end_date']=str(END+timedelta(days=1));self.deny(c,'PLANNING_END_DATE_MISMATCH')
 def test_vibration_cannot_start_weekend(self):
  c=plan('VIBRATION_DURABILITY');c['data']['start_date']=str(START+timedelta(days=1));self.deny(c,'PLANNING_WEEKDAY_REQUIRED','VIBRATION_DURABILITY')
 def test_duplicate_execution_is_idempotent(self):self.ok(run_plan()+f"SELECT dqa_business.execute_schedule_draft('{T}','{OP}',{literal(plan())});SELECT count(*),max(revision) FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'1|1')
 def test_stale_draft_cannot_overwrite(self):
  r=execute(run_plan()+run_plan(plan(),OP.replace('001','002')));self.assertIn('REVISION_CONFLICT',r.stderr)
 def test_edit_increments_revision(self):self.ok(run_plan()+run_plan(plan(expected_draft_revision=1),OP.replace('001','002'))+f"SELECT revision FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",'2')
 def test_command_swap_rejected(self):
  c=plan();q=literal(c);c['data']['note']='changed';r=execute('RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',{q});SELECT dqa_business.execute_schedule_draft('{T}','{OP}',{literal(c)});");self.assertIn('PLANNING_OPERATION_CONFLICT',r.stderr)
 def test_expired_operation_never_executes(self):
  q=literal(plan());r=execute('RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',{q});RESET ROLE;UPDATE dqa_private.schedule_draft_operations SET expires_at=clock_timestamp()-interval '1 second';"+auth(1)+f"SELECT dqa_business.schedule_draft_result('{T}','{OP}');SELECT dqa_business.execute_schedule_draft('{T}','{OP}',{q})");self.assertIn('PLANNING_OPERATION_EXPIRED',r.stderr)
 def test_snapshot_no_email_or_auth_id(self):self.ok(run_plan()+f"SELECT (dqa_business.schedule_draft_snapshot('{T}')->'schedule_executors'->0) ? 'login_email',(dqa_business.schedule_draft_snapshot('{T}')->'schedule_executors'->0) ? 'auth_user_id'",'f|f')
 def test_formal_booking_gate_unchanged(self):
  r=execute(run_plan()+"RESET ROLE;UPDATE dqa_business.schedules SET status='BOOKED'");self.assertIn('RULE_NOT_APPROVED',r.stderr)
 def test_direct_draft_write_denied(self):
  r=execute(run_plan()+"UPDATE dqa_business.schedule_drafts SET plan='{}'");self.assertIn('permission denied',r.stderr)
 def test_cross_tenant_rls(self):self.ok(run_plan()+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SELECT count(*) FROM dqa_business.schedule_drafts",'0')
 def test_equipment_occupied_is_rejected(self):
  sql=f"INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) SELECT '{T}',id,'{EQ}','{START}T00:00:00+08:00','{END}T23:00:00+08:00',1,1 FROM dqa_business.schedules WHERE tenant_id='{T}' ORDER BY id LIMIT 1;"
  self.deny(plan(),'PLANNING_RESOURCE_CONFLICT',prefix=sql)
 def test_resource_change_between_prepare_execute_rejected(self):
  q=literal(plan());r=execute('RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',{q});RESET ROLE;UPDATE dqa_business.equipment SET space_units=19 WHERE id='{EQ}';"+auth(1)+f"SELECT dqa_business.execute_schedule_draft('{T}','{OP}',{q});");self.assertIn('REVISION_CONFLICT',r.stderr)
 def test_wrong_actor_cannot_get_result(self):self.ok(run_plan()+'RESET ROLE;'+auth(3)+f"SELECT dqa_business.schedule_draft_result('{T}','{OP}')->>'state'",'NOT_FOUND')
 def test_weekday_preparation_cannot_cross_weekend(self):
  c=plan('VIBRATION_DURABILITY');c['data']['start_date']=str(START+timedelta(days=3));c['data']['end_date']=str(START+timedelta(days=5));c['data']['preparation_minutes']=60;self.deny(c,'PLANNING_WEEKDAY_REQUIRED','VIBRATION_DURABILITY')
 def test_missing_and_conflicting_hours_are_rejected(self):
  c=plan('VIBRATION_DURABILITY',expected_request_revision=7);self.deny(c,'PLANNING_DURATION_REQUIRED','VIBRATION_DURABILITY',prefix=f"UPDATE dqa_business.requests SET specification='試驗時間：20 小時與 30 小時' WHERE id='{REQ}';")
 def test_snapshot_does_not_send_all_execution_segments(self):self.ok(run_plan()+f"SELECT (dqa_business.schedule_draft_snapshot('{T}')->'schedule_drafts'->0->'plan') ? 'segments'",'f')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
