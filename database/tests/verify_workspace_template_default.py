"""Template CRUD, permissions and isolation. Local synthetic PostgreSQL only; all writes roll back."""
from pathlib import Path
import argparse,json,os,subprocess,unittest,hashlib,base64
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'] and s['container'].startswith('dqa-business-local-');cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';OTHER='b0000000-0000-0000-0000-000000000001';ID='ef880000-0000-4000-8000-000000000001';OP='ef890000-0000-4000-8000-000000000001';OP2='ef890000-0000-4000-8000-000000000002';data=b'PK\x03\x04'+b'0'*30;SHA=hashlib.sha256(data).hexdigest();CONTENT=base64.b64encode(data).decode()
def auth(user=U):return f"SET LOCAL request.jwt.claim.sub='{user}';SET LOCAL ROLE authenticated;"
def save(t=T,op=OP,ident=ID,sha=SHA,name='空白委託V1.xlsx'):return f"SELECT dqa_business.save_blank_request_template('{t}','{op}','{ident}','{name}','V1','{sha}','{CONTENT}');"
def delete(ident=ID,revision=1,op=OP2,t=T):return f"SELECT dqa_business.delete_blank_request_template('{t}','{op}','{ident}',{revision});"
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+'ROLLBACK;',text=True,capture_output=True)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_default_row_visible_and_no_bytes_in_list(self):self.ok(auth()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'builtin_visible',dqa_business.blank_request_template_library('{T}')->'rows';",'true|[]')
 def test_multiple_versions_accumulate(self):self.ok(auth()+save()+save(op=OP2,ident='ef880000-0000-4000-8000-000000000002')+f"SELECT jsonb_array_length(dqa_business.blank_request_template_library('{T}')->'rows');",'2')
 def test_original_file_and_sha_preserved(self):self.ok(auth()+save()+f"SELECT dqa_business.blank_request_template_file('{T}','{ID}')->>'content',dqa_business.blank_request_template_file('{T}','{ID}')->>'sha256';",CONTENT+'|'+SHA)
 def test_uploaded_row_delete_preserves_cases(self):self.ok(auth()+save()+delete()+f"RESET ROLE;SELECT (SELECT count(*) FROM dqa_private.blank_request_templates),(SELECT count(*) FROM dqa_business.requests WHERE tenant_id='{T}');",'0|2')
 def test_default_delete_is_shared_and_retains_saved_versions(self):self.ok(auth()+save()+delete('BLANK',0)+f"SELECT dqa_business.blank_request_template_library('{T}')->>'builtin_visible',jsonb_array_length(dqa_business.blank_request_template_library('{T}')->'rows');",'false|1')
 def test_readers_can_read_but_cannot_manage(self):self.ok(auth()+save()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+f"SELECT dqa_business.blank_request_template_library('{T}')->>'can_manage',dqa_business.blank_request_template_file('{T}','{ID}')->>'name';",'false|空白委託V1.xlsx')
 def test_reader_delete_denied(self):self.deny(auth()+save()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+delete(),'TEMPLATE_ADMIN_REQUIRED')
 def test_reader_save_denied(self):self.deny(auth('10000000-0000-0000-0000-000000000003')+save(),'TEMPLATE_ADMIN_REQUIRED')
 def test_anonymous_cannot_read(self):self.deny(f"SET LOCAL ROLE anon;SELECT dqa_business.blank_request_template_library('{T}');",'permission denied')
 def test_other_workspace_cannot_read(self):self.deny(auth()+f"SELECT dqa_business.blank_request_template_library('{OTHER}');",'TEMPLATE_ACCESS_DENIED')
 def test_other_workspace_cannot_delete(self):self.deny(auth()+delete(t=OTHER),'TEMPLATE_ADMIN_REQUIRED')
 def test_save_idempotency(self):self.ok(auth()+save()+save()+"RESET ROLE;SELECT count(*) FROM dqa_private.blank_request_templates;",'1')
 def test_receipt_after_delete_never_recreates_file(self):self.ok(auth()+save()+delete()+save()+"RESET ROLE;SELECT count(*) FROM dqa_private.blank_request_templates;",'0')
 def test_operation_cannot_be_reused_with_new_payload(self):self.deny(auth()+save()+save(name='不同版本.xlsx'),'TEMPLATE_OPERATION_CONFLICT')
 def test_delete_idempotency(self):self.ok(auth()+save()+delete()+delete()+f"SELECT dqa_business.blank_request_template_result('{T}','{OP2}')->>'state';",'DELETED')
 def test_stale_default_revision_rejected(self):self.deny(auth()+delete('BLANK',2),'REVISION_CONFLICT')
 def test_stale_file_revision_rejected(self):self.deny(auth()+save()+delete(revision=2),'REVISION_CONFLICT')
 def test_bad_hash_rejected(self):self.deny(auth()+save(sha='a'*64),'TEMPLATE_FILE_INVALID')
 def test_filename_path_rejected(self):self.deny(auth()+save(name='../blank.xlsx'),'TEMPLATE_FIELDS_INVALID')
 def test_duplicate_document_id_cannot_overwrite(self):self.deny(auth()+save()+save(op=OP2,name='新檔案.xlsx'),'TEMPLATE_OPERATION_CONFLICT')
 def test_private_table_no_direct_read_or_mutation(self):self.deny(auth()+"SELECT * FROM dqa_private.blank_request_templates;",'permission denied')
 def test_result_not_found_does_not_claim_success(self):self.ok(auth()+f"SELECT dqa_business.blank_request_template_result('{T}','{OP}')->>'state';",'NOT_COMMITTED_OR_NOT_FOUND')
 def test_no_file_data_in_audit(self):self.ok(auth()+save()+f"SELECT changed_columns::text FROM dqa_business.audit_events WHERE record_id='{ID}' AND table_name='blank_request_templates';",'{name,version,sha256}')
 def test_fifty_versions_limit_rejects_extra_without_overwrite(self):self.deny(auth()+f"DO $t$ BEGIN FOR i IN 1..51 LOOP PERFORM dqa_business.save_blank_request_template('{T}',gen_random_uuid(),gen_random_uuid(),'合成.xlsx','V1','{SHA}','{CONTENT}');END LOOP;END $t$;",'TEMPLATE_LIMIT')
 def test_oversized_encoded_content_rejected(self):self.deny(auth()+f"SELECT dqa_business.save_blank_request_template('{T}','{OP}','{ID}','合成.xlsx','V1','{SHA}',repeat('A',2796208));",'TEMPLATE_FIELDS_INVALID')
 def test_system_initialization_preserves_reference_template_library(self):
  sql=auth()+save()+delete('BLANK',0)+f"SELECT set_config('test.plan',dqa_business.preview_assistant_command('{T}','RESTART')::text,true);SELECT dqa_business.prepare_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,current_setting('test.plan')::jsonb->>'fingerprint','初始化系統');RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,'{U}','DELETE');RESET ROLE;"+auth()+f"SELECT jsonb_array_length(dqa_business.blank_request_template_library('{T}')->'rows'),dqa_business.blank_request_template_library('{T}')->>'builtin_visible';"
  self.ok(sql,'1|false')
def bind(ident=ID,revision=0,op='ef890000-0000-4000-8000-000000000003',sha=SHA,t=T):return f"SELECT dqa_business.set_blank_request_template_default('{t}','{op}','{ident}',{revision},{'NULL' if sha is None else chr(39)+sha+chr(39)});"
class DefaultTests(Tests):
 def test_builtin_is_initial_default(self):self.ok(auth()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'default_template_id';",'BLANK')
 def test_bind_saved_version_and_exact_file(self):self.ok(auth()+save()+bind()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'default_template_id',dqa_business.blank_request_template_file('{T}','{ID}')->>'sha256';",ID+'|'+SHA)
 def test_binding_cannot_be_deleted(self):self.deny(auth()+save()+bind()+delete(),'TEMPLATE_IN_USE')
 def test_unbind_then_delete(self):self.ok(auth()+save()+bind()+bind('BLANK',1,'ef890000-0000-4000-8000-000000000004',None)+delete()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'default_template_id',jsonb_array_length(dqa_business.blank_request_template_library('{T}')->'rows');",'BLANK|0')
 def test_binding_preserves_hidden_builtin(self):self.ok(auth()+save()+delete('BLANK',0)+bind(revision=1)+f"SELECT dqa_business.blank_request_template_library('{T}')->>'builtin_visible',dqa_business.blank_request_template_library('{T}')->>'revision';",'false|2')
 def test_default_stale_revision_rejected(self):self.deny(auth()+save()+bind(revision=4),'REVISION_CONFLICT')
 def test_default_hash_mismatch_rejected(self):self.deny(auth()+save()+bind(sha='a'*64),'TEMPLATE_FILE_INVALID')
 def test_default_missing_template_rejected(self):self.deny(auth()+bind(),'TEMPLATE_NOT_FOUND')
 def test_default_readonly_denied(self):self.deny(auth()+save()+"RESET ROLE;"+auth('10000000-0000-0000-0000-000000000003')+bind(),'TEMPLATE_ADMIN_REQUIRED')
 def test_default_anonymous_denied(self):self.deny("SET LOCAL ROLE anon;"+bind(),'permission denied')
 def test_default_other_tenant_denied(self):self.deny(auth()+save()+bind(t=OTHER),'TEMPLATE_ADMIN_REQUIRED')
 def test_default_idempotence(self):self.ok(auth()+save()+bind()+bind()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'revision';",'1')
 def test_old_default_retry_does_not_revert_newer_binding(self):self.ok(auth()+save()+bind()+bind('BLANK',1,'ef890000-0000-4000-8000-000000000004',None)+bind()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'default_template_id';",'BLANK')
 def test_default_operation_payload_conflict(self):self.deny(auth()+save()+bind()+bind('BLANK',0,sha=None),'TEMPLATE_OPERATION_CONFLICT')
 def test_default_foreign_key_blocks_direct_removal(self):self.deny(auth()+save()+bind()+f"RESET ROLE;DELETE FROM dqa_private.blank_request_templates WHERE id='{ID}';",'blank_template_default_fk')
 def test_default_audit_contains_only_metadata(self):self.ok(auth()+save()+bind()+f"SELECT changed_columns::text FROM dqa_business.audit_events WHERE table_name='blank_request_template_state' AND record_id='{T}' ORDER BY created_at DESC LIMIT 1;",'{default_template_id}')
 def test_default_binding_preserved_by_system_initialization(self):
  sql=auth()+save()+bind()+f"SELECT set_config('test.plan',dqa_business.preview_assistant_command('{T}','RESTART')::text,true);SELECT dqa_business.prepare_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,current_setting('test.plan')::jsonb->>'fingerprint','初始化系統');RESET ROLE;SET LOCAL ROLE service_role;SELECT dqa_business.complete_assistant_restart('{T}',(current_setting('test.plan')::jsonb->>'id')::uuid,'{U}','DELETE');RESET ROLE;"+auth()+f"SELECT dqa_business.blank_request_template_library('{T}')->>'default_template_id';"
  self.ok(sql,ID)

r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DefaultTests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'cloud_mutations':False},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
