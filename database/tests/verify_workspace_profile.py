"""Local two-tenant profile tests. Mutations rollback, no mail/provider calls."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
B='b0000000-0000-0000-0000-000000000001'
D=dict(workspaceName='Synthetic workspace',dateFormat='YYYY/MM/DD',timeZone='Asia/Taipei',labName='Synthetic lab',address='',phone='',email='',website='',identifier='',qualityLead='',technicalLead='')
def get(t=T):return f"SELECT dqa_business.workspace_profile('{t}')"
def put(d=None,rev=0,t=T):return f"SELECT dqa_business.save_workspace_profile('{t}','{json.dumps(D if d is None else d)}'::jsonb,{rev})"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_committed_profile_survives_new_database_connection(self):
  try:
   r=subprocess.run(cmd,input='BEGIN;'+auth()+put()+';COMMIT;',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr)
   self.ok(auth()+get()+"->'configuration'->>'labName'",'Synthetic lab')
  finally:
   cleanup=subprocess.run(cmd,input=f"DELETE FROM dqa_business.settings WHERE tenant_id='{T}' AND module='workspace_profile_v1';",text=True,capture_output=True,env=env);self.assertEqual(cleanup.returncode,0,cleanup.stderr)
 def test_default_no_seed_write(self):self.ok(auth()+get()+"->>'revision'",'0')
 def test_default_uses_existing_tenant(self):self.ok(auth()+get()+f"->'configuration'->>'workspaceName'=(SELECT name FROM dqa_business.tenants WHERE id='{T}')",'t')
 def test_save_and_reauthenticated_read(self):self.ok(auth()+put()+";RESET ROLE;RESET request.jwt.claim.sub;"+auth()+get()+"->'configuration'->>'labName'",'Synthetic lab')
 def test_other_workspace_stays_default(self):self.ok(auth()+put()+';RESET ROLE;'+auth('20000000-0000-0000-0000-000000000001')+get(B)+"->>'revision'",'0')
 def test_cross_tenant_read(self):self.deny(auth()+get(B),'WORKSPACE_PROFILE_ACCESS_DENIED')
 def test_cross_tenant_write(self):self.deny(auth()+put(t=B),'WORKSPACE_PROFILE_ACCESS_DENIED')
 def test_member_read(self):self.ok(auth('10000000-0000-0000-0000-000000000002')+get()+"->>'can_manage'",'false')
 def test_member_write(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+put(),'WORKSPACE_PROFILE_ACCESS_DENIED')
 def test_anon(self):self.deny('SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_stale_revision(self):self.deny(auth()+put()+';'+put(),'REVISION_CONFLICT')
 def test_same_value_no_revision_churn(self):self.ok(auth()+put()+';'+put(rev=1)+"->>'revision'",'1')
 def test_update(self):self.ok(auth()+put()+';'+put({**D,'labName':'Changed'},1)+"->>'revision'",'2')
 def test_invalid_fields(self):
  for d in [{**D,'token':'bad'},{**D,'dateFormat':'wrong'},{**D,'timeZone':'Mars'},{**D,'labName':None},{**D,'website':'javascript:x'},{**D,'workspaceName':''}]:self.deny(auth()+put(d),'WORKSPACE_PROFILE_FIELDS_INVALID')
 def test_no_direct_write(self):self.deny(auth()+f"UPDATE dqa_business.settings SET configuration='{{}}' WHERE tenant_id='{T}'",'permission denied')
 def test_minimal_audit(self):self.ok(auth()+put()+f";RESET ROLE;SELECT count(*) FROM dqa_business.audit_events WHERE table_name='settings' AND record_id=(SELECT id FROM dqa_business.settings WHERE tenant_id='{T}' AND module='workspace_profile_v1')",'1')
 def test_tenant_clock_unchanged(self):self.ok(auth()+put({**D,'timeZone':'UTC'})+f";SELECT timezone FROM dqa_business.tenants WHERE id='{T}'",'Asia/Taipei')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True,'rollback_tests':16,'committed_persistence_tests':1,'synthetic_profile_cleaned_up':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
