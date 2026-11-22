"""Account/email intent contract; all synthetic mutations roll back locally."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
MOP='ef000000-0000-4000-8000-000000000005';MOP2='ef000000-0000-4000-8000-000000000006'
mailmember=newmember.replace('save_workspace_access','save_access_with_invitation')
seed=auth()+newrole+mailmember
svc='RESET ROLE;SET LOCAL ROLE service_role;'
claim=lambda op=MOP:f"SELECT dqa_business.claim_account_invitation('{T}','{op}','{U}')->>'state';"
on='RESET ROLE;UPDATE dqa_private.account_mail_policy SET enabled=true;'
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-2400:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_save_commits_mail_intent(self):self.ok(seed+f"SELECT dqa_business.access_result_with_invitation('{T}','{MOP}')->'invitation'->>'state'",'NOT_CONFIGURED')
 def test_service_blocked_before_smtp_ready(self):self.ok(seed+svc+claim(),'NOT_CONFIGURED')
 def test_claim_only_once_even_after_timeout(self):self.ok(seed+on+svc+claim()+claim(),'UNKNOWN')
 def test_first_dispatch_grant_has_db_recipient(self):self.ok(seed+on+svc+f"SELECT dqa_business.claim_account_invitation('{T}','{MOP}','{U}')->>'email'",'pending@example.invalid')
 def test_browser_cannot_claim_or_forge_receipt(self):self.deny(seed+claim(),'permission denied')
 def test_browser_cannot_finish(self):self.deny(seed+f"SELECT dqa_business.finish_account_invitation('{T}','{MOP}',gen_random_uuid(),'SENT','ACCEPTED')",'permission denied')
 def test_nonadmin_cannot_request_email(self):self.deny(seed+auth('10000000-0000-0000-0000-000000000002')+f"SELECT dqa_business.request_account_invitation('{T}','{MID}',1,'{MOP2}')",'ACCESS_ADMIN_REQUIRED')
 def test_private_mail_not_readable(self):self.deny(seed+'SELECT * FROM dqa_private.account_invitations','permission denied')
 def test_no_member_write_on_bad_revision(self):self.deny(seed+save('member',MID,99,member(),op=MOP2).replace('save_workspace_access','save_access_with_invitation'),'REVISION_CONFLICT')
 def test_normal_pending_edits_do_not_duplicate_mail(self):self.ok(seed+save('member',MID,1,member(name='New label'),op=MOP2).replace('save_workspace_access','save_access_with_invitation')+f"RESET ROLE;SELECT count(*) FROM dqa_private.account_invitations WHERE tenant_id='{T}' AND member_id='{MID}'",'1')
 def test_operation_replay_does_not_duplicate_mail(self):self.ok(seed+mailmember+f"RESET ROLE;SELECT count(*) FROM dqa_private.account_invitations WHERE tenant_id='{T}' AND member_id='{MID}'",'1')
 def test_disabled_member_not_sent(self):self.ok(seed+save('member',MID,1,member(enabled=False),op=MOP2)+on+svc+claim(),'SKIPPED_DISABLED')
 def test_new_verified_identity_skips_send(self):self.ok(seed+f"RESET ROLE;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"+on+svc+claim(),'SKIPPED_VERIFIED')
 def test_verified_member_never_queues(self):self.ok(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"+seed+f"SELECT dqa_business.access_result_with_invitation('{T}','{MOP}')->'invitation'->>'state'",'SKIPPED_VERIFIED')
 def test_cancelled_operation_stays_blocked(self):self.deny(auth()+f"SELECT dqa_business.resolve_access_operation('{T}','{OP}');"+newrole.replace('save_workspace_access','save_access_with_invitation'),'ACCESS_OPERATION_CONFLICT')
 def test_other_actor_cannot_claim(self):self.deny(seed+on+svc+f"SELECT dqa_business.claim_account_invitation('{T}','{MOP}','10000000-0000-0000-0000-000000000002')",'ACCESS_ADMIN_REQUIRED')
 def test_finish_fences_dispatch_id(self):self.ok(seed+on+svc+claim()+f"SELECT dqa_business.finish_account_invitation('{T}','{MOP}',gen_random_uuid(),'SENT','ACCEPTED')->>'state'",'UNKNOWN')
 def test_directory_and_recovery_return_current_mail_receipt(self):
  self.ok(seed+on+svc+claim()+f"RESET ROLE;SELECT dqa_business.finish_account_invitation('{T}','{MOP}',(SELECT dispatch_id FROM dqa_private.account_invitations WHERE id='{MOP}'),'SENT','ACCEPTED');"+auth()+f"SELECT dqa_business.access_result_with_invitation('{T}','{MOP}')->'invitation'->>'state'",'SENT')
 def test_test_sender_blocks_other_inboxes_without_dispatch(self):self.ok(seed+on+"RESET ROLE;UPDATE dqa_private.account_mail_policy SET sender_mode='TEST_ONLY',test_recipient_email='registered@example.invalid';"+svc+claim(),'REQUIRES_VERIFIED_SENDER')
 def test_test_sender_accepts_only_configured_test_inbox(self):self.ok(seed+on+"RESET ROLE;UPDATE dqa_private.account_mail_policy SET sender_mode='TEST_ONLY',test_recipient_email='pending@example.invalid';"+svc+claim(),'DISPATCH_GRANTED')
 def test_sender_domain_upgrade_releases_the_existing_queue(self):self.ok(seed+on+"RESET ROLE;UPDATE dqa_private.account_mail_policy SET sender_mode='TEST_ONLY',test_recipient_email='registered@example.invalid';"+svc+claim()+"RESET ROLE;UPDATE dqa_private.account_mail_policy SET sender_mode='CUSTOM_DOMAIN';"+svc+claim(),'DISPATCH_GRANTED')

r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
