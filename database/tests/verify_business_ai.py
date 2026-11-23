"""Rollback-only authenticated AI journal and existing scheduling-rule checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_schedule_drafts.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)), 'exec'))
SID='af000000-0000-4000-8000-000000000001'
AIOP='af100000-0000-4000-8000-000000000001'
BASE_FIXTURE=fixture
# Existing browser sessions bind the real auth identity, never a browser-supplied role.
def fixture(kind='HIGH_HUMIDITY'):
 return BASE_FIXTURE(kind)+f"RESET ROLE;INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES('{SID}','{uid(1)}','{T}',repeat('a',64),clock_timestamp()+interval '1 hour');"
def prepare(engine='E4',system='lms',input=None,operation=AIOP):
 return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_business_ai('{T}','{operation}','{engine}','{system}',{literal(input or {'question':'合成實驗室查詢'})},'{SID}');"
def claim():
 return f"RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.claim_business_ai('{T}','{AIOP}','{uid(1)}',repeat('a',64),'[\"{REQ}\"]','{{}}');"
def finish(state='SUCCEEDED',result=None):
 if result is None:result={'execution_mode':'LIVE_PROVIDER','provider':'openai_responses','real_ai':True,'result':{'summary':'合成傳輸測試，非實際模型證據。'}}
 return f"RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.finish_business_ai('{T}','{AIOP}','{uid(1)}','{state}',{literal(result)},NULL);"
def lookup():return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.business_ai_result('{T}','{AIOP}')->>'state';"
class Tests(unittest.TestCase):
 def ok(self,sql,expected,kind='HIGH_HUMIDITY'):
  r=execute(sql,kind);self.assertEqual(r.returncode,0,r.stderr[-2000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2000:])
 def test_prepare_claim_finish_own_result(self):self.ok(prepare()+claim()+finish()+lookup(),'SUCCEEDED')
 def test_duplicate_claim_is_false(self):self.ok(prepare()+claim()+claim(),'f')
 def test_completed_prepare_never_dispatches_again(self):self.ok(prepare()+claim()+finish()+prepare()+f"SELECT dqa_business.prepare_business_ai('{T}','{AIOP}','E4','lms','{{\"question\":\"合成實驗室查詢\"}}','{SID}')->>'dispatch'",'false')
 def test_browser_cannot_claim_or_settle(self):self.deny(prepare()+f"SELECT dqa_business.claim_business_ai('{T}','{AIOP}','{uid(1)}',repeat('a',64),'[]','{{}}')",'permission denied')
 def test_wrong_actor_lookup_is_not_found(self):self.ok(prepare()+'RESET ROLE;'+auth(3)+f"SELECT dqa_business.business_ai_result('{T}','{AIOP}')->>'state'",'NOT_FOUND')
 def test_cross_tenant_lookup_is_not_found(self):self.ok(prepare()+f"SELECT dqa_business.business_ai_result('b0000000-0000-0000-0000-000000000001','{AIOP}')->>'state'",'NOT_FOUND')
 def test_revoked_session_cannot_dispatch(self):self.ok(prepare()+f"RESET ROLE;UPDATE dqa_private.browser_sessions SET revoked_at=clock_timestamp() WHERE id='{SID}';"+claim(),'f')
 def test_changed_member_cannot_dispatch(self):self.ok(prepare()+f"RESET ROLE;UPDATE dqa_business.memberships SET display_name='CHANGED' WHERE id='{MAN}';"+claim(),'f')
 def test_changed_role_cannot_dispatch(self):self.ok(prepare()+f"RESET ROLE;UPDATE dqa_business.roles SET name=name||' changed' WHERE id=(SELECT role_id FROM dqa_business.memberships WHERE id='{MAN}');"+claim(),'f')
 def test_old_operation_cannot_dispatch(self):self.ok(prepare()+"RESET ROLE;UPDATE dqa_private.business_ai_operations SET created_at=clock_timestamp()-interval '3 minutes';"+claim(),'f')
 def test_input_change_cannot_reuse_id(self):self.deny(prepare()+prepare(input={'question':'另一個問題'}),'AI_OPERATION_CONFLICT')
 def test_mock_provider_cannot_be_marked_live(self):self.deny(prepare()+claim()+finish(result={'real_ai':False,'execution_mode':'MOCK','provider':'mock'}),'AI_PROVIDER_EVIDENCE_REQUIRED')
 def test_unknown_can_only_recover_without_redispatch(self):self.ok(prepare()+claim()+finish('UNKNOWN')+prepare()+finish()+lookup(),'SUCCEEDED')
 def test_clear_removes_conversation_not_audit(self):self.ok(prepare()+claim()+finish()+'RESET ROLE;'+auth(1)+f"SELECT jsonb_array_length(dqa_business.business_ai_conversation('{T}','lms'));SELECT dqa_business.clear_business_ai_conversation('{T}','lms');SELECT jsonb_array_length(dqa_business.business_ai_conversation('{T}','lms')),(dqa_business.business_ai_overview('{T}')->'records'->0->>'state')",'0|SUCCEEDED')
 def test_conversation_own_system_and_identity(self):self.ok(prepare()+claim()+finish()+'RESET ROLE;'+auth(1)+f"SELECT jsonb_array_length(dqa_business.business_ai_conversation('{T}','lms'))",'1')
 def test_unauthenticated_private_journal_denied(self):self.deny('SET LOCAL ROLE anon;SELECT * FROM dqa_private.business_ai_operations','permission denied')
 def test_other_session_not_accepted(self):self.deny(prepare().replace(SID,'af000000-0000-4000-8000-000000000099'),'AI_ACCESS_DENIED')
 def test_burst_is_bounded(self):self.deny(''.join(prepare(operation=f'af100000-0000-4000-8000-{i:012}') for i in range(1,8)),'AI_RATE_LIMITED')
 def test_humidity_candidates_keep250_and_no_business_writes(self):
  self.ok('RESET ROLE;'+auth(1)+f"WITH c AS(SELECT dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal({'earliest':str(START),'latest':str(END+timedelta(days=3))})}) j) SELECT jsonb_array_length(j->'candidates')>0,j->'candidates'->0->'plan'->>'hours_per_batch',(SELECT count(*) FROM dqa_business.schedule_drafts),(SELECT count(*) FROM dqa_business.schedules) FROM c",'t|250|0|2')
 def test_vibration_candidates_three_weekdays(self):
  self.ok('RESET ROLE;'+auth(1)+f"WITH c AS(SELECT dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal({'earliest':str(START),'latest':str(START+timedelta(days=7))})}) j) SELECT jsonb_array_length(j->'candidates'->0->'plan'->'segments'),j->'candidates'->0->'plan'->>'end_date' FROM c",'3|'+str(START+timedelta(days=4)),'VIBRATION_DURABILITY')
 def test_zero_units_has_no_candidates(self):self.ok(f"RESET ROLE;UPDATE dqa_business.equipment SET space_units=1 WHERE id IN('{EQ}','{EQ2}');"+auth(1)+f"SELECT jsonb_array_length(dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal({'earliest':str(START),'latest':str(END)})})->'candidates')",'0')
 def test_unverified_executor_never_selected(self):self.ok(f"RESET ROLE;UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{uid(5)}';"+auth(1)+f"SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.business_ai_schedule_candidates('{T}','{REQ}','{{}}')->'candidates') c WHERE c->'command'->'data'->>'executor_id'='{EX}')",'t')
 def test_candidate_apply_rechecks_equipment_revision(self):
  self.deny('RESET ROLE;'+auth(1)+f"SELECT dqa_business.validate_business_ai_schedule('{T}',{literal(plan())});RESET ROLE;UPDATE dqa_business.equipment SET space_units=19 WHERE id='{EQ}';"+auth(1)+f"SELECT dqa_business.validate_business_ai_schedule('{T}',{literal(plan())});",'REVISION_CONFLICT')
 def test_formal_booking_stays_manual_release_gated(self):self.deny("UPDATE dqa_business.schedules SET status='BOOKED'",'RULE_NOT_APPROVED')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
