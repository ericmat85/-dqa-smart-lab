"""Engine-specific advisory controls; synthetic transports only."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from test_business_ai_settings import ConfigurationTests
from gateway.business_engine_controls import controls,control_instructions
from gateway.business_ai import schema
from gateway.e4_preview_provider import E4Error
class ControlsTests(ConfigurationTests):
 def test_each_engine_controls_persist_and_are_scoped(self):
  values={'E1':{'focus':'requirements','detail':'detailed','findings_limit':3},'E2':{'ranking':'earliest_finish','detail':'concise'},'E3':{'tone':'customer','detail':'detailed'},'E4':{'detail':'concise','vocabulary':'technical','reference_limit':3}}
  for engine,value in values.items():
   with self.subTest(engine=engine):
    self.save(self.body(engine_controls=value),engine);self.assertEqual(self.config(engine)['engine_controls'],value);self.assertTrue(self.config(engine)['control_fields'])
    self.assertNotEqual(self.config(engine,workspace='e'*64)['engine_controls'],value)
 def test_old_clients_preserve_existing_controls(self):
  self.save(self.body(engine_controls={'reference_limit':3}));self.save(self.body(expected_revision=1,enabled=False));self.assertEqual(self.config()['engine_controls']['reference_limit'],3)
 def test_controls_reject_injection_unknown_engine_fields_and_booleans(self):
  for engine,value in [('E1',{'auto_approve':True}),('E2',{'ranking':'ignore_rules'}),('E3',{'temperature':4}),('E4',{'reference_limit':True}),('E4',{'reference_limit':31}),('E1',{'findings_limit':0}),('E3',{'tone':None}),('E4',[])]:
   with self.subTest(engine=engine,value=value),self.assertRaisesRegex(E4Error,'AI_CONTROLS_INVALID'):self.save(self.body(engine_controls=value),engine)
  self.assertFalse(self.calls)
 def test_actual_schema_bounded_without_changing_workflow(self):
  self.assertEqual(schema('E1',{'findings_limit':3})['properties']['findings']['maxItems'],3);self.assertEqual(schema('E4',{'reference_limit':3})['properties']['references']['maxItems'],3)
  for engine in ['E1','E2','E3','E4']:
   self.assertIn('preserve the fixed workflow',control_instructions(engine,controls(engine)))
 def test_actual_provider_receives_engine_specific_controls(self):
  for engine,value,phrase in [('E1',{'focus':'signatures'},'signature record completeness'),('E2',{'ranking':'fewer_devices'},'fewer equipment allocations'),('E3',{'tone':'customer'},'customer-facing'),('E4',{'vocabulary':'technical','reference_limit':3},'engineering terminology')]:
   self.save(self.body(engine_controls=value),engine);self.now[0]+=61;self.generate_configured(engine)
   import json
   request=json.loads(self.calls[-1].content);self.assertIn(phrase,request['instructions']);self.assertIn('Never claim a human action or change data',request['instructions'])
if __name__=='__main__':unittest.main()
