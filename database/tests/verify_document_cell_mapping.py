"""Synthetic local PostgreSQL only; every mutation rolls back."""
from pathlib import Path
import argparse,json,subprocess,unittest,hashlib,base64
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'];cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';M='a2000000-0000-0000-0000-000000000001';TRIAL='a3000000-0000-0000-0000-000000000001';Q='a6000000-0000-0000-0000-000000000001';DOC='cd000000-0000-4000-8000-000000000001';F='cf000000-0000-4000-8000-000000000001';B='bf000000-0000-4000-8000-000000000001';OP='ce000000-0000-4000-8000-000000000001';SHA=hashlib.sha256(b'PK\x03\x04'+b'0'*30).hexdigest();CONTENT=base64.b64encode(b'PK\x03\x04'+b'0'*30).decode();MAP=[{'field':'productCode','sheet':'原稿','cell':'A1'}]
def auth(user=U):return f"SET LOCAL request.jwt.claim.sub='{user}';SET LOCAL ROLE authenticated;"
def report():return f"SELECT dqa_business.save_trial_template_binding('{T}','{OP}','{TRIAL}',0,'{F}','合成報告.xlsx','V1','{SHA}','{CONTENT}');"
def blank(default=True):return f"RESET ROLE;INSERT INTO dqa_private.blank_request_templates(tenant_id,id,name,version,content,sha256,created_by) VALUES('{T}','{B}','委託單.xlsx','V1',decode('{CONTENT}','base64'),'{SHA}','{U}');"+(f"INSERT INTO dqa_private.blank_request_template_state(tenant_id,default_template_id) VALUES('{T}','{B}') ON CONFLICT(tenant_id) DO UPDATE SET default_template_id=EXCLUDED.default_template_id;" if default else '')+auth()
def mapping(kind='REPORT',file=F,revision=0,op='de000000-0000-4000-8000-000000000001',rows=MAP):return f"SELECT dqa_business.save_document_mapping('{T}','{op}','{kind}','{file}',{revision},'{SHA}','{json.dumps(rows,ensure_ascii=False)}');"
def seed(payload=None,doc=DOC,version=1,executor=M):
 payload=payload or {'request_legacy_id':'SYNTHETIC','product_code':'A08','form_details':{'sampleSource':['社內'],'sampleSourceOther':'生產一課'}}
 return f"RESET ROLE;ALTER TABLE dqa_business.requests DISABLE TRIGGER USER;ALTER TABLE dqa_business.schedules DISABLE TRIGGER USER;UPDATE dqa_business.requests SET status='AWAITING_LAB_RECEIPT' WHERE id='{Q}';UPDATE dqa_business.schedules SET status='AWAITING_RECEIPT',executor_member_id='{executor}' WHERE request_id='{Q}';INSERT INTO dqa_business.request_document_versions(tenant_id,id,request_id,version,request_revision,payload,document_sha256,submitted_by) VALUES('{T}','{doc}','{Q}',{version},1,'{json.dumps(payload,ensure_ascii=False)}','{'b'*64}','{M}');UPDATE dqa_business.requests SET request_document_version_id='{doc}' WHERE id='{Q}';ALTER TABLE dqa_business.requests ENABLE TRIGGER USER;ALTER TABLE dqa_business.schedules ENABLE TRIGGER USER;"+auth()
def case(kind='REPORT',doc=DOC):return f"dqa_business.document_mapping_case('{T}','{kind}','{doc}')"
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+'ROLLBACK;',text=True,capture_output=True)
class Tests(unittest.TestCase):
 def ok(self,sql,value):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],value)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_manager_mapping_saved(self):self.ok(auth()+report()+mapping()+f"SELECT dqa_business.document_mapping_catalog('{T}')->'targets'->0->>'revision';",'1')
 def test_mapping_no_file_bytes_in_catalog(self):self.ok(auth()+report()+mapping()+f"SELECT dqa_business.document_mapping_catalog('{T}')->'targets'->0 ? 'content';",'f')
 def test_mapping_same_operation_idempotent(self):self.ok(auth()+report()+mapping()+mapping()+f"SELECT dqa_business.document_mapping_catalog('{T}')->'targets'->0->>'revision';",'1')
 def test_mapping_conflict(self):self.deny(auth()+report()+mapping()+mapping(op='de000000-0000-4000-8000-000000000002'),'DOCUMENT_MAPPING_CONFLICT')
 def test_mapping_operation_fingerprint(self):self.deny(auth()+report()+mapping()+mapping(rows=[{**MAP[0],'cell':'A2'}]),'DOCUMENT_MAPPING_CONFLICT')
 def test_unknown_outcome_lookup(self):self.ok(auth()+report()+mapping()+f"SELECT dqa_business.document_mapping_result('{T}','de000000-0000-4000-8000-000000000001')->>'state';",'SAVED')
 def test_unknown_operation_not_replayed(self):self.ok(auth()+f"SELECT dqa_business.document_mapping_result('{T}','de000000-0000-4000-8000-000000000001')->>'state';",'NOT_COMMITTED_OR_NOT_FOUND')
 def test_readonly_cannot_map(self):self.deny(auth()+report()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+mapping(),'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_anon_cannot_catalog(self):self.deny(f"SET LOCAL ROLE anon;SELECT dqa_business.document_mapping_catalog('{T}');",'permission denied')
 def test_other_tenant_cannot_catalog(self):self.deny(auth()+"SELECT dqa_business.document_mapping_catalog('b0000000-0000-0000-0000-000000000001');",'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_private_table_no_direct_read(self):self.deny(auth()+"SELECT * FROM dqa_private.mapped_document_pins;",'permission denied')
 def test_request_and_report_sources_separate(self):self.deny(auth()+blank()+mapping(kind='REPORT',file=B),'DOCUMENT_MAPPING_NOT_FOUND')
 def test_report_upload_cannot_copy_blank_hash(self):self.deny(auth()+blank()+report(),'TRIAL_TEMPLATE_REQUEST_FORM_DENIED')
 def test_request_mapping_requires_bound_default(self):self.deny(auth()+blank(default=False)+mapping(kind='REQUEST',file=B),'DOCUMENT_MAPPING_NOT_FOUND')
 def test_coordinate_limit(self):self.deny(auth()+report()+mapping(rows=[{**MAP[0],'cell':'AW1'}]),'DOCUMENT_MAPPING_INVALID')
 def test_no_duplicate_cell(self):self.deny(auth()+report()+mapping(rows=MAP+MAP),'DOCUMENT_MAPPING_INVALID')
 def test_signature_field_denied(self):self.deny(auth()+report()+mapping(rows=[{**MAP[0],'field':'requesterSignature'}]),'DOCUMENT_MAPPING_INVALID')
 def test_mapping_required_before_submission(self):self.deny(auth()+report()+seed(),'DOCUMENT_MAPPING_REQUIRED')
 def test_sample_source_content_required(self):self.deny(auth()+seed(payload={'form_details':{'sampleSource':['社內']}}),'ORIGINAL_SOURCE_REQUIRED')
 def test_request_source_snapshot_copies_bytes(self):self.ok(auth()+blank()+mapping(kind='REQUEST',file=B)+seed()+f"SELECT {case('REQUEST')}->>'content';",CONTENT)
 def test_report_snapshot_and_payload(self):self.ok(auth()+report()+mapping()+seed()+f"SELECT {case()}->'mapping'->0->>'cell', {case()}->'payload'->>'product_code';",'A1|A08')
 def test_mapping_edits_do_not_change_submitted_snapshot(self):self.ok(auth()+report()+mapping()+seed()+mapping(revision=1,op='de000000-0000-4000-8000-000000000002',rows=[{**MAP[0],'cell':'A2'}])+f"SELECT {case()}->'mapping'->0->>'cell';",'A1')
 def test_resubmission_new_mapping(self):self.ok(auth()+report()+mapping()+seed()+mapping(revision=1,op='de000000-0000-4000-8000-000000000002',rows=[{**MAP[0],'cell':'A2'}])+seed(doc='cd000000-0000-4000-8000-000000000002',version=2)+f"SELECT {case(doc='cd000000-0000-4000-8000-000000000002')}->'mapping'->0->>'cell';",'A2')
 def test_unassigned_executor_cannot_get_report(self):self.deny(auth()+report()+mapping()+seed(executor='a2000000-0000-0000-0000-000000000003')+f"SELECT {case()};",'TRIAL_TEMPLATE_ACCESS_DENIED')
 def test_no_bound_request_uses_builtin(self):self.ok(auth()+seed()+f"SELECT {case('REQUEST')}->>'has_template';",'false')
 def test_pin_content_cannot_change_through_mapping_rpc(self):self.ok(auth()+blank()+mapping(kind='REQUEST',file=B)+seed()+mapping(kind='REQUEST',file=B,revision=1,op='de000000-0000-4000-8000-000000000002',rows=[{**MAP[0],'cell':'A2'}])+f"SELECT {case('REQUEST')}->'mapping'->0->>'cell';",'A1')
 def test_request_reference_delete_does_not_erase_submitted_content(self):self.ok(auth()+blank()+mapping(kind='REQUEST',file=B)+seed()+f"RESET ROLE;UPDATE dqa_private.blank_request_template_state SET default_template_id=NULL WHERE tenant_id='{T}';DELETE FROM dqa_private.blank_request_templates WHERE tenant_id='{T}' AND id='{B}';"+auth()+f"SELECT {case('REQUEST')}->>'content';",CONTENT)
 def test_report_context_enforces_current_executor(self):self.ok(auth()+report()+mapping()+seed()+f"SELECT dqa_business.document_mapping_report_context('{T}','{Q}')->>'kind';",'REPORT')
 def test_old_document_denied_after_resubmission(self):self.deny(auth()+report()+mapping()+seed()+seed(doc='cd000000-0000-4000-8000-000000000002',version=2)+f"SELECT {case()};",'DOCUMENT_MAPPING_ACCESS_DENIED')
 def test_initializer_preserves_mapping_and_reference_but_cascades_case_pin(self):
  sql=auth()+report()+mapping()+seed()+f"SELECT set_config('test.plan',dqa_business.preview_assistant_command('{T}','RESTART')::text,true);SELECT dqa_business.prepare_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,current_setting('test.plan')::jsonb->>'fingerprint','初始化系統');RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,'{U}','DELETE');RESET ROLE;SELECT (SELECT count(*) FROM dqa_private.document_cell_mappings),(SELECT count(*) FROM dqa_private.trial_template_files),(SELECT count(*) FROM dqa_private.mapped_document_pins);"
  self.ok(sql,'1|1|0')
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests);result=unittest.TextTestRunner(verbosity=2).run(suite);Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
