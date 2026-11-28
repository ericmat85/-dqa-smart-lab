"""Two-tenant UI color integration tests on an isolated local DB; no cloud DSN."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
B='b0000000-0000-0000-0000-000000000001'
D=dict(tabBarColor='#142D48',tableHeaderColor='#D2DCE8')
def get(t=T):return f"SELECT dqa_business.workspace_appearance('{t}')"
def put(d=None,rev=0,t=T):return f"SELECT dqa_business.save_workspace_appearance('{t}','{json.dumps(D if d is None else d).replace(chr(39),chr(39)*2)}'::jsonb,{rev})"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_default_does_not_seed_settings(self):self.ok(auth()+get()+f";RESET ROLE;SELECT count(*) FROM dqa_business.settings WHERE tenant_id='{T}' AND module='workspace_appearance_v1'",'0')
 def test_default_neutral_header(self):self.ok(auth()+get()+"->'configuration'->>'tableHeaderColor'",'#D2DCE8')
 def test_read_save_reauthenticate(self):self.ok(auth()+put()+';RESET ROLE;RESET request.jwt.claim.sub;'+auth()+get()+"->'configuration'->>'tabBarColor'",'#142D48')
 def test_other_workspace_stays_default(self):self.ok(auth()+put()+';RESET ROLE;'+auth('20000000-0000-0000-0000-000000000001')+get(B)+"->>'revision'",'0')
 def test_cross_tenant_read(self):self.deny(auth()+get(B),'WORKSPACE_APPEARANCE_ACCESS_DENIED')
 def test_cross_tenant_write(self):self.deny(auth()+put(t=B),'WORKSPACE_APPEARANCE_ACCESS_DENIED')
 def test_member_read(self):self.ok(auth('10000000-0000-0000-0000-000000000002')+get()+"->>'can_manage'",'false')
 def test_member_write(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+put(),'WORKSPACE_APPEARANCE_ACCESS_DENIED')
 def test_anon(self):self.deny('SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_stale_revision(self):self.deny(auth()+put()+';'+put(),'REVISION_CONFLICT')
 def test_same_value_normalized_without_revision_churn(self):self.ok(auth()+put()+';'+put({**D,'tabBarColor':'#142d48'},1)+"->>'revision'",'1')
 def test_update(self):self.ok(auth()+put()+';'+put({**D,'tableHeaderColor':'#D9DDE2'},1)+"->>'revision'",'2')
 def test_invalid_fields(self):
  for d in [{**D,'token':'bad'},{'tabBarColor':'#123456'},{**D,'tableHeaderColor':None},{**D,'tabBarColor':'#FFF'},{**D,'tableHeaderColor':'red'},{**D,'tableHeaderColor':'url(x)'}]:self.deny(auth()+put(d),'WORKSPACE_APPEARANCE_FIELDS_INVALID')
 def test_invalid_revision(self):self.deny(auth()+put(rev=-1),'WORKSPACE_APPEARANCE_FIELDS_INVALID')
 def test_no_direct_write(self):self.deny(auth()+f"UPDATE dqa_business.settings SET configuration='{{}}' WHERE tenant_id='{T}'",'permission denied')
 def test_existing_settings_not_modified(self):self.ok(f"SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) h INTO TEMP TABLE old_settings FROM dqa_business.settings s;"+auth()+put()+";RESET ROLE;SELECT (SELECT h FROM old_settings)=md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM dqa_business.settings s WHERE module<>'workspace_appearance_v1'",'t')
 def test_audit_records_one_change(self):self.ok(auth()+put()+f";RESET ROLE;SELECT count(*) FROM dqa_business.audit_events WHERE table_name='settings' AND record_id=(SELECT id FROM dqa_business.settings WHERE tenant_id='{T}' AND module='workspace_appearance_v1')",'1')
 def test_committed_persistence_across_connections(self):
  try:
   r=subprocess.run(cmd,input='BEGIN;'+auth()+put()+';COMMIT;',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr);self.ok(auth()+get()+"->>'revision'",'1')
  finally:
   r=subprocess.run(cmd,input=f"DELETE FROM dqa_business.settings WHERE tenant_id='{T}' AND module='workspace_appearance_v1';",text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr)
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
