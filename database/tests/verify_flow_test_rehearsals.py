"""Database-backed flow test copies. Synthetic fixtures, no network, rollback only."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().rsplit('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
RUN='ab100000-0000-4000-8000-000000000001'
def test_command(action='CREATE',revision=0,**changes):
 c="jsonb_build_object('action','%s','request_id','%s','run_id','%s','expected_revision',%d,'source_sha256',(dqa_business.preview_flow_test('%s','%s')->>'source_sha256'),'reason','合成測試','confirmation','FLOW TEST '||(SELECT legacy_id FROM dqa_business.requests WHERE id='%s'))"%(action,REQ,RUN,revision,T,REQ,REQ)
 if changes:c+='||'+literal(changes)
 return c
def flow(action='CREATE',who=1,revision=0,operation=1,changes=None):
 ident='ab200000-0000-4000-8000-'+str(operation).zfill(12)
 return 'RESET ROLE;'+auth(who)+f"SELECT dqa_business.execute_flow_test('{T}','{ident}',{test_command(action,revision,**(changes or {}))});"
def checkpoint():return flow()+flow('ADVANCE',5,1,2)+flow('ADVANCE',5,2,3)
def execute(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+received()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2400:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1900:])
 def test_admin_creates_explicit_marked_copy(self):self.ok(flow()+f"SELECT dqa_business.flow_test_run('{T}','{REQ}')->>'purpose'",'FLOW_TEST')
 def test_executor_cannot_mark_production_case(self):self.deny(flow(who=5),'FLOW_TEST_ADMIN_REQUIRED')
 def test_real_confirmation_is_required(self):self.deny(flow(changes={'confirmation':'yes'}),'FLOW_TEST_CONFIRMATION_REQUIRED')
 def test_reason_is_required(self):self.deny(flow(changes={'reason':' '}),'FLOW_TEST_CONFIRMATION_REQUIRED')
 def test_original_version_change_invalidates_create(self):self.deny(flow(changes={'source_sha256':'a'*64}),'FLOW_TEST_SOURCE_CHANGED')
 def test_unmarked_case_cannot_advance(self):self.deny(flow('ADVANCE',5,1),'FLOW_TEST_SOURCE_CHANGED')
 def test_only_authorized_executor_can_advance(self):self.deny(flow()+flow('ADVANCE',4,1,2),'FLOW_TEST_ACCESS_DENIED')
 def test_zero_half_full_checkpoints_are_canonical(self):self.ok(checkpoint()+f"SELECT dqa_business.flow_test_run('{T}','{REQ}')->>'percent',(dqa_business.flow_test_run('{T}','{REQ}')->>'virtual_at')::timestamptz=(SELECT ends_at FROM dqa_business.schedules WHERE request_id='{REQ}')",'100|t')
 def test_half_uses_whole_day_window_not_nominal_hours(self):self.ok(flow()+flow('ADVANCE',5,1,2)+f"SELECT (dqa_business.flow_test_run('{T}','{REQ}')->>'virtual_elapsed_seconds')::numeric=(SELECT extract(epoch FROM ends_at-starts_at)/2 FROM dqa_business.schedules WHERE request_id='{REQ}')",'t')
 def test_production_rows_and_signatures_never_change(self):
  snapshot=f"(SELECT md5(jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(q)) FROM dqa_business.requests q WHERE tenant_id='{T}'),'schedules',(SELECT jsonb_agg(to_jsonb(s)) FROM dqa_business.schedules s WHERE tenant_id='{T}'),'equipment',(SELECT jsonb_agg(to_jsonb(e)) FROM dqa_business.equipment e WHERE tenant_id='{T}'),'allocations',(SELECT jsonb_agg(to_jsonb(a)) FROM dqa_business.schedule_equipment a WHERE tenant_id='{T}'),'signatures',(SELECT jsonb_agg(to_jsonb(x)) FROM dqa_business.request_signatures x WHERE tenant_id='{T}'))::text))"
  self.ok('RESET ROLE;SELECT set_config(\'test.original\','+snapshot+',true);'+checkpoint()+'RESET ROLE;SELECT current_setting(\'test.original\')='+snapshot,'t')
 def test_duplicate_operation_does_not_advance_twice(self):self.ok(flow()+flow('ADVANCE',5,1,2)+flow('ADVANCE',5,1,2)+f"SELECT dqa_business.flow_test_run('{T}','{REQ}')->>'percent'",'50')
 def test_stale_checkpoint_does_not_jump_twice(self):self.deny(flow()+flow('ADVANCE',5,1,2)+flow('ADVANCE',5,1,3),'REVISION_CONFLICT')
 def test_completed_copy_cannot_advance_again(self):self.deny(checkpoint()+flow('ADVANCE',5,3,4),'FLOW_TEST_COMPLETED')
 def test_second_copy_is_rejected(self):self.deny(flow()+flow(operation=8,changes={'run_id':'ab100000-0000-4000-8000-000000000008'}),'FLOW_TEST_ALREADY_EXISTS')
 def test_history_has_actual_and_virtual_times(self):self.ok(checkpoint()+f"RESET ROLE;SELECT count(*),bool_and(created_at<virtual_at) FROM dqa_private.flow_test_events WHERE run_id='{RUN}'",'3|t')
 def test_completion_does_not_enable_formal_report_submission(self):self.deny(checkpoint()+upload(),'HUMAN_ACCESS_DENIED')
 def test_direct_private_write_is_denied(self):self.deny(auth(5)+"SELECT * FROM dqa_private.flow_test_runs",'permission denied')
 def test_cross_tenant_access_is_denied(self):self.deny(flow()+"RESET ROLE;SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SET LOCAL ROLE authenticated;"+f"SELECT dqa_business.flow_test_run('{T}','{REQ}')",'FLOW_TEST_ACCESS_DENIED')
 def test_revoked_role_cannot_query_receipt(self):self.deny(flow()+f"RESET ROLE;UPDATE dqa_business.memberships SET enabled=false WHERE id='{MAN}';"+auth(1)+f"SELECT dqa_business.flow_test_result('{T}','ab200000-0000-4000-8000-000000000001')",'FLOW_TEST_ACCESS_DENIED')
 def test_purpose_and_source_cannot_be_written_by_client(self):self.deny(flow(changes={'purpose':'PRODUCTION'}),'FLOW_TEST_FIELDS_INVALID')
 def test_replay_receipt_survives_transport_loss(self):self.ok(flow()+flow(operation=1)+f"SELECT dqa_business.flow_test_result('{T}','ab200000-0000-4000-8000-000000000001')->>'state'",'SAVED')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'rollback_only':True},indent=2)+'\n');raise SystemExit(not result.wasSuccessful())
