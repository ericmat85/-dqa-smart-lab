"""Authoritative preview, unchanged save validation, and bounded E2 candidate search."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_schedule_drafts.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)), 'exec'))
def preview(c=None):return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.preview_schedule_draft('{T}',{literal(c or plan())})"
def wrong_end():
 c=plan();c['data']['end_date']=str(START);return c
class Tests(unittest.TestCase):
 def check(self,sql,expected,kind='HIGH_HUMIDITY'):
  r=execute(sql,kind);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def reject(self,sql,code):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr[-1800:])
 def test_preview_corrects_end_without_writes(self):
  self.check(preview(wrong_end())+f"->>'end_date';RESET ROLE;SELECT count(*) FROM dqa_business.schedule_drafts UNION ALL SELECT count(*) FROM dqa_private.schedule_draft_operations",'0')
 def test_preview_returns_exact250h_canonical_end(self):self.check(preview(wrong_end())+"->>'end_date'",str(END))
 def test_saving_wrong_end_still_fails(self):self.reject(run_plan(wrong_end()),'PLANNING_END_DATE_MISMATCH')
 def test_canonical_preview_can_be_saved(self):
  c=wrong_end();j=literal(c);self.check('RESET ROLE;'+auth(1)+f"SELECT set_config('test.preview.command',jsonb_set({j},'{{data,end_date}}',dqa_business.preview_schedule_draft('{T}',{j})->'end_date')::text,true);SELECT dqa_business.prepare_schedule_draft('{T}','{OP}',current_setting('test.preview.command')::jsonb);SELECT dqa_business.execute_schedule_draft('{T}','{OP}',current_setting('test.preview.command')::jsonb);SELECT plan->>'end_date' FROM dqa_business.schedule_drafts WHERE request_id='{REQ}'",str(END))
 def test_start_search_window_does_not_limit_finish_date(self):
  self.check('RESET ROLE;'+auth(1)+f"WITH x AS(SELECT dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal({'earliest':str(START),'latest':str(START),'sample_space_units':1})}) j) SELECT jsonb_array_length(j->'candidates')>0,(j->'candidates'->0->'plan'->>'end_date')::date>'{START}'::date FROM x",'t|t')
 def test_every_candidate_round_trips_strict_planner(self):
  self.check('RESET ROLE;'+auth(1)+f"WITH x AS(SELECT dqa_business.business_ai_schedule_candidates('{T}','{REQ}',{literal({'earliest':str(START),'latest':str(START+timedelta(days=5)),'sample_space_units':2})}) j) SELECT count(*)>0,bool_and(dqa_business.validate_business_ai_schedule('{T}',c->'command')->>'end_date'=c->'plan'->>'end_date') FROM x,LATERAL jsonb_array_elements(j->'candidates') c",'t|t')
 def water(self,units):
  c=plan('VIBRATION_DURABILITY');c['expected_request_revision']=7;c['data'].update(end_date=str(START),sample_space_units=units,equipment_revisions={EQ:2})
  setup=f"RESET ROLE;UPDATE dqa_business.trial_definitions SET profile_code='WATER_INGRESS' WHERE id='a3000000-0000-0000-0000-000000000001';UPDATE dqa_business.requests SET specification='試驗時間：1 小時。' WHERE id='{REQ}';UPDATE dqa_business.equipment SET name='防水試驗機 合成',space_units=2,daily_hours=1 WHERE id='{EQ}';"
  return setup+preview(c)+"->>'end_date'"
 def test_machine_daily_hours_limit_is_used(self):self.check(self.water(1),str(START+timedelta(days=3)),'VIBRATION_DURABILITY')
 def test_units_change_completion_using_same_calendar(self):self.check(self.water(2),str(START+timedelta(days=4)),'VIBRATION_DURABILITY')
 def test_preview_still_requires_role_and_read_permissions(self):self.reject('RESET ROLE;'+auth(3)+f"SELECT dqa_business.preview_schedule_draft('{T}',{literal(plan())})",'PLANNING_ACCESS_DENIED')
 def test_anonymous_preview_cannot_execute(self):self.reject("RESET ROLE;SET LOCAL ROLE anon;"+f"SELECT dqa_business.preview_schedule_draft('{T}',{literal(plan())})",'permission denied')
 def test_private_calculator_cannot_be_called_by_browser(self):self.reject('RESET ROLE;'+auth(1)+f"SELECT dqa_private.calculate_schedule_draft_plan('{T}',{literal(plan())},false)",'permission denied')
 def test_revision_fence_is_unchanged(self):
  c=plan();c['data']['equipment_revisions'][EQ]=99;self.reject(preview(c),'REVISION_CONFLICT')
 def test_preview_does_not_accept_untrusted_override_flags(self):
  c=plan();c['skip_conflicts']=True;self.reject(preview(c),'PLANNING_FIELDS_INVALID')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
