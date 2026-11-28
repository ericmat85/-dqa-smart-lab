"""Isolated two-tenant private image persistence, permissions and revision checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
B='b0000000-0000-0000-0000-000000000001';U2='10000000-0000-0000-0000-000000000002'
def get(t=T):return f"SELECT dqa_business.workspace_images('{t}')"
def put(kind='avatar',image=PNG,name='image.png',rev=0,t=T):return f"SELECT dqa_business.save_workspace_image('{t}',{sqltext(kind)},{sqltext(image)},{sqltext(name)},{rev})"
def sqltext(v):return 'NULL'if v is None else "'"+v.replace("'","''")+"'"
class Tests(unittest.TestCase):
 def ok(self,q,want):
  r=run(q);self.assertEqual(r.returncode,0,r.stderr[-2000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],want)
 def deny(self,q,code):
  r=run(q);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_default_no_seed(self):self.ok(auth()+get()+f";RESET ROLE;SELECT count(*) FROM dqa_private.ui_images WHERE tenant_id='{T}'",'0')
 def test_activated_member_can_save_own_avatar(self):self.ok(auth(U2)+put()+"->'images'->'avatar'->>'revision'",'1')
 def test_activated_member_can_save_own_signature(self):self.ok(auth(U2)+put('signature')+"->'images'->'signature'->>'image'",PNG)
 def test_member_cannot_change_logo(self):self.deny(auth(U2)+put('logo'),'WORKSPACE_IMAGE_ACCESS_DENIED')
 def test_admin_logo_shared_to_member(self):self.ok(auth()+put('logo')+';RESET ROLE;'+auth(U2)+get()+"->'images'->'logo'->>'image'",PNG)
 def test_admin_cannot_read_other_member_image(self):self.ok(auth(U2)+put('signature')+';RESET ROLE;'+auth()+get()+"->'images'->'signature'->>'revision'",'0')
 def test_same_tenant_personal_isolation(self):self.ok(auth()+put()+';RESET ROLE;'+auth(U2)+get()+"->'images'->'avatar'->>'revision'",'0')
 def test_cross_tenant_read(self):self.deny(auth()+get(B),'WORKSPACE_IMAGE_ACCESS_DENIED')
 def test_cross_tenant_write(self):self.deny(auth()+put(t=B),'WORKSPACE_IMAGE_ACCESS_DENIED')
 def test_other_tenant_defaults(self):self.ok(auth()+put('logo')+';RESET ROLE;'+auth('20000000-0000-0000-0000-000000000001')+get(B)+"->'images'->'logo'->>'revision'",'0')
 def test_anon_execute_denied(self):self.deny('SET LOCAL ROLE anon;'+get(),'permission denied')
 def test_direct_table_read_denied(self):self.deny(auth()+"SELECT * FROM dqa_private.ui_images",'permission denied')
 def test_direct_table_write_denied(self):self.deny(auth()+"DELETE FROM dqa_private.ui_images",'permission denied')
 def test_revision_conflict(self):self.deny(auth()+put()+';'+put(),'REVISION_CONFLICT')
 def test_same_image_no_revision_churn(self):self.ok(auth()+put()+';'+put(rev=1)+"->'images'->'avatar'->>'revision'",'1')
 def test_remove_keeps_revision(self):self.ok(auth()+put()+';'+put(image=None,name='',rev=1)+"->'images'->'avatar'->>'revision'",'2');self.deny(auth()+put()+';'+put(image=None,name='',rev=1)+';'+put(),'REVISION_CONFLICT')
 def test_invalid_images(self):
  for image in ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AA==',PNG+'!',PNG+'\n','https://invalid.example/logo.png'] :self.deny(auth()+put(image=image),'WORKSPACE_IMAGE_INVALID')
 def test_invalid_name_kind_revision(self):
  for q in [put(kind='anything'),put(name='../photo.png'),put(rev=-1),put(kind=None),put(image=None,name='wrong.png')]:self.deny(auth()+q,'WORKSPACE_IMAGE_INVALID')
 def test_disabled_account_denied(self):self.deny(f"UPDATE dqa_business.memberships SET enabled=false WHERE auth_user_id='{U2}';"+auth(U2)+get(),'WORKSPACE_IMAGE_ACCESS_DENIED')
 def test_audit_has_metadata_only(self):self.ok(auth()+put()+";RESET ROLE;SELECT count(*) FROM dqa_business.audit_events WHERE table_name='ui_images' AND 'image_data'=ANY(changed_columns)",'1')
 def test_persist_across_connections(self):
  try:
   r=subprocess.run(cmd,input='BEGIN;'+auth()+put()+';COMMIT;',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr);self.ok(auth()+get()+"->'images'->'avatar'->>'image'",PNG)
  finally:
   r=subprocess.run(cmd,input=f"DELETE FROM dqa_private.ui_images WHERE tenant_id='{T}';",text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr)
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True},indent=2));raise SystemExit(not r.wasSuccessful())
