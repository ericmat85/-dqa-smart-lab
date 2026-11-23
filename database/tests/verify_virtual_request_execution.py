"""Rollback-only native VIRTUAL lifecycle and REAL isolation tests; never connects to cloud."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
real_base=base_fixture

def virtual_base():
 sql=real_base();needle=f"SELECT dqa_business.create_request_draft('{T}','{REQ}',"
 assert sql.count(needle)==1
 return sql.replace(needle,f"SELECT dqa_business.create_classified_request_draft('{T}','{REQ}',").replace(');RESET ROLE;',",'VIRTUAL');RESET ROLE;")
base_fixture=virtual_base

def advance(number=20,who=5,**overrides):
 operation='ef500000-0000-4000-8000-'+str(number).zfill(12)
 c=f"jsonb_build_object('action','ADVANCE','request_id','{REQ}','run_id',r->>'id','expected_revision',r->'revision','source_sha256',r->>'source_sha256','reason','','confirmation','')"
 if overrides:c+='||'+literal(overrides)
 return 'RESET ROLE;'+auth(who)+f"DO $test$ DECLARE r jsonb;c jsonb;BEGIN r:=dqa_business.preview_flow_test('{T}','{REQ}')->'run';c:={c};PERFORM dqa_business.execute_flow_test('{T}','{operation}',c);END $test$;"
def virtual_complete():return received()+advance()+advance(21)
def virtual_submitted():return virtual_complete()+upload()+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True)
def virtual_archived():return virtual_submitted()+human('REPORT_APPROVE',4,6)+human('REPORT_APPROVE',6,7)+upload('ARCHIVE',1,ARCHIVE)+human('CONFIRM_ARCHIVE',1,8,upload=ARCHIVE,proof=True)
def execute(sql,real=False):
 global base_fixture
 base_fixture=real_base if real else virtual_base
 try:return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
 finally:base_fixture=virtual_base
class Tests(unittest.TestCase):
 def ok(self,sql,expected,real=False):
  r=execute(sql,real);self.assertEqual(r.returncode,0,r.stderr[-2300:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code,real=False):
  r=execute(sql,real);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2300:])
 def test_virtual_classification_at_birth_and_signed_document(self):self.ok(f"RESET ROLE;SELECT execution_kind,(SELECT payload->>'execution_kind' FROM dqa_business.request_document_versions WHERE id=q.request_document_version_id) FROM dqa_business.requests q WHERE id='{REQ}'",'VIRTUAL|VIRTUAL')
 def test_old_client_defaults_real(self):self.ok(f"RESET ROLE;SELECT execution_kind FROM dqa_business.requests WHERE id='{REQ}'",'REAL',True)
 def test_classification_cannot_change_after_saving(self):self.deny(f"RESET ROLE;UPDATE dqa_business.requests SET execution_kind='REAL' WHERE id='{REQ}'",'EXECUTION_KIND_IMMUTABLE')
 def test_real_cannot_be_promoted_to_virtual(self):self.deny(f"RESET ROLE;UPDATE dqa_business.requests SET execution_kind='VIRTUAL' WHERE id='{REQ}'",'EXECUTION_KIND_IMMUTABLE',True)
 def test_no_physical_booking(self):self.ok(booked()+f"RESET ROLE;SELECT execution_kind,status,(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}'",'VIRTUAL|AWAITING_RECEIPT|0')
 def test_acknowledgement_is_required(self):self.deny(booked()+advance(),'FLOW_TEST_RECEIPT_REQUIRED')
 def test_receipt_requires_real_executor_signature(self):self.deny(booked()+human('RECEIVE',5,2,signature=''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_start_advances_native_status_and_separate_clock(self):self.ok(received()+advance()+f"RESET ROLE;SELECT q.status,s.status,s.virtual_percent,s.virtual_at=s.starts_at+(s.ends_at-s.starts_at)/2,s.started_at<s.starts_at FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}'",'RUNNING|RUNNING|50|t|t')
 def test_complete_advances_native_status_without_changing_equipment(self):self.ok(virtual_complete()+f"RESET ROLE;SELECT q.status,s.status,s.virtual_percent,s.virtual_at=s.ends_at,s.completed_at<s.ends_at,(SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}') FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}'",'COMPLETED|COMPLETED|100|t|t|IDLE')
 def test_completed_virtual_can_submit_report(self):self.ok(virtual_submitted()+f"SELECT status FROM dqa_business.reports WHERE request_id='{REQ}'",'SUBMITTED')
 def test_report_review_and_archive_remain_native(self):self.ok(virtual_archived()+f"SELECT status,(SELECT status FROM dqa_business.requests WHERE id='{REQ}'),archived_artifact_version_id IS NOT NULL FROM dqa_business.reports WHERE request_id='{REQ}'",'ARCHIVED|CLOSED|t')
 def test_no_approval_or_signature_fabricated_by_acceleration(self):self.ok(virtual_complete()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_COMPLETE'),(SELECT count(*) FROM dqa_private.virtual_trial_events WHERE request_id='{REQ}'),(SELECT count(*) FROM dqa_business.lab_operations WHERE request_id='{REQ}' AND action IN('START','COMPLETE'))",'0|2|2')
 def test_only_virtual_cases_can_accelerate(self):self.deny(received()+advance(),'VIRTUAL_TRIAL_REQUIRED',True)
 def test_reader_cannot_accelerate(self):self.deny(received()+advance(who=3),'FLOW_TEST_ACCESS_DENIED')
 def test_admin_may_accelerate(self):self.ok(received()+advance(who=1)+f"SELECT status FROM dqa_business.requests WHERE id='{REQ}'",'RUNNING')
 def test_stale_source_does_not_advance(self):self.deny(received()+advance(expected_revision=999),'FLOW_TEST_SOURCE_CHANGED')
 def test_caller_cannot_supply_percent(self):self.deny(received()+advance(percent=100),'FLOW_TEST_FIELDS_INVALID')
 def test_old_create_command_rejected(self):self.deny(received()+advance(action='CREATE'),'FLOW_TEST_FIELDS_INVALID')
 def test_private_permits_not_leaked(self):self.ok(virtual_archived()+"RESET ROLE;SELECT (SELECT count(*) FROM dqa_private.human_permits),(SELECT count(*) FROM dqa_private.virtual_permits)",'0|0')
 def test_direct_clock_tampering_rejected(self):self.deny(received()+f"RESET ROLE;UPDATE dqa_business.schedules SET virtual_percent=100,virtual_at=ends_at WHERE request_id='{REQ}'",'VIRTUAL_CLOCK_DENIED')
 def test_normal_manual_completion_cannot_bypass_virtual_clock(self):self.deny(received()+advance()+human('COMPLETE',5,7),'VIRTUAL_ACCELERATOR_REQUIRED')
 def test_true_real_start_window_remains(self):self.deny(received()+human('START',5,7),'HUMAN_START_WINDOW',True)
 def test_no_more_than_two_steps(self):self.deny(virtual_complete()+advance(22),'FLOW_TEST_COMPLETED')
 def test_report_intent_carries_authoritative_purpose(self):self.ok(virtual_complete()+upload()+f"SELECT dqa_business.report_upload_intent('{T}','{UPLOAD}')->>'execution_kind'",'VIRTUAL')
 def test_one_hour_virtual_trial_retains_a_whole_day_window(self):
  setup=fixture().replace("SET profile_code='HIGH_HUMIDITY'", "SET profile_code='WATER_INGRESS',duration_hours=1,specification='試驗時間：1 小時。'").replace('250 小時','1 小時').replace('恆溫恆濕機 合成','防水試驗機 合成').replace('"end_date": "'+str(END)+'"','"end_date": "'+str(START)+'"')
  sql=virtual_complete()+f"RESET ROLE;SELECT plan->>'hours_per_batch',extract(epoch FROM ends_at-starts_at)/86400=1,virtual_at=ends_at FROM dqa_business.schedules WHERE request_id='{REQ}'"
  r=subprocess.run(cmd,input='BEGIN;'+setup+sql+';ROLLBACK;',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr[-1800:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'1|t|t')
 def test_virtual_notification_grant_is_explicitly_marked(self):
  worker='ef600000-0000-4000-8000-000000000001'
  ready=f"RESET ROLE;INSERT INTO dqa_private.business_mail_policy(tenant_id,enabled) VALUES('{T}',true) ON CONFLICT(tenant_id) DO UPDATE SET enabled=true;INSERT INTO dqa_business.notification_preferences(tenant_id,member_id,enabled) SELECT tenant_id,id,true FROM dqa_business.memberships WHERE tenant_id='{T}';SELECT dqa_business.business_mail_heartbeat('{T}','{worker}',true,'SMTP_AUTH_READY');"
  self.ok(ready+received()+f"RESET ROLE;SELECT left(dqa_business.claim_business_mail('{T}','{worker}')->>'request_code',15)",'[虛擬委託／流程測試] REQ')
 def test_virtual_booking_never_autostarts_on_the_real_clock(self):
  sql=received()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()+interval '1 day' WHERE request_id='{REQ}';SET LOCAL request.jwt.claim.sub='';SET LOCAL request.jwt.claim.role='service_role';SET LOCAL ROLE service_role;SELECT dqa_business.start_due_lab_trials('{T}');RESET ROLE;SELECT status,virtual_percent FROM dqa_business.schedules WHERE request_id='{REQ}'"
  self.ok(sql,'BOOKED|0')
 def test_private_virtual_permit_cannot_be_forged(self):self.deny(auth(5)+"SELECT * FROM dqa_private.virtual_permits",'permission denied')
 def test_events_immutable(self):self.deny(virtual_complete()+"RESET ROLE;DELETE FROM dqa_private.virtual_trial_events",'APPEND_ONLY_RECORD')
 def test_snapshot_includes_purpose(self):self.ok(received()+f"SELECT dqa_business.original_ui_snapshot('{T}')->'requests'->0->>'execution_kind'",'VIRTUAL')
 def test_virtual_equipment_unavailability_does_not_block_modelled_plan(self):
  # Booking revalidates equipment revisions as usual; use a new draft after the physical status change.
  c=plan();c['expected_draft_revision']=1;c['data']['equipment_revisions'][EQ]=2
  self.ok(f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQ}';"+run_plan(c,operation='ef200000-0000-4000-8000-000000000002')+booked()+f"RESET ROLE;SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}'",'MAINTENANCE')
 def test_real_still_rejects_unavailable_equipment(self):
  c=plan();c['expected_draft_revision']=1;c['data']['equipment_revisions'][EQ]=2
  self.deny(f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='MAINTENANCE' WHERE id='{EQ}';"+run_plan(c,operation='ef200000-0000-4000-8000-000000000002'),'PLANNING_EQUIPMENT_REQUIRED',True)
 def test_idempotent_replay_does_not_advance_twice(self):
  sql=received()+'RESET ROLE;'+auth(5)+f"DO $test$ DECLARE r jsonb;c jsonb;op uuid:=gen_random_uuid();first_result jsonb;BEGIN r:=dqa_business.preview_flow_test('{T}','{REQ}')->'run';c:=jsonb_build_object('action','ADVANCE','request_id','{REQ}','run_id',r->>'id','expected_revision',r->'revision','source_sha256',r->>'source_sha256','reason','','confirmation','');first_result:=dqa_business.execute_flow_test('{T}',op,c);IF dqa_business.execute_flow_test('{T}',op,c)->>'replayed'<>'true' THEN RAISE EXCEPTION 'NOT_REPLAYED';END IF;IF dqa_business.flow_test_result('{T}',op)<>first_result THEN RAISE EXCEPTION 'RECEIPT_CHANGED';END IF;END $test$;RESET ROLE;SELECT virtual_percent FROM dqa_business.schedules WHERE request_id='{REQ}'"
  self.ok(sql,'50')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'native_workflow':True,'cloud_mutations':False},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
