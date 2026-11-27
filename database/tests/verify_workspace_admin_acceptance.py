"""Rollback-only administrator acceptance and unchanged ordinary-role security checks.

Uses the same isolated synthetic PostgreSQL state as the existing workflow suites.
Never connects to a cloud DSN or persists a request, role change, signature, or file.
"""
from pathlib import Path
import unittest,json,subprocess
root=Path(__file__).parent

def helpers(name):
 file=root/name;ns={'__file__':str(file)}
 exec(compile(file.read_text().split('\nclass Tests',1)[0],str(file),'exec'),ns)
 return ns
w=helpers('verify_request_workflow.py')
h=helpers('verify_human_workflow.py')
p=helpers('verify_preflight_sequence.py')
T=w['T'];REQ=w['REQ'];OWN=w['OWN'];MAN=w['MAN']
ADMIN_ROLE="a1000000-0000-0000-0000-000000000002"
promote=f"RESET ROLE;UPDATE dqa_business.roles SET is_tenant_admin=true WHERE id='{ADMIN_ROLE}';"

def admin_requests():
 return promote+''.join('RESET ROLE;'+w['run_action'](2,w['command'](action,revision),revision) for action,revision in [('SUBMIT',1),('MANAGER_APPROVE',2),('LMS_APPROVE',3),('LMS_APPROVE',4)])

class Tests(unittest.TestCase):
 def ok(self,ns,sql,expected):
  r=ns['execute'](sql);self.assertEqual(r.returncode,0,r.stderr[-2600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,ns,sql,error):
  r=ns['execute'](sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2600:])
 def test_admin_owner_can_submit_and_sign_manager_and_both_lms_levels(self):
  self.ok(w,admin_requests()+f"RESET ROLE;SELECT status,request_review_level,(SELECT count(*) FROM dqa_business.approval_events WHERE request_id=q.id AND actor_member_id='{OWN}') FROM dqa_business.requests q WHERE id='{REQ}'",'AWAITING_SCHEDULING|2|4')
 def test_admin_without_assigned_supervisor_can_submit_without_forging_assignment(self):
  self.ok(w,promote+f"UPDATE dqa_business.memberships SET supervisor_member_id=NULL WHERE id='{OWN}';"+'RESET ROLE;'+w['run_action'](2,w['command'](),1)+f"RESET ROLE;SELECT supervisor_member_id IS NULL FROM dqa_business.requests WHERE id='{REQ}'",'t')
 def test_admin_does_not_change_directory_supervisor_or_role_review_level(self):
  self.ok(w,admin_requests()+f"RESET ROLE;SELECT supervisor_member_id='{MAN}',(SELECT review_level FROM dqa_business.roles WHERE id='{ADMIN_ROLE}') FROM dqa_business.memberships WHERE id='{OWN}'",'t|0')
 def test_all_signatures_record_real_administrator_and_same_document(self):
  self.ok(w,admin_requests()+f"RESET ROLE;SELECT count(*),count(DISTINCT document_version_id),bool_and(actor_member_id='{OWN}') FROM dqa_business.request_signatures WHERE request_id='{REQ}'",'4|1|t')
 def test_admin_can_approve_unassigned_request_manager_stage(self):
  self.ok(w,w['submitted']()+"RESET ROLE;UPDATE dqa_business.roles SET is_tenant_admin=true WHERE id='a1000000-0000-0000-0000-000000000003';"+w['run_action'](3,w['command']('MANAGER_APPROVE',2),2)+f"SELECT status FROM dqa_business.requests WHERE id='{REQ}'",'AWAITING_LMS_REVIEW')
 def test_non_admin_owner_cannot_self_review(self):
  self.deny(w,w['submitted']()+'RESET ROLE;'+w['run_action'](2,w['command']('MANAGER_APPROVE',2),2),'WORKFLOW_SELF_REVIEW_DENIED')
 def test_non_admin_wrong_level_stays_denied(self):
  self.deny(w,w['manager']()+'RESET ROLE;'+w['run_action'](4,w['command']('LMS_APPROVE',3),3),'WORKFLOW_REVIEW_LEVEL_REQUIRED')
 def test_admin_still_cannot_submit_someone_elses_draft(self):
  self.deny(w,w['run_action'](1,w['command'](),1),'WORKFLOW_ACCESS_DENIED')
 def test_admin_cannot_skip_manager_stage(self):
  self.deny(w,promote+'RESET ROLE;'+w['submitted']()+'RESET ROLE;'+w['run_action'](2,w['command']('LMS_APPROVE',2),2),'WORKFLOW_STATE_INVALID')
 def test_admin_signature_required_and_stale_revision_rejected(self):
  self.deny(w,promote+'RESET ROLE;'+w['run_action'](2,w['command'](signature_data=''),1),'WORKFLOW_SIGNATURE_REQUIRED')
  self.deny(w,promote+'RESET ROLE;'+w['submitted']()+'RESET ROLE;'+w['run_action'](2,w['command']('MANAGER_APPROVE',1),2),'REVISION_CONFLICT')
 def test_revoked_admin_cannot_use_cross_level_rights(self):
  sql=promote+'RESET ROLE;'+w['submitted']()+'RESET ROLE;'+w['run_action'](2,w['command']('MANAGER_APPROVE',2),2)+f"RESET ROLE;UPDATE dqa_business.roles SET is_tenant_admin=false WHERE id='{ADMIN_ROLE}';"+'RESET ROLE;'+w['run_action'](2,w['command']('LMS_APPROVE',3),3)
  self.deny(w,sql,'WORKFLOW_SELF_REVIEW_DENIED')
 def test_other_tenant_admin_cannot_approve(self):
  sql=w['submitted']()+'RESET ROLE;'+w['run_action'](1,w['command']('MANAGER_APPROVE',2),2).replace(w['uid'](1),'20000000-0000-0000-0000-000000000001')
  self.deny(w,sql,'WORKFLOW_ACCESS_DENIED')
 def test_admin_can_review_both_report_levels_and_archive_without_assignment(self):
  sql=h['submitted']()+promote+h['human']('REPORT_APPROVE',2,6)+h['human']('REPORT_APPROVE',2,7)+h['upload']('ARCHIVE',2,h['ARCHIVE'])+h['human']('CONFIRM_ARCHIVE',2,8,upload=h['ARCHIVE'],proof=True)
  self.ok(h,sql+f"RESET ROLE;SELECT status,confirmed_by='{OWN}',(SELECT count(*) FROM dqa_business.report_signatures WHERE request_id='{REQ}' AND actor_member_id='{OWN}') FROM dqa_business.reports WHERE request_id='{REQ}'",'ARCHIVED|t|2')
 def test_admin_submitter_can_review_own_report(self):
  sql=h['submitted']()+"RESET ROLE;UPDATE dqa_business.roles SET is_tenant_admin=true WHERE id='a1000000-0000-0000-0000-000000000005';"+h['human']('REPORT_APPROVE',5,6)+h['human']('REPORT_APPROVE',5,7)
  self.ok(h,sql+f"SELECT status FROM dqa_business.reports WHERE request_id='{REQ}'",'AWAITING_VIEW')
 def test_admin_can_return_report_awaiting_manager_readback(self):
  self.ok(h,h['viewed']()+promote+h['human']('REPORT_RETURN',2,8)+f"SELECT status FROM dqa_business.reports WHERE request_id='{REQ}'",'RETURNED')
 def test_admin_cannot_approve_view_state_or_archive_before_reviews(self):
  self.deny(h,h['viewed']()+h['human']('REPORT_APPROVE',1,8),'HUMAN_REPORT_REVIEW_DENIED')
  self.deny(h,h['submitted']()+h['upload']('ARCHIVE',1,h['ARCHIVE']),'HUMAN_ACCESS_DENIED')
 def test_normal_report_owner_and_wrong_level_stay_denied(self):
  self.deny(h,h['submitted']()+h['human']('REPORT_APPROVE',2,6),'HUMAN_REPORT_REVIEW_DENIED')
  self.deny(h,h['submitted']()+h['human']('REPORT_APPROVE',6,6),'HUMAN_REPORT_REVIEW_DENIED')
 def test_ordinary_report_reviewer_cannot_change_levels(self):
  sql=h['level2']()+"RESET ROLE;UPDATE dqa_business.roles SET review_level=3 WHERE id='a1000000-0000-0000-0000-000000000004';"+h['human']('REPORT_APPROVE',4,7)
  self.deny(h,sql,'HUMAN_REPORT_LEVEL_CONFLICT')
 def test_admin_report_review_still_requires_signature(self):
  self.deny(h,h['submitted']()+h['human']('REPORT_APPROVE',1,6,signature=''),'WORKFLOW_SIGNATURE_REQUIRED')
 def test_admin_archive_still_requires_file_attestation(self):
  self.deny(h,h['viewed']()+h['upload']('ARCHIVE',1,h['ARCHIVE'])+h['human']('CONFIRM_ARCHIVE',1,8,upload=h['ARCHIVE'],proof=False),'HUMAN_FILE_VERIFICATION_REQUIRED')
 def test_admin_can_plan_number_and_sign_own_preapproval_request(self):
  plan=p['plan']().replace(p['auth'](3),p['auth'](2));number=p['number']().replace(p['auth'](3),p['auth'](2))
  sql=promote+plan+number+p['review'](2,'LMS_APPROVE',12,p['FIRST'],'2')+p['review'](2,'LMS_APPROVE',13)
  self.ok(p,sql+f"SELECT status,(SELECT count(*) FROM dqa_business.approval_events WHERE request_id='{REQ}' AND actor_member_id='{OWN}' AND stage IN('LMS_1','LMS_2')) FROM dqa_business.schedules WHERE request_id='{REQ}'",'AWAITING_RECEIPT|2')
 def test_admin_does_not_bypass_preapproval_plan_or_number(self):
  self.deny(p,promote+p['review'](2,'LMS_APPROVE',12,p['FIRST'],'1'),'PREAPPROVAL_PLAN_REQUIRED')

r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
Path(w['a'].result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'synthetic_only':True},indent=2)+'\n')
raise SystemExit(not r.wasSuccessful())
