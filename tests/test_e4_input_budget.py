"""Fixed input limits, lossless compact requests and Fake HTTP only."""
import copy,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent));sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
from test_e4_controlled import ControlledTests,controlled,FAKE_KEY
from test_e4_readonly import FIXTURES
from gateway.e4_preview_provider import E4Error
from gateway.e4_session import subject
from gateway.e4_chat_contract import instructions_for,schema_for
from gateway.live_provider import DOCS

class InputBudgetTests(unittest.TestCase):
 def setUp(self):
  self.h=ControlledTests();self.h.setUp();self.h.bootstrap()
  with patch.object(controlled.httpx,'Client',side_effect=self.h.client_factory):self.s=self.h.load({'E4_LIVE_LEDGER_INITIALIZE':'0','AI_SPEND_APPROVED':'1','OPENAI_API_KEY':FAKE_KEY}).service
  self.requests=[];original=self.h.fake_provider
  def capture(req):
   self.requests.append(json.loads(req.content));return original(req)
  self.s.client._transport.handler=capture
 def tearDown(self):self.h.tearDown()
 def context(self,name):
  c=copy.deepcopy(FIXTURES[name]);c['observed_at']=int(self.h.now[0]*1000);return c
 def test_equipment_list_that_previously_overflowed_keeps_every_fact(self):
  c=self.context('equipment');c['items']=[c['items'][0]];binding=self.h.binding()
  result=self.s.analyze(binding,'列出目前所有設備與狀況','I-fit-equipment','GENERAL_CHAT',demo_context=c)
  self.assertFalse(result['real_ai']);self.assertEqual(json.loads(self.requests[0]['input'])['demo_context'],c)
  request=self.requests[0];bound=len(json.dumps(request,ensure_ascii=False,separators=(',',':')).encode())+4096
  self.assertLessEqual(bound,8192);self.assertEqual(self.s.settings.max_input,8192);self.assertEqual(request['max_output_tokens'],768)
  for rule in ['untrusted','Never sum overlapping','Space Units','UNAVAILABLE','partial lists','No tools','REPORT_DRAFT','signatures','citations must be empty']:
   self.assertIn(rule,request['instructions'])
 def test_report_required_evidence_is_not_removed_to_fit(self):
  c=self.context('draft');self.s.analyze(self.h.binding(),'製作 REQ-2026-001 的報告草稿','I-fit-report','GENERAL_CHAT',demo_context=c)
  self.assertEqual(json.loads(self.requests[0]['input'])['demo_context'],c)
 def test_history_is_trimmed_only_as_whole_oldest_pairs(self):
  binding=self.h.binding();generation=self.s.ledger.bind_session(binding,self.h.now[0]);history,_=self.s._session(subject(binding),'GENERAL_CHAT')
  pairs=[{'user':'舊問題'+str(i)+'問'*900,'assistant':'舊回答'+str(i)+'答'*1800} for i in range(4)]
  history.update(pairs=copy.deepcopy(pairs),turns=4,generation=generation)
  c=self.context('equipment');self.s.analyze(binding,'列出目前所有設備與狀況','I-fit-history','GENERAL_CHAT',demo_context=c)
  inp=json.loads(self.requests[0]['input']);self.assertEqual(inp['demo_context'],c);self.assertEqual(inp['history'],pairs[len(pairs)-len(inp['history']):] if inp['history'] else [])
 def test_genuinely_oversized_input_is_denied_before_reservation_or_dispatch(self):
  before=self.s.ledger.snapshot()
  with self.assertRaisesRegex(E4Error,'INPUT_TOKEN_LIMIT'):self.s.analyze(self.h.binding(),'請解釋'*300,'I-still-too-long','GENERAL_CHAT',demo_context=self.context('equipment'))
  self.assertFalse(self.requests);self.assertEqual(self.s.ledger.snapshot(),before)
 def test_document_qa_keeps_original_instructions_schema_and_all_documents(self):
  self.s.analyze(self.h.binding(),'合成溫度文件說明','I-fit-doc','DOCUMENT_QA')
  req=self.requests[0];self.assertEqual(req['instructions'],instructions_for('DOCUMENT_QA'));self.assertEqual(req['text']['format']['schema'],schema_for('DOCUMENT_QA'));self.assertEqual(json.loads(req['input'])['documents'],DOCS)
 def test_plain_greeting_keeps_the_original_general_chat_rules(self):
  self.s.analyze(self.h.binding(),'你好','I-fit-greeting','GENERAL_CHAT')
  self.assertEqual(self.requests[0]['instructions'],instructions_for('GENERAL_CHAT'));self.assertNotIn('demo_context',json.loads(self.requests[0]['input']))

if __name__=='__main__':unittest.main(verbosity=2)
