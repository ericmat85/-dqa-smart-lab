"""Rollback-only shared parameter kinds, unit edits, references and replay guards."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_equipment_capabilities.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
K='CUSTOM_1234567890ABCDEF1234567890ABCDEF';D='ea610000-0000-4000-8000-000000000001'
NEW=dict(label='流量',units=['mL/min','L/min'])
def call(action='SAVE',kind=K,rev=0,data=None,oid=101,who=1,prepare=True,execute_save=True,member=None,tenant=T):
 c=data if data is not None else (NEW if action=='SAVE' else {})
 actor=member or f"(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{uid(who)}')"
 if member:actor="'"+member+"'::uuid"
 args=f"'{tenant}','{op(oid)}',{actor},'{action}','{kind}',{rev},{literal(c)}"
 return 'RESET ROLE;'+auth(who)+(f"SELECT dqa_business.prepare_spec_parameter({args});" if prepare else '')+(f"SELECT dqa_business.save_spec_parameter({args});" if execute_save else '')
def trial_write(conditions,oid=110,revision=0):
 data=dict(name='合成自訂條件試驗',aliases=[],profile_code='UNVERIFIED',specification='試驗時間：4 小時。',acceptance='合成判定',equipment_reference='合成設備',specification_version='CUSTOM-1',duration_hours=4,definition_details=dict(conditions=conditions,equipment_ids=[],description=[dict(type='text',text='試驗時間：4 小時。')]))
 c=dict(kind='trial',action='save',id=D,expected_revision=revision,data=data)
 return 'RESET ROLE;'+auth(1)+f"SELECT dqa_business.prepare_resource_operation('{T}','{op(oid)}',{literal(c)});SELECT dqa_business.execute_resource_operation('{T}','{op(oid)}',{literal(c)});"
def param_condition(unit='mL/min',low=48,high=52):return condition(K,unit,low,high)
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-3000:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-3200:])
 def test_defaults_read_without_backfilling_live_rows(self):self.ok(auth(1)+f"SELECT set_config('test.defaults',(jsonb_array_length(dqa_business.spec_parameter_context('{T}')->'rows')=8)::text,true);RESET ROLE;SELECT current_setting('test.defaults')='true' AND NOT EXISTS(SELECT 1 FROM dqa_private.spec_parameter_definitions);")
 def test_create_is_durable_in_shared_bootstrap(self):self.ok(call()+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{T}')->'specification_parameters')r WHERE r->>'id'='{K}' AND r->>'label'='流量' AND r->'units'={literal(NEW['units'])});")
 def test_custom_kind_accepted_by_native_trial_validator(self):self.ok(call()+trial_write([param_condition()])+f"RESET ROLE;SELECT details->'conditions'={literal([param_condition()])} FROM dqa_private.trial_editor_settings WHERE trial_id='{D}';")
 def test_custom_kind_accepted_by_equipment_editor(self):self.ok(call()+save_caps([param_condition(low=0,high=100)])+f"RESET ROLE;SELECT capabilities={literal([param_condition(low=0,high=100)])} FROM dqa_private.equipment_capabilities WHERE equipment_id='{EQ}';")
 def test_unregistered_kind_rejected_for_trial(self):self.deny(trial_write([param_condition()]),'TRIAL_DETAILS_INVALID')
 def test_unregistered_kind_rejected_for_equipment(self):self.deny(save_caps([param_condition()]),'EQUIPMENT_CAPABILITIES_INVALID')
 def test_label_and_additional_unit_can_change_while_in_use(self):
  d=dict(label='液體流量',units=NEW['units']+['m³/h']);self.ok(call()+trial_write([param_condition()])+call(rev=1,data=d,oid=102)+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.spec_parameter_context('{T}')->'rows')r WHERE r->>'id'='{K}' AND r->>'label'='液體流量' AND r->'units' ? 'm³/h' AND r->'unit_usage'->>'mL/min'='1');")
 def test_editing_unreferenced_unit_is_allowed(self):self.ok(call()+call(rev=1,data=dict(label='流量',units=['m³/h']),oid=102)+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.spec_parameter_context('{T}')->'rows')r WHERE r->>'id'='{K}' AND r->'units'='[\"m³/h\"]'::jsonb);")
 def test_referenced_trial_kind_cannot_be_deleted(self):self.deny(call()+trial_write([param_condition()])+call('DELETE',rev=1,oid=102),'SPEC_PARAMETER_IN_USE')
 def test_referenced_equipment_kind_cannot_be_deleted(self):self.deny(call()+save_caps([param_condition(low=0,high=100)])+call('DELETE',rev=1,oid=102),'SPEC_PARAMETER_IN_USE')
 def test_used_unit_cannot_be_removed(self):self.deny(call()+trial_write([param_condition()])+call(rev=1,data=dict(label='流量',units=['L/min']),oid=102),'SPEC_PARAMETER_IN_USE')
 def test_parameter_can_be_deleted_after_sources_are_cleared(self):self.ok(call()+trial_write([param_condition()])+trial_write([],111,1)+call('DELETE',rev=1,oid=102)+f"RESET ROLE;SELECT NOT enabled AND revision=2 FROM dqa_private.spec_parameter_definitions WHERE tenant_id='{T}' AND kind='{K}';")
 def test_historical_plans_keep_reference_guard_after_source_clear(self):
  self.deny(call()+requirements([param_condition()])+capabilities([param_condition(low=0,high=100)])+first()+f"RESET ROLE;DELETE FROM dqa_private.trial_editor_settings WHERE tenant_id='{T}';DELETE FROM dqa_private.equipment_capabilities WHERE tenant_id='{T}';"+call('DELETE',rev=1,oid=102),'SPEC_PARAMETER_IN_USE')
 def test_shared_custom_parameter_still_filters_equipment_range(self):self.deny(call()+requirements([param_condition()])+capabilities([param_condition(low=0,high=49)])+plan(),'PLANNING_CONDITIONS_EXCEEDED')
 def test_builtin_name_edit_retains_stable_identity(self):self.ok(call(kind='TEMPERATURE',data=dict(label='溫度條件',units=['°C']))+f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.spec_parameter_context('{T}')->'rows')r WHERE r->>'id'='TEMPERATURE' AND r->>'label'='溫度條件' AND (r->>'builtin')::boolean);")
 def test_unused_builtin_can_be_deleted_without_default_reappearing(self):self.ok(call('DELETE',kind='OTHER')+f"SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{T}')->'specification_parameters')r WHERE r->>'id'='OTHER');")
 def test_deleted_kind_is_not_recreated_by_an_old_editor(self):self.deny(call()+call('DELETE',rev=1,oid=102)+call(rev=2,oid=103),'SPEC_PARAMETER_NOT_FOUND')
 def test_duplicate_label_and_units_are_rejected(self):
  for data,error in [(dict(label='溫度',units=['X']),'SPEC_PARAMETER_NAME_EXISTS'),(dict(label='流量',units=['X','X']),'SPEC_PARAMETER_FIELDS_INVALID'),(dict(label='流量',units=[]),'SPEC_PARAMETER_FIELDS_INVALID')]:
   with self.subTest(data=data):self.deny(call(data=data),error)
 def test_stale_revision_and_different_replay_payload_rejected(self):
  self.deny(call()+call(rev=0,oid=102),'SPEC_PARAMETER_REVISION_CONFLICT');self.deny(call()+call(data=dict(label='不同內容',units=['X'])),'SPEC_PARAMETER_OPERATION_CONFLICT')
 def test_same_operation_replay_does_not_increment_revision(self):self.ok(call()+call()+f"RESET ROLE;SELECT revision=1 AND (SELECT count(*)=1 FROM dqa_private.spec_parameter_operations WHERE tenant_id='{T}') FROM dqa_private.spec_parameter_definitions WHERE kind='{K}';")
 def test_execute_requires_prepared_intent(self):self.deny(call(prepare=False),'SPEC_PARAMETER_OPERATION_CONFLICT')
 def test_prepare_does_not_write_business_definition(self):self.ok(call(execute_save=False)+f"SELECT dqa_business.spec_parameter_result('{T}','{op(101)}')->>'state'='PLANNED';RESET ROLE;SELECT NOT EXISTS(SELECT 1 FROM dqa_private.spec_parameter_definitions);")
 def test_expired_intent_cannot_commit_and_can_be_recovered(self):self.deny(call(execute_save=False)+f"RESET ROLE;UPDATE dqa_private.spec_parameter_operations SET expires_at=clock_timestamp()-interval '1 minute';"+call(prepare=False),'SPEC_PARAMETER_EXPIRED')
 def test_expired_preparation_result_is_definitive(self):self.ok(call(execute_save=False)+f"RESET ROLE;UPDATE dqa_private.spec_parameter_operations SET expires_at=clock_timestamp()-interval '1 minute';"+auth(1)+f"SELECT dqa_business.spec_parameter_result('{T}','{op(101)}')->>'state'='EXPIRED';")
 def test_nonmanager_and_wrong_workspace_are_denied(self):self.deny(call(who=2),'SPEC_PARAMETER_ACCESS_DENIED');self.deny(call(tenant='b0000000-0000-0000-0000-000000000001'),'SPEC_PARAMETER_ACCESS_DENIED')
 def test_membership_assertion_cannot_cross_sessions(self):self.deny(call(member='f0000000-0000-4000-8000-000000000001'),'SPEC_PARAMETER_ACCESS_DENIED')
 def test_basic_catalog_visible_but_management_denied_to_requester(self):self.ok('RESET ROLE;'+auth(2)+f"SELECT jsonb_array_length(dqa_business.original_ui_snapshot('{T}')->'specification_parameters')=8;");self.deny('RESET ROLE;'+auth(2)+f"SELECT dqa_business.spec_parameter_context('{T}');",'SPEC_PARAMETER_ACCESS_DENIED')
 def test_private_rows_not_directly_writable(self):self.deny(auth(1)+'DELETE FROM dqa_private.spec_parameter_definitions;','permission denied')
 def test_64_kind_limit_preserves_existing_catalog(self):
  sql=''
  for i in range(56):sql+=call(kind='CUSTOM_'+f'{i+1:032X}',data=dict(label='自訂'+str(i+1),units=['U']),oid=200+i)
  self.deny(sql+call(kind='CUSTOM_'+f'{57:032X}',data=dict(label='超過上限',units=['U']),oid=299),'SPEC_PARAMETER_LIMIT')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
