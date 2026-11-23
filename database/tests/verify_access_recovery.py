"""Recovery contract on isolated local PostgreSQL; all ordinary tests roll back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
resolve=lambda op=OP:f"SELECT dqa_business.resolve_access_operation('{T}','{op}');"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1700:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1700:])
 def test_saved_receipt_is_preserved(self):self.ok(auth()+newrole+resolve()+f"SELECT dqa_business.access_operation_result('{T}','{OP}')->>'state'",'SAVED')
 def test_missing_operation_is_terminal_without_business_write(self):self.ok(auth()+resolve()+f"SELECT dqa_business.access_operation_result('{T}','{OP}')->>'state',(SELECT count(*) FROM dqa_business.roles WHERE id='{RID}')",'CANCELLED_NO_WRITE|0')
 def test_late_old_request_is_blocked(self):self.deny(auth()+resolve()+newrole,'ACCESS_OPERATION_CONFLICT')
 def test_resolution_is_idempotent(self):self.ok(auth()+resolve()+resolve()+f"RESET ROLE;SELECT count(*) FROM dqa_private.access_operations WHERE tenant_id='{T}' AND id='{OP}'",'1')
 def test_new_operation_can_save_after_old_cancelled(self):self.ok(auth()+resolve()+save(op='ef000000-0000-4000-8000-000000000099')+f"SELECT count(*) FROM dqa_business.roles WHERE id='{RID}'",'1')
 def test_nonadmin_cannot_resolve(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+resolve(),'ACCESS_ADMIN_REQUIRED')
 def test_anon_cannot_resolve(self):self.deny('SET LOCAL ROLE anon;'+resolve(),'permission denied')
 def test_null_id_is_rejected(self):self.deny(auth()+f"SELECT dqa_business.resolve_access_operation('{T}',NULL)",'ACCESS_FIELDS_INVALID')
 def test_other_tenant_is_rejected(self):self.deny(auth()+f"SELECT dqa_business.resolve_access_operation('b0000000-0000-0000-0000-000000000001','{OP}')",'ACCESS_ADMIN_REQUIRED')
 def test_other_actor_receipt_cannot_be_resolved(self):self.deny(auth()+newrole+f"RESET ROLE;UPDATE dqa_private.access_operations SET actor_id='10000000-0000-0000-0000-000000000002' WHERE id='{OP}';"+auth()+resolve(),'ACCESS_OPERATION_CONFLICT')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
