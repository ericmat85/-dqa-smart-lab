"""Rollback-only supervisor stop, resource release and completion-time guard tests."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_virtual_request_execution.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
def stop(who=1,replay=False,**kw):return human('STOP',who,40,signature='',comment='合成中止原因',replay=replay,**kw)
def level1():return f"RESET ROLE;UPDATE dqa_business.roles SET permissions=array_append(permissions,'schedules.book'),systems=ARRAY['lms'],pages=array_append(pages,'schedule') WHERE id='a1000000-0000-0000-0000-000000000003';"
class Tests(unittest.TestCase):
 def ok(self,sql,expected,real=False):
  r=execute(sql,real);self.assertEqual(r.returncode,0,r.stderr[-2400:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code,real=False):
  r=execute(sql,real);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2200:])
 def test_admin_stops_running_real_trial_and_releases_resources(self):self.ok(running()+stop()+f"RESET ROLE;SELECT q.status,s.status,(SELECT bool_and(released_at IS NOT NULL) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id),(SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}'),(SELECT action||':'||reason FROM dqa_business.lab_operations WHERE request_id=q.id AND action='INTERRUPT') FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}'",'CANCELLED|CANCELLED|t|IDLE|INTERRUPT:合成中止原因',True)
 def test_level1_can_stop(self):self.ok(running()+level1()+stop(3)+f"SELECT status FROM dqa_business.requests WHERE id='{REQ}'",'CANCELLED',True)
 def test_executor_cannot_stop(self):self.deny(running()+stop(5),'HUMAN_STOP_DENIED',True)
 def test_higher_reviewer_with_booking_permission_cannot_stop(self):
  grant=f"RESET ROLE;UPDATE dqa_business.roles SET permissions=array_append(permissions,'schedules.book'),systems=ARRAY['lms'],pages=array_append(pages,'schedule') WHERE id='a1000000-0000-0000-0000-000000000004';"
  self.deny(running()+grant+stop(4),'HUMAN_STOP_DENIED',True)
 def test_booked_real_trial_can_be_cancelled_before_start(self):self.ok(booked()+stop()+f"RESET ROLE;SELECT (SELECT status FROM dqa_business.requests WHERE id='{REQ}'),(SELECT action FROM dqa_business.lab_operations WHERE request_id='{REQ}')",'CANCELLED|CANCEL',True)
 def test_virtual_stop_never_changes_physical_equipment(self):self.ok(virtual_complete().split(advance(21))[0]+stop()+f"RESET ROLE;SELECT q.status,s.status,s.virtual_percent,(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id),(SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}') FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}'",'CANCELLED|CANCELLED|50|0|IDLE')
 def test_completed_trial_cannot_stop(self):self.deny(completed()+stop(),'HUMAN_STOP_STATE_INVALID',True)
 def test_stale_revision_cannot_stop(self):self.deny(running()+stop(overrides={'expected_request_revision':999}),'REVISION_CONFLICT',True)
 def test_stale_draft_revision_cannot_stop(self):self.deny(running()+stop(overrides={'expected_draft_revision':999}),'REVISION_CONFLICT',True)
 def test_no_fabricated_signature_or_completion(self):self.ok(running()+stop()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_STOP' AND decision='NOTE'),(SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_COMPLETE'),(SELECT count(*) FROM dqa_private.human_permits)",'1|0|0',True)
 def test_same_operation_replayed_once(self):self.ok(running()+stop(replay=True)+f"RESET ROLE;SELECT count(*) FROM dqa_business.lab_operations WHERE request_id='{REQ}' AND action='INTERRUPT'",'1',True)
 def test_signature_input_rejected_for_stop(self):self.deny(running()+stop(overrides={'signature_data':SIG}),'HUMAN_FIELDS_INVALID',True)
 def test_early_completion_still_denied(self):self.deny(running()+human('COMPLETE',5,41),'HUMAN_COMPLETION_TOO_EARLY',True)
 def test_due_completion_still_allowed(self):self.ok(completed()+f"SELECT status FROM dqa_business.requests WHERE id='{REQ}'",'COMPLETED',True)
 def test_maintenance_status_is_preserved(self):self.ok(running()+f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQ}';"+stop()+f"SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}'",'MAINTENANCE',True)
 def test_clock_does_not_restart_cancelled_booking(self):self.ok(received()+stop()+f"RESET ROLE;SET LOCAL request.jwt.claim.sub='';SET LOCAL request.jwt.claim.role='service_role';SET LOCAL ROLE service_role;SELECT dqa_business.start_due_lab_trials('{T}');RESET ROLE;SELECT status FROM dqa_business.requests WHERE id='{REQ}'",'CANCELLED',True)
 def test_private_authorization_helper_not_exposed(self):self.deny(auth(1)+f"SELECT dqa_private.can_stop_scheduled_trial('{T}')",'permission denied')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'cloud_mutations':False},indent=2));raise SystemExit(not r.wasSuccessful())
