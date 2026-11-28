"""Header palette, legacy client compatibility and tenant/revision guards; isolated DB only."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
D=dict(tabBarColor='#142D48',tableHeaderColor='#D2DCE8',headerColor='#AABBCC')
def get(t=T):return f"SELECT dqa_business.workspace_appearance_v2('{t}')"
def put(d=None,rev=0,t=T):return f"SELECT dqa_business.save_workspace_appearance_v2('{t}','{json.dumps(D if d is None else d)}'::jsonb,{rev})"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_default_without_seed(self):self.ok(auth()+get()+"->'configuration'->>'headerColor'",'#DCE7F1')
 def test_save_header(self):self.ok(auth()+put()+";"+get()+"->'configuration'->>'headerColor'",'#AABBCC')
 def test_legacy_packet_contains_two_keys(self):self.ok(auth()+put()+f";SELECT count(*) FROM jsonb_object_keys(dqa_business.workspace_appearance('{T}')->'configuration')",'2')
 def test_legacy_write_preserves_header(self):self.ok(auth()+put()+f";SELECT dqa_business.save_workspace_appearance('{T}','{{\"tabBarColor\":\"#112233\",\"tableHeaderColor\":\"#D2DCE8\"}}',1);"+get()+"->'configuration'->>'headerColor'",'#AABBCC')
 def test_legacy_same_value_does_not_churn(self):self.ok(auth()+put()+f";SELECT dqa_business.save_workspace_appearance('{T}','{{\"tabBarColor\":\"#142D48\",\"tableHeaderColor\":\"#D2DCE8\"}}',1)->>'revision'",'1')
 def test_upgrade_legacy(self):self.ok(auth()+f"SELECT dqa_business.save_workspace_appearance('{T}','{{\"tabBarColor\":\"#112233\",\"tableHeaderColor\":\"#D2DCE8\"}}',0);"+get()+"->'configuration'->>'headerColor'",'#DCE7F1')
 def test_same_value(self):self.ok(auth()+put()+';'+put(rev=1)+"->>'revision'",'1')
 def test_revision_conflict(self):self.deny(auth()+put()+';'+put(),'REVISION_CONFLICT')
 def test_member_read_only(self):self.ok(auth('10000000-0000-0000-0000-000000000002')+get()+"->>'can_manage'",'false');self.deny(auth('10000000-0000-0000-0000-000000000002')+put(),'WORKSPACE_APPEARANCE_ACCESS_DENIED')
 def test_tenant_isolation(self):self.deny(auth()+get('b0000000-0000-0000-0000-000000000001'),'WORKSPACE_APPEARANCE_ACCESS_DENIED');self.deny(auth()+put(t='b0000000-0000-0000-0000-000000000001'),'WORKSPACE_APPEARANCE_ACCESS_DENIED')
 def test_invalid_colors(self):
  for d in [{**D,'headerColor':'url(x)'},{**D,'headerColor':None},{**D,'headerColor':'#FFF'},{k:v for k,v in D.items() if k!='headerColor'},{**D,'extra':'#123456'}]:self.deny(auth()+put(d),'WORKSPACE_APPEARANCE_FIELDS_INVALID')
 def test_anon_denied(self):self.deny('SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_other_settings_unchanged(self):self.ok("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) h INTO TEMP TABLE old_settings FROM dqa_business.settings s WHERE module<>'workspace_appearance_v1';"+auth()+put()+";RESET ROLE;SELECT (SELECT h FROM old_settings)=md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM dqa_business.settings s WHERE module<>'workspace_appearance_v1'",'t')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
