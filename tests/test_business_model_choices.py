"""Documented model profiles with MockTransport only; no paid inference."""
import unittest,sys,json,hashlib
from pathlib import Path
from decimal import Decimal
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import test_business_ai as fixture
from gateway.business_ai import POLICY,BusinessAI
from gateway.business_model_catalog import CATALOG
from gateway.e4_preview_provider import E4Error
class ModelChoiceTests(unittest.TestCase):
 setUp=fixture.Tests.setUp
 tearDown=fixture.Tests.tearDown
 payload=fixture.Tests.payload
 provider=fixture.Tests.provider
 generate=fixture.Tests.generate
 def body(self,model,revision=0,**kw):
  b={'operation_id':__import__('uuid').uuid4().hex,'expected_revision':revision,'enabled':True,'model':model,'per_call_usd':'0.05','total_cap_usd':'1','max_output_tokens':768,'key_action':'KEEP'};b.update(kw);return b
 def save(self,model,engine='E4',revision=0,**kw):return self.app.settings_store.save(self.app.states[engine],'c'*64,engine,'d'*64,self.body(model,revision,**kw))
 def view(self,engine='E4'):return self.app.settings_store.public(self.app.states[engine],'c'*64,engine)
 def test_health_never_probes_any_keys_or_blocks_on_metadata_transport(self):
  with patch.object(self.states[0].service.client,'get',side_effect=AssertionError('health must not access network')):self.app.health('c'*64)
  self.assertFalse(self.calls);self.assertFalse(self.metadata_calls)
 def test_all_models_listed_with_explicit_compatible_and_disabled_reasons(self):
  for engine in ('E1','E2','E3','E4'):
   data=self.view(engine);self.assertEqual(len(data['models']),99);self.assertEqual(set(data['allowed_models']),{'gpt-6-luna','gpt-6-sol','gpt-6.1-terra'})
   for row in data['models']:
    self.assertTrue(row['reason']);self.assertFalse(row['paid_inference_verified'])
   for model in ('gpt-image-2','gpt-6.2-sol','gpt-4.1-mini'):
    self.assertFalse(next(r for r in data['models'] if r['id']==model)['selectable'])
  self.assertFalse(self.calls);self.assertEqual(len(self.metadata_calls),1)
 def test_selected_models_dispatch_selected_id_parameters_and_exact_prices_without_new_ledger(self):
  before=self.states[0].ledger.snapshot();identity=self.states[0].ledger.identity;spent=Decimal(0)
  for revision,(model,price) in enumerate([('gpt-6-sol',Decimal('0.00056')),('gpt-6.1-terra',Decimal('0.00028')),('gpt-6-luna',Decimal('0.000028'))]):
   self.save(model,revision=revision);self.now[0]+=61;result=self.generate();body=json.loads(self.calls[-1].content)
   self.assertEqual(body['model'],model);self.assertEqual(result['requested_model'],model);self.assertEqual(result['estimated_cost_usd'],str(price));spent+=price
   if model!='gpt-6-luna':self.assertEqual(body['reasoning'],{'effort':'none'})
   else:self.assertNotIn('reasoning',body)
  after=self.states[0].ledger.snapshot();self.assertEqual(self.states[0].ledger.identity,identity);self.assertEqual(after['cap_nanos'],before['cap_nanos']);self.assertEqual(after['expires'],before['expires']);self.assertEqual(Decimal(after['spent_nanos'])/10**9,spent)
 def test_four_engines_use_independent_choices_and_existing_shared_money(self):
  for engine,model in [('E1','gpt-6-sol'),('E2','gpt-6.1-terra'),('E3','gpt-6.1-terra'),('E4','gpt-6-luna')]:
   self.save(model,engine);self.now[0]+=61;r=self.generate(self.payload(engine));self.assertEqual(r['model'],model)
  self.assertEqual(len(self.calls),4)
 def test_forged_disabled_model_is_rejected_even_when_client_bypasses_option(self):
  for model in ('gpt-6.2-sol','gpt-6-astra','gpt-image-2','unknown'):
   with self.assertRaisesRegex(E4Error,'AI_MODEL_INCOMPATIBLE'):self.save(model)
  self.assertEqual(self.view()['revision'],0);self.assertFalse(self.calls)
 def test_budget_incompatible_switch_and_provider_access_cannot_be_saved(self):
  with self.assertRaisesRegex(E4Error,'AI_MODEL_BUDGET_INCOMPATIBLE'):self.save('gpt-6-sol',per_call_usd='0.001')
  self.model_ids=['gpt-6-luna'];self.app.settings_store.catalog.cache.clear()
  with self.assertRaisesRegex(E4Error,'AI_MODEL_ACCESS_DENIED'):self.save('gpt-6-sol')
  self.assertEqual(self.view()['revision'],0);self.assertFalse(self.calls)
 def test_missing_metadata_disables_options_and_dispatch_but_still_allows_turning_off(self):
  self.mode='metadata-error';self.app.settings_store.catalog.cache.clear();data=self.view();self.assertTrue(all(not x['selectable'] for x in data['models']))
  with self.assertRaisesRegex(E4Error,'MODEL_ACCESS_UNCONFIRMED'):self.generate()
  self.save('gpt-6-luna',enabled=False);self.assertFalse(self.view()['enabled']);self.assertFalse(self.calls)
 def test_replacing_key_with_model_access_denied_keeps_original_settings(self):
  self.model_ids=['gpt-6-luna'];self.app.settings_store.catalog.cache.clear()
  with self.assertRaisesRegex(E4Error,'AI_MODEL_ACCESS_DENIED'):self.save('gpt-6-sol',key_action='REPLACE',api_key='sk-SYNTHETIC_MODELS_DENIED')
  data=self.view();self.assertEqual(data['revision'],0);self.assertEqual(data['key_mode'],'INHERIT');self.assertFalse(self.calls)
 def test_price_catalog_is_bound_to_policy_hash_and_fail_closed_on_tamper(self):
  self.assertEqual(json.loads(POLICY.read_bytes())['model_catalog_sha256'],hashlib.sha256(Path('render-backend/gateway/business_model_catalog.json').read_bytes()).hexdigest())
  original=Path.read_bytes
  def read(path):return b'{}' if path.name=='business_model_catalog.json' else original(path)
  with patch.object(Path,'read_bytes',read):app=BusinessAI({'BUSINESS_AI_ENABLED':'1','BUSINESS_AI_POLICY_SHA256':hashlib.sha256(POLICY.read_bytes()).hexdigest(),'BUSINESS_AI_GATEWAY_SECRET':self.secret},self.states[0],self.states[1],clock=lambda:self.now[0])
  self.assertFalse(app.enabled);self.assertFalse(self.calls)
if __name__=='__main__':unittest.main()
