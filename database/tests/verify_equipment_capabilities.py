"""Rollback-only equipment parameters, condition sources and native planning exclusion."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_date_scheduling.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
TRIAL='a3000000-0000-0000-0000-000000000001'
def condition(kind='TEMPERATURE',unit='°C',low=98,high=102):return dict(kind=kind,unit=unit,lower=low,upper=high)
def requirements(rows=None):
 d=dict(conditions=rows if rows is not None else [condition()],equipment_ids=[],description=[dict(type='text',text='試驗時間：250 小時。')])
 return f"RESET ROLE;INSERT INTO dqa_private.trial_editor_settings VALUES('{T}','{TRIAL}',{literal(d)});"
def capabilities(rows=None):return f"RESET ROLE;INSERT INTO dqa_private.equipment_capabilities VALUES('{T}','{EQ}',{literal(rows if rows is not None else [condition(low=-40,high=150)])});"
def save_caps(rows,oid=81,rev=1,who=1,omit=False):
 data=dict(legacy_id='EQ-PREFLIGHT',name='恆溫恆濕機 合成',category='溫濕度試驗',model='',serial_number='',space_units=6,daily_hours=24,specification='',next_calibration=None,next_maintenance=None,display_details=dict(location='合成位置',owner='合成管理者'))
 if not omit:data['capabilities']=rows
 c=dict(kind='equipment',action='save',id=EQ,expected_revision=rev,data=data)
 return 'RESET ROLE;'+auth(who)+f"SELECT dqa_business.prepare_resource_operation('{T}','{op(oid)}',{literal(c)});SELECT dqa_business.execute_resource_operation('{T}','{op(oid)}',{literal(c)});"
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-3500:])
 def test_100_degree_requirement_rejects_95_degree_machine(self):self.deny(requirements([condition(low=100,high=100)])+capabilities([condition(low=-40,high=95)])+plan(),'PLANNING_CONDITIONS_EXCEEDED')
 def test_full_plus_minus_range_is_checked_not_just_nominal(self):self.deny(requirements()+capabilities([condition(low=-40,high=100)])+plan(),'PLANNING_CONDITIONS_EXCEEDED')
 def test_boundary_covers_both_ends_and_first_review_can_reserve(self):self.ok(requirements()+capabilities([condition(low=98,high=102)])+first()+f"RESET ROLE;SELECT plan->'capability_checks'->0->'requirements'={literal([condition()])} AND status='PENDING_APPROVAL' FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_missing_structured_spec_is_not_inferred_from_plain_text(self):self.deny(requirements()+f"RESET ROLE;UPDATE dqa_business.equipment SET specification='溫度 -40～150°C' WHERE id='{EQ}';"+plan().replace('"'+EQ+'": 1','"'+EQ+'": 2'),'PLANNING_CONDITIONS_UNVERIFIED')
 def test_all_conditions_must_fit(self):self.deny(requirements([condition(),condition('HUMIDITY','%RH',88,92)])+capabilities([condition(low=-40,high=150),condition('HUMIDITY','%RH',10,90)])+plan(),'PLANNING_CONDITIONS_EXCEEDED')
 def test_incompatible_electrical_units_are_not_compared(self):self.deny(requirements([condition('ELECTRICAL','A',1,2)])+capabilities([condition('ELECTRICAL','V',0,48)])+plan(),'PLANNING_CONDITIONS_UNVERIFIED')
 def test_convertible_force_units_match_the_same_condition(self):self.ok(requirements([condition('FORCE','N',1000,2000)])+capabilities([condition('FORCE','kN',0,3)])+plan()+f"SELECT plan->'capability_checks'->0->'capabilities'={literal([condition('FORCE','kN',0,3)])} FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';")
 def test_no_numeric_source_keeps_legacy_scheduling_unchanged(self):self.ok(plan()+f"SELECT plan->'capability_checks'->0->'requirements'='[]'::jsonb FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';")
 def test_first_review_rechecks_equipment_parameters(self):self.deny(requirements()+capabilities()+plan()+numbers()+f"RESET ROLE;UPDATE dqa_private.equipment_capabilities SET capabilities={literal([condition(low=-40,high=95)])} WHERE equipment_id='{EQ}';"+review(3,'LMS_APPROVE',12,FIRST,'2'),'PLANNING_CONDITIONS_EXCEEDED')
 def test_parameters_persist_and_are_in_authorized_snapshot(self):self.ok(save_caps([condition(low=-40,high=95)])+f"SELECT dqa_business.original_ui_snapshot('{T}')->'equipment_capabilities'->0->'capabilities'={literal([condition(low=-40,high=95)])};")
 def test_remove_parameters_is_durable(self):self.ok(save_caps([condition()])+save_caps([],82,2)+f"RESET ROLE;SELECT capabilities='[]'::jsonb FROM dqa_private.equipment_capabilities WHERE equipment_id='{EQ}';")
 def test_legacy_client_omission_preserves_parameters(self):self.ok(save_caps([condition()])+save_caps(None,82,2,omit=True)+f"RESET ROLE;SELECT capabilities={literal([condition()])} FROM dqa_private.equipment_capabilities WHERE equipment_id='{EQ}';")
 def test_replay_does_not_increment_equipment_revision(self):self.ok(save_caps([condition()])+save_caps([condition()])+f"RESET ROLE;SELECT revision=2 FROM dqa_business.equipment WHERE id='{EQ}';")
 def test_stale_parameter_write_is_rejected(self):self.deny(save_caps([condition()])+save_caps([],82,1),'REVISION_CONFLICT')
 def test_reserved_device_parameters_cannot_change(self):self.deny(capabilities()+first()+save_caps([condition(low=-40,high=95)]),'RESOURCE_RESERVED')
 def test_private_rows_are_not_client_writable(self):self.deny(auth(1)+'DELETE FROM dqa_private.equipment_capabilities;','permission denied')
 def test_nonmanager_cannot_change_parameters(self):self.deny(save_caps([condition()],who=2),'RESOURCE_WRITE_DENIED')
 def test_reversed_missing_and_unknown_unit_rejected(self):
  for c in [condition(low=100,high=95),condition(low=None),condition(unit='F'),condition('FORCE','°C',0,1)]:
   with self.subTest(c=c):self.deny(save_caps([c]),'EQUIPMENT_CAPABILITIES_INVALID')
 def test_duplicate_normalized_units_are_rejected(self):self.deny(save_caps([condition('FORCE','N',0,3000),condition('FORCE','kN',0,3)]),'EQUIPMENT_CAPABILITIES_INVALID')
 def test_fault_repair_does_not_choose_an_underpowered_substitute(self):
  last=(datetime.fromisoformat(START)+timedelta(days=30)).date().isoformat()
  sql=requirements()+capabilities()+second()+f"RESET ROLE;UPDATE dqa_business.equipment SET specification='合成相同規格',category='溫濕度試驗' WHERE id='{EQ}';INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,specification,space_units,daily_hours,operational_status) VALUES('{ALT}','{T}','EQ-ALT','恆溫恆濕機 替代','溫濕度試驗','合成相同規格',6,24,'IDLE');INSERT INTO dqa_private.equipment_capabilities VALUES('{T}','{ALT}',{literal([condition(low=-40,high=95)])});"+incident('EQUIPMENT_FAULT',last=last,equipment=EQ)+f"RESET ROLE;SELECT plan->'allocations'->0->>'equipment_id'='{EQ}' AND starts_at>('{last}'::date::timestamp AT TIME ZONE 'Asia/Taipei') FROM dqa_business.schedules WHERE request_id='{REQ}';"
  self.ok(sql)
 def test_fault_repair_filters_bad_machine_before_choosing_a_qualified_one(self):
  good='ee100000-0000-4000-8000-000000000003';last=(datetime.fromisoformat(START)+timedelta(days=30)).date().isoformat()
  sql=requirements()+capabilities()+second()+f"RESET ROLE;UPDATE dqa_business.equipment SET specification='合成相同規格',category='溫濕度試驗' WHERE id='{EQ}';"
  for device,maximum in [(ALT,95),(good,150)]:sql+=f"INSERT INTO dqa_business.equipment(id,tenant_id,legacy_id,name,category,specification,space_units,daily_hours,operational_status) VALUES('{device}','{T}','EQ-{maximum}','恆溫恆濕機 替代{maximum}','溫濕度試驗','合成相同規格',6,24,'IDLE');INSERT INTO dqa_private.equipment_capabilities VALUES('{T}','{device}',{literal([condition(low=-40,high=maximum)])});"
  self.ok(sql+incident('EQUIPMENT_FAULT',last=last,equipment=EQ)+f"RESET ROLE;SELECT plan->'allocations'->0->>'equipment_id'='{good}' AND status='AWAITING_RECEIPT' FROM dqa_business.schedules WHERE request_id='{REQ}';")
 def test_authorized_planner_context_carries_exact_condition_source_and_device_parameters(self):
  self.ok(requirements()+capabilities()+auth(3)+f"SELECT (dqa_business.preapproval_context('{T}','{REQ}')->'condition_sources'->0->>'trial_id')='{TRIAL}' AND dqa_business.preapproval_context('{T}','{REQ}')->'condition_sources'->0->'conditions'={literal([condition()])} AND EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.preapproval_context('{T}','{REQ}')->'equipment') e WHERE e->>'id'='{EQ}' AND e->'capabilities'={literal([condition(low=-40,high=150)])});")
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
