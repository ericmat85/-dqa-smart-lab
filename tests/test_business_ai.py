"""All provider transports are mocked. No network, secrets or paid inference."""
import sys,json,hashlib,hmac,time,uuid,tempfile,threading,unittest
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
import httpx
from gateway.business_ai import BusinessAI,POLICY
from gateway.e4_preview_provider import E4Service,Settings,E4Error
from gateway.e4_preview_ledger import Ledger
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.now=[1795449600.0];self.calls=[];self.mode='ok';self.key='FAKE_TEST_CREDENTIAL_NOT_REAL';self.services=[];self.states=[]
  for group in ['E4','E2']:
   cfg=Settings('gpt-6-luna',Decimal('.10'),Decimal('.50'),Decimal('.05'),Decimal('1'),1809187140.0,group,max_output=768,max_input=16384 if group=='E2' else 8192,request_timeout=.15)
   p=Path(self.tmp.name)/(group+'.sqlite');Ledger.initialize_local_or_operator(p,cfg.identity(),cfg.total_cap,cfg.expires);ledger=Ledger(p,cfg.identity());ledger.require_unknown_reconciliation=True
   service=E4Service(cfg,ledger,lambda:self.key,client=httpx.Client(transport=httpx.MockTransport(self.provider)),clock=lambda:self.now[0]);self.services.append(service);self.states.append(SimpleNamespace(service=service,ledger=ledger,code='TEST_TRANSPORT'))
  self.secret='FAKE_BUSINESS_GATEWAY_TEST_ONLY_'+'a'*32
  self.app=BusinessAI({'BUSINESS_AI_ENABLED':'1','BUSINESS_AI_POLICY_SHA256':hashlib.sha256(POLICY.read_bytes()).hexdigest(),'BUSINESS_AI_GATEWAY_SECRET':self.secret},self.states[0],self.states[1],clock=lambda:self.now[0])
 def tearDown(self):
  for x in self.services:x.executor.shutdown(wait=True);x.client.close()
  self.tmp.cleanup()
 def payload(self,engine='E4',**kw):
  p={'engine':engine,'operation_id':str(uuid.uuid4()),'subject':'a'*64,'session_nonce':'b'*64,'language':'zh-TW','question':'實驗室設備與試驗資料','context':{'references':['SUMMARY'],'records':[],'candidates':[{'id':'C1'}]}};p.update(kw);return p
 def provider(self,req):
  self.calls.append(req);body=json.loads(req.content);e=body['text']['format']['schema']['properties']['engine']['enum'][0];self.assertEqual(str(req.url),E4Service.ENDPOINT);self.assertFalse(body['store']);self.assertIn('untrusted',body['instructions']);self.assertNotIn('tools',body)
  if self.mode=='timeout':time.sleep(.22)
  if self.mode=='auth':return httpx.Response(401)
  result={'engine':e,'summary':'合成傳輸測試，未呼叫真實模型。','findings':[],'sections':[{'title':'合成報告','text':'尚無量測資料。'}] if e=='E3' else [],'selected_candidate_id':'C1' if e=='E2' else '', 'references':['SUMMARY']}
  if self.mode=='invented_ref':result['references']=['secret:foreign']
  if self.mode=='invented_candidate':result['selected_candidate_id']='FORGED'
  if self.mode=='write_claim':result['summary']='我已刪除所有資料'
  return httpx.Response(200,headers={'x-request-id':'req_MOCK_TEST'},json={'id':'resp_MOCK_TEST','model':'gpt-6-luna','status':'incomplete' if self.mode=='incomplete' else 'completed','usage':{'input_tokens':80,'output_tokens':40},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result)}]}]})
 def generate(self,p=None):return self.app.generate(p or self.payload(),'I-'+'a'*32)
 def test_all_four_routes_are_explicitly_mock_in_transport_tests(self):
  for e in ['E1','E2','E3','E4']:
   self.now[0]+=61;r=self.generate(self.payload(e));self.assertEqual(r['engine'],e);self.assertFalse(r['real_ai']);self.assertEqual(r['execution_mode'],'MOCK');self.assertGreater(Decimal(r['estimated_cost_usd']),0)
  self.assertEqual(len(self.calls),4)
 def test_e1_e3_e4_share_existing_ledger_e2_is_separate(self):
  for e in ['E1','E3']:self.now[0]+=61;self.generate(self.payload(e))
  before=self.states[0].ledger.snapshot()['spent_nanos'];self.generate(self.payload('E2'));self.assertGreater(before,0);self.assertEqual(self.states[0].ledger.snapshot()['spent_nanos'],before);self.assertGreater(self.states[1].ledger.snapshot()['spent_nanos'],0)
 def test_language_uses_interface_setting(self):
  for language,text in [('en','Respond in English.'),('zh-TW','繁體中文')]:
   self.generate(self.payload(language=language));self.assertIn(text,json.loads(self.calls[-1].content)['instructions'])
 def test_missing_authentication_rejected(self):
  with self.assertRaisesRegex(E4Error,'AI_GATEWAY_AUTH_REQUIRED'):self.app.authenticate('POST','/__business_ai/generate',{},b'{}')
  self.assertFalse(self.calls)
 def test_body_and_route_bound_signature(self):
  at=str(int(self.now[0]*1000));path='/__business_ai/generate';raw=b'{}';sig=hmac.new(self.secret.encode(),b'BUSINESS_AI_V1.POST.'+path.encode()+b'.'+at.encode()+b'.'+raw,hashlib.sha256).hexdigest();h={'x-business-ai-at':at,'x-business-ai-signature':sig};self.app.authenticate('POST',path,h,raw)
  for body,route in [(b'{"forged":true}',path),(raw,'/__business_ai/result')]:
   with self.assertRaises(E4Error):self.app.authenticate('POST',route,h,body)
  self.now[0]+=61
  with self.assertRaises(E4Error):self.app.authenticate('POST',path,h,raw)
 def test_health_does_not_call_provider(self):self.app.health();self.assertFalse(self.calls)
 def test_lookup_never_calls_provider_and_is_actor_bound(self):
  p=self.payload();self.generate(p);n=len(self.calls);r=self.app.lookup({k:p[k] for k in ['engine','operation_id','subject']});self.assertEqual(r['state'],'SUCCEEDED');self.assertEqual(len(self.calls),n);self.assertEqual(self.app.lookup({'engine':p['engine'],'operation_id':p['operation_id'],'subject':'c'*64})['state'],'NOT_FOUND')
 def test_same_operation_never_dispatched_twice(self):
  p=self.payload();self.generate(p)
  with self.assertRaises(E4Error):self.generate(p)
  self.assertEqual(len(self.calls),1)
 def test_budget_limit_does_not_invoke_provider(self):
  with self.states[0].ledger.connect() as c:c.execute('UPDATE budget SET spent=999000000')
  with self.assertRaisesRegex(E4Error,'TOTAL_BUDGET_LIMIT'):self.generate()
  self.assertFalse(self.calls)
 def test_rate_limit_shared_across_engines(self):
  self.generate(self.payload('E1'));self.generate(self.payload('E3'))
  with self.assertRaisesRegex(E4Error,'RATE_LIMIT'):self.generate()
  self.assertEqual(len(self.calls),2)
 def test_oversized_input_not_sent(self):
  with self.assertRaisesRegex(E4Error,'INPUT_TOKEN_LIMIT'):self.generate(self.payload(context={'records':['x'*20000]}))
  self.assertFalse(self.calls)
 def test_expired_budget_not_sent(self):
  self.now[0]=1809187141
  with self.assertRaisesRegex(E4Error,'BUDGET_EXPIRED'):self.generate()
  self.assertFalse(self.calls)
 def test_known_usage_invalid_output_settles_cost_and_rejects(self):
  for mode in ['invented_ref','incomplete','write_claim']:
   self.now[0]+=61;self.mode=mode
   with self.assertRaisesRegex(E4Error,'AI_OUTPUT_REJECTED'):self.generate()
  snap=self.states[0].ledger.snapshot();self.assertEqual(snap['held_nanos'],0);self.assertGreater(snap['spent_nanos'],0)
 def test_lookup_accounted_rejection_is_known_failure(self):
  self.mode='incomplete';p=self.payload()
  with self.assertRaisesRegex(E4Error,'AI_OUTPUT_REJECTED'):self.generate(p)
  self.assertEqual(self.app.lookup({k:p[k] for k in ['engine','operation_id','subject']})['state'],'FAILED');self.assertEqual(len(self.calls),1)
 def test_e2_cannot_invent_candidate(self):
  self.mode='invented_candidate'
  with self.assertRaisesRegex(E4Error,'AI_OUTPUT_REJECTED'):self.generate(self.payload('E2'))
  self.assertEqual(self.states[1].ledger.snapshot()['held_nanos'],0)
 def test_timeout_holds_reservation_and_never_retries(self):
  self.mode='timeout'
  with self.assertRaisesRegex(E4Error,'PROVIDER_DEADLINE_OUTCOME_UNKNOWN'):self.generate()
  time.sleep(.25);self.assertEqual(len(self.calls),1);self.assertEqual(self.states[0].ledger.snapshot()['held_nanos'],50000000)
  with self.assertRaisesRegex(E4Error,'OUTCOME_RECONCILIATION_REQUIRED'):self.generate()
 def test_provider_http_auth_failure_keeps_unknown_without_retry(self):
  self.mode='auth'
  with self.assertRaisesRegex(E4Error,'MODEL_AUTHENTICATION_FAILED'):self.generate()
  self.assertEqual(len(self.calls),1);self.assertEqual(self.states[0].ledger.snapshot()['held_nanos'],50000000)
 def test_cancel_before_dispatch_does_not_invoke_provider(self):
  cancel=threading.Event();cancel.set()
  with self.assertRaises(E4Error):self.app.generate(self.payload(),'I-'+'a'*32,cancel)
  time.sleep(.02);self.assertFalse(self.calls);self.assertEqual(self.states[0].ledger.snapshot()['held_nanos'],0)
 def test_asgi_routes_require_signature_and_mock_result_never_claims_real(self):
  import asyncio
  async def run():
   async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://synthetic.internal') as client:
    denied=await client.get('/__business_ai/health');self.assertEqual(denied.status_code,401);self.assertFalse(self.calls)
    def headers(method,path,raw):
     at=str(int(self.now[0]*1000));sig=hmac.new(self.secret.encode(),b'BUSINESS_AI_V1.'+method.encode()+b'.'+path.encode()+b'.'+at.encode()+b'.'+raw,hashlib.sha256).hexdigest();return {'X-Business-AI-At':at,'X-Business-AI-Signature':sig}
    path='/__business_ai/health';r=await client.get(path,headers=headers('GET',path,b''));self.assertEqual(r.status_code,200);self.assertFalse(self.calls)
    path='/__business_ai/generate';raw=json.dumps(self.payload('E3')).encode();r=await client.post(path,content=raw,headers=headers('POST',path,raw));self.assertEqual(r.status_code,200,r.text);self.assertFalse(r.json()['data']['real_ai']);self.assertEqual(len(self.calls),1)
  asyncio.run(run())
 def test_out_of_scope_no_inference(self):
  for q in ['幫我重設帳號權限密碼','明天台股哪一支會漲','DQA 問題追蹤模組怎麼使用']:
   with self.assertRaises(E4Error):self.generate(self.payload(question=q))
  self.assertFalse(self.calls)
if __name__=='__main__':unittest.main(verbosity=2)
