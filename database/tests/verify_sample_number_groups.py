"""Rollback-only manual group entry, replay, freeze, replan and administrator default checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_preflight_sequence.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
base_group_fixture=fixture
quantity=3
def fixture(priority='一般'):
 return base_group_fixture(priority).replace('"quantity": 3','"quantity": '+str(quantity)).replace("'溫濕度試驗',6,24","'溫濕度試驗',"+str(max(6,quantity))+",24")
def numbers(action='SAVE',oid=10,revision=None,plan_revision=None,codes=None):
 rev="coalesce((SELECT revision FROM dqa_private.preapproval_samples WHERE request_id=q.id),0)" if revision is None else str(revision)
 pr="(SELECT revision FROM dqa_business.schedule_drafts WHERE request_id=q.id)" if plan_revision is None else str(plan_revision)
 values=codes if codes is not None else (['RT-2','ST-3','AB-4'] if quantity==3 else ['RT-'+str(i+1) for i in range(quantity)])
 return f"RESET ROLE;SELECT set_config('test.document',q.request_document_version_id::text,true),set_config('test.request_revision',q.revision::text,true),set_config('test.sample_revision',({rev})::text,true),set_config('test.plan_revision',coalesce(({pr})::text,'0'),true) FROM dqa_business.requests q WHERE id='{REQ}';"+auth(3)+f"SELECT dqa_business.save_preapproval_sample_numbers('{T}','{op(oid)}','{REQ}',current_setting('test.document')::uuid,current_setting('test.request_revision')::bigint,current_setting('test.sample_revision')::integer,current_setting('test.plan_revision')::bigint,'{action}',{literal(values if action=='SAVE' else [])});"
def first(external=False):return plan(external)+numbers()+review(3,'LMS_APPROVE',12,FIRST,'2')
def second(external=False):return first(external)+review(4,'LMS_APPROVE',13)
class Tests(unittest.TestCase):
 def setUp(self):
  global quantity,virtual;quantity=3;virtual=False
 def ok(self,sql,expected='t',priority='一般'):
  r=execute(sql,priority);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2400:])
 def test_exact_quantity_and_two_distinct_letters(self):
  self.ok(plan()+numbers()+f"RESET ROLE;SELECT count(*)=3 AND bool_and(code~'^#[A-Z]{{2}}-[1-9][0-9]*$' AND substr(code,2,1)<>substr(code,3,1)) AND count(DISTINCT substr(code,2,2))=3 FROM dqa_private.sample_number_allocations WHERE request_id='{REQ}';")
 def test_group_matches_context_and_plan(self):
  self.ok(plan()+numbers()+f"SELECT (dqa_business.preapproval_context('{T}','{REQ}')->>'sample_numbers_valid')::boolean AND jsonb_array_length(dqa_business.preapproval_context('{T}','{REQ}')->'sample_numbers')=3;")
 def test_generate_without_plan_denied(self):self.deny(numbers(),'PREAPPROVAL_PLAN_REQUIRED')
 def test_generate_second_group_denied(self):self.deny(plan()+numbers()+numbers(oid=18),'PREAPPROVAL_SAMPLE_GROUP_EXISTS')
 def test_automatic_generation_denied(self):self.deny(plan()+f"RESET ROLE;"+auth(3)+f"SELECT dqa_business.mutate_preapproval_sample_numbers('{T}','{op(19)}','{REQ}',q.request_document_version_id,q.revision,0,1,'GENERATE') FROM dqa_business.requests q WHERE id='{REQ}';",'PREAPPROVAL_SAMPLE_MANUAL_REQUIRED')
 def test_replay_same_operation_no_extra_numbers(self):self.ok(plan()+numbers(revision=0,plan_revision=1)+numbers(revision=0,plan_revision=1)+f"RESET ROLE;SELECT count(*)=3 AND (SELECT revision=2 FROM dqa_business.schedule_drafts WHERE request_id='{REQ}') FROM dqa_private.sample_number_allocations;")
 def test_operation_content_conflict(self):self.deny(plan()+numbers(revision=0,plan_revision=1)+numbers('DELETE',revision=0,plan_revision=1),'PREAPPROVAL_OPERATION_CONFLICT')
 def test_stale_plan_denied(self):self.deny(plan()+numbers(plan_revision=2),'PREAPPROVAL_PLAN_REQUIRED')
 def test_stale_sample_denied(self):self.deny(plan()+numbers(revision=7),'REVISION_CONFLICT')
 def test_group_delete_retains_history(self):self.ok(plan()+numbers()+numbers('DELETE',18)+f"RESET ROLE;SELECT count(*)=3 AND bool_and(revoked_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM dqa_private.preapproval_samples WHERE request_id='{REQ}') FROM dqa_private.sample_number_allocations;")
 def test_delete_and_regenerate_new_codes_not_reused(self):self.ok(plan()+numbers()+numbers('DELETE',18)+numbers(oid=19,codes=['RT-5','ST-6','AB-7'])+f"RESET ROLE;SELECT count(*)=6 AND count(DISTINCT code)=6 AND count(*) FILTER(WHERE revoked_at IS NULL)=3 AND min(split_part(code,'-',2)::int) FILTER(WHERE revoked_at IS NULL)=5 FROM dqa_private.sample_number_allocations;")
 def test_delete_missing_group_denied(self):self.deny(plan()+numbers('DELETE'),'PREAPPROVAL_SAMPLE_REQUIRED')
 def test_replan_keeps_saved_codes_without_reconfirmation(self):self.ok(plan()+numbers()+plan(oid=18)+review(3,'LMS_APPROVE',12,FIRST,'3')+f"SELECT status='PENDING_APPROVAL' AND sample_code=plan->>'sample_code' FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_cannot_approve_without_numbers(self):self.deny(plan()+review(3,'LMS_APPROVE',12,FIRST,'1'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_deleted_group_prevents_approval(self):self.deny(plan()+numbers()+numbers('DELETE',18)+review(3,'LMS_APPROVE',12,FIRST,'3'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_partial_group_prevents_approval(self):self.deny(plan()+numbers()+f"RESET ROLE;DELETE FROM dqa_private.sample_number_allocations WHERE request_id='{REQ}' AND ordinal=3;"+review(3,'LMS_APPROVE',12,FIRST,'2'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_approval_freezes_generation(self):self.deny(first()+numbers(oid=18),'PLANNING_ACCESS_DENIED')
 def test_approval_freezes_deletion(self):self.deny(first()+numbers('DELETE',18),'PLANNING_ACCESS_DENIED')
 def test_wrong_level_cannot_generate(self):self.deny(plan()+numbers().replace(auth(3),auth(4)),'PLANNING_ACCESS_DENIED')
 def test_wrong_tenant_cannot_generate(self):self.deny(plan()+numbers().replace(uid(3),'20000000-0000-0000-0000-000000000001'),'PLANNING_ACCESS_DENIED')
 def test_tables_not_directly_writable(self):self.deny(plan()+auth(3)+"DELETE FROM dqa_private.sample_number_allocations;",'permission denied')
 def test_outsourced_group_and_both_reviews(self):self.ok(second(True)+f"SELECT status='AWAITING_RECEIPT' AND plan->'allocations'='[]'::jsonb FROM dqa_business.schedules WHERE request_id='{REQ}';",priority='委外')
 def test_thousand_samples_no_under_count_or_truncation(self):
  global quantity;quantity=1000
  self.ok(plan()+numbers()+review(3,'LMS_APPROVE',12,FIRST,'2')+f"RESET ROLE;SELECT count(*)=1000 AND count(DISTINCT code)=1000 AND count(DISTINCT substr(code,2,2))=1 FROM dqa_private.sample_number_allocations;")
 def test_virtual_preflight_still_required(self):
  global virtual;virtual=True
  self.deny(second()+accelerate(),'FLOW_TEST_PREFLIGHT_REQUIRED')
 def test_admin_still_requires_complete_group(self):self.deny("RESET ROLE;UPDATE dqa_business.roles SET is_tenant_admin=true WHERE id='a1000000-0000-0000-0000-000000000002';"+plan().replace(auth(3),auth(2))+review(2,'LMS_APPROVE',12,FIRST,'1'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_repeated_letters_rejected(self):self.deny(plan()+numbers(codes=['RR-2','ST-3','AB-4']),'PREAPPROVAL_SAMPLE_FORMAT_INVALID')
 def test_duplicate_code_rejected(self):self.deny(plan()+numbers(codes=['RT-2','ST-3','ST-3']),'PREAPPROVAL_SAMPLE_DUPLICATE')
 def test_missing_entry_rejected(self):self.deny(plan()+numbers(codes=['RT-2','ST-3']),'PREAPPROVAL_SAMPLE_COUNT_INVALID')
 def test_blank_entry_rejected(self):self.deny(plan()+numbers(codes=['RT-2','','AB-4']),'PREAPPROVAL_SAMPLE_COUNT_INVALID')
 def test_zero_and_negative_serials_rejected(self):
  for value in ['RT-0','RT--2','RT-02','RT-2.5']:
   with self.subTest(value=value):self.deny(plan()+numbers(codes=[value,'ST-3','AB-4']),'PREAPPROVAL_SAMPLE_FORMAT_INVALID')
 def test_optional_hash_and_case_are_normalized(self):self.ok(plan()+numbers(codes=[' rt-2 ','#sT-3','ab-4'])+f"RESET ROLE;SELECT sample_code='#RT-2、#ST-3、#AB-4' FROM dqa_private.preapproval_samples WHERE request_id='{REQ}';")
 def test_retired_codes_cannot_be_reused(self):self.deny(plan()+numbers()+numbers('DELETE',18)+numbers(oid=19),'PREAPPROVAL_SAMPLE_ALREADY_USED')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
