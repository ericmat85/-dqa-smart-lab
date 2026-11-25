"""Destructive command tests run only on isolated synthetic PostgreSQL; every case rolls back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_virtual_request_execution.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
def preview(action='CLEANUP',who=1):return 'RESET ROLE;'+auth(who)+f"SELECT set_config('test.command',dqa_business.preview_assistant_command('{T}','{action}')::text,true);"
def cleanup():return f"SELECT dqa_business.execute_assistant_cleanup('{T}',(current_setting('test.command')::jsonb->>'id')::uuid,current_setting('test.command')::jsonb->>'fingerprint','刪除所有虛擬委託');"
def prepare():return f"SELECT dqa_business.prepare_assistant_restart('{T}',(current_setting('test.command')::jsonb->>'id')::uuid,current_setting('test.command')::jsonb->>'fingerprint','初始化系統');"
def reset(outcome='DELETE'):return f"RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.command')::jsonb->>'id')::uuid,'{uid(1)}','{outcome}');RESET ROLE;"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2600:])
 def test_query_is_deduplicated_across_native_stages(self):self.ok(received()+advance()+f"RESET ROLE;{auth(1)}SELECT dqa_business.assistant_virtual_requests('{T}')->>'total',dqa_business.assistant_virtual_requests('{T}')->>'running'",'1|1')
 def test_nonadmin_query_respects_request_visibility(self):self.ok(f"RESET ROLE;UPDATE dqa_business.roles SET permissions=array_remove(permissions,'requests.read_all') WHERE id='a1000000-0000-0000-0000-000000000003';{auth(3)}SELECT dqa_business.assistant_virtual_requests('{T}')->>'scope'",'PERMITTED_REQUESTS')
 def test_anonymous_query_denied(self):self.deny(f"RESET ROLE;SET LOCAL ROLE anon;SELECT dqa_business.assistant_virtual_requests('{T}')",'permission denied')
 def test_foreign_tenant_query_denied(self):self.deny(f"RESET ROLE;{auth(1)}SELECT dqa_business.assistant_virtual_requests('b0000000-0000-0000-0000-000000000001')",'COMMAND_ACCESS_DENIED')
 def test_preview_does_not_delete(self):self.ok(preview()+f"RESET ROLE;SELECT count(*) FROM dqa_business.requests WHERE id='{REQ}'",'1')
 def test_cleanup_running_virtual_preserves_real_and_other_tenant(self):self.ok(received()+advance()+preview()+cleanup()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.requests WHERE id='{REQ}'),(SELECT count(*) FROM dqa_business.requests WHERE tenant_id='{T}' AND execution_kind='REAL'),(SELECT count(*) FROM dqa_business.requests WHERE tenant_id='b0000000-0000-0000-0000-000000000001'),(SELECT count(*) FROM dqa_private.virtual_trial_events WHERE request_id='{REQ}')",'0|2|1|0')
 def test_cleanup_archived_virtual_deletes_linked_signed_versions(self):self.ok(virtual_archived()+preview()+cleanup()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.requests WHERE id='{REQ}'),(SELECT count(*) FROM dqa_business.request_signatures WHERE request_id='{REQ}'),(SELECT count(*) FROM dqa_business.report_signatures WHERE request_id='{REQ}')",'0|0|0')
 def test_cleanup_is_idempotent(self):self.ok(preview()+cleanup()+cleanup()+"RESET ROLE;SELECT count(*) FROM dqa_private.assistant_command_plans",'1')
 def test_cleanup_nonadmin_denied(self):self.deny(preview(who=2),'COMMAND_ADMIN_REQUIRED')
 def test_cleanup_confirmation_cannot_execute_restart_plan(self):self.deny(preview('RESTART')+cleanup(),'COMMAND_CONFIRMATION_INVALID')
 def test_stale_preview_aborts_every_deletion(self):self.deny(preview()+f"RESET ROLE;UPDATE dqa_business.requests SET purpose='changed' WHERE id='{REQ}';{auth(1)}"+cleanup(),'COMMAND_PREVIEW_STALE')
 def test_expired_preview_denied(self):self.deny(preview()+f"RESET ROLE;UPDATE dqa_private.assistant_command_plans SET expires_at=clock_timestamp()-interval '1 second';{auth(1)}"+cleanup(),'COMMAND_EXPIRED')
 def test_wrong_actor_cannot_execute_other_admin_plan(self):self.deny(preview()+f"RESET ROLE;{auth(2)}"+cleanup(),'COMMAND_ADMIN_REQUIRED')
 def test_restart_requires_fresh_server_reauth(self):self.deny(preview('RESTART')+prepare()+f"SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.command')::jsonb->>'id')::uuid,'{uid(1)}','DELETE')",'permission denied')
 def test_restart_service_cannot_skip_prepare(self):self.deny(preview('RESTART')+reset(),'COMMAND_ADMIN_REQUIRED')
 def test_wrong_password_leaves_requests_intact(self):self.ok(preview('RESTART')+prepare()+reset('PASSWORD_INVALID')+f"SELECT (SELECT state FROM dqa_private.assistant_command_plans),(SELECT count(*) FROM dqa_business.requests WHERE tenant_id='{T}')",'REJECTED|3')
 def test_restart_all_case_histories_preserves_masters_settings_accounts(self):self.ok(virtual_archived()+preview('RESTART')+prepare()+reset()+f"SELECT (SELECT count(*) FROM dqa_business.requests WHERE tenant_id='{T}'),(SELECT count(*) FROM dqa_business.equipment WHERE id='{EQ}'),(SELECT count(*) FROM dqa_business.memberships WHERE tenant_id='{T}' AND enabled),(SELECT count(*) FROM dqa_business.requests WHERE tenant_id='b0000000-0000-0000-0000-000000000001')",'0|1|6|1')
 def test_restart_idempotency_does_not_delete_new_request(self):self.ok(preview('RESTART')+prepare()+reset()+f"{auth(1)}SELECT dqa_business.create_request_draft('{T}','ef990000-0000-4000-8000-000000000001','{{\"purpose\":\"after restart\"}}');"+reset()+f"SELECT count(*) FROM dqa_business.requests WHERE tenant_id='{T}'",'1')
 def test_private_permits_cannot_be_forged(self):self.deny(f"RESET ROLE;{auth(1)}INSERT INTO dqa_private.assistant_delete_permits VALUES(txid_current(),'dqa_business.requests','{{}}')",'permission denied')
 def test_normal_immutable_protection_remains(self):self.deny("RESET ROLE;DELETE FROM dqa_business.audit_events",'APPEND_ONLY_RECORD')
 def test_admin_revoked_after_prepare_cannot_restart(self):self.deny(preview('RESTART')+prepare()+f"RESET ROLE;UPDATE dqa_business.memberships SET enabled=false WHERE auth_user_id='{uid(1)}';"+reset(),'COMMAND_ADMIN_REQUIRED')
 def test_restart_receipt_survives_reset(self):self.ok(preview('RESTART')+prepare()+reset()+f"{auth(1)}SELECT dqa_business.assistant_command_result('{T}',(current_setting('test.command')::jsonb->>'id')::uuid)->>'state'",'SAVED')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'cloud_mutations':False},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
