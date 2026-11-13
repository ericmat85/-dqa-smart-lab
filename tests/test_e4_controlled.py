"""Non-paid verification only. Provider HTTP uses MockTransport; no real inference."""
import asyncio,base64,hashlib,hmac,json,os,socket,sqlite3,subprocess,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
import httpx
from gateway import e4_controlled_provider as controlled
from gateway.e4_paired_preview import PairedApp,mock_environment,install_openai_egress_guard,LIVE_PATH,MOCK_PATH
from gateway.e4_preview_provider import E4Error

REAL_PATH=Path
REAL_CLIENT=httpx.Client
REAL_ASYNC_CLIENT=httpx.AsyncClient
FAKE_KEY='FAKE_PROVIDER_TEST_ONLY_NOT_A_REAL_CREDENTIAL'
MOCK_KEY='FAKE_MOCK_GATEWAY_TEST_ONLY_1234567890'
LIVE_KEY='FAKE_LIVE_GATEWAY_TEST_ONLY_1234567890'

class ControlledTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  # Historical bootstrap cases retain the original approval and clock. Renewals
  # are existing-ledger-only and tested independently, not a new bootstrap permit.
  from gateway.budget_expiry_renewal import NEW_EXPIRY,original_policy,canonical
  from datetime import datetime
  p=json.loads(controlled.POLICY_PATH.read_bytes())
  if p['expires_at']==NEW_EXPIRY:p=original_policy(p,'E4')
  fixture=self.root/'original-e4-policy.json';fixture.write_bytes(canonical(p))
  self.policy_mapping=patch.object(controlled,'POLICY_PATH',fixture);self.policy_mapping.start()
  self.p,self.digest=controlled.load_policy();self.now=[datetime.fromisoformat('2026-11-13T00:00:00+08:00').timestamp()];self.calls=[];self.states=[]
  def mapped(value):return REAL_PATH(str(value).replace('/var/data/e4-mock',str(self.root)))
  self.mapping=patch.object(controlled,'Path',mapped);self.mapping.start()
  self.mount=patch.object(controlled.os.path,'ismount',side_effect=lambda p:REAL_PATH(p)==self.root);self.mount.start()
  self.env={'RENDER':'true','RENDER_SERVICE_ID':self.p['render_service_id'],'E4_RELEASE_POLICY_SHA256':self.digest,'LIVE_PROVIDER_ENABLED':'false','LIVE_AI_ENABLED':'false','AI_SPEND_APPROVED':'0','E4_LIVE_LEDGER_INITIALIZE':'1'}
 def tearDown(self):
  for state in self.states:state.close()
  self.mapping.stop();self.mount.stop();self.policy_mapping.stop();self.temp.cleanup()
 def load(self,changes=None):
  env={**self.env,**(changes or {})}
  state=controlled.load_provider(env,clock=lambda:self.now[0]);self.states.append(state);return state
 def bootstrap(self):
  state=self.load();path=state.ledger.path;state.close();return path
 def binding(self,actor='level1',account='DEMO-LEVEL1'):
  import uuid
  return {'sid':uuid.uuid4().hex,'accountId':account,'system':'lms','actor':actor,'exp':int((self.now[0]+900)*1000)}
 def fake_provider(self,req):
  self.calls.append((req.method,str(req.url)))
  if req.method=='GET':return httpx.Response(200,json={'id':'gpt-6-luna'})
  body=json.loads(req.content);context=json.loads(body['input']);mode='GENERAL_CHAT' if body['text']['format']['name']=='e4_general_chat' else 'DOCUMENT_QA'
  self.assertFalse(body['store']);self.assertEqual(body['service_tier'],'default');self.assertLessEqual(body['max_output_tokens'],768)
  cites=[]
  if mode=='DOCUMENT_QA':
   doc=context['documents'][0];cites=[{'document_id':doc['id'],'version':doc['version'],'quote':doc['text']}]
  result={'engine':'E4','summary':'本機 MockTransport 驗證，未執行真實模型。','issues':[],'advice':[],'citations':cites}
  return httpx.Response(200,headers={'x-request-id':'req_MOCK_CONTROLLED_TEST'},json={'id':'resp_MOCK_CONTROLLED_TEST','status':'completed','model':'gpt-6-luna','usage':{'input_tokens':80,'output_tokens':40},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result)}]}]})
 def client_factory(self,**kwargs):return REAL_CLIENT(transport=httpx.MockTransport(self.fake_provider),**kwargs)
 def test_approved_policy_and_expiry_are_exact_and_not_old_proposal(self):
  self.assertEqual(self.p['per_call_usd'],'0.05');self.assertEqual(self.p['total_usd'],'1.00');self.assertEqual(self.p['expires_at'],'2026-11-13T23:59:00+08:00');self.assertEqual(self.p['limits']['max_concurrent'],1)
 def test_missing_hash_and_wrong_context_never_construct_provider(self):
  self.assertIsNone(self.load({'E4_RELEASE_POLICY_SHA256':'wrong'}).service)
  with self.assertRaisesRegex(E4Error,'PROTECTED_RENDER_CONTEXT_REQUIRED'):self.load({'RENDER_SERVICE_ID':'OTHER_SERVICE'})
  with patch.object(controlled.os.path,'ismount',return_value=False):
   with self.assertRaisesRegex(E4Error,'VERIFIED_PERSISTENT_MOUNT_REQUIRED'):self.load()
 def test_bootstrap_initializes_only_mock_free_budget_no_inference(self):
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):state=self.load({'OPENAI_API_KEY':FAKE_KEY,'AI_SPEND_APPROVED':'1'})
  self.assertTrue(state.initialized);self.assertIsNone(state.service);self.assertEqual(state.code,'LIVE_LEDGER_BOOTSTRAP_ONLY');self.assertEqual(self.calls,[]);self.assertEqual(state.ledger.snapshot()['spent_nanos'],0)
 def test_bootstrap_tightens_owned_existing_directory_without_touching_parent(self):
  directory=self.root/'live'/self.p['approval_id'];directory.mkdir(parents=True);directory.chmod(0o755);parent_mode=directory.parent.stat().st_mode
  state=self.load();self.assertEqual(directory.stat().st_mode&0o777,0o700);self.assertEqual(directory.parent.stat().st_mode,parent_mode);self.assertEqual(state.code,'LIVE_LEDGER_BOOTSTRAP_ONLY');self.assertEqual(self.calls,[])
 def test_bootstrap_does_not_adopt_foreign_owned_directory(self):
  directory=self.root/'live'/self.p['approval_id'];directory.mkdir(parents=True);directory.chmod(0o755)
  from types import SimpleNamespace
  with patch.object(controlled.os,'fstat',return_value=SimpleNamespace(st_uid=os.getuid()+1,st_mode=directory.stat().st_mode)):
   with self.assertRaisesRegex(E4Error,'PRIVATE_LIVE_STATE_OWNER_REQUIRED'):self.load()
  self.assertEqual(directory.stat().st_mode&0o777,0o755);self.assertFalse((directory/'budget.sqlite').exists())
 def test_bootstrap_rejects_symlink_and_preserves_existing_ledger_budget(self):
  directory=self.root/'live'/self.p['approval_id'];directory.parent.mkdir();target=self.root/'OTHER';target.mkdir();directory.symlink_to(target)
  with self.assertRaisesRegex(E4Error,'LIVE_STATE_SYMLINK_DENIED'):self.load()
  directory.unlink();db=self.bootstrap();before=db.read_bytes();directory.chmod(0o755);state=self.load()
  self.assertFalse(state.initialized);self.assertEqual(db.read_bytes(),before);self.assertEqual(state.ledger.snapshot()['cap_nanos'],1000000000);self.assertEqual(directory.stat().st_mode&0o777,0o700)
 def test_normal_start_never_silently_repairs_directory_permissions(self):
  db=self.bootstrap();db.parent.chmod(0o755)
  with self.assertRaisesRegex(E4Error,'PRIVATE_LIVE_STATE_REQUIRED'):self.load({'E4_LIVE_LEDGER_INITIALIZE':'0'})
  self.assertEqual(db.parent.stat().st_mode&0o777,0o755)
 def test_normal_reopen_nonpaid_model_metadata_then_mock_transport_service(self):
  db=self.bootstrap()
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY})
  self.assertFalse(state.initialized);self.assertEqual(state.ledger.path,db);self.assertEqual(self.calls,[('GET','https://api.openai.com/v1/models/gpt-6-luna')]);self.assertTrue(state.service.simulation);self.assertEqual(state.ledger.snapshot()['cap_nanos'],1000000000)
 def test_unapproved_or_missing_key_is_disabled_after_ledger_reopen(self):
  self.bootstrap()
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):
   state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','OPENAI_API_KEY':FAKE_KEY});self.assertIsNone(state.service);state.close()
   state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1'});self.assertEqual(state.code,'PROVIDER_CREDENTIAL_REQUIRED')
  self.assertEqual(self.calls,[])
 def test_owner_lock_prevents_second_runtime_and_false_topology_proof(self):
  state=self.load()
  with self.assertRaisesRegex(E4Error,'SINGLE_LIVE_INSTANCE_ONLY'):self.load()
  with self.assertRaisesRegex(E4Error,'VERIFIED_SINGLE_INSTANCE_TOPOLOGY_REQUIRED'):controlled.SingleInstanceLiveLedger(state.ledger.path,state.ledger.identity,state.owner,None)
 def test_missing_or_reconfigured_database_is_not_reset(self):
  db=self.bootstrap();before=db.read_bytes();modified={**self.p,'total_usd':'0.99'}
  with patch.object(controlled,'load_policy',return_value=(modified,self.digest)):
   with self.assertRaisesRegex(ValueError,'LEDGER_IDENTITY_MISMATCH'):self.load({'E4_LIVE_LEDGER_INITIALIZE':'0'})
  self.assertEqual(db.read_bytes(),before);db.unlink()
  with self.assertRaisesRegex(E4Error,'EXPLICIT_LIVE_LEDGER_INITIALIZATION_REQUIRED'):self.load({'E4_LIVE_LEDGER_INITIALIZE':'0'})
  self.assertFalse(db.exists())
 def test_expired_release_does_not_initialize_or_call_metadata(self):
  from datetime import datetime
  self.now[0]=datetime.fromisoformat(self.p['expires_at']).timestamp()+1
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):state=self.load({'AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY})
  self.assertIsNone(state.service);self.assertIsNone(state.ledger);self.assertEqual(state.code,'BUDGET_EXPIRED');self.assertEqual(self.calls,[])
 def test_expired_existing_ledger_can_still_revoke_sessions_without_provider(self):
  from datetime import datetime
  self.bootstrap();self.now[0]=datetime.fromisoformat(self.p['expires_at']).timestamp()+1;state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY});self.assertIsNone(state.service);self.assertIsNotNone(state.ledger);b=self.binding();state.ledger.control(b,self.now[0],'logout')
  with self.assertRaisesRegex(ValueError,'SESSION_REVOKED'):state.ledger.bind_session(b,self.now[0])
  self.assertEqual(self.calls,[])
 def test_unknown_cost_survives_reopen_and_blocks_every_new_paid_operation(self):
  state=self.load();ledger=state.ledger;b=self.binding();gen=ledger.bind_session(b,self.now[0]);ledger.reserve('I-unknown','subject','.05',self.now[0],2,'fingerprint',binding=b,generation=gen);ledger.authorize_dispatch('I-unknown',b,gen,self.now[0]);ledger.unknown('I-unknown','TEST_UNKNOWN',self.now[0]);ledger.transport_done('I-unknown');db=ledger.path;state.close();again=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0'})
  self.assertEqual(again.ledger.snapshot()['held_nanos'],50000000)
  with self.assertRaisesRegex(ValueError,'OUTCOME_RECONCILIATION_REQUIRED'):again.ledger.reserve('I-next','subject','.05',self.now[0],2)
  code="import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute('SELECT held FROM budget').fetchone()[0])"
  out=subprocess.check_output([sys.executable,'-B','-c',code,str(db)],env={'PATH':os.environ['PATH']},text=True);self.assertEqual(out.strip(),'50000000')
 def test_deadline_crossed_between_reserve_and_dispatch_is_not_sent(self):
  from datetime import datetime
  self.now[0]=datetime.fromisoformat(self.p['expires_at']).timestamp()-.5;state=self.load();l=state.ledger;b=self.binding();g=l.bind_session(b,self.now[0]);l.reserve('I-boundary','subject','.05',self.now[0],2,binding=b,generation=g)
  with self.assertRaisesRegex(ValueError,'BUDGET_EXPIRED'):l.authorize_dispatch('I-boundary',b,g,self.now[0]+.5)
  self.assertEqual(l.attempt('I-boundary')['state'],'REJECTED_NOT_SENT');self.assertEqual(l.snapshot()['held_nanos'],0);self.assertEqual(l.snapshot()['spent_nanos'],0)
 def test_atomic_global_concurrency_and_budget(self):
  state=self.load();l=state.ledger;barrier=threading.Barrier(2);out=[]
  def run(number):
   try:barrier.wait();l.reserve('I-concurrent'+str(number),'subject','.05',self.now[0],2);out.append('GRANTED')
   except ValueError as e:out.append(str(e))
  threads=[threading.Thread(target=run,args=(i,)) for i in range(2)]
  for t in threads:t.start()
  for t in threads:t.join()
  self.assertEqual(sorted(out),['GRANTED','SERVICE_BUSY']);self.assertEqual(l.snapshot()['held_nanos'],50000000)
 def test_both_chat_modes_are_mock_only_in_offline_adapter_test(self):
  self.bootstrap()
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY})
  b=self.binding();a=state.service.analyze(b,'你好','I-general','GENERAL_CHAT');self.assertFalse(a['real_ai']);self.assertEqual(a['execution_mode'],'MOCK');self.now[0]+=61
  b['exp']=int((self.now[0]+900)*1000);b['sid']='b'*32
  d=state.service.analyze(b,'合成條件','I-document','DOCUMENT_QA');self.assertTrue(d['result']['citations']);self.assertFalse(d['real_ai']);self.assertEqual(len([x for x in self.calls if x[0]=='POST']),2)
 def test_model_metadata_rejection_never_posts_provider_request(self):
  self.bootstrap()
  def factory(**kwargs):return REAL_CLIENT(transport=httpx.MockTransport(lambda req:httpx.Response(403,json={})),**kwargs)
  with patch.object(controlled.httpx,'Client',side_effect=factory):
   with self.assertRaisesRegex(E4Error,'MODEL_METADATA_ACCESS_NOT_VERIFIED'):self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY})
 def test_provider_failure_holds_reservation_and_never_retries_or_falls_back(self):
  self.bootstrap()
  with patch.object(controlled.httpx,'Client',side_effect=self.client_factory):state=self.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY})
  requests=[]
  def denied(req):requests.append(req);return httpx.Response(429,json={'error':{'message':'TEST_ONLY'}})
  state.service.client._transport.handler=denied;b=self.binding()
  with self.assertRaisesRegex(E4Error,'PROVIDER_RATE_LIMIT'):state.service.analyze(b,'你好','I-denied','GENERAL_CHAT')
  self.now[0]+=61
  with self.assertRaisesRegex(E4Error,'OUTCOME_RECONCILIATION_REQUIRED'):state.service.analyze(b,'再試一次','I-blocked','GENERAL_CHAT')
  self.assertEqual(len(requests),1);self.assertEqual(state.ledger.snapshot()['held_nanos'],50000000);self.assertEqual(state.ledger.snapshot()['spent_nanos'],0)
 def test_expired_health_does_not_claim_paid_inference_is_active(self):
  from types import SimpleNamespace
  fake=SimpleNamespace(settings=SimpleNamespace(expires=time.time()-1),simulation=False,ledger=None)
  app=PairedApp('/tmp/NONE',controlled.ProviderState(service=fake),LIVE_KEY,mock_available=False)
  async def run():
   async with REAL_ASYNC_CLIENT(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
    r=await client.get('/healthz');self.assertEqual(r.status_code,503);self.assertFalse(r.json()['paid_inference_approved']);self.assertEqual(r.json()['live_provider'],'BUDGET_EXPIRED')
  asyncio.run(run())
 def test_mock_environment_never_inherits_provider_or_live_credentials(self):
  env={'PATH':'/bin','PREVIEW_GATEWAY_SECRET':MOCK_KEY,'OPENAI_API_KEY':FAKE_KEY,'E4_LIVE_GATEWAY_SECRET':LIVE_KEY,'AI_SPEND_APPROVED':'1','LIVE_PROVIDER_ENABLED':'true','RENDER_API_KEY':'FAKE_ADMIN','PGPASSWORD':'FAKE_DB'};child=mock_environment(env)
  self.assertEqual(child['PREVIEW_GATEWAY_SECRET'],MOCK_KEY);self.assertEqual(child['AI_SPEND_APPROVED'],'0');self.assertEqual(child['LIVE_PROVIDER_ENABLED'],'false');self.assertFalse(any(k in child for k in ['OPENAI_API_KEY','E4_LIVE_GATEWAY_SECRET','RENDER_API_KEY','PGPASSWORD']))
 def test_parent_egress_allows_only_resolved_openai_tls_and_unix_ipc(self):
  original=(socket.getaddrinfo,socket.socket.connect,socket.socket.connect_ex)
  def resolve(host,port,*args,**kwargs):return [(socket.AF_INET,socket.SOCK_STREAM,6,'',('203.0.113.5' if host=='api.openai.com' else '203.0.113.6',port))]
  try:
   socket.getaddrinfo=resolve;socket.socket.connect=lambda s,a:None;socket.socket.connect_ex=lambda s,a:0;install_openai_egress_guard()
   with socket.socket() as s:
    with self.assertRaisesRegex(OSError,'LIVE_EGRESS_DENIED'):s.connect(('203.0.113.5',443))
    socket.getaddrinfo('api.openai.com',443);s.connect(('203.0.113.5',443))
    with self.assertRaisesRegex(OSError,'LIVE_EGRESS_DENIED'):s.connect(('203.0.113.5',80))
    socket.getaddrinfo('other.invalid',443)
    with self.assertRaisesRegex(OSError,'LIVE_EGRESS_DENIED'):s.connect(('203.0.113.6',443))
   with socket.socket(socket.AF_UNIX) as s:s.connect('/tmp/FAKE_SOCKET')
  finally:socket.getaddrinfo,socket.socket.connect,socket.socket.connect_ex=original
 def test_paired_routes_keep_gateway_separation_and_no_generic_forward(self):
  state=controlled.ProviderState();app=PairedApp('/tmp/not-real.sock',state,LIVE_KEY,mock_available=False)
  async def run():
   async with REAL_ASYNC_CLIENT(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
    self.assertEqual((await c.post('/https://arbitrary.invalid')).status_code,404)
    self.assertEqual((await c.get(LIVE_PATH)).status_code,405)
    self.assertEqual((await c.post(LIVE_PATH,json={'synthetic':True,'question':'你好'},headers={'x-preview-gateway':MOCK_KEY})).status_code,401)
    r=await c.post(MOCK_PATH,json={'synthetic':True,'question':'你好'},headers={'x-preview-gateway':MOCK_KEY});self.assertEqual(r.status_code,503);self.assertNotIn(LIVE_KEY,r.text)
  asyncio.run(run())
 def test_mock_bridge_is_fixed_unix_transport_and_filters_credentials(self):
  seen=[]
  def handler(req):seen.append(req);return httpx.Response(200,json={'trace_id':'I-mock-child','data':{'execution_mode':'MOCK','real_ai':False}})
  def async_factory(**kwargs):return REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler),base_url='http://mock.internal')
  app=PairedApp('/tmp/FAKE_PRIVATE_UDS',controlled.ProviderState(),LIVE_KEY)
  async def run():
   client=REAL_ASYNC_CLIENT(transport=httpx.ASGITransport(app=app),base_url='http://test')
   async with client:
    with patch('gateway.e4_paired_preview.httpx.AsyncClient',side_effect=async_factory):r=await client.post(MOCK_PATH,json={'synthetic':True,'question':'你好'},headers={'x-preview-gateway':MOCK_KEY,'Authorization':'DO_NOT_FORWARD','Cookie':'DO_NOT_FORWARD'})
   self.assertEqual(r.status_code,200);self.assertEqual(r.headers['x-trace-id'],'I-mock-child');self.assertEqual(str(seen[0].url),'http://mock.internal'+MOCK_PATH);self.assertNotIn('authorization',seen[0].headers);self.assertNotIn('cookie',seen[0].headers);self.assertEqual(seen[0].headers['x-preview-gateway'],MOCK_KEY)
  asyncio.run(run())
 def test_mock_bridge_disconnect_cancels_upstream_worker_request(self):
  cancelled=[]
  class SlowClient:
   async def __aenter__(self):return self
   async def __aexit__(self,*args):pass
   async def post(self,*args,**kwargs):
    try:await asyncio.Future()
    except asyncio.CancelledError:cancelled.append(True);raise
  app=PairedApp('/tmp/FAKE_PRIVATE_UDS',controlled.ProviderState(),LIVE_KEY)
  async def run():
   incoming=asyncio.Queue();await incoming.put({'type':'http.request','body':b'{}','more_body':False})
   async def disconnect():await asyncio.sleep(.02);await incoming.put({'type':'http.disconnect'})
   async def send(message):self.fail('Disconnected client must not receive a success packet')
   task=asyncio.create_task(disconnect())
   scope={'type':'http','path':MOCK_PATH,'method':'POST','headers':[]}
   with patch('gateway.e4_paired_preview.httpx.AsyncClient',return_value=SlowClient()):await app(scope,incoming.get,send)
   await task
  asyncio.run(run());self.assertEqual(cancelled,[True])
 def test_actual_mock_worker_runs_over_private_unix_socket_without_provider_key(self):
  from gateway.e4_mock_preview import MockRuntime
  self.now[0]=time.time()  # The separate Mock worker verifies the real wall clock.
  state_dir=self.root/'mock';runtime=MockRuntime(state_dir,MOCK_KEY,{},initialize=True);runtime.close();uds=self.root/'worker.sock'
  env={'PATH':os.environ['PATH'],'PYTHONPATH':str(Path(__file__).parents[1]/'render-backend'),'PYTHONDONTWRITEBYTECODE':'1','PREVIEW_GATEWAY_SECRET':MOCK_KEY,'AI_SPEND_APPROVED':'0','LIVE_PROVIDER_ENABLED':'false','LIVE_AI_ENABLED':'false'}
  process=subprocess.Popen([sys.executable,'-B','-m','gateway.e4_paired_preview','--mock-worker','--uds',str(uds),'--mock-state-dir',str(state_dir)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:
   for _ in range(100):
    if uds.exists():break
    if process.poll() is not None:self.fail('Mock worker failed to start')
    time.sleep(.02)
   with REAL_CLIENT(transport=httpx.HTTPTransport(uds=str(uds)),base_url='http://worker.internal') as client:
    r=client.get('/healthz');self.assertEqual(r.status_code,200);self.assertEqual(r.json()['e4_provider'],'MOCK_HTTP_ONLY')
   b=self.binding();data=base64.urlsafe_b64encode(json.dumps(b,separators=(',',':')).encode()).decode().rstrip('=');signature=base64.urlsafe_b64encode(hmac.new(MOCK_KEY.encode(),('E4_SESSION_V2.'+data).encode(),hashlib.sha256).digest()).decode().rstrip('=');headers={'x-preview-gateway':MOCK_KEY,'x-preview-session':data+'.'+signature,'x-demo-actor':'level1','x-preview-system':'lms'}
   app=PairedApp(str(uds),controlled.ProviderState(),LIVE_KEY,mock_process=process)
   async def bridge():
    async with REAL_ASYNC_CLIENT(transport=httpx.ASGITransport(app=app),base_url='http://parent.internal') as client:
     r=await client.post(MOCK_PATH,json={'synthetic':True,'question':'你好','mode':'GENERAL_CHAT'},headers=headers);self.assertEqual(r.status_code,200);self.assertFalse(r.json()['data']['real_ai']);self.assertEqual(r.json()['data']['execution_mode'],'MOCK')
   asyncio.run(bridge())
  finally:process.terminate();process.wait(timeout=5)

if __name__=='__main__':unittest.main(verbosity=2)
