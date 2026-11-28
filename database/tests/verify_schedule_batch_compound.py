"""Rollback-only compound batch planning preserves signed stage source and equipment feasibility."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_compound_schedule.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
BATCH='bd630000-0000-4000-8000-000000000001'
def command(ids=None,units=1,member=None,first=START,last=None):
 ids=ids or [REQ,R2];member=member or f"(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{uid(1)}')"
 return f"jsonb_build_object('expected_member',{member},'options',jsonb_build_object('earliest','{first}','latest','{last or (datetime.fromisoformat(first)+timedelta(days=31)).date().isoformat()}'),'selection',(SELECT jsonb_agg(jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',coalesce((SELECT revision FROM dqa_business.schedule_drafts WHERE tenant_id=q.tenant_id AND request_id=q.id),0),'sample_space_units',{units},'equipment_count',CASE WHEN q.form_details->>'priority'='委外' THEN 0 ELSE 1 END,'sample_code','') ORDER BY q.id) FROM dqa_business.requests q WHERE q.tenant_id='{T}' AND q.id=ANY(ARRAY[{','.join(chr(39)+x+chr(39) for x in ids)}]::uuid[])))"
def prepare(ids=None,units=1,oid=BATCH,cmd_value=None,**kw):return 'RESET ROLE;'+auth(1)+f"SELECT set_config('test.batch.command',({cmd_value or command(ids,units,**kw)})::text,true);SELECT dqa_business.prepare_schedule_batch('{T}','{oid}',current_setting('test.batch.command')::jsonb);"
def save_batch(oid=BATCH):return f"SELECT dqa_business.execute_schedule_batch('{T}','{oid}');"
def packet(oid=BATCH):return f"dqa_business.schedule_batch_result('{T}','{oid}')"
class Tests(unittest.TestCase):
 def test_signed_compound_source_produces_stage_specific_batch_draft(self):
  r=query(prepare([REQ])+save_batch()+f"RESET ROLE;SELECT jsonb_array_length(plan->'segments')=6 AND jsonb_array_length(plan->'allocations')=3 AND plan->>'sample_code'='' AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE request_id='{REQ}') FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';")
  self.assertEqual(r.returncode,0,r.stderr[-3000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
