"""Mock-only configuration and runtime enforcement. No paid provider calls."""
import sys,json,uuid,threading,unittest
from pathlib import Path
from unittest.mock import patch
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).parent))
import test_business_ai as fixture
from gateway.e4_preview_provider import E4Error
from gateway.business_ai import BusinessAI

class ConfigurationTests(unittest.TestCase):
 setUp=fixture.Tests.setUp
 tearDown=fixture.Tests.tearDown
 payload=fixture.Tests.payload
 provider=fixture.Tests.provider
 generate=fixture.Tests.generate
 workspace='c'*64
 actor='d'*64
 def body(self,**changes):
  b={'operation_id':str(uuid.uuid4()),'expected_revision':0,'enabled':True,'model':'gpt-6-luna','per_call_usd':'0.05','total_cap_usd':'1','max_output_tokens':768,'key_action':'KEEP'};b.update(changes);return b
 def config(self,engine='E4',workspace=None):return self.app.settings_store.public(self.app.states[engine],workspace or self.workspace,engine)
 def save(self,body=None,engine='E4',workspace=None):return self.app.settings_store.save(self.app.states[engine],workspace or self.workspace,engine,self.actor,body or self.body())
 def generate_configured(self,engine='E4'):return self.generate(self.payload(engine,workspace=self.workspace))
 def test_default_status_reads_existing_mask_without_key_or_call(self):
  for e in ['E1','E2','E3','E4']:
   c=self.config(e);self.assertTrue(c['enabled']);self.assertEqual(c['key_mode'],'INHERIT');self.assertTrue(c['key_configured']);self.assertEqual(c['revision'],0);self.assertNotIn(self.key,json.dumps(c));self.assertTrue(c['key_mask'].endswith(self.key[-4:]))
  self.assertFalse(self.calls)
 def test_settings_persist_across_instances_and_do_not_refill_ledger(self):
  self.generate_configured();before=self.states[0].ledger.snapshot()
  self.save(self.body(enabled=False,total_cap_usd='0.1'))
  restarted=BusinessAI({'BUSINESS_AI_ENABLED':'1','BUSINESS_AI_GATEWAY_SECRET':self.secret},self.states[0],self.states[1],clock=lambda:self.now[0])
  row=restarted.settings_store.public(self.states[0],self.workspace,'E4');self.assertFalse(row['enabled']);self.assertEqual(row['revision'],1);self.assertEqual(self.states[0].ledger.snapshot(),before)
 def test_disable_all_four_independently_prevents_dispatch_and_survives_readback(self):
  for e in ['E1','E2','E3','E4']:
   self.save(self.body(enabled=False),e)
   with self.assertRaisesRegex(E4Error,'AI_ENGINE_DISABLED'):self.generate_configured(e)
  self.assertFalse(self.calls)
 def test_disabled_engine_and_key_override_do_not_affect_other_workspace_or_engine(self):
  self.save(self.body(enabled=False),'E1');self.generate_configured('E3');self.now[0]+=61
  self.generate(self.payload('E1',workspace='e'*64));self.assertEqual(len(self.calls),2)
 def test_credential_encrypted_and_used_only_by_target_engine_then_removed_and_inherited(self):
  key='sk-SYNTHETIC_REPLACEMENT_KEY_DO_NOT_USE'
  self.save(self.body(key_action='REPLACE',api_key=key),'E1');c=self.config('E1');self.assertEqual(c['key_mode'],'OVERRIDE');self.assertNotIn(key,json.dumps(c));self.assertNotIn(key.encode(),self.states[0].ledger.path.read_bytes())
  self.generate_configured('E1');self.assertEqual(self.calls[-1].headers['authorization'],'Bearer '+key)
  self.now[0]+=61;self.generate_configured('E3');self.assertEqual(self.calls[-1].headers['authorization'],'Bearer '+self.key)
  self.save(self.body(expected_revision=1,key_action='REMOVE'),'E1');self.assertFalse(self.config('E1')['key_configured'])
  with self.assertRaisesRegex(E4Error,'PROVIDER_CREDENTIAL_REQUIRED'):self.generate_configured('E1')
  self.save(self.body(expected_revision=2,key_action='INHERIT'),'E1');self.now[0]+=61;self.generate_configured('E1');self.assertEqual(self.calls[-1].headers['authorization'],'Bearer '+self.key)
 def test_revision_and_operation_replay_protect_concurrent_edits(self):
  b=self.body(enabled=False);r=self.save(b);self.assertEqual(self.save(b)['revision'],r['revision']);self.assertTrue(self.save(b)['replayed']);self.assertEqual(self.config()['revision'],1)
  with self.assertRaisesRegex(E4Error,'AI_SETTINGS_REVISION_CONFLICT'):self.save()
  with self.assertRaisesRegex(E4Error,'AI_SETTINGS_OPERATION_CONFLICT'):self.save({**b,'enabled':True})
  with self.assertRaisesRegex(E4Error,'AI_SETTINGS_OPERATION_CONFLICT'):self.save(b,'E1')
 def test_cross_workspace_read_isolation_and_no_secrets_in_audit(self):
  self.save(self.body(key_action='REPLACE',api_key='sk-SYNTHETIC_SECRET_REPLACEMENT'))
  self.assertEqual(self.config(workspace='e'*64)['revision'],0)
  with self.states[0].ledger.connect() as c:rows=c.execute('SELECT * FROM business_ai_settings_audit').fetchall()
  self.assertNotIn('sk-SYNTHETIC_SECRET_REPLACEMENT',json.dumps(rows));self.assertNotIn('api_key',json.dumps(rows))
 def test_invalid_and_escalated_settings_are_rejected_without_any_mutation(self):
  cases=[{'enabled':1},{'model':'arbitrary-unpriced'},{'per_call_usd':'NaN'},{'per_call_usd':'0.051'},{'total_cap_usd':'1.01'},{'total_cap_usd':'-1'},{'total_cap_usd':'0.01'},{'max_output_tokens':769},{'max_output_tokens':True},{'key_action':'REPLACE','api_key':'bad key'},{'key_action':'KEEP','api_key':'unexpected-key'},{'endpoint':'https://evil.invalid'},{'workspace':'e'*64}]
  for extra in cases:
   with self.subTest(extra=extra):
    with self.assertRaisesRegex(E4Error,'AI_SETTINGS_FIELDS_INVALID|AI_MODEL_INCOMPATIBLE'):self.save(self.body(**extra))
  self.assertEqual(self.config()['revision'],0);self.assertFalse(self.calls)
 def test_output_token_and_per_call_limits_enforced_on_actual_request(self):
  self.save(self.body(max_output_tokens=64,per_call_usd='0.04'));self.generate_configured();request=json.loads(self.calls[-1].content);self.assertEqual(request['max_output_tokens'],64)
  self.save(self.body(expected_revision=1,per_call_usd='0.000001'))
  with self.assertRaisesRegex(E4Error,'PER_CALL_BUDGET_LIMIT'):self.generate_configured()
  self.assertEqual(len(self.calls),1)
 def test_zero_cap_prevents_provider_dispatch_and_no_new_reservation(self):
  self.save(self.body(total_cap_usd='0'));before=self.states[0].ledger.snapshot()
  with self.assertRaisesRegex(E4Error,'AI_ENGINE_BUDGET_LIMIT'):self.generate_configured()
  self.assertFalse(self.calls);self.assertEqual(self.states[0].ledger.snapshot(),before)
 def test_ceiling_counts_existing_spent_and_held_shared_with_other_engines(self):
  self.save(self.body(total_cap_usd='0.05'),'E1')
  with self.states[0].ledger.connect() as c:c.execute('UPDATE budget SET spent=1')
  with self.assertRaisesRegex(E4Error,'AI_ENGINE_BUDGET_LIMIT'):self.generate_configured('E1')
  self.assertFalse(self.calls)
 def test_change_between_reservation_and_dispatch_releases_hold_without_call(self):
  original=self.states[0].ledger.authorize_dispatch
  def changed(*args,**kw):
   self.save(self.body(enabled=False));return original(*args,**kw)
  with patch.object(self.states[0].ledger,'authorize_dispatch',side_effect=changed):
   with self.assertRaisesRegex(E4Error,'AI_SETTINGS_CHANGED'):self.generate_configured()
  self.assertFalse(self.calls);self.assertEqual(self.states[0].ledger.snapshot()['held_nanos'],0)
 def test_cap_save_during_inflight_does_not_cancel_accounting_or_reset_spend(self):
  self.mode='timeout';errors=[]
  def call():
   try:self.generate_configured()
   except E4Error as e:errors.append(e.code)
  thread=threading.Thread(target=call);thread.start()
  import time
  for _ in range(100):
   if self.calls:break
   time.sleep(.002)
  self.save(self.body(total_cap_usd='0'));thread.join();time.sleep(.25)
  self.assertEqual(errors,['PROVIDER_DEADLINE_OUTCOME_UNKNOWN']);self.assertEqual(self.states[0].ledger.snapshot()['held_nanos'],50000000)
  with self.assertRaises(E4Error):self.generate_configured()
  self.assertEqual(len(self.calls),1)

 def test_missing_workspace_cannot_bypass_saved_engine_controls(self):
  self.save(self.body(enabled=False));p=self.payload();p.pop('workspace')
  with self.assertRaisesRegex(E4Error,'AI_FIELDS_INVALID'):self.generate(p)
  self.assertFalse(self.calls)
 def test_storage_failure_keeps_health_available_and_fails_closed_before_provider(self):
  with patch('gateway.business_ai.AISettings.initialize',side_effect=OSError('synthetic inaccessible disk')):
   app=BusinessAI({'BUSINESS_AI_ENABLED':'1','BUSINESS_AI_POLICY_SHA256':__import__('hashlib').sha256(__import__('gateway.business_ai',fromlist=['POLICY']).POLICY.read_bytes()).hexdigest(),'BUSINESS_AI_GATEWAY_SECRET':self.secret},self.states[0],self.states[1],clock=lambda:self.now[0])
  self.assertFalse(app.health(self.workspace)['engines']['E4']['ready'])
  with self.assertRaisesRegex(E4Error,'AI_SETTINGS_UNAVAILABLE'):app.generate(self.payload(workspace=self.workspace),'I-synthetic')
  self.assertFalse(self.calls)
 def test_signed_settings_endpoint_never_exposes_key_and_denies_unsigned_or_tampered_body(self):
  import asyncio,httpx,hashlib,hmac
  async def run():
   async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://synthetic.invalid') as client:
    path='/__business_ai/settings';p={'workspace':self.workspace,'engine':'E1','actor':self.actor,'action':'READ'};raw=json.dumps(p).encode()
    def headers(body):
     at=str(int(self.now[0]*1000));sig=hmac.new(self.secret.encode(),b'BUSINESS_AI_V1.POST.'+path.encode()+b'.'+at.encode()+b'.'+body,hashlib.sha256).hexdigest();return {'x-business-ai-at':at,'x-business-ai-signature':sig}
    denied=await client.post(path,content=raw);self.assertEqual(denied.status_code,401)
    tampered=await client.post(path,content=raw+b' ',headers=headers(raw));self.assertEqual(tampered.status_code,401)
    read=await client.post(path,content=raw,headers=headers(raw));self.assertEqual(read.status_code,200);self.assertNotIn(self.key,read.text)
    save={**p,'action':'SAVE','body':self.body(enabled=False)};raw=json.dumps(save).encode();saved=await client.post(path,content=raw,headers=headers(raw));self.assertEqual(saved.status_code,200);self.assertTrue(saved.json()['data']['saved']);self.assertFalse(self.config('E1')['enabled']);self.assertFalse(self.calls)
  asyncio.run(run())

if __name__=='__main__':unittest.main()
