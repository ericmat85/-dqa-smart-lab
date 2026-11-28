"""Uploaded report removal; synthetic isolated PostgreSQL, every case rolls back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_trial_template_delivery.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
DOP='dd000000-0000-4000-8000-000000000051';SECOND='cf000000-0000-4000-8000-000000000002';OP2='ce000000-0000-4000-8000-000000000002'
def unbind():return save(op='ce000000-0000-4000-8000-000000000003',file=None,revision=1,content=None,sha=None)
def delete(operation=DOP,file=FILE,revision=2,tenant=T):return f"SELECT dqa_business.delete_report_template_file('{tenant}','{operation}','{file}',{revision});"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-3000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2000:])
 def test_explicit_unbind_then_delete_hides_file(self):self.ok(auth()+save()+unbind()+delete()+f"SELECT jsonb_array_length(dqa_business.trial_template_catalog('{T}')->'files'),dqa_business.trial_template_catalog('{T}')->'trials'->0->>'file_id',dqa_business.trial_template_catalog('{T}')->'trials'->0->>'revision';",'0||2')
 def test_bound_file_cannot_be_deleted(self):self.deny(auth()+save()+delete(revision=1),'TRIAL_TEMPLATE_IN_USE')
 def test_disabled_trial_bound_file_cannot_be_deleted(self):self.deny(auth()+save()+f"RESET ROLE;UPDATE dqa_business.trial_definitions SET enabled=false WHERE id='{TRIAL}';"+auth()+delete(revision=1),'TRIAL_TEMPLATE_IN_USE')
 def test_historical_delete_keeps_current(self):self.ok(auth()+save()+save(op=OP2,file=SECOND,revision=1,version='V2')+delete(revision=2)+f"SELECT jsonb_array_length(dqa_business.trial_template_catalog('{T}')->'files'),dqa_business.trial_template_catalog('{T}')->'files'->0->>'id';",'1|'+SECOND)
 def test_pinned_case_retains_original_and_mapping(self):self.ok(auth()+save()+seed()+unbind()+delete()+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'id',dqa_business.document_mapping_case('{T}','REPORT','{DOC}')->'mapping'->0->>'cell';",FILE+'|A1')
 def test_library_file_read_rejected_after_delete(self):self.deny(auth()+save()+unbind()+delete()+f"SELECT dqa_business.trial_template_file('{T}','{FILE}');",'TRIAL_TEMPLATE_NOT_FOUND')
 def test_rebinding_deleted_file_rejected(self):self.deny(auth()+save()+unbind()+delete()+save(op=OP2,revision=2,content=None),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_old_upload_receipt_cannot_rebind_deleted_version(self):self.ok(auth()+save()+unbind()+delete()+save()+f"RESET ROLE;SELECT file_id IS NULL,revision FROM dqa_private.trial_template_bindings WHERE trial_id='{TRIAL}';",'t|2')
 def test_idempotent_delete_once(self):self.ok(auth()+save()+unbind()+delete()+delete()+f"RESET ROLE;SELECT count(*),(SELECT count(*) FROM dqa_business.audit_events WHERE table_name='report_template_file_deletions') FROM dqa_private.report_template_file_deletions;",'1|1')
 def test_receipt_lookup(self):self.ok(auth()+save()+unbind()+delete()+f"SELECT dqa_business.trial_template_result('{T}','{DOP}')->>'file_id';",FILE)
 def test_receipt_conflict(self):self.deny(auth()+save()+unbind()+delete()+delete(revision=3),'TRIAL_TEMPLATE_OPERATION_CONFLICT')
 def test_repeat_different_operation_rejected(self):self.deny(auth()+save()+unbind()+delete()+delete(operation=OP2,revision=2),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_stale_binding_cannot_be_deleted(self):self.deny(auth()+save()+delete(revision=0),'TRIAL_TEMPLATE_REVISION_CONFLICT')
 def test_cross_tenant_not_admin(self):self.deny(auth()+save()+delete(tenant='b0000000-0000-0000-0000-000000000001'),'TRIAL_TEMPLATE_ADMIN_REQUIRED')
 def test_foreign_file_denied(self):self.deny(auth()+save()+delete(file='bf000000-0000-4000-8000-000000000001'),'TRIAL_TEMPLATE_NOT_FOUND')
 def test_reader_denied(self):self.deny(auth()+save()+'RESET ROLE;'+auth('10000000-0000-0000-0000-000000000003')+delete(),'TRIAL_TEMPLATE_ADMIN_REQUIRED')
 def test_disabled_trial_unbound_file_can_be_retired(self):self.ok(auth()+save()+unbind()+f"RESET ROLE;UPDATE dqa_business.trial_definitions SET enabled=false WHERE id='{TRIAL}';"+auth()+delete()+f"SELECT jsonb_array_length(dqa_business.trial_template_catalog('{T}')->'files');",'0')
 def test_catalog_exposes_binding_revision(self):self.ok(auth()+save()+f"SELECT dqa_business.trial_template_catalog('{T}')->'files'->0->>'binding_revision';",'1')
 def test_files_are_not_physically_destroyed(self):self.ok(auth()+save()+seed()+unbind()+delete()+f"RESET ROLE;SELECT count(*),(SELECT count(*) FROM dqa_private.request_trial_template_pins),(SELECT count(*) FROM dqa_private.document_cell_mappings) FROM dqa_private.trial_template_files;",'1|1|1')
 def test_bound_rejection_preserves_binding_file_audit_and_receipt(self):self.ok(auth()+save()+f"DO $$BEGIN PERFORM dqa_business.delete_report_template_file('{T}','{DOP}','{FILE}',1);RAISE EXCEPTION 'EXPECTED_BOUND_REJECTION';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'TRIAL_TEMPLATE_IN_USE' THEN RAISE;END IF;END $$;RESET ROLE;SELECT file_id,revision,(SELECT count(*) FROM dqa_private.report_template_file_deletions),(SELECT count(*) FROM dqa_private.trial_template_operations WHERE id='{DOP}') FROM dqa_private.trial_template_bindings WHERE trial_id='{TRIAL}';",FILE+'|1|0|0')
 def test_private_table_denied(self):self.deny(auth()+'SELECT * FROM dqa_private.report_template_file_deletions;','permission denied')
 def test_old_binding_function_denied(self):self.deny(auth()+f"SELECT dqa_business.save_trial_template_binding_v50('{T}','{OP}','{TRIAL}',0,NULL,NULL,NULL,NULL,NULL);",'permission denied')
 def test_old_catalog_denied(self):self.deny(auth()+f"SELECT dqa_business.trial_template_catalog_v50('{T}');",'permission denied')
 def test_anon_and_service_have_no_execute(self):self.ok("SELECT has_function_privilege('anon','dqa_business.delete_report_template_file(uuid,uuid,uuid,integer)','EXECUTE'),has_function_privilege('service_role','dqa_business.delete_report_template_file(uuid,uuid,uuid,integer)','EXECUTE');",'f|f')
 def test_invalid_revision_rejected(self):self.deny(auth()+save()+delete(revision=-1),'TRIAL_TEMPLATE_FIELDS_INVALID')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'scope':'network-none synthetic local PostgreSQL; all cases rolled back'},indent=2));raise SystemExit(not result.wasSuccessful())
