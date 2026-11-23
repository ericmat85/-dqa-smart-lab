from pathlib import Path
from copy import deepcopy
from decimal import Decimal
import unittest,json,sys
from dynamic_adapter import run,number,exact_native
from ai_engine_core.service import EngineCore
O=Path(__file__).resolve().parents[1];TRACE=json.loads((O/'evidence/dynamic-input-output-trace.json').read_text())
BY={x['caseId']:x for x in TRACE}
class Dynamic(unittest.TestCase):
 def test_all_fifteen_reused(self):self.assertEqual(len({r['sourceRequestId'] for r in TRACE}),15)
 def test_dynamic_not_original_payload(self):
  for c in TRACE:self.assertTrue(c['raw']['request_id'].startswith('SYNTH-DYN-'));self.assertIsNone(c['output']['publicResult']);self.assertFalse(c['output']['providerCalled'])
 def test_no_registration_import(self):
  self.assertNotIn('source_context',sys.modules);self.assertNotIn('input_mapper',sys.modules)
 def test_e1_numeric_deviation(self):
  o=BY['NEG-E1-VOLTAGE-DEVIATION']['output'];self.assertEqual(o['status'],'ADVISORY');self.assertTrue(o['adapterFindings']);self.assertEqual(o['adapterFindings'][0]['field'],'supply');self.assertFalse(o['coreOutput']['requires_human_review']['can_approve'])
 def test_e1_core_condition_deviation(self):self.assertTrue(BY['NEG-E1-CONDITION-DEVIATION']['output']['coreOutput']['result_payload']['findings'])
 def test_e2_variation(self):
  positives=[x for x in TRACE if x['caseId'].startswith('DYN-') and x['engine']=='E2'];self.assertGreater(len({x['raw']['request_payload']['samples']['count'] for x in positives}),1);self.assertEqual({x['raw']['request_payload']['required_devices'] for x in positives},{1,2});self.assertGreater(len({x['raw']['request_payload']['start_date'] for x in positives}),1)
 def test_e2_proposal_sums_days(self):
  from datetime import date,timedelta
  for c in TRACE:
   if c['engine']!='E2' or c['output']['status']!='ADVISORY':continue
   p=c['raw']['request_payload']
   for q in c['output']['coreOutput']['result_payload']['proposals']:
    self.assertEqual(sum(a['sample_count'] for a in q['allocations']),p['samples']['count']);self.assertEqual(q['start_date'],p['start_date']);self.assertEqual(q['expected_end_date'],str(date.fromisoformat(p['start_date'])+timedelta(days=p['duration_days']-1)));self.assertEqual(q['granularity'],'DAY');self.assertFalse(q['applied'])
 def test_missing_evidence_not_no_feasible(self):
  for key in ['NEG-E2-MISSING-CAPACITY','NEG-E2-SPACE-UNIT']:
   o=BY[key]['output'];self.assertEqual(o['status'],'BLOCKED');self.assertFalse(o['coreCalled'])
  self.assertNotIn('NO_FEASIBLE_SCHEDULE',json.dumps(TRACE))
 def test_e3_review_not_generation(self):
  o=BY['NEG-E3-OUT-OF-RANGE']['output'];p=o['coreOutput']['result_payload'];self.assertFalse(p['checks'][0]['within_declared_limits']);self.assertEqual(p['draft_data']['original_result'],'PASS');self.assertEqual(p['review_status'],'PENDING_HUMAN');self.assertEqual(o['reportGeneration'],'NOT_IMPLEMENTED')
 def test_e3_outlier_warning(self):self.assertIn('DECLARED_RESULT_REQUIRES_HUMAN_REVIEW',BY['NEG-E3-OUT-OF-RANGE']['output']['coreOutput']['warnings'])
 def test_e4_question_unchanged(self):
  for c in TRACE:
   if c['engine']=='E4':self.assertEqual(c['raw']['request_payload']['query'],c['output']['preservedInput']['request_payload']['query'])
 def test_e4_answer_source_exact(self):
  for c in TRACE:
   if c['engine']=='E4' and c['output']['status']=='ADVISORY':
    p=c['output']['coreOutput']['result_payload'];self.assertEqual(p['answer'],'\n'.join(x['quote'] for x in p['citations']));self.assertFalse(p['verified_regulatory_conclusion'])
 def test_unsupported_questions_refuse(self):self.assertEqual(BY['NEG-E4-UNSUPPORTED-QUESTION']['output']['status'],'REFUSED')
 def test_no_silent_numeric_rounding(self):self.assertEqual(BY['NEG-E3-NO-ROUNDING-12-1']['output']['reason'],'CORE_EXACT_NUMERIC_PROJECTION_UNSUPPORTED');self.assertEqual(BY['NEG-E3-NO-ROUNDING-12-1']['context']['lexicalMeasurements'][1]['value'],'12.1')
 def test_format_valid_nonrepresentable_is_distinct(self):self.assertEqual(number('12.1','V'),Decimal('12.1'))
 def test_seconds_exact_scale(self):self.assertEqual(number('2.00','s'),Decimal('2.00'))
 def test_integer_units(self):
  for u in ['min','h','ms']:self.assertEqual(number('8',u),Decimal(8));self.assertEqual(number(8,u),Decimal(8))
 def test_negative_boolean_rejected_integer(self):
  for x in [True,-1,'-1','2.0']:
   with self.assertRaises(ValueError):number(x,'ms')
 def test_precision_invalids(self):
  for x,u in [('2','s'),('2.0','s'),('2.000','s'),('12','V'),('12.00','V'),('1.0','min'),('1.5','h'),('2.5','ms')]:
   with self.assertRaises(ValueError):number(x,u)
 def test_nonfinite_rejected(self):
  for x in ['NaN','Infinity','-Infinity']:
   with self.assertRaises(ValueError):number(x,'mA')
 def test_unknown_source_version(self):
  c=deepcopy(TRACE[0]);c['context']['sourceCatalog'][0]['ref']['version']='STALE';self.assertEqual(run(c['raw'],c['context'])['status'],'BLOCKED')
 def test_no_network(self):
  import socket
  with self.assertRaises(RuntimeError):socket.socket()

def replay(c):
 def test(self):
  before=deepcopy((c['raw'],c['context']));seen=[]
  def profile(frame,event,arg):
   if event=='call' and frame.f_code is EngineCore.run.__code__:seen.append(frame.f_locals['raw']['engine_id'])
  old=sys.getprofile()
  def chained(frame,event,arg):
   profile(frame,event,arg)
   if old:old(frame,event,arg)
  sys.setprofile(chained)
  try:o=run(c['raw'],c['context'])
  finally:sys.setprofile(old)
  self.assertEqual(o,c['output']);self.assertEqual(o['status'],c['expectedStatus']);self.assertEqual(o['coreCalled'],c['expectedCoreCalled']);self.assertEqual(len(seen),int(o['coreCalled']));self.assertEqual((c['raw'],c['context']),before)
 return test
for c in TRACE:setattr(Dynamic,'test_case_'+c['caseId'].replace('-','_'),replay(c))
