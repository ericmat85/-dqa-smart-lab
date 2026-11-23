"""Local rollback-only validation of requester → planner → booking U ownership."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2200:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def test_planner_value_survives_save_reload_and_booking_without_requester_value(self):
  c=plan(expected_request_revision=7,expected_draft_revision=1);c['data']['sample_space_units']=2
  self.ok(f"RESET ROLE;UPDATE dqa_business.requests SET sample_space_units=NULL WHERE id='{REQ}';"+run_plan(c,OP.replace('001','002'))+booked()+f"RESET ROLE;SELECT s.plan->>'sample_space_units',a.allocated_units,q.sample_space_units IS NULL,(SELECT count(*) FROM dqa_business.request_document_versions v WHERE v.request_id=q.id AND v.payload ? 'sample_space_units') FROM dqa_business.schedules s JOIN dqa_business.schedule_equipment a ON a.schedule_id=s.id JOIN dqa_business.requests q ON q.id=s.request_id WHERE q.id='{REQ}'",'2|6|t|0')
 def test_planner_edit_never_changes_signed_version_or_request_revision(self):
  c=plan(expected_draft_revision=1);c['data']['sample_space_units']=3
  self.ok(f"RESET ROLE;SELECT set_config('dqa.test_original_hash',(SELECT document_sha256 FROM dqa_business.request_document_versions WHERE request_id='{REQ}'),true);"+run_plan(c,OP.replace('001','002'))+f"RESET ROLE;SELECT d.plan->>'sample_space_units',q.revision,v.document_sha256=current_setting('dqa.test_original_hash'),v.document_sha256=encode(sha256(convert_to(v.payload::text,'UTF8')),'hex') FROM dqa_business.schedule_drafts d JOIN dqa_business.requests q ON q.id=d.request_id JOIN dqa_business.request_document_versions v ON v.id=q.request_document_version_id WHERE q.id='{REQ}'",'3|6|t|t')
 def test_blank_zero_fractional_and_excess_units_cannot_be_scheduled(self):
  for units in [None,0,-1,1.5,100001,'2']:
   c=plan(expected_draft_revision=1);c['data']['sample_space_units']=units;r=execute(run_plan(c,OP.replace('001','002')));self.assertNotEqual(r.returncode,0);self.assertIn('PLANNING_FIELDS_INVALID',r.stderr[-1800:])
 def test_capacity_is_computed_from_planner_value(self):
  c=plan(expected_draft_revision=1);c['data']['sample_space_units']=21;r=execute(run_plan(c,OP.replace('001','002')));self.assertNotEqual(r.returncode,0);self.assertIn('PLANNING_SPACE_INSUFFICIENT',r.stderr[-1800:])
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'database':s['database']}));raise SystemExit(not result.wasSuccessful())
