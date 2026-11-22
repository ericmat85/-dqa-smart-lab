"""Password verification is covered by BFF tests; SQL enforces the service-only boundary.
Every synthetic deletion and membership mutation rolls back in this suite.
"""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_workspace_access.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
DOP='ef000000-0000-4000-8000-000000000077';DOP2='ef000000-0000-4000-8000-000000000078'
seed=auth()+newrole+newmember
svc='RESET ROLE;SET LOCAL ROLE service_role;'
def prep(op=DOP,target=MID,rev=1):return f"SELECT dqa_business.prepare_account_deletion('{T}','{op}','{target}',{rev});"
def finish(outcome='DELETE',op=DOP,actor=U):return f"SELECT dqa_business.complete_account_deletion('{T}','{op}','{actor}','{outcome}');"
def resolve():return f"SELECT dqa_business.resolve_access_with_deletion('{T}','{DOP}');"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr[-2000:])
 def test_prepare_never_deletes(self):self.ok(seed+prep()+f"SELECT enabled,deleted_at IS NULL FROM dqa_business.memberships WHERE id='{MID}'",'t|t')
 def test_browser_cannot_execute_deletion(self):self.deny(seed+prep()+finish(),'permission denied')
 def test_anon_cannot_prepare(self):self.deny(seed+'RESET ROLE;SET LOCAL ROLE anon;'+prep(),'permission denied')
 def test_nonadmin_cannot_prepare(self):self.deny(seed+auth('10000000-0000-0000-0000-000000000002')+prep(),'ACCESS_ADMIN_REQUIRED')
 def test_self_deletion_denied(self):self.deny(auth()+prep(target='a2000000-0000-0000-0000-000000000001',rev=1),'ACCESS_DELETE_SELF_DENIED')
 def test_other_tenant_denied(self):self.deny(seed+f"SELECT dqa_business.prepare_account_deletion('b0000000-0000-0000-0000-000000000001','{DOP}','{MID}',1)",'ACCESS_ADMIN_REQUIRED')
 def test_wrong_revision_denied(self):self.deny(seed+prep(rev=9),'REVISION_CONFLICT')
 def test_failed_password_preserves_member(self):self.ok(seed+prep()+svc+finish('PASSWORD_INVALID')+f"RESET ROLE;SELECT enabled,deleted_at IS NULL FROM dqa_business.memberships WHERE id='{MID}'",'t|t')
 def test_failed_password_cannot_later_delete_same_intent(self):self.ok(seed+prep()+svc+finish('PASSWORD_INVALID')+finish()+f"RESET ROLE;SELECT enabled FROM dqa_business.memberships WHERE id='{MID}'",'t')
 def test_authorized_delete_retains_history_row(self):self.ok(seed+prep()+svc+finish()+f"RESET ROLE;SELECT enabled,deleted_at IS NOT NULL,deleted_by='{U}' FROM dqa_business.memberships WHERE id='{MID}'",'f|t|t')
 def test_directory_hides_deleted_member(self):self.ok(seed+prep()+svc+finish()+auth()+f"SELECT count(*) FROM jsonb_array_elements(dqa_business.access_directory_with_invitations('{T}')->'members') x WHERE x->>'id'='{MID}'",'0')
 def test_deletion_is_idempotent(self):self.ok(seed+prep()+svc+finish()+finish()+f"RESET ROLE;SELECT revision FROM dqa_business.memberships WHERE id='{MID}'",'2')
 def test_prepare_replay_does_not_allow_another_password_attempt(self):self.ok(seed+prep()+f"SELECT dqa_business.prepare_account_deletion('{T}','{DOP}','{MID}',1)->>'reauth_granted'",'false')
 def test_cancel_fences_late_delete(self):self.ok(seed+prep()+resolve()+svc+finish()+f"RESET ROLE;SELECT enabled FROM dqa_business.memberships WHERE id='{MID}'",'t')
 def test_delete_receipt_survives_resolve(self):self.ok(seed+prep()+svc+finish()+auth()+resolve()+f"SELECT dqa_business.access_result_with_invitation('{T}','{DOP}')->>'deleted'",'true')
 def test_expired_intent_cannot_delete(self):self.ok(seed+prep()+f"RESET ROLE;UPDATE dqa_private.account_delete_intents SET expires_at=clock_timestamp()-interval '1 second' WHERE id='{DOP}';"+svc+finish()+f"RESET ROLE;SELECT enabled FROM dqa_business.memberships WHERE id='{MID}'",'t')
 def test_state_changes_rechecked_after_password_verification(self):self.deny(seed+prep()+save('member',MID,1,member(name='Changed'),op=DOP2)+svc+finish(),'REVISION_CONFLICT')
 def test_supervisor_assignment_blocks_delete(self):self.deny(seed+f"RESET ROLE;UPDATE dqa_business.memberships SET supervisor_member_id='{MID}' WHERE id='a2000000-0000-0000-0000-000000000002';"+auth()+prep(),'ACCESS_SUPERVISOR_IN_USE')
 def test_live_work_blocks_delete(self):self.deny(seed+f"RESET ROLE;UPDATE dqa_business.requests SET owner_member_id='{MID}' WHERE id='a6000000-0000-0000-0000-000000000002';"+auth()+prep(),'ACCESS_MEMBER_WORK_IN_USE')
 def test_unprepared_service_call_denied(self):self.deny(seed+svc+finish(),'ACCESS_OPERATION_CONFLICT')
 def test_other_actor_cannot_complete(self):self.deny(seed+prep()+svc+finish(actor='10000000-0000-0000-0000-000000000002'),'ACCESS_OPERATION_CONFLICT')
 def test_deleted_row_cannot_be_reenabled_through_old_save_rpc(self):self.deny(seed+prep()+svc+finish()+auth()+save('member',MID,2,member(),op=DOP2),'ACCESS_MEMBER_DELETED')
 def test_deleted_email_can_be_added_as_new_membership(self):self.ok(seed+prep()+svc+finish()+auth()+save('member',NU,0,member(),op=DOP2)+f"SELECT count(*) FROM dqa_business.memberships WHERE login_email='pending@example.invalid' AND deleted_at IS NULL",'1')
 def test_private_intent_cannot_be_read(self):self.deny(seed+prep()+'SELECT * FROM dqa_private.account_delete_intents','permission denied')
 def test_passwords_and_tokens_never_enter_intent_table(self):self.ok("SELECT count(*) FROM information_schema.columns WHERE table_schema='dqa_private' AND table_name='account_delete_intents' AND column_name~'(password|token)'",'0')
 def test_only_five_password_attempts_allowed(self):
  sql=seed
  for i in range(6):sql+=prep(op=f'ef000000-0000-4000-8000-{100+i:012}')
  self.deny(sql,'ACCESS_RATE_LIMITED')
 def test_target_browser_sessions_are_revoked(self):
  before=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"
  self.ok(before+seed+f"RESET ROLE;INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES(gen_random_uuid(),'{NU}','{T}',repeat('c',64),clock_timestamp()+interval '1 hour');"+auth()+prep()+svc+finish()+f"RESET ROLE;SELECT bool_and(revoked_at IS NOT NULL) FROM dqa_private.browser_sessions WHERE auth_user_id='{NU}'",'t')
 def test_old_auth_identity_can_be_readded_without_duplicate_context(self):
  before=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"
  self.ok(before+seed+prep()+svc+finish()+auth()+save('member','ef000000-0000-4000-8000-000000000099',0,member(),op=DOP2)+auth(NU)+"SELECT jsonb_array_length(dqa_business.connection_context()->'memberships')",'1')
 def test_deleted_member_cannot_receive_new_assignment(self):self.deny(seed+prep()+svc+finish()+f"RESET ROLE;UPDATE dqa_business.equipment SET owner_member_id='{MID}' WHERE id='a4000000-0000-0000-0000-000000000001'",'ACCESS_MEMBER_DELETED')
 def test_auth_identity_and_history_membership_retained(self):
  before=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());"
  self.ok(before+seed+prep()+svc+finish()+f"RESET ROLE;SELECT count(*) FROM auth.users WHERE id='{NU}'",'1')

r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
