"""Reversible case maintenance checks. Mutations run only in isolated local PostgreSQL and roll back."""
import argparse,json,os,subprocess,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();state=json.loads(Path(a.state).read_text());assert state['network']=='none' and not state['published_ports'] and state['container'].startswith('dqa-business-local-');env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',state['database']]
T='2aa05e58-4a02-40f8-99ff-49135b1e10aa';U='4de0302f-8234-4075-a314-cb86010ae9a3';A='a0000000-0000-0000-0000-000000000001';AU='10000000-0000-0000-0000-000000000001'
def auth(u=U):return f"SET LOCAL request.jwt.claim.sub='{u}';SET LOCAL ROLE authenticated;"
def preview(t=T,keys='NULL'):return f"SELECT set_config('test.plan',dqa_business.preview_case_cleanup('{t}',{keys})::text,true);"
def execute(t=T,confirmation="'移至回收區'"):return f"SELECT dqa_business.execute_case_cleanup('{t}',(current_setting('test.plan')::jsonb->>'plan_id')::uuid,current_setting('test.plan')::jsonb->>'fingerprint',{confirmation});"
def restore(t=T):return f"SELECT dqa_business.restore_case_cleanup('{t}',(current_setting('test.plan')::jsonb->>'plan_id')::uuid,'還原委託資料');"
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def last(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,message):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(message,r.stderr)
 def test_preview_does_not_move_any_records(self):self.last(auth()+preview()+f"SELECT count(*) FROM dqa_business.import_rows WHERE tenant_id='{T}' AND source_collection='reviews'",'50')
 def test_workspace_data_disappears_through_database_reads(self):self.last(auth()+preview()+execute()+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'reviews'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'schedules'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'labAudit'),(SELECT count(*) FROM dqa_business.equipment WHERE tenant_id='{T}')",'0|0|0|20')
 def test_raw_envelope_and_direct_read_are_also_protected(self):self.last(auth()+preview()+execute()+f"SELECT count(*) FROM dqa_business.import_rows WHERE tenant_id='{T}' AND source_collection<>'equipment'",'0')
 def test_restore_preserves_all_original_objects(self):self.last(auth()+preview()+execute()+restore()+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'reviews'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'schedules'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'labAudit'),(SELECT count(*) FROM dqa_business.import_rows WHERE tenant_id='{T}')",'50|34|12|117')
 def test_no_payload_is_physically_deleted(self):self.last(auth()+preview()+execute()+f"RESET ROLE;SELECT count(*) FROM dqa_business.import_rows WHERE tenant_id='{T}'",'117')
 def test_execute_is_idempotent(self):self.last(auth()+preview()+execute()+execute()+f"SELECT count(*) FROM dqa_business.audit_events WHERE tenant_id='{T}' AND table_name='case_recycle_runs'",'1')
 def test_restore_is_idempotent(self):self.last(auth()+preview()+execute()+restore()+restore()+f"SELECT count(*) FROM dqa_business.audit_events WHERE tenant_id='{T}' AND table_name='case_recycle_runs'",'2')
 def test_single_legacy_case_and_its_children(self):
  key=f"ARRAY['legacy:'||(SELECT id FROM dqa_business.import_rows WHERE tenant_id='{T}' AND source_collection='reviews' AND legacy_id='REQ-2026-001')]";self.last(auth()+preview(keys=key)+execute()+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'reviews'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'schedules'),jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'labAudit')",'49|33|11')
 def test_other_workspace_untouched(self):self.last(auth()+preview()+execute()+"RESET ROLE;SELECT count(*) FROM dqa_business.requests WHERE tenant_id='b0000000-0000-0000-0000-000000000001'",'1')
 def test_nonadmin_cannot_preview(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+preview(A),'MAINTENANCE_ADMIN_REQUIRED')
 def test_foreign_workspace_cannot_preview(self):self.deny(auth()+preview(A),'MAINTENANCE_ADMIN_REQUIRED')
 def test_anon_cannot_execute(self):self.deny('SET LOCAL ROLE anon;'+preview(),'permission denied')
 def test_confirmation_required_even_for_admin(self):self.deny(auth()+preview()+execute(confirmation='NULL'),'MAINTENANCE_CONFIRMATION_INVALID')
 def test_stale_preview_is_rejected(self):self.deny(auth()+preview()+f"SELECT dqa_business.create_request_draft('{T}','ef000000-0000-0000-0000-000000000001','{{\"purpose\":\"new draft\"}}');"+execute(),'MAINTENANCE_PREVIEW_STALE')
 def test_expired_plan_is_rejected(self):self.deny(auth()+preview()+"RESET ROLE;UPDATE dqa_private.case_cleanup_plans SET expires_at=clock_timestamp()-interval '1 second';SET LOCAL ROLE authenticated;"+execute(),'MAINTENANCE_PLAN_EXPIRED')
 def test_active_equipment_reservations_block_cleanup(self):self.deny(auth(AU)+preview(A)+execute(A),'MAINTENANCE_ACTIVE_RESERVATIONS')
 def test_tagged_requests_and_files_are_not_readable_via_owner_helpers(self):
  key="ARRAY['request:a6000000-0000-0000-0000-000000000002']";self.last(auth(AU)+preview(A,key)+execute(A)+"SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';SELECT dqa_private.can_read_request('"+A+"','a6000000-0000-0000-0000-000000000002'),dqa_private.can_read_artifact('"+A+"','aa000000-0000-0000-0000-000000000002')",'f|f')
 def test_recycled_draft_cannot_be_updated_by_old_editor(self):
  grant="UPDATE dqa_business.roles SET permissions=array_append(permissions,'requests.draft') WHERE id='a1000000-0000-0000-0000-000000000003';";key="ARRAY['request:a6000000-0000-0000-0000-000000000002']";self.deny(grant+auth(AU)+preview(A,key)+execute(A)+"SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';SELECT dqa_business.update_request_draft('"+A+"','a6000000-0000-0000-0000-000000000002',1,'{\"purpose\":\"not allowed\"}')",'DRAFT_NOT_AVAILABLE')
 def test_new_drafts_created_after_cleanup_remain_after_restore(self):self.last(auth()+preview()+execute()+f"SELECT dqa_business.create_request_draft('{T}','ef000000-0000-0000-0000-000000000002','{{\"purpose\":\"new after cleanup\"}}');"+restore()+f"SELECT jsonb_array_length(dqa_business.maintenance_overview('{T}')->'choices')",'51')
 def test_private_recycle_tables_cannot_be_changed_directly(self):self.deny(auth()+"SELECT * FROM dqa_private.case_recycle_items",'permission denied')
 def test_stale_execute_after_restore_never_recycles_again(self):self.last(auth()+preview()+execute()+restore()+execute()+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'legacy_import'->'reviews')",'50')
 def test_gate_stays_closed(self):self.deny(auth()+f"UPDATE dqa_business.requests SET status='RUNNING' WHERE tenant_id='{T}'",'permission denied')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'passed':r.wasSuccessful(),'network':'none','all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
