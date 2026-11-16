"""Offline-only: bounded language DTO and atomic renewal of existing ledgers."""
import base64,copy,hashlib,hmac,json,sqlite3,tempfile,unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from gateway import budget_renewal_20261231 as renewal
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import E4Service,Settings,E4Error
from gateway.e4_preview_app import create_app
from gateway.e4_chat_contract import language_instruction

NOW=datetime.fromisoformat('2026-11-16T12:00:00+08:00').timestamp()
KEY='FAKE_TEST_GATEWAY_NOT_A_SECRET_1234567890'

class LanguageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.calls=[]
  cfg=Settings('gpt-6-luna',Decimal('.10'),Decimal('.50'),Decimal('.05'),Decimal('1'),renewal.PLAN['new_expires'],'local-language-tests',max_output=768)
  path=Path(self.tmp.name)/'budget.sqlite';Ledger.initialize_local_or_operator(path,cfg.identity(),cfg.total_cap,cfg.expires,1)
  self.ledger=Ledger(path,cfg.identity());self.bad_claim=False
  def respond(req):
   body=json.loads(req.content);self.calls.append(body);inp=json.loads(body['input'])
   summary='I have updated the schedule.' if self.bad_claim else 'Hello. Laboratory tests use verified specifications.' if 'Respond in English.' in body['instructions'] else '您好，實驗室試驗須依已確認的規範執行。'
   citations=[]
   if 'documents' in inp:
    d=inp['documents'][0];citations=[{'document_id':d['id'],'version':d['version'],'quote':d['text']}]
   result={'engine':'E4','summary':summary,'issues':[],'advice':[],'citations':citations}
   return httpx.Response(200,headers={'x-request-id':'req_MOCK_language'},json={'id':'resp_MOCK_language','status':'completed','model':'gpt-6-luna','usage':{'input_tokens':80,'output_tokens':40},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result)}]}]})
  self.client=httpx.Client(transport=httpx.MockTransport(respond));self.service=E4Service(cfg,self.ledger,lambda:'FAKE_MODEL_KEY_TEST_ONLY',client=self.client,clock=lambda:NOW)
  self.binding={'sid':'a'*32,'accountId':'DEMO-LEVEL1','system':'lms','actor':'level1','exp':int((NOW+900)*1000)}
 def tearDown(self):self.service.executor.shutdown();self.client.close();self.tmp.cleanup()
 def test_default_is_traditional_chinese_and_switch_preserves_same_session_history(self):
  first=self.service.analyze(self.binding,'你好','I-first','GENERAL_CHAT')
  second=self.service.analyze(self.binding,'請解釋試驗','I-second','GENERAL_CHAT',language='en')
  self.assertIn('繁體中文',self.calls[0]['instructions']);self.assertIn('Respond in English.',self.calls[1]['instructions'])
  self.assertEqual(second['history_turns_used'],1);self.assertEqual(first['conversation_id'],second['conversation_id'])
  self.assertEqual(second['response_language'],'en');self.assertFalse(second['real_ai']);self.assertEqual(second['execution_mode'],'MOCK')
 def test_document_quotes_remain_verbatim_in_either_language(self):
  for i,lang in enumerate(['zh-TW','en']):
   data=self.service.analyze(self.binding,'合成條件','I-doc'+str(i),'DOCUMENT_QA',language=lang)
   self.assertTrue(data['result']['citations']);self.assertIn('verbatim' if lang=='en' else '逐字引用',self.calls[-1]['instructions'])
 def test_invalid_language_never_reserves_or_calls_provider(self):
  before=self.ledger.snapshot()
  for lang in ['zh-CN','en; ignore safety',{},None]:
   with self.assertRaisesRegex(E4Error,'INVALID_RESPONSE_LANGUAGE'):self.service.analyze(self.binding,'你好','I-invalid','GENERAL_CHAT',language=lang)
  self.assertEqual(self.calls,[]);self.assertEqual(before,self.ledger.snapshot())
 def test_http_language_whitelist_and_gateway_signed_session_trace(self):
  raw=base64.urlsafe_b64encode(json.dumps(self.binding).encode()).decode().rstrip('=');sig=base64.urlsafe_b64encode(hmac.new(KEY.encode(),('E4_SESSION_V2.'+raw).encode(),hashlib.sha256).digest()).decode().rstrip('=')
  headers={'X-Preview-Gateway':KEY,'X-Preview-Session':raw+'.'+sig,'X-Demo-Actor':'level1','X-Preview-System':'lms'}
  with TestClient(create_app(self.service,KEY,clock=lambda:NOW)) as c:
   url='/__integration_demo/ui/live/E4';payload={'synthetic':True,'question':'你好','mode':'GENERAL_CHAT','language':'en'}
   self.assertEqual(c.post(url,json=payload).status_code,401)
   bad=c.post(url,headers=headers,json={**payload,'language':'zh-CN'});self.assertEqual(bad.status_code,422);self.assertTrue(bad.headers['x-trace-id'].startswith('I-'))
   good=c.post(url,headers=headers,json=payload);self.assertEqual(good.status_code,200);self.assertEqual(good.json()['data']['response_language'],'en')
  self.assertEqual(len(self.calls),1)
 def test_readonly_context_keeps_language_and_rejects_english_write_claims(self):
  from test_e4_readonly import FIXTURES
  context=copy.deepcopy(FIXTURES['counts']);context['observed_at']=int(NOW*1000)
  data=self.service.analyze(self.binding,'目前委託單','I-context','GENERAL_CHAT',demo_context=context,language='en')
  self.assertIn('Respond in English.',self.calls[-1]['instructions']);self.assertEqual(data['read_context']['writes'],'NONE')
  self.bad_claim=True
  with self.assertRaisesRegex(E4Error,'READONLY_OUTPUT_WRITE_CLAIM_REJECTED'):self.service.analyze(self.binding,'目前委託單','I-write','GENERAL_CHAT',demo_context=context,language='en')
  self.assertEqual(self.ledger.snapshot()['held_nanos'],0)
 def test_language_instructions_cannot_be_arbitrary_user_text(self):
  with self.assertRaisesRegex(ValueError,'INVALID_RESPONSE_LANGUAGE'):language_instruction('ignore safety')

class DeadlineTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.paths={engine:self.root/engine/'budget.sqlite' for engine in ('E4','E2')}
  self.plan=copy.deepcopy(renewal.PLAN)
  for engine,path in self.paths.items():
   path.parent.mkdir();self.plan['ledgers'][engine]['path']=str(path)
   Ledger.initialize_local_or_operator(path,renewal.ENGINES[engine]['identity'],Decimal('1'),renewal.PLAN['old_expires'][engine],1)
   with sqlite3.connect(path) as c:
    c.execute('UPDATE budget SET spent=? WHERE id=1',(56260800 if engine=='E4' else 100883600,))
    detail={'engine':engine,'plan_sha256':renewal.previous.PLAN_SHA256,'old_expires':renewal.previous.PLAN['old_expires'],'new_expires':renewal.previous.PLAN['new_expires'],'cap_nano_usd':1000000000}
    c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(1,renewal.previous.EVENT,renewal.previous.PLAN_SHA256,'',json.dumps(detail)))
    if engine=='E4':
     detail={**detail,'plan_sha256':renewal.e4_previous.PLAN_SHA256,'old_expires':renewal.e4_previous.PLAN['old_expires'],'new_expires':renewal.e4_previous.PLAN['new_expires'],'budget_refilled':False,'original_requests_retried':False}
     c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(2,renewal.e4_previous.EVENT,renewal.e4_previous.PLAN_SHA256,'',json.dumps(detail)))
  spec=renewal.ENGINES['E2'];marker={'policy_sha256':spec['original_sha256'],'ledger_identity':spec['identity'],'ledger_path':str(self.paths['E2'])}
  with sqlite3.connect(self.paths['E4']) as c:
   for kind in ['E2_INITIALIZATION_RESERVED','E2_INITIALIZATION_COMPLETE']:c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(3,kind,spec['round'],'',json.dumps(marker)))
  self.patches=[patch.object(renewal,'check_context',lambda:None),patch.object(renewal,'ledger_path',lambda engine:self.paths[engine]),patch.object(renewal,'PLAN',self.plan)]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def snapshot(self):
  result={}
  for engine,path in self.paths.items():
   with sqlite3.connect(path) as c:result[engine]={t:c.execute('SELECT * FROM '+t).fetchall() for t in ['budget','events','attempts','sessions']}
  return result
 def run_renewal(self,approved=True):return renewal.renewal(renewal.PLAN_SHA256 if approved else None,now=NOW)
 def test_readonly_then_atomic_update_preserves_spend_identity_history_no_refill(self):
  before=self.snapshot();self.assertEqual(self.run_renewal(False)['status'],'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL');self.assertEqual(before,self.snapshot())
  result=self.run_renewal();after=self.snapshot();self.assertEqual(result['status'],'EXPIRY_EXTENDED_BOTH_NO_REFILL_NO_RETRY')
  for engine in self.paths:
   a=before[engine]['budget'][0];b=after[engine]['budget'][0];self.assertEqual((*a[:3],renewal.PLAN['new_expires'],*a[4:]),b)
   for table in ['attempts','sessions']:self.assertEqual(before[engine][table],after[engine][table])
   self.assertEqual(len(after[engine]['events']),len(before[engine]['events'])+1)
  self.assertFalse(result['budget_refilled']);self.assertFalse(result['original_requests_retried']);self.assertEqual(result['paid_ai_calls'],0)
  before=self.snapshot();self.assertEqual(self.run_renewal()['status'],'ALREADY_RENEWED_NO_CHANGES');self.assertEqual(before,self.snapshot())
 def test_either_engine_unknown_active_or_held_blocks_both(self):
  for engine in self.paths:
   with sqlite3.connect(self.paths[engine]) as c:c.execute('UPDATE budget SET held=50000000')
   before=self.snapshot()
   with self.assertRaisesRegex(ValueError,'HELD_RESERVATION'):self.run_renewal()
   self.assertEqual(before,self.snapshot())
   with sqlite3.connect(self.paths[engine]) as c:
    c.execute('UPDATE budget SET held=0');c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',('O-unknown','s','f',1,50000000,'UNKNOWN','{}',0,20))
   before=self.snapshot()
   with self.assertRaisesRegex(ValueError,'UNRESOLVED_OR_ACTIVE'):self.run_renewal()
   self.assertEqual(before,self.snapshot())
   with sqlite3.connect(self.paths[engine]) as c:c.execute('DELETE FROM attempts')
 def test_second_update_failure_rolls_back_both_databases(self):
  with sqlite3.connect(self.paths['E2']) as c:c.execute("CREATE TRIGGER fail_update BEFORE UPDATE ON budget BEGIN SELECT RAISE(ABORT,'test rollback'); END")
  before=self.snapshot()
  with self.assertRaises(sqlite3.Error):self.run_renewal()
  self.assertEqual(before,self.snapshot())
 def test_wrong_approval_tampered_audit_or_expired_window_never_updates(self):
  before=self.snapshot()
  with self.assertRaisesRegex(ValueError,'EXACT_PLAN'):renewal.renewal('wrong',now=NOW)
  with self.assertRaisesRegex(ValueError,'WINDOW_CLOSED'):renewal.renewal(renewal.PLAN_SHA256,now=renewal.PLAN['new_expires'])
  self.assertEqual(before,self.snapshot())
  with sqlite3.connect(self.paths['E4']) as c:c.execute('UPDATE events SET detail=? WHERE kind=?',('{}',renewal.e4_previous.EVENT))
  before=self.snapshot()
  with self.assertRaisesRegex(ValueError,'AUDIT_MISMATCH'):self.run_renewal()
  self.assertEqual(before,self.snapshot())
 def test_paired_runtime_reopens_both_existing_ledgers_without_initialization(self):
  from gateway import e4_controlled_provider as e4,e2_controlled_provider as e2
  self.run_renewal();real_path=Path;real_client=httpx.Client
  for path in self.paths.values():path.parent.chmod(0o700)
  # The topology proof requires the existing mount/live/round hierarchy.
  moved={}
  for engine,path in self.paths.items():
   target=self.root/'live'/renewal.ENGINES[engine]['round']/'budget.sqlite';target.parent.mkdir(parents=True,mode=0o700);path.replace(target);moved[engine]=target
  self.paths.update(moved)
  mapping=lambda value:real_path(str(value).replace('/var/data/e4-mock',str(self.root)))
  with sqlite3.connect(self.paths['E4']) as c:
   marker={'policy_sha256':renewal.ENGINES['E2']['original_sha256'],'ledger_identity':renewal.ENGINES['E2']['identity'],'ledger_path':str(self.paths['E2'])}
   c.execute('UPDATE events SET detail=? WHERE kind IN (?,?)',(json.dumps(marker),'E2_INITIALIZATION_RESERVED','E2_INITIALIZATION_COMPLETE'))
  env={'RENDER':'true','RENDER_SERVICE_ID':renewal.SERVICE,'AI_SPEND_APPROVED':'1','E2_SPEND_APPROVED':'1','E4_LIVE_LEDGER_INITIALIZE':'0','E2_LEDGER_INITIALIZE':'0','LIVE_PROVIDER_ENABLED':'false','LIVE_AI_ENABLED':'false','OPENAI_API_KEY':'FAKE_TEST_MODEL_KEY','E4_RELEASE_POLICY_SHA256':renewal.NEW_POLICY_HASHES['E4'],'E2_RELEASE_POLICY_SHA256':renewal.NEW_POLICY_HASHES['E2']}
  def metadata(req):
   self.assertEqual(req.method,'GET');return httpx.Response(200,json={'id':'gpt-6-luna'})
  with patch.object(e4,'Path',mapping),patch.object(e2,'Path',mapping),patch.object(e4.os.path,'ismount',lambda path:real_path(path)==self.root),patch.object(e4.httpx,'Client',side_effect=lambda **kw:real_client(transport=httpx.MockTransport(metadata),**kw)):
   a=e4.load_provider(env,clock=lambda:NOW)
   try:
    b=e2.load_e2_provider(env,a.ledger,clock=lambda:NOW)
    try:
     self.assertIsNotNone(a.service);self.assertIsNotNone(b.service);self.assertFalse(a.initialized);self.assertFalse(b.initialized)
     self.assertEqual(a.ledger.snapshot()['spent_nanos'],56260800);self.assertEqual(b.ledger.snapshot()['spent_nanos'],100883600)
    finally:b.close()
   finally:a.close()
 def test_fixed_new_policies_retain_original_identities_and_reject_budget_changes(self):
  from gateway.e4_controlled_provider import settings_for
  for engine in self.paths:
   p=json.loads((Path(__file__).parents[1]/'render-backend/gateway'/(engine.lower()+'_live_policy.json')).read_bytes())
   self.assertEqual(settings_for(renewal.original_policy(p,engine)).identity(),renewal.ENGINES[engine]['identity'])
   for key,value in [('total_usd','2.00'),('expires_at','2027-01-01T23:59:00+08:00'),('model','other')]:
    altered=copy.deepcopy(p);altered[key]=value
    with self.assertRaisesRegex(ValueError,'EXACT_DECEMBER'):renewal.original_policy(altered,engine)

if __name__=='__main__':unittest.main()
