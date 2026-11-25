"""Native synthetic review/receipt tests. Network-disabled local PostgreSQL; every transaction rolls back."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
human_fixture=fixture
original_run_action=run_action
FIELDS={'allowed':'yes','sampleCode':'SYN-001'}
RECEIPT={'sampleCorrect':'yes','sampleQuantity':3,'sampleReceivedDate':'2026-11-25','executionAbnormal':'pending'}
ROWS=[{'field':v,'sheet':'原稿','cell':'A'+str(i+1)} for i,v in enumerate(['lms1AllowedYesCheck','lms1SampleCode','lms1Signature','lms2Signature','labSampleCorrectYesCheck','labSampleQuantity','labSampleReceivedDate','labExecutionAbnormalYesCheck','labAbnormalDescription','labReceiptSignature'])]
BLANK='f9000000-0000-4000-8000-000000000001'
def wrapper_review(i,c,number,fields=FIELDS,phase=None):
 q=literal(c);f=literal(fields);phases=[phase] if phase else ['prepare','execute'];return auth(i)+''.join(f"SELECT dqa_business.{p}_request_template_operation('{T}','{op(number)}',{q},{f});" for p in phases)
def run_action(i,c,number):return wrapper_review(i,c,number) if c['action']=='LMS_APPROVE' and i==3 else original_run_action(i,c,number)
def blank_setup():
 import hashlib
 content=b'PK\x03\x04'+b'0'*30;h=hashlib.sha256(content).hexdigest()
 return f"RESET ROLE;INSERT INTO dqa_private.blank_request_templates(tenant_id,id,name,version,content,sha256,created_by) VALUES('{T}','{BLANK}','合成委託單.xlsx','V1',decode('{base64.b64encode(content).decode()}','base64'),'{h}','{uid(1)}');INSERT INTO dqa_private.blank_request_template_state(tenant_id,default_template_id) VALUES('{T}','{BLANK}') ON CONFLICT(tenant_id) DO UPDATE SET default_template_id=EXCLUDED.default_template_id;"+auth(1)+f"SELECT dqa_business.save_document_mapping('{T}','f9000000-0000-4000-8000-000000000002','REQUEST','{BLANK}',0,'{h}',{literal(ROWS)});RESET ROLE;"
def fixture():return blank_setup()+human_fixture()
def wrapped_human(action,number=2,fields=RECEIPT,who=5,phase=None,replay=False):
 sql=human(action,who,number)
 sql=sql.replace('prepare_human_operation(', 'prepare_human_template_operation(').replace('execute_human_operation(', 'execute_human_template_operation(')
 sql=sql.replace(',c);',',c,'+literal(fields)+');').replace(',c,NULL);',',c,'+literal(fields)+',NULL);')
 if phase=='prepare':sql=sql[:sql.index('PERFORM dqa_business.execute')]+"PERFORM set_config('dqa.stage_command',c::text,true);END $test$;"
 if replay:sql=sql.replace('END $test$;',f"PERFORM dqa_business.execute_human_template_operation('{T}','ef400000-0000-4000-8000-{number:012d}',c,{literal(fields)},NULL);END $test$;")
 return sql
def ctx(signatures=True):return f"dqa_business.document_mapping_case('{T}','REQUEST',(SELECT request_document_version_id FROM dqa_business.requests WHERE id='{REQ}'))->'stages'" if signatures else f"dqa_business.document_mapping_stage_context('{T}',(SELECT request_document_version_id FROM dqa_business.requests WHERE id='{REQ}'))"
def execute(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,value):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],value)
 def deny(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0,r.stdout[-300:]);self.assertIn(code,r.stderr[-2400:])
 def test_first_and_second_review_and_original_signers_are_canonical(self):self.ok(auth(1)+f"SELECT ({ctx()}->'LMS_1'->'fields'->>'sampleCode'),({ctx()}->'LMS_2'->>'signature_data')='{SIG}',({ctx()} ?& ARRAY['REQUESTER','REQUEST_MANAGER']);",'SYN-001|t|t')
 def test_context_inputs_never_exposes_signature_bytes(self):self.ok(auth(1)+f"SELECT {ctx(False)}->'stages'->'LMS_1' ? 'signature_data';",'f')
 def test_requester_can_read_authorized_stage_checks(self):self.ok(auth(2)+f"SELECT {ctx()}->'LMS_1'->'fields'->>'allowed';",'yes')
 def test_cross_tenant_context_denied(self):self.deny("RESET ROLE;SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SET LOCAL ROLE authenticated;"+f"SELECT {ctx()};",'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_first_inputs_do_not_rewrite_original_payload(self):self.ok(f"RESET ROLE;SELECT NOT(payload ? 'allowed') AND NOT(payload->'form_details' ? 'allowed') FROM dqa_business.request_document_versions WHERE request_id='{REQ}';",'t')
 def test_direct_receipt_cannot_skip_mapped_checklist(self):self.deny(booked()+human('RECEIVE',5,2),'TEMPLATE_STAGE_FIELDS_REQUIRED')
 def test_receipt_persists_choices_and_signed_document(self):self.ok(booked()+wrapped_human('RECEIVE')+f"SELECT {ctx()}->'LAB_RECEIVE'->'fields'->>'sampleQuantity',({ctx()}->'LAB_RECEIVE'->>'signature_data')='{SIG}';",'3|t')
 def test_receipt_repeat_is_idempotent(self):self.ok(booked()+wrapped_human('RECEIVE',replay=True)+"RESET ROLE;SELECT count(*) FROM dqa_private.request_template_stage_entries WHERE stage='LAB_RECEIVE';",'1')
 def test_wrong_executor_cannot_use_wrappers(self):self.deny(booked()+wrapped_human('RECEIVE',who=1),'HUMAN_EXECUTOR_REQUIRED')
 def test_receipt_requires_signature_in_same_operation(self):self.deny(booked()+wrapped_human('RECEIVE').replace(SIG,''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_forged_signer_fields_denied(self):self.deny(booked()+wrapped_human('RECEIVE',fields={**RECEIPT,'signature_data':SIG}),'TEMPLATE_STAGE_FIELDS_INVALID')
 def test_bad_calendar_date_denied(self):self.deny(booked()+wrapped_human('RECEIVE',fields={**RECEIPT,'sampleReceivedDate':'2026-02-30'}),'TEMPLATE_STAGE_FIELDS_INVALID')
 def test_changed_fields_on_same_prepared_operation_denied(self):
  self.deny(booked()+wrapped_human('RECEIVE',phase='prepare')+auth(5)+f"SELECT dqa_business.execute_human_template_operation('{T}','ef400000-0000-4000-8000-000000000002',current_setting('dqa.stage_command')::jsonb,{literal({**RECEIPT,'sampleQuantity':4})});",'TEMPLATE_STAGE_OPERATION_CONFLICT')
 def test_prepared_receipt_permission_revocation_is_rechecked(self):self.deny(booked()+wrapped_human('RECEIVE',phase='prepare')+"RESET ROLE;UPDATE dqa_business.roles SET permissions=array_remove(permissions,'lab.execute') WHERE id='a1000000-0000-0000-0000-000000000005';"+auth(5)+f"SELECT dqa_business.execute_human_template_operation('{T}','ef400000-0000-4000-8000-000000000002',current_setting('dqa.stage_command')::jsonb,{literal(RECEIPT)});",'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_no_partial_receipt_event_or_schedule_on_missing_fields(self):
  sql=booked()+human('RECEIVE',5,2)
  # Catch rejection inside a subtransaction, then verify the prior booking remains intact.
  start=sql.index('DO $test$');body=sql[start:].replace('END $test$;','EXCEPTION WHEN OTHERS THEN IF SQLERRM<>\'TEMPLATE_STAGE_FIELDS_REQUIRED\' THEN RAISE;END IF;END $test$;')
  self.ok(sql[:start]+body+f"RESET ROLE;SELECT status,(SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_RECEIVE') FROM dqa_business.schedules WHERE request_id='{REQ}';",'AWAITING_RECEIPT|0')
 def test_receipt_context_hidden_after_reschedule(self):
  self.ok(booked()+wrapped_human('RECEIVE')+f"RESET ROLE;ALTER TABLE dqa_business.schedules DISABLE TRIGGER USER;UPDATE dqa_business.schedules SET status='CANCELLED' WHERE request_id='{REQ}';ALTER TABLE dqa_business.schedules ENABLE TRIGGER USER;"+auth(1)+f"SELECT {ctx()} ? 'LAB_RECEIVE';",'f')
 def test_completion_finalizes_abnormal_and_retains_receipt_record(self):
  sql=booked()+wrapped_human('RECEIVE')+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()+interval '1 hour' WHERE request_id='{REQ}';"+human('START',5,3)+f"RESET ROLE;UPDATE dqa_business.schedules SET ends_at=clock_timestamp()-interval '1 hour' WHERE request_id='{REQ}';"+wrapped_human('COMPLETE',4,{'executionAbnormal':'no'})
  self.ok(sql+f"SELECT {ctx()}->'LAB_RECEIVE'->'fields'->>'executionAbnormal',{ctx()}->'LAB_COMPLETE'->'fields'->>'executionAbnormal';",'pending|no')
 def test_completion_does_not_accept_pending(self):self.deny(booked()+wrapped_human('RECEIVE')+wrapped_human('COMPLETE',4,{'executionAbnormal':'pending'}),'TEMPLATE_STAGE_FIELDS_INVALID')
 def test_private_entries_inaccessible(self):self.deny(auth(1)+"SELECT * FROM dqa_private.request_template_stage_entries",'permission denied')
 def test_private_validator_inaccessible(self):self.deny(auth(1)+"SELECT dqa_private.validate_template_stage_fields('LMS_1','{}');",'permission denied')
 def test_required_field_derivation_includes_conditional_dependencies(self):self.ok("RESET ROLE;SELECT dqa_private.template_stage_required('LAB_RECEIVE','[{\"field\":\"labAbnormalDescription\"}]') @> ARRAY['executionAbnormal','abnormalDescription'];",'t')
 def test_second_level_rejects_first_review_fields(self):self.deny("RESET ROLE;SELECT dqa_private.validate_template_stage_fields('LMS_2','{\"allowed\":\"yes\"}');",'TEMPLATE_STAGE_FIELDS_INVALID')
 def test_all_123_stage_fields_are_editable_request_mappings(self):
  # Build the mapping under the migration owner, then invoke the public RPC as the admin.
  sql="RESET ROLE;SELECT set_config('dqa.stage_map',(SELECT jsonb_agg(jsonb_build_object('field',f->>'id','sheet','原稿','cell','A'||i)) FROM jsonb_array_elements(dqa_private.template_stage_schema()->'fields') WITH ORDINALITY t(f,i))::text,true);"+auth(1)+f"SELECT dqa_business.save_document_mapping('{T}','f9000000-0000-4000-8000-000000000003','REQUEST','{BLANK}',1,(dqa_business.document_mapping_catalog('{T}')->'targets'->0->>'sha256'),current_setting('dqa.stage_map')::jsonb)->>'state';"
  self.ok(sql,'SAVED')
 def test_report_template_rejects_stage_fields(self):
  row=literal([{'field':'lms1Signature','sheet':'原稿','cell':'A1'}])
  self.deny(auth(1)+f"SELECT dqa_business.save_document_mapping('{T}','f9000000-0000-4000-8000-000000000003','REPORT','{BLANK}',0,'{'a'*64}',{row});",'DOCUMENT_MAPPING_INVALID')
 def first_stage_sql(self,sql):
  prefix=blank_setup()+base_fixture()+original_run_action(2,command(),1)+original_run_action(1,command('MANAGER_APPROVE',2),2)
  return subprocess.run(cmd,input='BEGIN;'+prefix+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
 def test_direct_first_review_cannot_bypass_required_fields(self):
  r=self.first_stage_sql(original_run_action(3,command('LMS_APPROVE',3),3));self.assertNotEqual(r.returncode,0);self.assertIn('TEMPLATE_STAGE_FIELDS_REQUIRED',r.stderr)
 def test_first_review_atomic_rollback_without_checklist(self):
  sql=auth(3)+f"DO $t$ BEGIN PERFORM dqa_business.prepare_request_operation('{T}','{op(3)}',{literal(command('LMS_APPROVE',3))});PERFORM dqa_business.execute_request_operation('{T}','{op(3)}',{literal(command('LMS_APPROVE',3))});EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'TEMPLATE_STAGE_FIELDS_REQUIRED' THEN RAISE;END IF;END $t$;RESET ROLE;SELECT request_review_level,(SELECT count(*) FROM dqa_business.approval_events WHERE request_id=q.id AND stage='LMS_1') FROM dqa_business.requests q WHERE id='{REQ}';"
  r=self.first_stage_sql(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],'0|0')
 def test_wrapper_cannot_skip_review_level(self):
  r=self.first_stage_sql(wrapper_review(4,command('LMS_APPROVE',3),3));self.assertNotEqual(r.returncode,0);self.assertIn('WORKFLOW_REVIEW_LEVEL_REQUIRED',r.stderr)
 def test_first_review_replay_keeps_single_entry(self):
  r=self.first_stage_sql(wrapper_review(3,command('LMS_APPROVE',3),3)+wrapper_review(3,command('LMS_APPROVE',3),3,phase='execute')+"RESET ROLE;SELECT count(*) FROM dqa_private.request_template_stage_entries WHERE stage='LMS_1';");self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],'1')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
