"""Synthetic, network-disabled PostgreSQL verification; every test rolls back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().rsplit('\nclass Tests',1)[0],str(Path(__file__)),'exec'))

def clock():
 return f"RESET ROLE;SET LOCAL request.jwt.claim.sub='';SET LOCAL request.jwt.claim.role='service_role';SET LOCAL ROLE service_role;SELECT dqa_business.start_due_lab_trials('{T}');"
def due():
 return received()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()+interval '1 day' WHERE request_id='{REQ}';"
def finish_select():
 return f"RESET ROLE;SELECT s.status,q.status,(SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}'),(SELECT count(*) FROM dqa_private.schedule_start_events WHERE schedule_id=s.id) FROM dqa_business.schedules s JOIN dqa_business.requests q ON q.id=s.request_id WHERE q.id='{REQ}'"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_due_received_booking_starts_atomically(self):self.ok(due()+clock()+finish_select(),'RUNNING|RUNNING|IN_USE|1')
 def test_not_yet_due_does_not_start(self):self.ok(received()+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_receiving_during_reserved_day_can_still_start(self):self.ok(booked()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()+interval '1 day' WHERE request_id='{REQ}';"+human('RECEIVE',5,2)+clock()+finish_select(),'RUNNING|RUNNING|IN_USE|1')
 def test_expired_receipt_is_rejected(self):self.deny(booked()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '2 days',ends_at=clock_timestamp()-interval '1 day' WHERE request_id='{REQ}';"+human('RECEIVE',5,2),'HUMAN_RECEIPT_WINDOW')
 def test_missing_receipt_does_not_start(self):self.ok(booked()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute' WHERE request_id='{REQ}';"+clock()+finish_select(),'AWAITING_RECEIPT|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_expired_booking_is_not_fabricated_as_running(self):self.ok(due()+f"RESET ROLE;UPDATE dqa_business.schedules SET ends_at=clock_timestamp()-interval '1 second' WHERE request_id='{REQ}';"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_maintenance_blocks_start(self):self.ok(due()+f"UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQ}';"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|MAINTENANCE|0')
 def test_calibration_blocks_start(self):self.ok(due()+f"UPDATE dqa_business.equipment SET operational_status='CALIBRATION' WHERE id='{EQ}';"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|CALIBRATION|0')
 def test_repeated_tick_is_idempotent(self):self.ok(due()+clock()+clock()+finish_select(),'RUNNING|RUNNING|IN_USE|1')
 def test_disabled_executor_blocks_start(self):self.ok(due()+f"UPDATE dqa_business.memberships SET enabled=false WHERE id='{EX}';"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_revoked_executor_permission_blocks_start(self):self.ok(due()+"UPDATE dqa_business.roles SET permissions=array_remove(permissions,'lab.execute');"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_closed_workflow_policy_blocks_start(self):self.ok(due()+f"UPDATE dqa_private.human_workflow_policy SET enabled=false WHERE tenant_id='{T}';"+clock()+finish_select(),'BOOKED|AWAITING_LAB_RECEIPT|IDLE|0')
 def test_system_event_does_not_forge_signature_or_human_operation(self):self.ok(due()+clock()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.lab_operations WHERE request_id='{REQ}' AND action='START'),(SELECT count(*) FROM dqa_private.schedule_start_events WHERE request_id='{REQ}' AND source='SERVER_SCHEDULE_CLOCK'),(SELECT count(*) FROM dqa_private.schedule_start_permits)",'0|1|0')
 def test_clock_does_not_complete_or_release_occupied_trial(self):self.ok(due()+clock()+clock()+f"RESET ROLE;SELECT completed_at IS NULL,(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id AND released_at IS NULL) FROM dqa_business.schedules s WHERE request_id='{REQ}'",'t|1')
 def test_user_cannot_call_service_clock(self):self.deny(due()+auth(5)+f"SELECT dqa_business.start_due_lab_trials('{T}')",'permission denied')
 def test_service_role_claim_is_required(self):self.deny(due()+f"SELECT dqa_business.start_due_lab_trials('{T}')",'AUTOSTART_SERVICE_REQUIRED')
 def test_no_global_status_bypass(self):self.deny(due()+f"UPDATE dqa_business.schedules SET status='RUNNING' WHERE request_id='{REQ}'",'RULE_NOT_APPROVED')
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests);result=unittest.TextTestRunner(verbosity=2).run(suite)
 Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'synthetic':True,'rollback_only':True},indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
