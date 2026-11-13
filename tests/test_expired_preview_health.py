"""Local ASGI health and expiry guards; no cloud state or Provider transport."""
import base64,hashlib,hmac,json,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from fastapi.testclient import TestClient
from gateway.e4_controlled_provider import ProviderState
from gateway.e4_paired_preview import PairedApp
from gateway.e4_preview_ledger import Ledger

KEY='LOCAL_TEST_'+'X'*48
class ExpiredHealth(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'budget.sqlite'
  Ledger.initialize_local_or_operator(self.path,'LOCAL_EXPIRED_ONLY','1',time.time()-60)
  self.ledger=Ledger(self.path,'LOCAL_EXPIRED_ONLY')
 def tearDown(self):self.tmp.cleanup()
 def app(self,ledger=None,code='BUDGET_EXPIRED',service=None):
  return PairedApp('/never-connect.sock',ProviderState(ledger=ledger,code=code,status=403,service=service),KEY,mock_available=False,e2_state=ProviderState(code='BUDGET_EXPIRED',status=403))
 def test_expired_budget_can_serve_session_and_policy_errors_without_spend(self):
  before=self.ledger.snapshot()
  with TestClient(self.app(self.ledger)) as client:
   for _ in range(3):
    response=client.get('/healthz');self.assertEqual(response.status_code,200)
    data=response.json();self.assertEqual(data['live_provider'],'BUDGET_EXPIRED');self.assertFalse(data['paid_inference_approved']);self.assertEqual(data['e4_provider'],'DISABLED');self.assertTrue(response.headers['x-trace-id'].startswith('I-'))
  self.assertEqual(self.ledger.snapshot(),before)
  with self.ledger.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],0)
 def test_missing_or_unreadable_ledger_remains_unhealthy(self):
  for ledger in [None,SimpleNamespace(snapshot=lambda:(_ for _ in ()).throw(OSError('LOCAL_UNREADABLE')))]:
   with TestClient(self.app(ledger)) as client:self.assertEqual(client.get('/healthz').status_code,503)
 def test_other_provider_configuration_errors_are_not_hidden(self):
  for code in ['LIVE_RELEASE_CONFIGURATION_INVALID','PROVIDER_CREDENTIAL_REQUIRED','LIVE_PROVIDER_DISABLED']:
   with TestClient(self.app(self.ledger,code=code)) as client:self.assertEqual(client.get('/healthz').status_code,503)
 def test_warm_process_expiry_is_not_reported_as_live_provider(self):
  service=SimpleNamespace(settings=SimpleNamespace(expires=time.time()-60),simulation=False)
  with TestClient(self.app(self.ledger,code='CONTROLLED_LIVE_CONFIGURED_NOT_MODEL_PROOF',service=service)) as client:
   response=client.get('/healthz');self.assertEqual(response.status_code,200);self.assertEqual(response.json()['live_provider'],'BUDGET_EXPIRED');self.assertFalse(response.json()['paid_inference_approved'])
 def test_gateway_and_signed_session_still_required(self):
  with TestClient(self.app(self.ledger)) as client:
   for engine in ['E2','E4']:
    response=client.post('/__integration_live/ui/live/'+engine,json={'synthetic':True,'question':'你好','mode':'GENERAL_CHAT'})
    self.assertEqual(response.status_code,401);self.assertEqual(response.json()['error']['code'],'AUTHENTICATION_REQUIRED');self.assertTrue(response.headers['x-trace-id'].startswith('I-'))
   response=client.post('/__integration_live/ui/live/E4',headers={'x-preview-gateway':KEY},json={'synthetic':True,'question':'你好','mode':'GENERAL_CHAT'})
   self.assertEqual(response.status_code,401);self.assertEqual(response.json()['error']['code'],'SIGNED_SESSION_REQUIRED')
 def test_valid_session_gets_budget_expired_and_can_clear_without_dispatch(self):
  now=time.time();binding={'sid':'b'*32,'accountId':'DEMO-LEVEL1','system':'lms','actor':'level1','exp':int((now+600)*1000)}
  data=base64.urlsafe_b64encode(json.dumps(binding,separators=(',',':')).encode()).decode().rstrip('=');sig=base64.urlsafe_b64encode(hmac.new(KEY.encode(),('E4_SESSION_V2.'+data).encode(),hashlib.sha256).digest()).decode().rstrip('=')
  headers={'x-preview-gateway':KEY,'x-preview-session':data+'.'+sig,'x-demo-actor':'level1','x-preview-system':'lms'};before=self.ledger.snapshot()
  with TestClient(self.app(self.ledger)) as client:
   response=client.post('/__integration_live/ui/live/E4',headers=headers,json={'synthetic':True,'question':'你好','mode':'GENERAL_CHAT'})
   self.assertEqual(response.status_code,403);self.assertEqual(response.json()['error']['code'],'BUDGET_EXPIRED')
   response=client.post('/__integration_live/ui/live/E4',headers=headers,json={'synthetic':True,'question':'/clear','mode':'GENERAL_CHAT'})
   self.assertEqual(response.status_code,200);self.assertEqual(response.json()['data']['control'],'CONVERSATION_CLEARED');self.assertFalse(response.json()['data']['real_ai'])
  self.assertEqual(self.ledger.snapshot(),before)
  with self.ledger.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],0)
 def test_methods_paths_and_health_response_do_not_expose_credentials(self):
  with TestClient(self.app(self.ledger)) as client:
   self.assertEqual(client.get('/__integration_live/ui/live/E4').status_code,405)
   self.assertEqual(client.get('/not-an-api').status_code,404)
   self.assertNotIn(KEY,client.get('/healthz').text)
