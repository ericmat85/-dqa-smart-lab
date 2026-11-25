"""Local synthetic PostgreSQL only. Every test rolls back."""
from pathlib import Path
import argparse,json,subprocess,unittest,hashlib,base64
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'];cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';MEMBER='a2000000-0000-0000-0000-000000000001';TRIAL='a3000000-0000-0000-0000-000000000001';Q='a6000000-0000-0000-0000-000000000001';DOC='cd000000-0000-4000-8000-000000000001';FILE='cf000000-0000-4000-8000-000000000001';OP='ce000000-0000-4000-8000-000000000001';ATT='ca000000-0000-4000-8000-000000000001';SHA=hashlib.sha256(b'PK\x03\x04'+b'0'*30).hexdigest();CONTENT=base64.b64encode(b'PK\x03\x04'+b'0'*30).decode()
def auth(user=U):return f"SET LOCAL request.jwt.claim.sub='{user}';SET LOCAL ROLE authenticated;"
def save(op=OP,file=FILE,revision=0,trial=TRIAL,content=CONTENT,sha=SHA,version='V1'):
 return f"SELECT dqa_business.save_trial_template_binding('{T}','{op}','{trial}',{revision},{'NULL' if file is None else chr(39)+file+chr(39)},{'NULL' if content is None else chr(39)+'合成.xlsx'+chr(39)},{'NULL' if content is None else chr(39)+version+chr(39)},{'NULL' if sha is None else chr(39)+sha+chr(39)},{'NULL' if content is None else chr(39)+content+chr(39)});"
def seed(doc=DOC,version=1,executor=MEMBER):return f"""RESET ROLE;ALTER TABLE dqa_business.requests DISABLE TRIGGER USER;ALTER TABLE dqa_business.schedules DISABLE TRIGGER USER;
DO $mapping$ DECLARE f record;BEGIN IF to_regclass('dqa_private.document_cell_mappings') IS NOT NULL THEN FOR f IN SELECT b.file_id,x.sha256 FROM dqa_private.trial_template_bindings b JOIN dqa_private.trial_template_files x ON x.tenant_id=b.tenant_id AND x.id=b.file_id WHERE b.tenant_id='{T}' AND b.trial_id='{TRIAL}' AND NOT EXISTS(SELECT 1 FROM dqa_private.document_cell_mappings c WHERE c.tenant_id=b.tenant_id AND c.kind='REPORT' AND c.file_id=b.file_id) LOOP PERFORM dqa_business.save_document_mapping('{T}',gen_random_uuid(),'REPORT',f.file_id,0,f.sha256,'[{{"field":"productCode","sheet":"原稿","cell":"A1"}}]'::jsonb);END LOOP;END IF;END $mapping$;
UPDATE dqa_business.requests SET status='AWAITING_LAB_RECEIPT' WHERE id='{Q}';UPDATE dqa_business.schedules SET status='AWAITING_RECEIPT',executor_member_id='{executor}' WHERE request_id='{Q}';
INSERT INTO dqa_business.request_document_versions(tenant_id,id,request_id,version,request_revision,payload,document_sha256,submitted_by) VALUES('{T}','{doc}','{Q}',{version},1,'{{}}','{'b'*64}','{MEMBER}');
UPDATE dqa_business.requests SET request_document_version_id='{doc}' WHERE id='{Q}';ALTER TABLE dqa_business.requests ENABLE TRIGGER USER;ALTER TABLE dqa_business.schedules ENABLE TRIGGER USER;"""+auth()
def file(doc=DOC):return f"SELECT dqa_business.request_trial_template_file('{T}','{doc}');"
def claim(attempt=ATT):return f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','{attempt}');"
def ack(attempt=ATT):return f"SELECT dqa_business.ack_trial_template_delivery('{T}','{DOC}','{attempt}');"
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+'ROLLBACK;',text=True,capture_output=True)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_catalog_no_bytes(self):self.ok(auth()+save()+f"SELECT dqa_business.trial_template_catalog('{T}')->'files'->0->>'version',dqa_business.trial_template_catalog('{T}')->'files'->0 ? 'content';",'V1|f')
 def test_manager_file_original_hash(self):self.ok(auth()+save()+f"SELECT dqa_business.trial_template_file('{T}','{FILE}')->>'content';",CONTENT)
 def test_bind_idempotent(self):self.ok(auth()+save()+save()+f"SELECT dqa_business.trial_template_catalog('{T}')->'trials'->0->>'revision';",'1')
 def test_stale_revision_rejected(self):self.deny(auth()+save()+save(op='ce000000-0000-4000-8000-000000000002',file='cf000000-0000-4000-8000-000000000002'),'TRIAL_TEMPLATE_REVISION_CONFLICT')
 def test_conflicting_operation_rejected(self):self.deny(auth()+save()+save(version='V2'),'TRIAL_TEMPLATE_OPERATION_CONFLICT')
 def test_file_id_cannot_be_overwritten(self):self.deny(auth()+save()+save(op='ce000000-0000-4000-8000-000000000002',revision=1),'TRIAL_TEMPLATE_OPERATION_CONFLICT')
 def test_bad_hash_rejected(self):self.deny(auth()+save(sha='a'*64),'TRIAL_TEMPLATE_FILE_INVALID')
 def test_wrong_trial_rejected(self):self.deny(auth()+save(trial='b3000000-0000-0000-0000-000000000001'),'TRIAL_TEMPLATE_FIELDS_INVALID')
 def test_readonly_cannot_bind(self):self.deny(auth('10000000-0000-0000-0000-000000000003')+save(),'TRIAL_TEMPLATE_ADMIN_REQUIRED')
 def test_anon_cannot_catalog(self):self.deny(f"SET LOCAL ROLE anon;SELECT dqa_business.trial_template_catalog('{T}');",'permission denied')
 def test_other_tenant_cannot_catalog(self):self.deny(auth()+"SELECT dqa_business.trial_template_catalog('b0000000-0000-0000-0000-000000000001');",'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_direct_private_table_denied(self):self.deny(auth()+"SELECT * FROM dqa_private.trial_template_files;",'permission denied')
 def test_submit_trigger_pins_original(self):self.ok(auth()+save()+seed()+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'id';",FILE)
 def test_binding_change_does_not_change_submitted_case(self):self.ok(auth()+save()+seed()+save(op='ce000000-0000-4000-8000-000000000002',file='cf000000-0000-4000-8000-000000000002',revision=1,version='V2')+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'version';",'V1')
 def test_unbind_preserves_old_case(self):self.ok(auth()+save()+seed()+save(op='ce000000-0000-4000-8000-000000000002',file=None,revision=1,content=None,sha=None)+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'id';",FILE)
 def test_no_retroactive_binding(self):self.ok(auth()+seed()+save()+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'has_template';",'false')
 def test_resubmitted_document_pins_new_version(self):self.ok(auth()+save()+seed()+save(op='ce000000-0000-4000-8000-000000000002',file='cf000000-0000-4000-8000-000000000002',revision=1,version='V2')+seed(doc='cd000000-0000-4000-8000-000000000002',version=2)+f"SELECT dqa_business.request_trial_template_file('{T}','cd000000-0000-4000-8000-000000000002')->>'version';",'V2')
 def test_old_document_no_longer_downloadable_after_resubmit(self):self.deny(auth()+save()+seed()+seed(doc='cd000000-0000-4000-8000-000000000002',version=2)+file(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_unassigned_admin_cannot_receive(self):self.deny(auth()+save()+seed(executor='a2000000-0000-0000-0000-000000000003')+file(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_unassigned_user_cannot_receive(self):self.deny(auth()+save()+seed()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+file(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_inbox_for_current_executor_only(self):self.ok(auth()+save()+seed()+f"SELECT jsonb_array_length(dqa_business.trial_template_inbox('{T}')->'rows');",'1')
 def test_claim_prevents_concurrent_tabs(self):self.ok(auth()+save()+seed()+claim()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','ca000000-0000-4000-8000-000000000002')->>'state';",'IN_PROGRESS')
 def test_claim_same_attempt_idempotent(self):self.ok(auth()+save()+seed()+claim()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','{ATT}')->>'state';",'CLAIMED')
 def test_dispatch_prevents_repeat_automatic_delivery(self):self.ok(auth()+save()+seed()+claim()+ack()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','ca000000-0000-4000-8000-000000000002')->>'state';",'DISPATCHED')
 def test_ack_wrong_attempt_denied(self):self.deny(auth()+save()+seed()+claim()+ack('ca000000-0000-4000-8000-000000000002'),'TRIAL_TEMPLATE_CLAIM_STALE')
 def test_expired_claim_can_be_recovered(self):self.ok(auth()+save()+seed()+claim()+"RESET ROLE;UPDATE dqa_private.trial_template_deliveries SET expires_at=now()-interval '1 minute';"+auth()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','ca000000-0000-4000-8000-000000000002')->>'state';",'CLAIMED')
 def test_unassigned_actor_cannot_ack(self):self.deny(auth()+save()+seed()+claim()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+ack(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_manual_file_still_available_after_dispatch(self):self.ok(auth()+save()+seed()+claim()+ack()+f"SELECT dqa_business.request_trial_template_file('{T}','{DOC}')->>'sha256';",SHA)
 def test_manual_retry_supersedes_a_stuck_claim(self):self.ok(auth()+save()+seed()+claim()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','ca000000-0000-4000-8000-000000000002',true)->>'state';",'CLAIMED')
 def test_manual_retry_invalidates_old_auto_ack(self):self.deny(auth()+save()+seed()+claim()+f"SELECT dqa_business.claim_trial_template_delivery('{T}','{DOC}','ca000000-0000-4000-8000-000000000002',true);"+ack(),'TRIAL_TEMPLATE_CLAIM_STALE')
 def test_reassigned_executor_cannot_ack(self):self.deny(auth()+save()+seed()+claim()+f"RESET ROLE;ALTER TABLE dqa_business.schedules DISABLE TRIGGER USER;UPDATE dqa_business.schedules SET executor_member_id='a2000000-0000-0000-0000-000000000003' WHERE request_id='{Q}';ALTER TABLE dqa_business.schedules ENABLE TRIGGER USER;"+auth()+ack(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_reassigned_executor_cannot_fetch_file(self):self.deny(auth()+save()+seed()+f"RESET ROLE;ALTER TABLE dqa_business.schedules DISABLE TRIGGER USER;UPDATE dqa_business.schedules SET executor_member_id='a2000000-0000-0000-0000-000000000003' WHERE request_id='{Q}';ALTER TABLE dqa_business.schedules ENABLE TRIGGER USER;"+auth()+file(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_early_phase_not_delivered_even_with_an_assignment(self):self.ok(auth()+save()+seed()+f"RESET ROLE;ALTER TABLE dqa_business.requests DISABLE TRIGGER USER;UPDATE dqa_business.requests SET status='AWAITING_SCHEDULING' WHERE id='{Q}';ALTER TABLE dqa_business.requests ENABLE TRIGGER USER;"+auth()+f"SELECT jsonb_array_length(dqa_business.trial_template_inbox('{T}')->'rows');",'0')
 def test_early_phase_file_download_denied(self):self.deny(auth()+save()+seed()+f"RESET ROLE;ALTER TABLE dqa_business.requests DISABLE TRIGGER USER;UPDATE dqa_business.requests SET status='AWAITING_SCHEDULING' WHERE id='{Q}';ALTER TABLE dqa_business.requests ENABLE TRIGGER USER;"+auth()+file(),'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_existing_case_without_pin_is_not_backfilled(self):self.ok(auth()+save()+f"RESET ROLE;SELECT count(*) FROM dqa_private.request_trial_template_pins;",'0')
 def test_result_readback(self):self.ok(auth()+save()+f"SELECT dqa_business.trial_template_result('{T}','{OP}')->>'state';",'SAVED')
 def test_missing_result_not_claimed_success(self):self.ok(auth()+f"SELECT dqa_business.trial_template_result('{T}','{OP}')->>'state';",'NOT_COMMITTED_OR_NOT_FOUND')
 def test_initializer_preserves_templates_but_cascades_case_pins(self):
  sql=auth()+save()+seed()+claim()+ack()+f"SELECT set_config('test.plan',dqa_business.preview_assistant_command('{T}','RESTART')::text,true);SELECT dqa_business.prepare_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,current_setting('test.plan')::jsonb->>'fingerprint','初始化系統');RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,'{U}','DELETE');RESET ROLE;SELECT (SELECT count(*) FROM dqa_private.trial_template_files),(SELECT count(*) FROM dqa_private.trial_template_bindings),(SELECT count(*) FROM dqa_private.request_trial_template_pins),(SELECT count(*) FROM dqa_private.trial_template_deliveries);"
  self.ok(sql,'1|1|0|0')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not r.wasSuccessful())
