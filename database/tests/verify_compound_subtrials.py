"""Rollback-only compound editor children, equipment scopes and reference protection."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_trial_editor.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
C1='ac620000-0000-4000-8000-000000000001';C2='ac620000-0000-4000-8000-000000000002';E2='ac620000-0000-4000-8000-000000000003'
def sub(index=0,**kw):
 d=dict(id=[C1,C2][index],name=['高溫放置','低溫放置'][index],conditions=[dict(kind='TEMPERATURE',unit='°C',lower=[98,-22][index],upper=[102,-18][index])],equipment_ids=[[E],[E2]][index]);d.update(kw);return d
def nested(**kw):
 d=dict(conditions=[],equipment_ids=[],description=[dict(type='text',text='試驗時間：4 小時。')],sub_trials=[sub(),sub(1)]);d.update(kw);return d
def setup_eq():return auth()+save(command())+save(command(id=E2,data=equipment(legacy_id='EQ-CHILD-B',name='合成低溫設備')),'ac620000-0000-4000-8000-000000000010')
def write(d=None,kind='COMPOUND_CONTINUOUS',revision=0,oid=20):
 c=command('trial',id=D,revision=revision,data=trial(definition_details=d if d is not None else nested(),test_type=kind));return save(c,f'ac620000-0000-4000-8000-{oid:012}')
def seed():return setup_eq()+write()
def caps():return f"RESET ROLE;INSERT INTO dqa_private.equipment_capabilities VALUES('{T}','{E}',{literal([dict(kind='TEMPERATURE',unit='°C',lower=0,upper=150)])}),('{T}','{E2}',{literal([dict(kind='TEMPERATURE',unit='°C',lower=-40,upper=25)])});"
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-3000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,error='TRIAL_DETAILS_INVALID'):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2500:])
 def test_children_round_trip_with_separate_equipment(self):self.ok(seed()+f"SELECT dqa_business.trial_editor_detail('{T}','{D}')->'details'={literal(nested())};")
 def test_noncontinuous_children_preserve_classification(self):self.ok(setup_eq()+write(kind='COMPOUND_DISCONTINUOUS')+f"SELECT dqa_business.original_ui_snapshot('{T}')->'trial_editor_details'->0->'details'->'sub_trials'={literal(nested()['sub_trials'])};")
 def test_children_can_be_edited_reordered_and_removed(self):
  d=nested(sub_trials=[sub(1,name='冷卻階段'),sub(name='升溫階段')]);self.ok(seed()+write(d,revision=1,oid=21)+f"SELECT dqa_business.trial_editor_detail('{T}','{D}')->'details'->'sub_trials'={literal(d['sub_trials'])};")
 def test_single_child_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub()])))
 def test_duplicate_child_id_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(),sub(1,id=C1)])))
 def test_duplicate_child_name_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(),sub(1,name='高溫放置')])))
 def test_foreign_child_equipment_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(),sub(1,equipment_ids=['ffffffff-ffff-4fff-8fff-ffffffffffff'])])),'TRIAL_EQUIPMENT_INVALID')
 def test_duplicate_equipment_inside_one_child_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(equipment_ids=[E,E]),sub(1)])),'TRIAL_EQUIPMENT_INVALID')
 def test_wrong_child_units_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(conditions=[dict(kind='TEMPERATURE',unit='N',lower=0,upper=1)]),sub(1)])))
 def test_reversed_child_bounds_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(conditions=[dict(kind='TEMPERATURE',unit='°C',lower=102,upper=98)]),sub(1)])))
 def test_recursive_children_and_extra_fields_rejected(self):self.deny(setup_eq()+write(nested(sub_trials=[sub(sub_trials=[]),sub(1)])))
 def test_children_require_compound_parent_type(self):self.deny(setup_eq()+write(kind='PLACEMENT'),'TRIAL_SUBTRIALS_INVALID')
 def test_type_only_edit_cannot_leave_children_on_single_trial(self):
  c=command('trial',id=D,revision=1,data=trial(test_type='PLACEMENT'));self.deny(seed()+save(c,'ac620000-0000-4000-8000-000000000022'),'TRIAL_SUBTRIALS_INVALID')
 def test_stale_editor_does_not_overwrite_children(self):self.deny(seed()+write(revision=9,oid=21),'REVISION_CONFLICT')
 def test_parameter_delete_guard_includes_child_conditions(self):self.deny(seed()+f"SELECT dqa_business.prepare_spec_parameter('{T}','{C1}',(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}'),'DELETE','TEMPERATURE',0,'{{}}');SELECT dqa_business.save_spec_parameter('{T}','{C1}',(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}'),'DELETE','TEMPERATURE',0,'{{}}');",'SPEC_PARAMETER_IN_USE')
 def test_parameter_usage_counts_parent_once_for_shared_child_kind(self):self.ok(seed()+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.spec_parameter_context('{T}')->'rows')r WHERE r->>'id'='TEMPERATURE' AND r->'usage'->>'trials'='1' AND r->'unit_usage'->>'°C'='1');")
 def test_each_device_matches_its_own_child(self):self.ok(seed()+caps()+f"SELECT dqa_private.equipment_condition_error('{T}','{D}','{E}') IS NULL AND dqa_private.equipment_condition_error('{T}','{D}','{E2}') IS NULL;")
 def test_unbound_device_cannot_match_even_with_capability(self):self.ok(seed()+caps()+f"SELECT dqa_private.equipment_condition_error('{T}','{D}','a4000000-0000-0000-0000-000000000001')='TRIAL_EQUIPMENT_MISMATCH';")
 def test_child_requires_complete_tolerance_range(self):self.ok(seed()+caps()+f"UPDATE dqa_private.equipment_capabilities SET capabilities={literal([dict(kind='TEMPERATURE',unit='°C',lower=0,upper=95)])} WHERE equipment_id='{E}';SELECT dqa_private.equipment_condition_error('{T}','{D}','{E}')='PLANNING_CONDITIONS_EXCEEDED';")
 def coverage(self,ids):
  plan=dict(allocations=[dict(equipment_id=id) for id in ids]);return seed()+caps()+f"INSERT INTO dqa_private.trial_editor_settings SELECT '{T}',trial_id,{literal(nested())} FROM dqa_business.requests WHERE tenant_id='{T}' LIMIT 1 ON CONFLICT(tenant_id,trial_id) DO UPDATE SET details=EXCLUDED.details;SELECT dqa_private.plan_capability_checks('{T}',(SELECT id FROM dqa_business.requests WHERE tenant_id='{T}' LIMIT 1),{literal(plan)})"
 def test_all_children_need_compatible_selected_equipment(self):self.deny(self.coverage([E])+';','TRIAL_SUBTRIAL_EQUIPMENT_REQUIRED')
 def test_each_child_retains_compared_equipment_in_plan_trace(self):
  expected=[dict(sub_trial_id=C1,equipment_id=E,requirements=sub()['conditions']),dict(sub_trial_id=C2,equipment_id=E2,requirements=sub(1)['conditions'])];self.ok(self.coverage([E,E2])+f" @> {literal(expected)};")
 def test_saved_third_child_can_be_removed_without_changing_siblings(self):
  third=sub(id='ac620000-0000-4000-8000-000000000004',name='暫存子試驗');self.ok(setup_eq()+write(nested(sub_trials=[sub(),sub(1),third]))+write(revision=1,oid=21)+f"SELECT dqa_business.trial_editor_detail('{T}','{D}')->'details'->'sub_trials'={literal(nested()['sub_trials'])};")
 def test_used_child_unit_cannot_be_removed(self):self.deny(seed()+f"SELECT dqa_business.prepare_spec_parameter('{T}','{C1}',(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}'),'SAVE','TEMPERATURE',0,'{{\"label\":\"溫度\",\"units\":[\"K\"]}}');SELECT dqa_business.save_spec_parameter('{T}','{C1}',(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}'),'SAVE','TEMPERATURE',0,'{{\"label\":\"溫度\",\"units\":[\"K\"]}}');",'SPEC_PARAMETER_IN_USE')
 def test_only_catalog_manager_can_save_children(self):self.deny(setup_eq()+'RESET ROLE;'+auth('10000000-0000-0000-0000-000000000002')+write(),'RESOURCE_WRITE_DENIED')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
