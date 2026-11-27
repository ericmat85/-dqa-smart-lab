"""Rollback-only native schedule -> number -> signed preflight -> virtual acceleration checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_preapproval_scheduling.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
original_fixture=fixture
virtual=False
def fixture(priority='一般'):
 sql=original_fixture(priority)
 if virtual:
  start=sql.index('dqa_business.create_request_draft(');end=sql.index('::jsonb)',start)+len('::jsonb')
  sql=sql[:end]+",'VIRTUAL'"+sql[end:];sql=sql.replace('dqa_business.create_request_draft(','dqa_business.create_classified_request_draft(',1)
 return sql+f"RESET ROLE;UPDATE dqa_business.roles SET permissions=permissions||ARRAY['schedules.book'],pages=pages||ARRAY['schedule'] WHERE id='a1000000-0000-0000-0000-000000000003';"
old_plan=plan
def plan(external=False,oid=11):return old_plan(external,oid).replace('"sample_code": "SAMPLE-001"','"sample_code": ""')
def number(code='GENERATED',revision=0,oid=10,planrevision='coalesce((SELECT revision FROM dqa_business.schedule_drafts WHERE request_id=q.id),0)'):
 return 'RESET ROLE;'+auth(3)+f"SELECT dqa_business.mutate_preapproval_sample_numbers('{T}','{op(oid)}','{REQ}',q.request_document_version_id,q.revision,{revision},{planrevision},'GENERATE') FROM dqa_business.requests q WHERE id='{REQ}';"
def first(external=False):return plan(external)+number()+review(3,'LMS_APPROVE',12,FIRST,'2')
def second(external=False):return first(external)+review(4,'LMS_APPROVE',13)
def prepared(fields=PREP):return second()+human('PREPARE',20,fields,'')
def accelerate(oid=40):return 'RESET ROLE;'+auth(5)+f"DO $t$ DECLARE r jsonb;c jsonb;BEGIN r:=dqa_business.preview_flow_test('{T}','{REQ}')->'run';c:=jsonb_build_object('action','ADVANCE','request_id','{REQ}','run_id',r->>'id','expected_revision',r->'revision','source_sha256',r->>'source_sha256','reason','','confirmation','');PERFORM dqa_business.execute_flow_test('{T}','{op(oid)}',c);END $t$;"
class Tests(unittest.TestCase):
 def setUp(self):
  global virtual;virtual=False
 def ok(self,sql,expected,external=False):
  r=execute(sql,'委外' if external else '一般');self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2600:])
 def test_can_plan_without_sample_number(self):self.ok(plan()+f"SELECT plan->>'sample_code'='' AND plan->>'sample_revision' IS NULL FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';",'t')
 def test_number_requires_confirmed_plan(self):self.deny(number(),'PREAPPROVAL_PLAN_REQUIRED')
 def test_public_plan_cannot_assign_number_in_the_planning_request(self):self.deny(plan()+number()+old_plan(oid=18),'PREAPPROVAL_SAMPLE_REQUIRED')
 def test_attach_number_updates_saved_plan_atomically(self):self.ok(plan()+number()+f"SELECT (plan->>'sample_code' LIKE '#__-%')::text,plan->>'sample_revision',revision FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';",'true|1|2')
 def test_number_rechecks_exact_plan_revision(self):self.deny(plan()+number(planrevision='2'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_first_signature_requires_number_after_plan(self):self.deny(plan()+review(3,'LMS_APPROVE',12,FIRST,'1'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_full_schedule_number_both_reviews(self):self.ok(second()+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}';",'AWAITING_RECEIPT')
 def test_saved_group_cannot_be_appended_or_overwritten(self):self.deny(plan()+number()+number(revision=1,oid=18),'PREAPPROVAL_SAMPLE_GROUP_EXISTS')
 def test_number_replay_does_not_increment_plan_twice(self):self.ok(plan()+number(planrevision='1')+number(planrevision='1')+f"SELECT revision FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';",'2')
 def test_replan_preserves_saved_group_without_reconfirmation(self):self.ok(plan()+number()+plan(oid=18)+review(3,'LMS_APPROVE',12,FIRST,'3')+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}';",'PENDING_APPROVAL')
 def test_existing_group_is_carried_into_replan(self):self.ok(plan()+number()+plan(oid=18)+review(3,'LMS_APPROVE',12,FIRST,'3')+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}';",'PENDING_APPROVAL')
 def test_virtual_preparation_is_not_an_accelerator_action(self):
  global virtual;virtual=True
  self.ok(prepared()+f"SELECT status,received_at IS NULL FROM dqa_business.schedules WHERE request_id='{REQ}';",'AWAITING_RECEIPT|t')
 def test_virtual_preparation_can_be_completed_after_original_start_time(self):
  global virtual;virtual=True
  self.ok(second()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 day' WHERE request_id='{REQ}';"+human('PREPARE',20,PREP,'')+human('RECEIVE',21,{'executionAbnormal':'no'})+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}';",'BOOKED')
 def test_virtual_accelerator_denied_before_preparation(self):
  global virtual;virtual=True
  self.deny(second()+accelerate(),'FLOW_TEST_PREFLIGHT_REQUIRED')
 def test_virtual_accelerator_denied_after_unsigned_preparation(self):
  global virtual;virtual=True
  self.deny(prepared()+accelerate(),'FLOW_TEST_PREFLIGHT_REQUIRED')
 def test_virtual_requires_no_issue_check_and_real_signature(self):
  global virtual;virtual=True
  self.deny(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'},''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_virtual_can_accelerate_after_preflight_signature(self):
  global virtual;virtual=True
  self.ok(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'})+accelerate()+f"SELECT status,virtual_percent FROM dqa_business.schedules WHERE request_id='{REQ}';",'RUNNING|50')
 def test_virtual_can_finish_after_full_preflight(self):
  global virtual;virtual=True
  self.ok(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'})+accelerate()+accelerate(41)+f"SELECT status,virtual_percent FROM dqa_business.schedules WHERE request_id='{REQ}';",'COMPLETED|100')
 def test_virtual_cannot_skip_preflight_using_start(self):
  global virtual;virtual=True
  self.deny(second()+human('START',20),'VIRTUAL_ACCELERATOR_REQUIRED')
 def test_cancel_request_is_pending_and_keeps_schedule(self):self.ok(second()+human('CANCEL_REQUEST',20,None,'')+f"SELECT status FROM dqa_business.schedules WHERE request_id='{REQ}';",'AWAITING_RECEIPT')
 def test_cancel_request_blocks_preparation(self):self.deny(second()+human('CANCEL_REQUEST',20,None,'')+human('PREPARE',21,PREP,''),'HUMAN_CANCELLATION_PENDING')
 def test_cancel_rejection_reopens_preflight(self):self.ok(second()+human('CANCEL_REQUEST',20,None,'')+human('CANCEL_REJECT',21,None,'').replace(auth(5),auth(3))+human('PREPARE',22,PREP,'')+f"SELECT status FROM dqa_business.lab_operations WHERE request_id='{REQ}' AND action='CANCEL';",'REJECTED')
 def test_cancel_approval_uses_supervisor_stop_and_releases_resources(self):self.ok(second()+human('CANCEL_REQUEST',20,None,'')+human('STOP',21,None,'').replace(auth(5),auth(3))+f"SELECT status,(SELECT bool_and(released_at IS NOT NULL) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}';",'CANCELLED|t')
 def test_executor_cannot_approve_own_cancel(self):self.deny(second()+human('CANCEL_REQUEST',20,None,'')+human('STOP',21,None,''),'HUMAN_STOP_DENIED')
 def test_outsourced_sequence_without_physical_device(self):self.ok(second(True)+f"SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id IN(SELECT id FROM dqa_business.schedules WHERE request_id='{REQ}');",'0',True)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
