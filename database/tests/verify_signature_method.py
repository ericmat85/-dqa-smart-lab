"""Rollback-only tenant signature-method configuration; no key creation or signing."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
def get(t=T):return f"SELECT dqa_business.signature_method_settings('{t}')"
def put(method='IMAGE',rev=0,t=T):return f"SELECT dqa_business.save_signature_method_settings('{t}','{method}',{rev})"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1700:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_default_matches_real_image_runtime(self):self.ok(auth()+get()+"->>'method'",'IMAGE')
 def test_digital_is_not_advertised_ready(self):self.ok(auth()+get()+"->>'digital_ready'",'false')
 def test_admin_can_save_into_existing_settings(self):self.ok(auth()+put()+"->>'revision'",'1')
 def test_image_save_is_idempotent(self):self.ok(auth()+put()+';'+put(rev=1)+"->>'revision'",'1')
 def test_stale_write_does_not_overwrite(self):self.deny(auth()+put()+';'+put(),'REVISION_CONFLICT')
 def test_digital_cannot_be_enabled_without_service(self):self.deny(auth()+put('DIGITAL'),'SIGNATURE_DIGITAL_NOT_CONFIGURED')
 def test_unknown_method_is_rejected(self):self.deny(auth()+put('fake'),'SIGNATURE_FIELDS_INVALID')
 def test_member_can_inspect_current_runtime_but_not_change_it(self):self.ok(auth('10000000-0000-0000-0000-000000000002')+get()+"->>'can_manage'",'false')
 def test_nonadmin_cannot_save(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+put(),'SIGNATURE_SETTINGS_ACCESS_DENIED')
 def test_tenant_injection_cannot_save(self):self.deny(auth()+put(t='b0000000-0000-0000-0000-000000000001'),'SIGNATURE_SETTINGS_ACCESS_DENIED')
 def test_tenant_injection_cannot_read(self):self.deny(auth()+get(t='b0000000-0000-0000-0000-000000000001'),'SIGNATURE_SETTINGS_ACCESS_DENIED')
 def test_anonymous_cannot_read(self):self.deny('SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_no_browser_direct_settings_write(self):self.deny(auth()+f"INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES('{T}','signature_method','{{\"method\":\"DIGITAL\"}}')",'permission denied')
 def test_existing_audit_tracks_explicit_configuration_save(self):self.ok(auth()+put()+f";RESET ROLE;SELECT count(*) FROM dqa_business.audit_events WHERE table_name='settings' AND record_id=(SELECT id FROM dqa_business.settings WHERE tenant_id='{T}' AND module='signature_method')",'1')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
