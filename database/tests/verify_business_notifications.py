"""Rollback-only integration of email consent, authoritative workflow and durable dispatch."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
human_fixture=fixture
WORKER='be000000-0000-4000-8000-000000000001';TESTOP='be000000-0000-4000-8000-000000000002'
def request_submitted():return run_action(2,command(),1)
def request_first():return request_submitted()+run_action(1,command('MANAGER_APPROVE',2),2)+run_action(3,command('LMS_APPROVE',3),3)
def consent():
 return f"RESET ROLE;INSERT INTO dqa_private.business_mail_policy(tenant_id,enabled) VALUES('{T}',true) ON CONFLICT(tenant_id) DO UPDATE SET enabled=true;UPDATE auth.users SET email_confirmed_at=clock_timestamp();INSERT INTO dqa_business.notification_preferences(tenant_id,member_id,enabled) SELECT tenant_id,id,true FROM dqa_business.memberships WHERE tenant_id='{T}';SELECT dqa_business.business_mail_heartbeat('{T}','{WORKER}',true,'SMTP_AUTH_READY');"
def execute(sql,mode='human'):
 setup=human_fixture() if mode=='human' else base_fixture()
 return subprocess.run(cmd,input='BEGIN;'+setup+consent()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
def claim():return f"SELECT set_config('dqa.mail.grant',dqa_business.claim_business_mail('{T}','{WORKER}')::text,true);"
def fence():return f"SELECT dqa_business.authorize_business_mail('{T}',(current_setting('dqa.mail.grant')::jsonb->>'id')::uuid,'{WORKER}',(current_setting('dqa.mail.grant')::jsonb->>'dispatch_id')::uuid);"
def finish(state='SENT',retry='false'):return f"SELECT dqa_business.finish_business_mail('{T}',(current_setting('dqa.mail.grant')::jsonb->>'id')::uuid,'{WORKER}',(current_setting('dqa.mail.grant')::jsonb->>'dispatch_id')::uuid,'{state}','TEST_RECEIPT',{retry});"
def testmail():return auth(1)+f"SELECT dqa_business.test_notification_email('{T}','{MAN}','{TESTOP}','lms');RESET ROLE;"
class Tests(unittest.TestCase):
 def ok(self,sql,expected,mode='human'):
  r=execute(sql,mode);self.assertEqual(r.returncode,0,r.stderr[-2300:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code,mode='human'):
  r=execute(sql,mode);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_request_submission_targets_designated_manager(self):self.ok(request_submitted()+f"RESET ROLE;SELECT kind,recipient_id FROM dqa_private.business_mail_outbox WHERE request_id='{REQ}'",'REQUEST_MANAGER|'+MAN,'request')
 def test_successive_review_levels_notify_distinct_reviewers(self):self.ok(request_first()+f"RESET ROLE;SELECT string_agg(kind||':'||review_level,',' ORDER BY created_at) FROM dqa_private.business_mail_outbox WHERE request_id='{REQ}'",'REQUEST_MANAGER:0,REQUEST_LMS:1,REQUEST_LMS:2','request')
 def test_policy_off_has_no_historical_backfill(self):self.ok(f"UPDATE dqa_private.business_mail_policy SET enabled=false;"+request_submitted()+f"RESET ROLE;UPDATE dqa_private.business_mail_policy SET enabled=true;SELECT count(*) FROM dqa_private.business_mail_outbox",'0','request')
 def test_booking_targets_executor(self):self.ok(booked()+f"RESET ROLE;SELECT kind,recipient_id FROM dqa_private.business_mail_outbox",'LAB_RECEIPT|'+EX)
 def test_full_report_lifecycle_queues_each_responsible_person(self):self.ok(archived()+"RESET ROLE;SELECT string_agg(kind,',' ORDER BY created_at) FROM dqa_private.business_mail_outbox WHERE kind LIKE 'REPORT_%'",'REPORT_REVIEW,REPORT_REVIEW,REPORT_VIEW,REPORT_ARCHIVED')
 def test_report_return_targets_executor(self):self.ok(completed()+upload()+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True)+human('REPORT_RETURN',4,6)+"RESET ROLE;SELECT recipient_id FROM dqa_private.business_mail_outbox WHERE kind='REPORT_RETURNED'",EX)
 def test_receipt_notifies_owner_and_supervisor(self):self.ok(received()+"RESET ROLE;SELECT count(*) FROM dqa_private.business_mail_outbox WHERE kind='LAB_RECEIVED'",'2')
 def test_preference_persists_own_cas(self):self.ok(auth(1)+f"SELECT dqa_business.save_notification_settings('{T}','{MAN}',false,1)->>'revision'",'2')
 def test_wrong_member_cannot_save(self):self.deny(auth(1)+f"SELECT dqa_business.save_notification_settings('{T}','{OWN}',false,1)",'NOTIFICATION_ACCESS_DENIED')
 def test_stale_revision_does_not_overwrite(self):self.deny(auth(1)+f"SELECT dqa_business.save_notification_settings('{T}','{MAN}',false,0)",'REVISION_CONFLICT')
 def test_disable_cancels_queued_mail(self):self.ok(testmail()+auth(1)+f"SELECT dqa_business.save_notification_settings('{T}','{MAN}',false,1);RESET ROLE;SELECT state FROM dqa_private.business_mail_outbox",'SKIPPED')
 def test_test_email_is_idempotent(self):self.ok(testmail()+testmail()+"SELECT count(*) FROM dqa_private.business_mail_outbox",'1')
 def test_test_email_rate_limit(self):self.deny(testmail()+auth(1)+f"SELECT dqa_business.test_notification_email('{T}','{MAN}','{op(950)}','lms')",'NOTIFICATION_RATE_LIMITED')
 def test_no_browser_recipient_override(self):self.deny(auth(1)+f"SELECT dqa_business.test_notification_email('{T}','{OWN}','{TESTOP}','request')",'NOTIFICATION_ACCESS_DENIED')
 def test_claim_and_send_have_durable_authorization(self):self.ok(testmail()+claim()+fence()+finish()+"SELECT state,attempts FROM dqa_private.business_mail_outbox",'SENT|1')
 def test_cannot_claim_twice_inflight(self):self.ok(testmail()+claim()+f"SELECT dqa_business.claim_business_mail('{T}','{WORKER}')->>'state'",'BUSY')
 def test_cannot_mark_sent_without_authorization(self):self.deny(testmail()+claim()+finish(),'NOTIFICATION_DISPATCH_EVIDENCE_REQUIRED')
 def test_disable_between_claim_and_data_prevents_send(self):self.ok(testmail()+claim()+auth(1)+f"SELECT dqa_business.save_notification_settings('{T}','{MAN}',false,1);RESET ROLE;"+fence(),'f')
 def test_verified_recipient_required_at_dispatch(self):self.ok(testmail()+f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{uid(1)}';"+claim()+"SELECT state FROM dqa_private.business_mail_outbox",'SKIPPED')
 def test_membership_disabled_before_dispatch(self):self.ok(testmail()+f"UPDATE dqa_business.memberships SET enabled=false WHERE id='{MAN}';"+claim()+"SELECT state FROM dqa_private.business_mail_outbox",'SKIPPED')
 def test_unknown_never_requeues(self):self.ok(testmail()+claim()+fence()+finish('UNKNOWN')+claim()+"SELECT state,attempts FROM dqa_private.business_mail_outbox",'UNKNOWN|1')
 def test_expired_lease_is_unknown(self):self.ok(testmail()+claim()+"UPDATE dqa_private.business_mail_outbox SET lease_until=clock_timestamp()-interval '1 second';"+claim()+"SELECT state FROM dqa_private.business_mail_outbox",'UNKNOWN')
 def test_old_dispatch_receipt_cannot_finish_new_attempt(self):self.ok(testmail()+claim()+finish('FAILED','true')+"UPDATE dqa_private.business_mail_outbox SET next_attempt_at=clock_timestamp();SELECT set_config('dqa.old',current_setting('dqa.mail.grant'),true);"+claim()+f"SELECT dqa_business.finish_business_mail('{T}',(current_setting('dqa.old')::jsonb->>'id')::uuid,'{WORKER}',(current_setting('dqa.old')::jsonb->>'dispatch_id')::uuid,'SENT','TEST_RECEIPT',false)",'f')
 def test_failed_retry_has_three_attempt_limit(self):self.ok(testmail()+''.join(claim()+finish('FAILED','true')+"UPDATE dqa_private.business_mail_outbox SET next_attempt_at=clock_timestamp();" for _ in range(3))+"SELECT state,attempts FROM dqa_private.business_mail_outbox",'FAILED|3')
 def test_monitor_scopes_records_to_current_recipient(self):self.ok(testmail()+auth(2)+f"SELECT jsonb_array_length(dqa_business.notification_status('{T}')->'records')",'0')
 def test_admin_monitor_reports_durable_state(self):self.ok(testmail()+auth(1)+f"SELECT dqa_business.notification_status('{T}')->'counts'->>'QUEUED'",'1')
 def test_browser_cannot_dispatch(self):self.deny(auth(1)+f"SELECT dqa_business.claim_business_mail('{T}','{WORKER}')",'permission denied')
 def test_anonymous_cannot_read_preferences(self):self.deny("SET LOCAL ROLE anon;SELECT dqa_business.notification_settings('"+T+"')",'permission denied')
 def test_changed_workflow_obsoletes_old_actionable_email(self):self.ok(request_first()+"RESET ROLE;"+claim()+"SELECT count(*) FROM dqa_private.business_mail_outbox WHERE kind IN('REQUEST_MANAGER','REQUEST_LMS') AND state='SKIPPED'",'2','request')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
