"""Rollback-only verification of schedule-before-signature and pre-start preparation on isolated local PostgreSQL."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_request_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
base_fixture=fixture
from datetime import datetime,timedelta,timezone
START=(datetime.now(timezone(timedelta(hours=8))).date()+timedelta(days=7)).isoformat()
EQ='ee100000-0000-4000-8000-000000000001';EX='a2000000-0000-0000-0000-000000000005'
def dynamic_command(action):return f"jsonb_build_object('request_id',q.id,'expected_revision',q.revision,'action','{action}','signature_data','{SIG}','comment','合成審核')"
def review(who,action,number,fields=None,plan_revision='NULL',prepare_only=False,plain=False):
 c=dynamic_command(action);oid=op(number)
 if fields is None or plain:
  prep=f"PERFORM dqa_business.prepare_request_operation('{T}','{oid}',c);";exe=f"PERFORM dqa_business.execute_request_operation('{T}','{oid}',c);"
 else:
  prep=f"PERFORM dqa_business.prepare_request_template_operation('{T}','{oid}',c,{literal(fields)},{plan_revision});";exe=f"PERFORM dqa_business.execute_request_template_operation('{T}','{oid}',c,{literal(fields)},{plan_revision});"
 return 'RESET ROLE;'+auth(who)+f"DO $t$ DECLARE c jsonb;BEGIN SELECT {c} INTO c FROM dqa_business.requests q WHERE id='{REQ}';{prep}"+("PERFORM set_config('dqa.preapproval_command',c::text,true);" if prepare_only else exe)+'END $t$;'
def fixture(priority='一般'):
 f=base_fixture()+f"UPDATE dqa_private.preapproval_cutover SET enabled=true;UPDATE dqa_private.human_workflow_policy SET enabled=true WHERE tenant_id='{T}';UPDATE dqa_business.trial_definitions SET profile_code='HIGH_HUMIDITY' WHERE id='a3000000-0000-0000-0000-000000000001';INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(5)}','preflight@example.invalid',clock_timestamp());INSERT INTO dqa_business.roles(id,tenant_id,code,name,permissions,systems,pages) VALUES('a1000000-0000-0000-0000-000000000005','{T}','PREFLIGHT','合成執行者',ARRAY['lab.execute','reports.submit'],ARRAY['lab'],ARRAY['requests','dashboard']);INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('{EX}','{T}','{uid(5)}','PREFLIGHT','合成執行者','a1000000-0000-0000-0000-000000000005','preflight@example.invalid');INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,space_units,daily_hours,operational_status) VALUES('{EQ}','{T}','EQ-PREFLIGHT','恆溫恆濕機 合成','溫濕度試驗',6,24,'IDLE');"
 return f+f"UPDATE dqa_business.requests SET form_details=form_details||jsonb_build_object('priority','{priority}') WHERE id='{REQ}';"+review(2,'SUBMIT',1)+review(1,'MANAGER_APPROVE',2)
def number(code='SAMPLE-001',revision=0,oid=10):
 return 'RESET ROLE;'+auth(3)+f"SELECT dqa_business.save_preapproval_sample_number('{T}','{op(oid)}','{REQ}',q.request_document_version_id,q.revision,{revision},'{code}') FROM dqa_business.requests q WHERE id='{REQ}';"
def plan(external=False,oid=11):
 d={'equipment_ids':[] if external else [EQ],'equipment_revisions':{} if external else {EQ:1},'executor_id':EX,'executor_revision':1,'start_date':START,'end_date':START,'sample_code':'SAMPLE-001','note':'合成排程','preparation_minutes':0,'cleanup_minutes':0,'sample_space_units':1}
 return 'RESET ROLE;'+auth(3)+f"DO $t$ DECLARE c jsonb;p jsonb;BEGIN SELECT jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',coalesce((SELECT revision FROM dqa_business.schedule_drafts WHERE request_id=q.id),0),'data',{literal(d)}) INTO c FROM dqa_business.requests q WHERE id='{REQ}';p:=dqa_business.preview_schedule_draft('{T}',c);c:=jsonb_set(c,'{{data,end_date}}',p->'end_date');PERFORM dqa_business.prepare_schedule_draft('{T}','{op(oid)}',c);PERFORM dqa_business.execute_schedule_draft('{T}','{op(oid)}',c);END $t$;"
FIRST={'permitTypes':['new_product'],'allowed':'yes','criteriaClear':'yes','resourcesReady':'yes'}
def first(external=False):return number()+plan(external=external)+review(3,'LMS_APPROVE',12,FIRST,'1')
def second(external=False):return first(external)+review(4,'LMS_APPROVE',13)
PREP={'sampleCorrect':'yes','sampleQuantity':3,'sampleReceivedDate':'2026-11-25','fixturesReady':'yes','operationFamiliar':'yes','outsourceBooked':'not_applicable'}
def human(action,number=20,fields=None,signature=SIG):
 c=f"jsonb_build_object('action','{action}','request_id',q.id,'expected_request_revision',q.revision,'expected_schedule_revision',s.revision,'expected_report_revision',0,'expected_draft_revision',d.revision,'signature_data','{signature}','comment','合成確認','upload_id',NULL)";suffix=f",{literal(fields)}" if fields is not None else '';wrap='_template' if fields is not None else ''
 return 'RESET ROLE;'+auth(5)+f"DO $t$ DECLARE c jsonb;BEGIN SELECT {c} INTO c FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.tenant_id=q.tenant_id AND s.request_id=q.id AND s.status NOT IN('DRAFT','CANCELLED') JOIN dqa_business.schedule_drafts d ON d.tenant_id=q.tenant_id AND d.request_id=q.id WHERE q.id='{REQ}';PERFORM dqa_business.prepare_human{wrap}_operation('{T}','{op(number)}',c{suffix});PERFORM dqa_business.execute_human{wrap}_operation('{T}','{op(number)}',c{suffix},NULL);END $t$;"
def prepared(fields=PREP):return second()+human('PREPARE',20,fields,'')
def execute(sql,priority='一般'):return subprocess.run(cmd,input='BEGIN;'+fixture(priority)+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
def other_request(external=False):
 other='ed000000-0000-4000-8000-000000000001'
 data=dict(trial_id='a3000000-0000-0000-0000-000000000001',product_code='SYNTHETIC-2',customer_name='SYNTHETIC',purpose='合成驗證',quantity=3,requested_date='2027-01-08',sample_space_units=1,specification='試驗時間：250 小時。',acceptance='合成判定',form_details={'testItems':['Synthetic humidity'],'purpose':['合成驗證'],'priority':'委外' if external else '一般'},draft_signature_data=SIG)
 return 'RESET ROLE;'+auth(2)+f"SELECT dqa_business.create_request_draft('{T}','{other}',{literal(data)});"+(review(2,'SUBMIT',1)+review(1,'MANAGER_APPROVE',2)+number()+plan(external)).replace('ef000000-0000-4000-8000-','ed000000-0000-4000-8000-')
class Tests(unittest.TestCase):
 def ok(self,sql,last,priority='一般'):
  r=execute(sql,priority);self.assertEqual(r.returncode,0,r.stderr[-3300:]);self.assertEqual(r.stdout.strip().splitlines()[-1],last)
 def deny(self,sql,code,priority='一般'):
  r=execute(sql,priority);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-3300:])
 def test_first_requires_confirmed_plan(self):self.deny(review(3,'LMS_APPROVE',12,plain=True),'PREAPPROVAL_PLAN_REQUIRED')
 def test_plan_requires_review_assigned_sample_number(self):self.deny(plan(),'PREAPPROVAL_SAMPLE_REQUIRED')
 def test_first_signature_reserves_before_second_review(self):self.ok(first()+f"RESET ROLE;SELECT q.status,q.request_review_level,s.status,(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}';",'AWAITING_LMS_REVIEW|1|PENDING_APPROVAL|1')
 def test_second_promotes_the_same_schedule(self):self.ok(second()+f"RESET ROLE;SELECT q.status,s.status,(SELECT count(*) FROM dqa_business.schedules WHERE request_id=q.id) FROM dqa_business.requests q JOIN dqa_business.schedules s ON s.request_id=q.id WHERE q.id='{REQ}';",'AWAITING_LAB_RECEIPT|AWAITING_RECEIPT|1')
 def test_derived_plan_fields_cannot_be_forged(self):self.deny(number()+plan()+review(3,'LMS_APPROVE',12,{**FIRST,'plannedOperator':'偽造人員'},'1'),'PREAPPROVAL_DERIVED_FIELDS_IMMUTABLE')
 def test_first_signature_uses_actual_plan_names_dates_and_number(self):self.ok(first()+f"SELECT dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->'fields'->>'equipment1',dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->'fields'->>'plannedOperator' FROM dqa_business.requests q WHERE id='{REQ}';",'恆溫恆濕機 合成|合成執行者')
 def test_number_is_not_editable_after_first_signature(self):self.deny(first()+number('CHANGED',1,19),'PLANNING_ACCESS_DENIED')
 def test_executor_cannot_read_before_second_signature(self):self.ok(first()+auth(5)+f"SELECT count(*) FROM dqa_business.requests WHERE id='{REQ}';",'0')
 def test_prepare_is_unsigned_and_does_not_start_receipt(self):self.ok(prepared()+f"SELECT s.status,s.received_at IS NULL,(SELECT count(*) FROM dqa_business.request_signatures WHERE request_id=s.request_id AND approval_event_id IN(SELECT id FROM dqa_business.approval_events WHERE stage='LAB_PREPARE')) FROM dqa_business.schedules s WHERE request_id='{REQ}';",'AWAITING_RECEIPT|t|0')
 def test_final_signature_requires_preparation_form(self):self.deny(second()+human('RECEIVE',21,{'executionAbnormal':'no'}),'TEMPLATE_STAGE_FIELDS_REQUIRED')
 def test_preparation_abnormalities_prevent_signature(self):self.deny(prepared({**PREP,'sampleCorrect':'no'})+human('RECEIVE',21,{'executionAbnormal':'no'}),'PREPARATION_NOT_READY')
 def test_explicit_no_abnormality_confirmation_is_required(self):self.deny(prepared()+human('RECEIVE',21,{}),'TEMPLATE_STAGE_FIELDS_REQUIRED')
 def test_final_confirmation_signs_before_start(self):self.ok(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'})+f"SELECT status,received_at IS NOT NULL FROM dqa_business.schedules WHERE request_id='{REQ}';",'BOOKED|t')
 def test_direct_receipt_cannot_skip_final_no_abnormality_confirmation(self):self.deny(prepared()+human('RECEIVE',21,fields=None),'TEMPLATE_STAGE_FIELDS_REQUIRED')
 def test_confirmation_cannot_rewrite_preparation_answers(self):self.deny(prepared()+human('RECEIVE',21,{'executionAbnormal':'no','sampleQuantity':99}),'TEMPLATE_STAGE_FIELDS_INVALID')
 def test_outsource_forces_virtual_device_and_no_physical_allocation(self):self.ok(first(True)+f"RESET ROLE;SELECT s.plan->>'equipment_label',s.plan->>'outsourced',(SELECT count(*) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}';",'委外設備|true|0','委外')
 def test_outsource_autofills_first_review_and_completion_date(self):self.ok(first(True)+f"SELECT dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->'fields'->>'equipment1',dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->'fields'->>'outsourced' FROM dqa_business.requests q WHERE id='{REQ}';",'委外設備|yes','委外')
 def test_internal_request_cannot_forge_no_equipment_outsourcing(self):self.deny(number()+plan(True),'PLANNING_EQUIPMENT_REQUIRED')
 def test_outsource_request_cannot_select_an_internal_device(self):self.deny(number()+plan(False),'PLANNING_EQUIPMENT_REQUIRED','委外')
 def test_unsigned_draft_plan_is_visible_without_fabricating_signature(self):self.ok(number()+plan()+f"SELECT dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->>'preview_only',dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LMS_1'->>'signature_data' IS NULL FROM dqa_business.requests q WHERE id='{REQ}';",'true|t')
 def test_number_operation_is_idempotent(self):self.ok(number()+number()+f"SELECT dqa_business.preapproval_number_result('{T}','{op(10)}')->>'revision';",'1')
 def test_changed_number_invalidates_saved_plan(self):self.deny(number()+plan()+number('CHANGED',1,18)+review(3,'LMS_APPROVE',12,FIRST,'1'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_first_cannot_approve_against_a_different_draft_revision(self):self.deny(number()+plan()+review(3,'LMS_APPROVE',12,FIRST,'2'),'PREAPPROVAL_PLAN_REQUIRED')
 def test_changed_catalog_is_checked_again_before_signature(self):
  sql=number()+plan()+review(3,'LMS_APPROVE',12,FIRST,'1',True)+f"RESET ROLE;UPDATE dqa_business.equipment SET name=name||' changed' WHERE id='{EQ}';"+auth(3)+f"SELECT dqa_business.execute_request_template_operation('{T}','{op(12)}',current_setting('dqa.preapproval_command')::jsonb,{literal(FIRST)},1);"
  self.deny(sql,'REVISION_CONFLICT')
 def test_first_replay_does_not_reserve_twice_or_sign_twice(self):
  call=f"SELECT dqa_business.execute_request_template_operation('{T}','{op(12)}',current_setting('dqa.preapproval_command')::jsonb,{literal(FIRST)},1);"
  self.ok(number()+plan()+review(3,'LMS_APPROVE',12,FIRST,'1',True)+call+call+f"SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LMS_1';",'1')
 def test_second_return_releases_pending_reservations(self):
  sql=first()+review(4,'RETURN',13)+f"RESET ROLE;SELECT status,(SELECT bool_and(released_at IS NOT NULL) FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{REQ}';"
  self.ok(sql,'CANCELLED|t')
 def test_wrong_reviewer_cannot_number_or_plan(self):self.deny(number().replace(auth(3),auth(4)),'PLANNING_ACCESS_DENIED')
 def test_preparation_answers_visible_before_signature_without_signature_data(self):self.ok(prepared()+f"SELECT dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages'->'LAB_PREPARE'->'fields'->>'sampleQuantity',dqa_business.document_mapping_stage_context('{T}',q.request_document_version_id)->'stages' ? 'LAB_RECEIVE' FROM dqa_business.requests q WHERE id='{REQ}';",'3|f')
 def test_improved_but_still_marked_abnormal_cannot_sign(self):self.deny(prepared({**PREP,'fixturesReady':'no','fixturesImprovedDate':'2026-11-25'})+human('RECEIVE',21,{'executionAbnormal':'no'}),'PREPARATION_NOT_READY')
 def test_outsource_requires_actual_outsource_booking_confirmation(self):self.deny(second(True)+human('PREPARE',20,PREP,'')+human('RECEIVE',21,{'executionAbnormal':'no'}),'PREPARATION_NOT_READY','委外')
 def test_preparation_must_be_unsigned(self):self.deny(second()+human('PREPARE',20,PREP,SIG),'HUMAN_FIELDS_INVALID')
 def test_final_confirmation_must_have_signature(self):self.deny(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'},''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_preparation_has_no_default_yes_values(self):self.deny(second()+human('PREPARE',20,{},''),'TEMPLATE_STAGE_FIELDS_REQUIRED')
 def test_private_tables_and_policy_are_not_client_writable(self):self.deny(auth(3)+"UPDATE dqa_private.preapproval_cutover SET enabled=false;",'permission denied')
 def test_preparation_does_not_allow_early_or_service_autostart(self):
  self.ok(prepared()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute' WHERE request_id='{REQ}';SET LOCAL request.jwt.claim.role='service_role';SELECT dqa_business.start_due_lab_trials('{T}')->>'started';",'0')
 def test_real_trial_autostarts_only_after_prestart_signature(self):
  self.ok(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'})+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute' WHERE request_id='{REQ}';SET LOCAL request.jwt.claim.role='service_role';SELECT dqa_business.start_due_lab_trials('{T}')->>'started';",'1')
 def test_outsourced_trial_autostarts_without_internal_equipment(self):
  self.ok(second(True)+human('PREPARE',20,{**PREP,'outsourceBooked':'yes'},'')+human('RECEIVE',21,{'executionAbnormal':'no'})+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '1 minute' WHERE request_id='{REQ}';SET LOCAL request.jwt.claim.role='service_role';SELECT dqa_business.start_due_lab_trials('{T}')->>'started';",'1','委外')
 def test_first_signature_preserves_original_document_bytes(self):
  self.ok(f"RESET ROLE;SELECT set_config('test.originalhash',(SELECT document_sha256 FROM dqa_business.request_document_versions WHERE request_id='{REQ}'),true);"+first()+f"RESET ROLE;SELECT document_sha256=current_setting('test.originalhash') FROM dqa_business.request_document_versions WHERE request_id='{REQ}';",'t')
 def test_executor_mail_is_queued_only_after_second_signature(self):
  setup=f"RESET ROLE;UPDATE dqa_private.business_mail_policy SET enabled=true WHERE tenant_id='{T}';INSERT INTO dqa_business.notification_preferences(tenant_id,member_id,enabled) VALUES('{T}','{EX}',true);"
  self.ok(setup+first()+f"RESET ROLE;DO $t$ BEGIN IF EXISTS(SELECT 1 FROM dqa_private.business_mail_outbox WHERE request_id='{REQ}' AND kind='LAB_RECEIPT') THEN RAISE EXCEPTION 'EARLY_EXECUTOR_MAIL';END IF;END $t$;"+review(4,'LMS_APPROVE',13)+f"RESET ROLE;SELECT count(*) FROM dqa_private.business_mail_outbox WHERE request_id='{REQ}' AND kind='LAB_RECEIPT' AND recipient_id='{EX}';",'1')
 def test_other_tenant_cannot_read_preapproval_context(self):
  self.deny(first()+"RESET ROLE;SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SET LOCAL ROLE authenticated;"+f"SELECT dqa_business.preapproval_context('{T}','{REQ}');",'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_historical_first_signature_retains_original_scheduling_order(self):
  self.ok(f"RESET ROLE;UPDATE dqa_private.preapproval_cutover SET enabled=false;"+review(3,'LMS_APPROVE',12)+f"RESET ROLE;UPDATE dqa_private.preapproval_cutover SET enabled=true,cutover_at=clock_timestamp();"+review(4,'LMS_APPROVE',13)+f"SELECT status FROM dqa_business.requests WHERE id='{REQ}';",'AWAITING_SCHEDULING')
 def test_no_transition_permits_survive_success(self):
  self.ok(prepared()+human('RECEIVE',21,{'executionAbnormal':'no'})+"RESET ROLE;SELECT (SELECT count(*) FROM dqa_private.human_permits)+(SELECT count(*) FROM dqa_private.request_transition_permits);",'0')
 def test_pending_first_signature_reserves_internal_device(self):self.deny(first()+other_request(),'PLANNING_RESOURCE_CONFLICT')
 def test_outsourced_trials_still_check_executor_time_conflicts(self):self.deny(first(True)+other_request(True),'PLANNING_RESOURCE_CONFLICT','委外')
 def test_outsourced_device_allows_parallel_trials_with_different_executors(self):
  newex='a2000000-0000-0000-0000-000000000006';setup=f"RESET ROLE;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(6)}','second-preflight@example.invalid',clock_timestamp());INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('{newex}','{T}','{uid(6)}','PREFLIGHT2','合成執行者2','a1000000-0000-0000-0000-000000000005','second-preflight@example.invalid');"
  self.ok(first(True)+setup+other_request(True).replace(EX,newex)+"SELECT 'parallel-external-ready';",'parallel-external-ready','委外')
 def test_second_return_resubmit_requires_new_number_and_plan_but_preserves_old_signatures(self):
  sql=first()+review(4,'RETURN',13)+review(2,'SUBMIT',30)+review(1,'MANAGER_APPROVE',31)+f"SELECT dqa_business.preapproval_context('{T}','{REQ}')->>'sample_code' IS NULL;"
  self.ok(sql,'t')
 def test_resubmitted_request_can_complete_both_reviews_without_overwriting_cancelled_schedule(self):
  sql=first()+review(4,'RETURN',13)+review(2,'SUBMIT',30)+review(1,'MANAGER_APPROVE',31)+number(revision=1,oid=32)+plan(oid=33)+review(3,'LMS_APPROVE',34,FIRST,'2')+review(4,'LMS_APPROVE',35)+f"RESET ROLE;SELECT count(*),count(DISTINCT legacy_id),count(*) FILTER(WHERE status='CANCELLED'),count(*) FILTER(WHERE status='AWAITING_RECEIPT') FROM dqa_business.schedules WHERE request_id='{REQ}';"
  self.ok(sql,'2|2|1|1')
 def test_legacy_plan_shape_keeps_existing_booking_compatibility(self):
  sql=f"RESET ROLE;UPDATE dqa_private.preapproval_cutover SET enabled=false;"+review(3,'LMS_APPROVE',12)+review(4,'LMS_APPROVE',13)+f"RESET ROLE;UPDATE dqa_business.roles SET permissions=permissions||ARRAY['schedules.plan','requests.read_all','equipment.read','catalog.read'],pages=pages||ARRAY['schedule'] WHERE id='a1000000-0000-0000-0000-000000000003';"+plan()+f"SELECT NOT(plan ? 'flow_version') AND NOT(plan->'allocations'->0 ? 'equipment_name') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';"
  self.ok(sql,'t')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
