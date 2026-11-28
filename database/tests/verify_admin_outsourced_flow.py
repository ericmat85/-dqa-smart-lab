"""One real native lifecycle, same isolated administrator at every stage; rollback only.

Virtual outsourcing keeps physical equipment free. Reports and PDF still require
file attestations. The local fixture supplies synthetic signatures/files only.
"""
from pathlib import Path
import unittest,json,subprocess
root=Path(__file__).parent

def helpers(name):
 f=root/name;ns={'__file__':str(f)};exec(compile(f.read_text().split('\nclass Tests',1)[0],str(f),'exec'),ns);return ns
w=helpers('verify_request_workflow.py');p=helpers('verify_preflight_sequence.py');h=helpers('verify_human_workflow.py')
T=w['T'];REQ=w['REQ'];OWN=w['OWN'];ROLE='a1000000-0000-0000-0000-000000000002';BATCH=w['op'](90)

def fixture(kind='VIRTUAL'):
 base=w['fixture']().replace('dqa_business.create_request_draft(','dqa_business.create_classified_request_draft(',1).replace('::jsonb);',"::jsonb,'"+kind+"');",1)
 return base+f"RESET ROLE;UPDATE dqa_private.preapproval_cutover SET enabled=true WHERE tenant_id='{T}';UPDATE dqa_private.human_workflow_policy SET enabled=true,report_key=decode('{h['KEY']}','hex') WHERE tenant_id='{T}';UPDATE dqa_business.roles SET is_tenant_admin=true,review_level=3,systems=ARRAY['request','lms','lab'],pages=ARRAY['dashboard','requests','schedule','reports','archive','equipment','settings'] WHERE id='{ROLE}';UPDATE dqa_business.roles SET systems=array_remove(systems,'lab') WHERE tenant_id='{T}' AND id<>'{ROLE}';UPDATE dqa_business.memberships SET supervisor_member_id=NULL WHERE id='{OWN}';UPDATE dqa_business.trial_definitions SET profile_code='HIGH_HUMIDITY' WHERE id='a3000000-0000-0000-0000-000000000001';UPDATE dqa_business.requests SET form_details=form_details||jsonb_build_object('priority','委外') WHERE id='{REQ}';"

def request(action,n,fields=None,planrevision='NULL'):
 return p['review'](2,action,n,fields,planrevision)

def batch(units=1):
 c=f"jsonb_build_object('expected_member','{OWN}','options',jsonb_build_object('earliest','{p['START']}','latest','{p['START']}'),'selection',jsonb_build_array(jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',0,'sample_space_units',{units},'equipment_count',0,'sample_code','')))"
 return 'RESET ROLE;'+w['auth'](2)+f"SELECT dqa_business.prepare_schedule_batch('{T}','{BATCH}',{c}) FROM dqa_business.requests q WHERE id='{REQ}';SELECT dqa_business.execute_schedule_batch('{T}','{BATCH}');"

def signed_plan():
 return request('SUBMIT',1)+request('MANAGER_APPROVE',2)+batch()+p['number']().replace(p['auth'](3),w['auth'](2))+request('LMS_APPROVE',12,p['FIRST'],"(SELECT revision FROM dqa_business.schedule_drafts WHERE request_id='"+REQ+"')")+request('LMS_APPROVE',13)

def prepared(confirmed=True):
 fields={**p['PREP'],'outsourceBooked':'yes' if confirmed else 'no'}
 return signed_plan()+p['human']('PREPARE',20,fields,'').replace(p['auth'](5),w['auth'](2))

def received(confirmed=True):return prepared(confirmed)+p['human']('RECEIVE',21,{'executionAbnormal':'no'}).replace(p['auth'](5),w['auth'](2))
def complete():return received()+p['accelerate'](40).replace(p['auth'](5),w['auth'](2))+p['accelerate'](41).replace(p['auth'](5),w['auth'](2))
def reported(completion=None):return (completion or complete())+h['upload'](who=2)+h['human']('REPORT_SUBMIT',2,50,upload=h['UPLOAD'],proof=True)
def archive(completion=None):return reported(completion)+h['human']('REPORT_APPROVE',2,51)+h['human']('REPORT_APPROVE',2,52)+h['upload']('ARCHIVE',2,h['ARCHIVE'])+h['human']('CONFIRM_ARCHIVE',2,53,upload=h['ARCHIVE'],proof=True)
def execute(sql,kind='VIRTUAL'):return subprocess.run(w['cmd'],input='BEGIN;'+fixture(kind)+sql+';ROLLBACK;',text=True,capture_output=True,env=w['env'])

class Tests(unittest.TestCase):
 def ok(self,sql,expected='t',kind='VIRTUAL'):
  r=execute(sql,kind);self.assertEqual(r.returncode,0,r.stderr[-4000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-3000:])
 def test_same_admin_outsourced_draft_to_archived_pdf(self):
  self.ok(archive()+f"RESET ROLE;SELECT q.status,r.status,r.confirmed_by='{OWN}',r.archived_artifact_version_id IS NOT NULL FROM dqa_business.requests q JOIN dqa_business.reports r ON r.request_id=q.id WHERE q.id='{REQ}';",'CLOSED|ARCHIVED|t|t')
 def test_real_outsourced_flow_to_archived_pdf_with_fixture_clock_only(self):
  # Real trials cannot use the accelerator. Only this local rollback fixture
  # moves the clock window; every state transition still uses native commands.
  completion=received()+f"RESET ROLE;UPDATE dqa_business.schedules SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()+interval '1 hour' WHERE request_id='{REQ}';"+h['human']('START',2,60)+f"RESET ROLE;UPDATE dqa_business.schedules SET ends_at=clock_timestamp()-interval '1 hour' WHERE request_id='{REQ}';"+h['human']('COMPLETE',2,61)
  self.ok(archive(completion)+f"RESET ROLE;SELECT q.status,r.status,q.execution_kind,NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment e JOIN dqa_business.schedules s ON s.id=e.schedule_id WHERE s.request_id=q.id) FROM dqa_business.requests q JOIN dqa_business.reports r ON r.request_id=q.id WHERE q.id='{REQ}';",'CLOSED|ARCHIVED|REAL|t',kind='REAL')
 def test_real_outsourced_trial_cannot_use_virtual_accelerator(self):
  r=execute(received()+p['accelerate'](40).replace(p['auth'](5),w['auth'](2)),'REAL');self.assertNotEqual(r.returncode,0);self.assertIn('VIRTUAL_TRIAL_REQUIRED',r.stderr[-3000:])
 def test_same_admin_at_every_signature_stage(self):
  self.ok(archive()+f"RESET ROLE;SELECT (SELECT count(*)=5 AND bool_and(actor_member_id='{OWN}') FROM dqa_business.request_signatures WHERE request_id='{REQ}') AND (SELECT count(*)=3 AND bool_and(actor_member_id='{OWN}') FROM dqa_business.report_signatures WHERE request_id='{REQ}') AND (SELECT count(*)=1 AND bool_and(actor_member_id='{OWN}') FROM dqa_business.approval_events WHERE request_id='{REQ}' AND stage='LAB_RECEIVE');")
 def test_outsourcing_uses_no_internal_equipment(self):
  self.ok(archive()+f"RESET ROLE;SELECT bool_and(plan->>'outsourced'='true' AND plan->'allocations'='[]'::jsonb AND executor_member_id='{OWN}') AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment e JOIN dqa_business.schedules s ON s.id=e.schedule_id WHERE s.request_id='{REQ}') FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_admin_still_needs_outsource_booking_confirmation(self):self.deny(received(False),'PREPARATION_NOT_READY')
 def test_virtual_acceleration_cannot_skip_preparation(self):self.deny(signed_plan()+p['accelerate'](40).replace(p['auth'](5),w['auth'](2)),'FLOW_TEST_PREFLIGHT_REQUIRED')
 def test_admin_report_still_requires_attestation(self):self.deny(complete()+h['upload'](who=2)+h['human']('REPORT_SUBMIT',2,50,upload=h['UPLOAD']),'HUMAN_FILE_VERIFICATION_REQUIRED')
 def test_batch_save_remains_draft_until_numbers_and_first_review(self):
  self.ok(request('SUBMIT',1)+request('MANAGER_APPROVE',2)+batch()+f"RESET ROLE;SELECT status='AWAITING_LMS_REVIEW' AND request_review_level=0 AND (SELECT count(*)=1 FROM dqa_business.schedule_drafts WHERE request_id='{REQ}') AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE request_id='{REQ}') AND NOT EXISTS(SELECT 1 FROM dqa_private.preapproval_samples WHERE request_id='{REQ}') FROM dqa_business.requests WHERE id='{REQ}';")

result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(w['a'].result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True,'same_admin_every_stage':True,'synthetic_only':True},indent=2));raise SystemExit(not result.wasSuccessful())
