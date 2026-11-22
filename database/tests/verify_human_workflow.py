"""Isolated, rollback-only manual lifecycle and file-attestation contract tests."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_schedule_drafts.py').read_text().rsplit('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
schedule_fixture=fixture
THIRD='a2000000-0000-0000-0000-000000000006';UPLOAD='ef300000-0000-4000-8000-000000000001';ARCHIVE='ef300000-0000-4000-8000-000000000002';KEY='ab'*32

def fixture():
 return schedule_fixture()+f"UPDATE dqa_private.human_workflow_policy SET enabled=true,report_key=decode('{KEY}','hex') WHERE tenant_id='{T}';UPDATE dqa_business.roles SET permissions=permissions||ARRAY['lab.execute','reports.submit'] WHERE id='a1000000-0000-0000-0000-000000000005';UPDATE dqa_business.roles SET permissions=permissions||ARRAY['reports.review'] WHERE id='a1000000-0000-0000-0000-000000000004';INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(6)}','synthetic-report-third@example.invalid',clock_timestamp());INSERT INTO dqa_business.roles(id,tenant_id,code,name,permissions,systems,pages,review_level) VALUES('a1000000-0000-0000-0000-000000000006','{T}','SYNTHETIC-L3','合成三階',ARRAY['requests.read_all','reports.read_all','reports.review'],ARRAY['lms'],ARRAY['dashboard','requests'],3);INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('{THIRD}','{T}','{uid(6)}','SYNTHETIC-L3','合成三階','a1000000-0000-0000-0000-000000000006','synthetic-report-third@example.invalid');"+run_plan()

def human(action,who=1,number=1,signature=SIG,comment='合成試驗紀錄',upload=None,proof=False,replay=False,overrides=None):
 if action in ['REPORT_RETURN','CONFIRM_ARCHIVE'] and signature==SIG:signature=''
 c=f"jsonb_build_object('action','{action}','request_id','{REQ}','expected_request_revision',q.revision,'expected_schedule_revision',coalesce((SELECT revision FROM dqa_business.schedules WHERE tenant_id='{T}' AND request_id=q.id AND status NOT IN('DRAFT','CANCELLED')),0),'expected_report_revision',coalesce((SELECT revision FROM dqa_business.reports WHERE tenant_id='{T}' AND request_id=q.id),0),'expected_draft_revision',(SELECT revision FROM dqa_business.schedule_drafts WHERE tenant_id='{T}' AND request_id=q.id),'signature_data','{signature}','comment','{comment}','upload_id',"+(f"'{upload}'" if upload else 'NULL')+")"
 if overrides:c+='||'+literal(overrides)
 op='ef400000-0000-4000-8000-'+str(number).zfill(12)
 proof_arg="current_setting('dqa.test_proof',true)" if proof else 'NULL'
 return 'RESET ROLE;'+auth(who)+f"DO $test$ DECLARE c jsonb;BEGIN SELECT {c} INTO c FROM dqa_business.requests q WHERE id='{REQ}';PERFORM dqa_business.prepare_human_operation('{T}','{op}',c);PERFORM dqa_business.execute_human_operation('{T}','{op}',c,{proof_arg});"+(f"PERFORM dqa_business.execute_human_operation('{T}','{op}',c,{proof_arg});" if replay else '')+'END $test$;'

def booked():return human('BOOK',1,1)
def received():return booked()+human('RECEIVE',5,2)
def running():return received()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()+interval '1 hour' WHERE request_id='{REQ}';"+human('START',5,3)
def completed():return running()+f"RESET ROLE;UPDATE dqa_business.schedules SET ends_at=clock_timestamp()-interval '1 hour' WHERE request_id='{REQ}';"+human('COMPLETE',5,4)
def upload(kind='REPORT',who=5,ident=UPLOAD):
 ext='xlsx' if kind=='REPORT' else 'pdf'
 prep='RESET ROLE;'+auth(who)+f"SELECT dqa_business.prepare_report_upload('{T}','{ident}','{REQ}','{kind}','SYNTHETIC.{ext}',128,'"+'a'*64+f"',(SELECT revision FROM dqa_business.requests WHERE id='{REQ}'),coalesce((SELECT revision FROM dqa_business.reports WHERE request_id='{REQ}'),0));"
 return prep+f"RESET ROLE;SELECT set_config('dqa.test_proof',encode(extensions.hmac(convert_to(u.id::text||':'||u.sha256||':'||u.byte_size::text||':'||u.mime_type,'UTF8'),decode('{KEY}','hex'),'sha256'),'hex'),true) FROM dqa_private.report_upload_intents u WHERE id='{ident}';"
def submitted():return completed()+upload()+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True)
def level2():return submitted()+human('REPORT_APPROVE',4,6)
def viewed():return level2()+human('REPORT_APPROVE',6,7)
def archived():return viewed()+upload('ARCHIVE',1,ARCHIVE)+human('CONFIRM_ARCHIVE',1,8,upload=ARCHIVE,proof=True)
def execute(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2300:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-2000:])
 def test_booking_creates_real_equipment_and_person_reservation(self):self.ok(booked()+f"RESET ROLE;SELECT status,(SELECT count(*) FROM dqa_business.schedule_equipment a WHERE a.schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}'",'AWAITING_RECEIPT|1')
 def test_closed_policy_blocks_booking(self):self.deny(f"RESET ROLE;UPDATE dqa_private.human_workflow_policy SET enabled=false;"+booked(),'HUMAN_RELEASE_REQUIRED')
 def test_read_only_cannot_book(self):self.deny(human('BOOK',3,1),'HUMAN_ACCESS_DENIED')
 def test_stale_source_blocks_booking(self):self.deny(human('BOOK',1,1,overrides={'expected_request_revision':1}),'REVISION_CONFLICT')
 def test_double_booking_is_idempotent(self):self.ok(human('BOOK',1,1,replay=True)+f"SELECT count(*) FROM dqa_business.schedules WHERE request_id='{REQ}'",'1')
 def test_wrong_executor_cannot_receive(self):self.deny(booked()+human('RECEIVE',1,2),'HUMAN_EXECUTOR_REQUIRED')
 def test_receipt_requires_signature(self):self.deny(booked()+human('RECEIVE',5,2,signature=''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_receipt_binds_signature_to_submitted_request(self):self.ok(received()+f"SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_RECEIVE' AND request_document_version_id IS NOT NULL",'1')
 def test_cannot_start_before_scheduled_time(self):self.deny(received()+human('START',5,3),'HUMAN_START_WINDOW')
 def test_cannot_start_without_receipt(self):self.deny(booked()+human('START',5,3),'HUMAN_STATE_INVALID')
 def test_start_changes_equipment_state(self):self.ok(running()+f"RESET ROLE;SELECT operational_status FROM dqa_business.equipment WHERE id='{EQ}'",'IN_USE')
 def test_cannot_complete_before_required_time(self):self.deny(running()+human('COMPLETE',5,4),'HUMAN_COMPLETION_TOO_EARLY')
 def test_completion_requires_result(self):self.deny(running()+f"RESET ROLE;UPDATE dqa_business.schedules SET ends_at=clock_timestamp()-interval '1 hour' WHERE request_id='{REQ}';"+human('COMPLETE',5,4,comment=''),'HUMAN_RESULT_REQUIRED')
 def test_completion_releases_reservations(self):self.ok(completed()+f"SELECT status,(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id AND released_at IS NULL) FROM dqa_business.schedules s WHERE request_id='{REQ}'",'COMPLETED|0')
 def test_report_requires_server_file_verification(self):self.deny(completed()+upload()+human('REPORT_SUBMIT',5,5,upload=UPLOAD),'HUMAN_FILE_VERIFICATION_REQUIRED')
 def test_submit_has_immutable_version_and_signature(self):self.ok(submitted()+f"SELECT status,(SELECT count(*) FROM dqa_business.report_versions WHERE report_id=r.id),(SELECT count(*) FROM dqa_business.report_signatures WHERE report_version_id=r.current_version_id) FROM dqa_business.reports r WHERE request_id='{REQ}'",'SUBMITTED|1|1')
 def test_no_self_report_approval(self):self.deny(submitted()+human('REPORT_APPROVE',5,6),'HUMAN_REPORT_REVIEW_DENIED')
 def test_wrong_report_level_denied(self):self.deny(submitted()+human('REPORT_APPROVE',6,6),'HUMAN_REPORT_REVIEW_DENIED')
 def test_return_requires_reason(self):self.deny(submitted()+human('REPORT_RETURN',4,6,comment=''),'HUMAN_RETURN_REASON_REQUIRED')
 def test_return_keeps_old_version(self):self.ok(submitted()+human('REPORT_RETURN',4,6)+f"SELECT status,(SELECT count(*) FROM dqa_business.report_versions WHERE report_id=r.id) FROM dqa_business.reports r WHERE request_id='{REQ}'",'RETURNED|1')
 def test_two_report_levels_lead_to_readback(self):self.ok(viewed()+f"SELECT status FROM dqa_business.reports WHERE request_id='{REQ}'",'AWAITING_VIEW')
 def test_only_assigned_manager_can_archive(self):self.deny(viewed()+upload('ARCHIVE',4,ARCHIVE),'HUMAN_ACCESS_DENIED')
 def test_full_flow_archives_pdf_and_closes_case(self):self.ok(archived()+f"SELECT status,(SELECT status FROM dqa_business.requests WHERE id='{REQ}'),archived_artifact_version_id IS NOT NULL FROM dqa_business.reports WHERE request_id='{REQ}'",'ARCHIVED|CLOSED|t')
 def test_no_permits_escape_transaction(self):self.ok(archived()+'RESET ROLE;SELECT count(*) FROM dqa_private.human_permits','0')
 def test_direct_state_change_remains_denied(self):self.deny("RESET ROLE;SELECT set_config('dqa.human','true',true);UPDATE dqa_business.requests SET status='CLOSED' WHERE id='"+REQ+"'",'RULE_NOT_APPROVED')
 def test_signatures_are_append_only(self):self.deny(submitted()+"RESET ROLE;DELETE FROM dqa_business.report_signatures",'APPEND_ONLY_RECORD')
 def test_forged_storage_path_is_rejected(self):self.deny(completed()+'RESET ROLE;'+auth(5)+"INSERT INTO storage.objects(bucket_id,name) VALUES('dqa-business-reports','forged/path.xlsx')",'row-level security')
 def test_prepared_storage_path_is_allowed(self):self.ok(completed()+upload()+'RESET ROLE;'+auth(5)+f"INSERT INTO storage.objects(bucket_id,name) VALUES('dqa-business-reports','{T}/{REQ}/{UPLOAD}.xlsx');SELECT count(*) FROM storage.objects",'1')
 def test_private_attestation_key_is_inaccessible(self):self.deny(auth(5)+'SELECT report_key FROM dqa_private.human_workflow_policy','permission denied')
 def test_cross_tenant_signature_reads_are_empty(self):self.ok(submitted()+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SELECT count(*) FROM dqa_business.report_signatures",'0')
 def test_manager_can_return_viewed_report(self):self.ok(viewed()+human('REPORT_RETURN',1,8)+f"SELECT status FROM dqa_business.reports WHERE request_id='{REQ}'",'RETURNED')
 def test_resubmission_preserves_two_versions(self):self.ok(submitted()+human('REPORT_RETURN',4,6)+upload(ident=ARCHIVE)+human('REPORT_SUBMIT',5,8,upload=ARCHIVE,proof=True)+f"SELECT count(*) FROM dqa_business.report_versions WHERE request_id='{REQ}'",'2')
 def test_old_report_does_not_allow_wrong_stage_review(self):self.deny(completed()+human('REPORT_APPROVE',4,5),'HUMAN_STATE_INVALID')
 def test_archive_requires_existing_report(self):self.deny(completed()+upload('ARCHIVE',1,ARCHIVE),'HUMAN_ACCESS_DENIED')
 def test_expired_upload_cannot_be_submitted(self):self.deny(completed()+upload()+f"RESET ROLE;UPDATE dqa_private.report_upload_intents SET expires_at=clock_timestamp()-interval '1 minute';"+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True),'HUMAN_UPLOAD_STALE')
 def test_revoked_capability_cannot_complete(self):
  prepared=human('COMPLETE',5,4).replace(f"PERFORM dqa_business.execute_human_operation('{T}','ef400000-0000-4000-8000-000000000004',c,NULL);","PERFORM set_config('dqa.test_command',c::text,true);")
  sql=running()+prepared+f"RESET ROLE;UPDATE dqa_business.roles SET permissions=array_remove(permissions,'lab.execute') WHERE id='a1000000-0000-0000-0000-000000000005';"+auth(5)+f"SELECT dqa_business.execute_human_operation('{T}','ef400000-0000-4000-8000-000000000004',current_setting('dqa.test_command')::jsonb,NULL)"
  self.deny(sql,'HUMAN_ACCESS_DENIED')

 def test_broad_permissive_storage_policy_cannot_allow_forged_path(self):self.deny(completed()+"RESET ROLE;CREATE POLICY synthetic_broad ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);"+auth(5)+"INSERT INTO storage.objects(bucket_id,name) VALUES('dqa-business-reports','forged/path.xlsx')",'row-level security')
 def test_other_tenant_cannot_read_prepared_upload(self):self.ok(completed()+upload()+'RESET ROLE;'+auth(5)+f"INSERT INTO storage.objects(bucket_id,name) VALUES('dqa-business-reports','{T}/{REQ}/{UPLOAD}.xlsx');SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SELECT count(*) FROM storage.objects",'0')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'storage_api_tested':False,'time_travel_only_in_operator_fixtures':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
