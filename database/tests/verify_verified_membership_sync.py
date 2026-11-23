"""Verified-email binding regression; synthetic transactions always roll back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_account_mail.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
VERIFY=f"RESET ROLE;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"
INVITE=auth()+f"SELECT dqa_business.request_account_invitation('{T}','{MID}',1,'{MOP2}');"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_resend_after_email_verification_links_and_skips_mail(self):self.ok(seed+VERIFY+INVITE+f"RESET ROLE;SELECT auth_user_id='{NU}',revision,role_id='{RID}',enabled,(SELECT count(*) FROM dqa_private.account_invitations WHERE member_id='{MID}') FROM dqa_business.memberships WHERE id='{MID}'",'t|2|t|t|1')
 def test_directory_and_skip_message_agree(self):self.ok(seed+VERIFY+INVITE+f"SELECT m->>'activation',dqa_business.access_result_with_invitation('{T}','{MOP2}')->'invitation'->>'state' FROM jsonb_array_elements(dqa_business.access_directory_with_invitations('{T}')->'members') m WHERE m->>'id'='{MID}'",'ACTIVE|SKIPPED_VERIFIED')
 def test_request_replay_never_rebinds_or_bumps_revision(self):self.ok(seed+VERIFY+INVITE+INVITE+f"RESET ROLE;SELECT revision FROM dqa_business.memberships WHERE id='{MID}'",'2')
 def test_bound_verified_save_and_skip_does_not_bump_extra_revision(self):self.ok(VERIFY+seed+save('member',MID,1,member(name='Saved name'),op=MOP2).replace('save_workspace_access','save_access_with_invitation')+f"SELECT revision FROM dqa_business.memberships WHERE id='{MID}'",'2')
 def test_save_after_later_verification_returns_actual_revision(self):self.ok(seed+VERIFY+auth()+save('member',MID,1,member(name='Saved name'),op=MOP2).replace('save_workspace_access','save_access_with_invitation')+f"SELECT (dqa_business.access_result_with_invitation('{T}','{MOP2}')->>'revision')::bigint=revision,revision,auth_user_id='{NU}' FROM dqa_business.memberships WHERE id='{MID}'",'t|3|t')
 def test_unverified_identity_never_bound(self):self.ok(seed+f"RESET ROLE;INSERT INTO auth.users(id,email) VALUES('{NU}','pending@example.invalid');"+INVITE+f"RESET ROLE;SELECT auth_user_id IS NULL,revision FROM dqa_business.memberships WHERE id='{MID}'",'t|1')
 def test_disabled_member_stays_disabled_unbound(self):self.ok(seed+VERIFY+auth()+save('member',MID,1,member(enabled=False),op=MOP2).replace('save_workspace_access','save_access_with_invitation')+f"SELECT auth_user_id IS NULL,enabled FROM dqa_business.memberships WHERE id='{MID}'",'t|f')
 def test_member_cannot_link_self_without_admin_operation(self):self.deny(seed+VERIFY+auth(NU)+f"SELECT dqa_business.request_account_invitation('{T}','{MID}',1,'{MOP2}')",'ACCESS_ADMIN_REQUIRED')
 def test_private_link_path_not_callable_by_browser(self):self.deny(seed+VERIFY+auth()+f"SELECT dqa_private.queue_account_invitation('{T}','{MID}','{MOP2}',true)",'permission denied')
 def test_wrong_tenant_cannot_link(self):self.deny(seed+VERIFY+auth()+f"SELECT dqa_business.request_account_invitation('b0000000-0000-0000-0000-000000000001','{MID}',1,'{MOP2}')",'ACCESS_ADMIN_REQUIRED')
 def test_other_verified_email_does_not_link(self):self.ok(seed+VERIFY.replace('pending@example.invalid','other@example.invalid')+INVITE+f"RESET ROLE;SELECT auth_user_id IS NULL FROM dqa_business.memberships WHERE id='{MID}'",'t')
 def test_auth_verification_is_never_changed(self):self.ok(seed+VERIFY+INVITE+f"RESET ROLE;SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id='{NU}'",'t')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
