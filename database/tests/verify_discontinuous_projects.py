"""Rollback-only mixed normal/continuous/discontinuous project and native day planning checks."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_mixed_compound_projects.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
base_mixed=mixed
def mixed(submit=True):
 c=base_mixed(submit)
 for i,mode in [(1,'CONTINUOUS'),(2,'DISCONTINUOUS')]:c['items'][i]['compound'].update(mode=mode,label=mode+'組')
 return c

def prepared():return prep()+save()+review(1,'MANAGER_APPROVE',681).replace(REQ,child(3))
def plan(data=None,save_it=True):return planning(data,save_it).replace(REQ,child(3))
def explicit_dates():return [None,None,(start+timedelta(days=10)).isoformat(),None,None,None]
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=query(sql);self.assertEqual(r.returncode,0,r.stderr[-3500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,code):
  r=query(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-3000:])
 def test_same_project_has_normal_continuous_and_discontinuous_signed_children(self):self.ok(prep()+save()+f"RESET ROLE;SELECT count(*)=3 AND (SELECT form_details->>'compoundMode'='CONTINUOUS' FROM dqa_business.requests WHERE id='{child(2)}') AND (SELECT form_details->>'compoundMode'='DISCONTINUOUS' FROM dqa_business.requests WHERE id='{child(3)}') AND count(*) FILTER(WHERE NOT(form_details ? 'compoundMode'))=1 FROM dqa_business.requests WHERE project_group_id='{M}';")
 def test_signed_document_keeps_group_mode_and_original_stage_order(self):self.ok(prep()+save()+f"RESET ROLE;SELECT payload->'form_details'->>'compoundMode'='DISCONTINUOUS' AND jsonb_array_length(payload->'form_details'->'compoundStages')=6 FROM dqa_business.request_document_versions WHERE request_id='{child(3)}';")
 def test_invalid_group_mode_cannot_create_project(self):
  c=mixed();c['items'][2]['compound']['mode']='SKIP_APPROVAL';self.deny(prep(c),'COMPOUND_PROTOCOL_INVALID')
 def test_mode_requires_a_compound_protocol_in_original_form(self):self.deny("RESET ROLE;SELECT dqa_private.validate_original_fields('{\"compoundMode\":\"DISCONTINUOUS\"}'::jsonb,'');",'COMPOUND_PROTOCOL_INVALID')
 def test_native_calendar_mode_is_per_request_not_global(self):self.ok(prepared()+plan()+f"RESET ROLE;SELECT plan->>'calendar'='compound_discontinuous' AND plan->'calendar_policy'->>'mode'='COMPOUND_DISCONTINUOUS' AND (SELECT dqa_private.trial_calendar_policy('{T}','{COMPOUND}','continuous')->>'mode'='COMPOUND_CONTINUOUS') FROM dqa_business.schedule_drafts WHERE request_id='{child(3)}';")
 def test_each_noncontinuous_stage_obeys_its_own_trial_calendar(self):
  policy=dict(mode='CONTINUOUS',weekends=False,holidays=False,work_start=0,work_end=1440,overtime=False,overtime_end=1440,substitution=True)
  sql=prepared()+f"RESET ROLE;INSERT INTO dqa_private.trial_calendar_policies VALUES('{T}','{stages[0]['trial_id']}',{literal(policy)},1);"+plan()+f"RESET ROLE;SELECT plan->>'start_date'=('{START}'::date+2)::text AND (plan->>'hours_per_batch')::numeric=122 FROM dqa_business.schedule_drafts WHERE request_id='{child(3)}';"
  self.ok(sql)
 def test_context_exposes_signed_mode_even_before_a_draft_exists(self):self.ok(prepared()+'RESET ROLE;'+auth(3)+f"SELECT dqa_business.preapproval_context('{T}','{child(3)}')->'calendar_policy'->>'mode'='COMPOUND_DISCONTINUOUS';")
 def test_explicit_stage_gap_preserves_effort_and_saved_earliest_dates(self):
  data=plan_data(stage_start_dates=explicit_dates());self.ok(prepared()+plan(data)+f"RESET ROLE;SELECT plan->'compound'->'stage_start_dates'={literal(explicit_dates())} AND (plan->>'hours_per_batch')::numeric=122 AND (SELECT sum((x->>'nominal_minutes')::numeric)=7320 FROM jsonb_array_elements(plan->'segments')x) AND (SELECT min((x->>'starts_at')::timestamptz)>=(('{START}'::date+10)::timestamp AT TIME ZONE 'Asia/Taipei') FROM jsonb_array_elements(plan->'segments')x WHERE x->>'stage_index'='3') AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE request_id='{child(3)}') FROM dqa_business.schedule_drafts WHERE request_id='{child(3)}';")
 def test_manual_stage_waits_over_weekend_instead_of_extending_exposure(self):
  # Phase3 needs an operator. Its earliest date is a Saturday, so native calendar defers it.
  days=[None,None,(start+timedelta(days=7)).isoformat(),None,None,None]
  self.ok(prepared()+plan(plan_data(stage_start_dates=days))+f"RESET ROLE;SELECT (SELECT bool_and(extract(isodow FROM (x->>'starts_at')::timestamptz AT TIME ZONE 'Asia/Taipei')<=5) FROM jsonb_array_elements(plan->'segments')x WHERE x->>'stage_index'='3') AND (plan->>'hours_per_batch')::numeric=122 FROM dqa_business.schedule_drafts WHERE request_id='{child(3)}';")
 def test_continuous_group_cannot_smuggle_in_stage_waiting(self):self.deny(prep()+save()+review(1,'MANAGER_APPROVE',682).replace(REQ,child(2))+planning(plan_data(stage_start_dates=explicit_dates())).replace(REQ,child(2)),'COMPOUND_STAGE_DATES_INVALID')
 def test_wrong_length_date_list_is_rejected(self):self.deny(prepared()+plan(plan_data(stage_start_dates=[None])),'COMPOUND_STAGE_DATES_INVALID')
 def test_invalid_date_is_rejected(self):
  days=explicit_dates();days[2]='2026-99-99';self.deny(prepared()+plan(plan_data(stage_start_dates=days)),'COMPOUND_STAGE_DATES_INVALID')
 def test_first_stage_must_use_overall_start_date(self):
  days=explicit_dates();days[0]=(start+timedelta(days=1)).isoformat();self.deny(prepared()+plan(plan_data(stage_start_dates=days)),'COMPOUND_STAGE_DATES_INVALID')
 def test_excessive_stage_delay_is_rejected(self):
  days=explicit_dates();days[2]=(start+timedelta(days=367)).isoformat();self.deny(prepared()+plan(plan_data(stage_start_dates=days)),'COMPOUND_STAGE_DATES_INVALID')
 def test_changing_mode_cannot_replace_a_prepared_project(self):
  c=mixed();c['items'][2]['compound']['mode']='CONTINUOUS';self.deny(prep()+save(c),'PROJECT_OPERATION_CONFLICT')
 def test_sample_numbers_and_first_signature_still_reserve_all_resources(self):
  sql=prepared()+plan(plan_data(stage_start_dates=explicit_dates()))+number_after().replace(REQ,child(3)).replace("'[\"RT-2\"]'::jsonb","'[\"RT-2\",\"ST-3\"]'::jsonb")+review(3,'LMS_APPROVE',683,FIRST,'2').replace(REQ,child(3))
  self.ok(sql+f"RESET ROLE;SELECT status='PENDING_APPROVAL' AND (SELECT count(*)=3 FROM dqa_business.schedule_equipment WHERE schedule_id=s.id) FROM dqa_business.schedules s WHERE request_id='{child(3)}';")
 def test_batch_replanning_preserves_saved_earliest_stage_dates(self):
  bid='bc650000-0000-4000-8000-000000000098';days=explicit_dates()
  sql=prepared()+plan(plan_data(stage_start_dates=days))+'RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_batch('{T}','{bid}',jsonb_build_object('expected_member',dqa_private.member_id('{T}'),'options',jsonb_build_object('earliest','{START}','latest','{START}'::date+31),'selection',jsonb_build_array(jsonb_build_object('request_id','{child(3)}','expected_request_revision',(SELECT revision FROM dqa_business.requests WHERE id='{child(3)}'),'expected_draft_revision',1,'sample_space_units',1,'equipment_count',1,'sample_code',''))));SELECT dqa_business.execute_schedule_batch('{T}','{bid}');RESET ROLE;SELECT plan->'compound'->'stage_start_dates'={literal(days)} AND (SELECT min((x->>'starts_at')::timestamptz)>=(('{START}'::date+10)::timestamp AT TIME ZONE 'Asia/Taipei') FROM jsonb_array_elements(plan->'segments')x WHERE x->>'stage_index'='3') FROM dqa_business.schedule_drafts WHERE request_id='{child(3)}';"
  self.ok(sql)
 def test_selected_mixed_types_reuse_batch_planning_and_save(self):
  sql=prep()+save()
  for n in range(1,4):sql+=review(1,'MANAGER_APPROVE',690+n).replace(REQ,child(n))
  bid='bc650000-0000-4000-8000-000000000099'
  sql+='RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_schedule_batch('{T}','{bid}',jsonb_build_object('expected_member',dqa_private.member_id('{T}'),'options',jsonb_build_object('earliest','{START}','latest','{START}'::date+31),'selection',(SELECT jsonb_agg(jsonb_build_object('request_id',id,'expected_request_revision',revision,'expected_draft_revision',0,'sample_space_units',1,'equipment_count',1,'sample_code','')) FROM dqa_business.requests WHERE project_group_id='{M}')));SELECT dqa_business.execute_schedule_batch('{T}','{bid}');RESET ROLE;SELECT count(*)=3 AND count(*) FILTER(WHERE plan->>'calendar'='compound_discontinuous')=1 FROM dqa_business.schedule_drafts WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{M}');"
  self.ok(sql)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
