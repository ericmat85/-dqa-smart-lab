"""Generated-reference deletion only; isolated local PostgreSQL, every case rolls back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_trial_template_delivery.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
DOP='dd000000-0000-4000-8000-000000000001'
def delete(operation=DOP,trial=TRIAL,revision=1,tenant=T):return f"SELECT dqa_business.delete_builtin_trial_template('{tenant}','{operation}','{trial}',{revision});"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-3000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2000:])
 def test_empty_list_is_backward_compatible(self):self.ok(auth()+f"SELECT dqa_business.trial_template_catalog('{T}')->'hidden_builtin_template_ids';",'[]')
 def test_delete_removes_only_the_generated_reference(self):self.ok(auth()+delete()+f"SELECT dqa_business.trial_template_catalog('{T}')->'hidden_builtin_template_ids',enabled FROM dqa_business.trial_definitions WHERE id='{TRIAL}';",'["TEST-TRIAL"]|t')
 def test_replaying_the_same_operation_is_idempotent(self):self.ok(auth()+delete()+delete()+f"RESET ROLE;SELECT count(*),(SELECT count(*) FROM dqa_business.audit_events WHERE table_name='builtin_trial_template_deletions') FROM dqa_private.builtin_trial_template_deletions WHERE tenant_id='{T}';",'1|1')
 def test_conflicting_operation_is_rejected(self):self.deny(auth()+delete()+delete(revision=2),'TRIAL_TEMPLATE_OPERATION_CONFLICT')
 def test_new_operation_cannot_delete_an_already_deleted_reference(self):self.deny(auth()+delete()+delete(operation='dd000000-0000-4000-8000-000000000002'),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_stale_source_revision_is_rejected(self):self.deny(auth()+delete(revision=2),'TRIAL_TEMPLATE_REVISION_CONFLICT')
 def test_readonly_member_cannot_delete(self):self.deny(auth('10000000-0000-0000-0000-000000000003')+delete(),'TRIAL_TEMPLATE_ADMIN_REQUIRED')
 def test_member_of_another_workspace_cannot_delete(self):self.deny(auth()+delete(tenant='b0000000-0000-0000-0000-000000000001'),'TRIAL_TEMPLATE_ADMIN_REQUIRED')
 def test_cross_workspace_trial_is_rejected(self):self.deny(auth()+delete(trial='b3000000-0000-0000-0000-000000000001'),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_disabled_trial_is_rejected(self):self.deny(f"UPDATE dqa_business.trial_definitions SET enabled=false WHERE id='{TRIAL}';"+auth()+delete(),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_zero_revision_is_invalid(self):self.deny(auth()+delete(revision=0),'TRIAL_TEMPLATE_FIELDS_INVALID')
 def test_anon_cannot_execute(self):self.deny('SET LOCAL ROLE anon;'+delete(),'permission denied')
 def test_direct_private_table_access_is_denied(self):self.deny(auth()+'SELECT * FROM dqa_private.builtin_trial_template_deletions;','permission denied')
 def test_old_catalog_implementation_is_not_directly_executable(self):self.deny(auth()+f"SELECT dqa_business.trial_template_catalog_v49('{T}');",'permission denied')
 def test_deletion_receipt_can_be_recovered(self):self.ok(auth()+delete()+f"SELECT dqa_business.trial_template_result('{T}','{DOP}')->>'action',dqa_business.trial_template_result('{T}','{DOP}')->>'deleted';",'DELETE_BUILTIN|true')
 def test_uploaded_file_and_binding_remain_available(self):self.ok(auth()+save()+delete()+f"SELECT dqa_business.trial_template_file('{T}','{FILE}')->>'content',(SELECT t->>'file_id' FROM jsonb_array_elements(dqa_business.trial_template_catalog('{T}')->'trials') t WHERE t->>'id'='{TRIAL}');",CONTENT+'|'+FILE)
 def test_existing_trials_requests_versions_and_bindings_are_unchanged(self):
  scan=f"SELECT jsonb_build_object('trial',(SELECT to_jsonb(t) FROM dqa_business.trial_definitions t WHERE id='{TRIAL}'),'requests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM dqa_business.requests q),'documents',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM dqa_business.request_document_versions v),'files',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM dqa_private.trial_template_files f),'bindings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY trial_id) FROM dqa_private.trial_template_bindings b)) v"
  self.ok(auth()+save()+"RESET ROLE;SELECT set_config('test.references_before',("+scan+")::text,true);"+auth()+delete()+"RESET ROLE;SELECT current_setting('test.references_before')::jsonb=("+scan+");",'t')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'scope':'network-none synthetic local PostgreSQL; all cases rolled back'},indent=2));raise SystemExit(not result.wasSuccessful())
