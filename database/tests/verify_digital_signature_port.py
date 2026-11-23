"""Local PostgreSQL only. Synthetic workflow and port writes all roll back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
config={'name':'合成驗章端口','connection_type':'HTTPS_GATEWAY','base_url':'https://signer.example.invalid/dqa','auth_mode':'BEARER_TOKEN','credential_ref':'DQA_SIGNATURE_PORT_TOKEN','certificate_ref':'lab-signer-01','timeout_seconds':8,'timestamp_mode':'PROVIDER_MANAGED','allow_checks':True}
def get(t=T):return f"SELECT dqa_business.digital_signature_port_settings('{t}')"
def save(c=None,rev=0,mid=MAN,t=T):return f"SELECT dqa_business.save_digital_signature_port('{t}','{mid}',{literal(config if c is None else c)},{rev})"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_default_has_no_endpoint_or_signing(self):self.ok(auth(1)+get()+"->>'configured'",'false')
 def test_admin_saves_real_database_config(self):self.ok(auth(1)+save()+"->>'revision'",'1')
 def test_same_configuration_is_idempotent(self):self.ok(auth(1)+save()+';'+save(rev=1)+"->>'revision'",'1')
 def test_updated_configuration_advances_revision(self):self.ok(auth(1)+save()+';'+save({**config,'name':'新版端口'},1)+"->>'revision'",'2')
 def test_stale_revision_is_rejected(self):self.deny(auth(1)+save()+';'+save(),'REVISION_CONFLICT')
 def test_scope_member_cannot_be_swapped(self):self.deny(auth(1)+save(mid=OWN),'SIGNATURE_PORT_ADMIN_REQUIRED')
 def test_nonadmin_cannot_read_port_or_credential_reference(self):self.deny(auth(2)+get(),'SIGNATURE_PORT_ADMIN_REQUIRED')
 def test_nonadmin_cannot_save(self):self.deny(auth(2)+save(mid=OWN),'SIGNATURE_PORT_ADMIN_REQUIRED')
 def test_foreign_tenant_cannot_read(self):self.deny(auth(1)+get('b0000000-0000-0000-0000-000000000001'),'SIGNATURE_PORT_ADMIN_REQUIRED')
 def test_foreign_tenant_cannot_write(self):self.deny(auth(1)+save(t='b0000000-0000-0000-0000-000000000001'),'SIGNATURE_PORT_ADMIN_REQUIRED')
 def test_anonymous_cannot_execute(self):self.deny('RESET ROLE;SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_raw_credentials_and_keys_are_not_accepted(self):
  for extra in [{'private_key':'SYNTHETIC_NOT_A_KEY'},{'token':'SYNTHETIC'},{'certificate_bytes':'SYNTHETIC'}]:self.deny(auth(1)+save({**config,**extra}),'SIGNATURE_PORT_FIELDS_INVALID')
 def test_secret_variable_names_outside_namespace_rejected(self):self.deny(auth(1)+save({**config,'credential_ref':'BUSINESS_MAIL_SMTP_PASSWORD'}),'SIGNATURE_PORT_FIELDS_INVALID')
 def test_plain_http_and_query_credentials_rejected(self):
  for url in ['http://signer.example.invalid','https://user:password@signer.example.invalid','https://signer.example.invalid/?token=secret']:self.deny(auth(1)+save({**config,'base_url':url}),'SIGNATURE_PORT_FIELDS_INVALID')
 def test_no_certificate_signing_readiness_from_config(self):self.ok(auth(1)+save()+"->>'digital_ready'",'false')
 def test_saving_port_does_not_unlock_method(self):self.deny(auth(1)+save()+f";SELECT dqa_business.save_signature_method_settings('{T}','DIGITAL',0)",'SIGNATURE_DIGITAL_NOT_CONFIGURED')
 def test_pdf_targets_come_from_authorized_report_versions(self):self.ok(archived()+auth(1)+f"SELECT jsonb_array_length(dqa_business.digital_signature_verification_targets('{T}'))",'1')
 def test_settings_audit_records_configuration_changes(self):self.ok(auth(1)+save()+';'+save({**config,'name':'新端口'},1)+f";RESET ROLE;SELECT count(*) FROM dqa_business.audit_events WHERE table_name='settings' AND record_id=(SELECT id FROM dqa_business.settings WHERE tenant_id='{T}' AND module='digital_signature_port')",'2')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
