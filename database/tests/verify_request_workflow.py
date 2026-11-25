"""Rollback-only human workflow validation in isolated, network-disabled PostgreSQL."""
import argparse,json,subprocess,os,unittest,base64
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'];env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';REQ='ef000000-0000-4000-8000-000000000001';OWN='a2000000-0000-0000-0000-000000000002';MAN='a2000000-0000-0000-0000-000000000001';SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII='
def uid(i):return '10000000-0000-0000-0000-'+str(i).zfill(12)
def op(i):return 'ef000000-0000-4000-8000-'+str(100+i).zfill(12)
def auth(i):return f"SET LOCAL request.jwt.claim.sub='{uid(i)}';SET LOCAL ROLE authenticated;"
def literal(v):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
def command(action='SUBMIT',revision=1,**kw):
 d=dict(request_id=REQ,expected_revision=revision,action=action,signature_data=SIG,comment='合成驗證');d.update(kw);return d

def run_action(i,c,number):
 q=literal(c);return auth(i)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(number)}',{q});SELECT dqa_business.execute_request_operation('{T}','{op(number)}',{q});"

def fixture():
 data=dict(trial_id='a3000000-0000-0000-0000-000000000001',product_code='SYNTHETIC',customer_name='SYNTHETIC',purpose='合成驗證',quantity=3,requested_date='2027-01-08',sample_space_units=1,specification='試驗時間：250 小時。',acceptance='合成判定',form_details={'testItems':['Synthetic humidity'],'purpose':['合成驗證']},draft_signature_data=SIG)
 return f"""DO $legacy$ BEGIN IF to_regclass('dqa_private.preapproval_cutover') IS NOT NULL THEN EXECUTE 'UPDATE dqa_private.preapproval_cutover SET enabled=false';END IF;END $legacy$;UPDATE dqa_private.request_workflow_policy SET enabled=true WHERE tenant_id='{T}';
UPDATE dqa_business.roles SET permissions=ARRAY(SELECT DISTINCT v FROM unnest(permissions||ARRAY['requests.draft','requests.submit']) v) WHERE id='a1000000-0000-0000-0000-000000000002';
UPDATE dqa_business.roles SET permissions=array_append(permissions,'requests.review_lms'),review_level=1 WHERE id='a1000000-0000-0000-0000-000000000003';
UPDATE dqa_business.memberships SET supervisor_member_id='{MAN}' WHERE id='{OWN}';
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{uid(4)}','synthetic-lms2@example.invalid',clock_timestamp());
INSERT INTO dqa_business.roles(id,tenant_id,code,name,permissions,review_level,systems,pages) VALUES('a1000000-0000-0000-0000-000000000004','{T}','SYNTHETIC-LMS2','合成二階',ARRAY['requests.read_all','requests.review_lms'],2,ARRAY['lms'],ARRAY['dashboard','requests']);
INSERT INTO dqa_business.memberships(id,tenant_id,auth_user_id,legacy_id,display_name,role_id,login_email) VALUES('a2000000-0000-0000-0000-000000000004','{T}','{uid(4)}','TEST-LMS2','合成二階','a1000000-0000-0000-0000-000000000004','synthetic-lms2@example.invalid');
{auth(2)} SELECT dqa_business.create_request_draft('{T}','{REQ}',{literal(data)});RESET ROLE;
"""

def submitted():return run_action(2,command(),1)
def manager():return submitted()+run_action(1,command('MANAGER_APPROVE',2),2)
def first():return manager()+run_action(3,command('LMS_APPROVE',3),3)
def all_steps():return first()+run_action(4,command('LMS_APPROVE',4),4)
def execute(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-1700:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr[-1900:])
 def test_full_human_workflow_stops_at_scheduling(self):self.ok(all_steps()+f"RESET ROLE;SELECT status,request_review_level FROM dqa_business.requests WHERE id='{REQ}'",'AWAITING_SCHEDULING|2')
 def test_signatures_bind_one_immutable_document(self):self.ok(all_steps()+f"SELECT count(*),count(DISTINCT document_version_id),bool_and(verification='NOT_VERIFIED') FROM dqa_business.request_signatures WHERE request_id='{REQ}'",'4|1|t')
 def test_document_hash_matches_frozen_content(self):self.ok(submitted()+f"SELECT document_sha256=encode(sha256(convert_to(payload::text,'UTF8')),'hex') FROM dqa_business.request_document_versions WHERE request_id='{REQ}'",'t')
 def test_closed_release_does_not_prepare_or_change_state(self):self.deny(f"UPDATE dqa_private.request_workflow_policy SET enabled=false WHERE tenant_id='{T}';"+submitted(),'WORKFLOW_RELEASE_REQUIRED')
 def test_no_signature_cannot_submit(self):self.deny(run_action(2,command(signature_data=''),1),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_invalid_signature_rejected(self):self.deny(run_action(2,command(signature_data='data:text/plain;base64,YQ=='),1),'DRAFT_SIGNATURE_INVALID')
 def test_missing_u_no_longer_blocks_submit(self):self.ok(f"UPDATE dqa_business.requests SET sample_space_units=NULL WHERE id='{REQ}';"+run_action(2,command(revision=2),1)+f"SELECT status,(SELECT payload ? 'sample_space_units' FROM dqa_business.request_document_versions WHERE request_id='{REQ}') FROM dqa_business.requests WHERE id='{REQ}'",'AWAITING_REQUEST_MANAGER|f')
 def test_missing_real_supervisor_blocks_submit(self):self.deny(f"UPDATE dqa_business.memberships SET supervisor_member_id=NULL WHERE id='{OWN}';"+submitted(),'WORKFLOW_SUPERVISOR_REQUIRED')
 def test_disabled_supervisor_blocks_submit(self):self.deny(f"UPDATE dqa_business.memberships SET enabled=false WHERE id='{MAN}';"+submitted(),'WORKFLOW_SUPERVISOR_REQUIRED')
 def test_other_person_cannot_submit_owner_draft(self):self.deny(run_action(1,command(),1),'WORKFLOW_ACCESS_DENIED')
 def test_self_review_is_denied_even_for_admin(self):self.deny(submitted()+run_action(2,command('MANAGER_APPROVE',2),2),'WORKFLOW_SELF_REVIEW_DENIED')
 def test_unassigned_manager_cannot_approve(self):self.deny(submitted()+run_action(3,command('MANAGER_APPROVE',2),2),'WORKFLOW_ACCESS_DENIED')
 def test_wrong_lms_level_is_denied(self):self.deny(manager()+run_action(4,command('LMS_APPROVE',3),3),'WORKFLOW_REVIEW_LEVEL_REQUIRED')
 def test_level_two_cannot_skip_manager(self):self.deny(submitted()+run_action(4,command('LMS_APPROVE',2),2),'WORKFLOW_STATE_INVALID')
 def test_stale_approval_preserves_current_state(self):self.deny(manager()+run_action(3,command('LMS_APPROVE',2),3),'REVISION_CONFLICT')
 def test_owner_cannot_edit_submitted_content(self):self.deny(submitted()+auth(2)+f"SELECT dqa_business.update_request_draft('{T}','{REQ}',2,'{{\"product_code\":\"CHANGED\"}}')",'RULE_NOT_APPROVED')
 def test_return_requires_reason(self):self.deny(submitted()+run_action(1,command('RETURN',2,signature_data='',comment=''),2),'WORKFLOW_RETURN_REASON_REQUIRED')
 def test_return_and_resubmit_creates_new_version(self):
  edit=auth(2)+f"SELECT dqa_business.update_request_draft('{T}','{REQ}',3,'{{\"product_code\":\"UPDATED\"}}');"
  self.ok(submitted()+run_action(1,command('RETURN',2,signature_data='',comment='合成退回'),2)+edit+run_action(2,command(revision=4),3)+f"SELECT count(*),count(DISTINCT document_sha256),min(payload->>'product_code'),max(payload->>'product_code') FROM dqa_business.request_document_versions WHERE request_id='{REQ}'",'2|2|SYNTHETIC|UPDATED')
 def test_returned_draft_does_not_mutate_frozen_payload(self):self.ok(submitted()+run_action(1,command('RETURN',2,signature_data=''),2)+auth(2)+f"SELECT dqa_business.update_request_draft('{T}','{REQ}',3,'{{\"product_code\":\"UPDATED\"}}');SELECT payload->>'product_code' FROM dqa_business.request_document_versions WHERE request_id='{REQ}'",'SYNTHETIC')
 def test_two_levels_cannot_be_same_actor_after_role_change(self):self.deny(first()+"RESET ROLE;UPDATE dqa_business.roles SET review_level=2 WHERE id='a1000000-0000-0000-0000-000000000003';"+run_action(3,command('LMS_APPROVE',4),4),'WORKFLOW_REVIEW_LEVEL_CONFLICT')
 def test_duplicate_execute_does_not_duplicate_signature(self):self.ok(submitted()+auth(2)+f"SELECT dqa_business.execute_request_operation('{T}','{op(1)}',{literal(command())});SELECT count(*) FROM dqa_business.request_signatures WHERE request_id='{REQ}'",'1')
 def test_prepare_fingerprint_prevents_payload_substitution(self):self.deny(auth(2)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(1)}',{literal(command())});SELECT dqa_business.execute_request_operation('{T}','{op(1)}',{literal(command(comment='other'))});",'WORKFLOW_OPERATION_CONFLICT')
 def test_request_content_is_not_client_supplied_to_approval(self):self.deny(run_action(2,{**command(),'status':'AWAITING_SCHEDULING'},1),'WORKFLOW_FIELDS_INVALID')
 def test_expired_command_cannot_execute(self):self.deny(auth(2)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(1)}',{literal(command())});RESET ROLE;UPDATE dqa_private.request_operations SET expires_at=clock_timestamp()-interval '1 second';"+auth(2)+f"SELECT dqa_business.execute_request_operation('{T}','{op(1)}',{literal(command())});",'WORKFLOW_OPERATION_EXPIRED')
 def test_expired_lookup_cancels_late_execution(self):self.ok(auth(2)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(1)}',{literal(command())});RESET ROLE;UPDATE dqa_private.request_operations SET expires_at=clock_timestamp()-interval '1 second';"+auth(2)+f"SELECT dqa_business.request_operation_result('{T}','{op(1)}')->>'state'",'EXPIRED')
 def test_other_actor_cannot_read_command_result(self):self.ok(submitted()+auth(1)+f"SELECT dqa_business.request_operation_result('{T}','{op(1)}')->>'state'",'NOT_FOUND')
 def test_signatures_are_append_only(self):self.deny(submitted()+"RESET ROLE;DELETE FROM dqa_business.request_signatures",'APPEND_ONLY_RECORD')
 def test_document_versions_are_append_only(self):self.deny(submitted()+"RESET ROLE;UPDATE dqa_business.request_document_versions SET payload='{}'",'APPEND_ONLY_RECORD')
 def test_direct_status_change_cannot_forge_guc(self):self.deny(f"SELECT set_config('dqa.manual_request','true',true);UPDATE dqa_business.requests SET status='AWAITING_REQUEST_MANAGER' WHERE id='{REQ}'",'RULE_NOT_APPROVED')
 def test_direct_approval_cannot_forge_permit(self):self.deny(submitted()+f"RESET ROLE;INSERT INTO dqa_business.approval_events(tenant_id,request_id,actor_member_id,stage,decision) VALUES('{T}','{REQ}','{MAN}','LMS_2','APPROVE')",'RULE_NOT_APPROVED')
 def test_other_workflow_gates_remain_closed(self):self.deny("UPDATE dqa_business.schedules SET status='BOOKED'",'RULE_NOT_APPROVED')
 def test_private_gate_release_not_client_writable(self):self.deny(auth(1)+'UPDATE dqa_private.request_workflow_policy SET enabled=true','permission denied')
 def test_cross_tenant_signatures_are_not_visible(self):self.ok(submitted()+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SET LOCAL ROLE authenticated;SELECT count(*) FROM dqa_business.request_signatures",'0')
 def test_no_transition_permit_remains_after_success(self):self.ok(all_steps()+'RESET ROLE;SELECT count(*) FROM dqa_private.request_transition_permits','0')
 def test_release_revoked_after_prepare_blocks_execution(self):self.deny(auth(2)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(1)}',{literal(command())});RESET ROLE;UPDATE dqa_private.request_workflow_policy SET enabled=false;"+auth(2)+f"SELECT dqa_business.execute_request_operation('{T}','{op(1)}',{literal(command())});",'WORKFLOW_RELEASE_REQUIRED')
 def test_actor_permission_revoked_after_prepare_blocks_execution(self):self.deny(auth(2)+f"SELECT dqa_business.prepare_request_operation('{T}','{op(1)}',{literal(command())});RESET ROLE;UPDATE dqa_business.roles SET permissions=array_remove(permissions,'requests.submit') WHERE id='a1000000-0000-0000-0000-000000000002';"+auth(2)+f"SELECT dqa_business.execute_request_operation('{T}','{op(1)}',{literal(command())});",'WORKFLOW_ACCESS_DENIED')
 def test_unconfirmed_supervisor_cannot_receive_submission(self):self.deny(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{uid(1)}';"+submitted(),'WORKFLOW_SUPERVISOR_REQUIRED')
 def test_historical_signer_label_does_not_change_with_account_name(self):self.ok(submitted()+f"RESET ROLE;UPDATE dqa_business.memberships SET display_name='RENAMED' WHERE id='{OWN}';"+auth(2)+f"SELECT actor_label='Synthetic requester A' FROM dqa_business.approval_events WHERE request_id='{REQ}'",'t')
 def test_current_document_and_events_in_snapshot_without_signature_bytes(self):self.ok(submitted()+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'workflow_signatures'),(dqa_business.original_ui_snapshot('{T}')->'workflow_signatures'->0) ? 'signature_data'",'1|f')
 def test_signature_image_read_is_tenant_and_request_scoped(self):self.ok(submitted()+f"SELECT dqa_business.request_signature_image('{T}',(SELECT id FROM dqa_business.request_signatures WHERE request_id='{REQ}'))->>'verification'",'NOT_VERIFIED')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
