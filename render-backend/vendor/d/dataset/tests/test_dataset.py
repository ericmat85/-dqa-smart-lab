import unittest,json,hashlib
from pathlib import Path
from copy import deepcopy
from decimal import Decimal
from ai_engine_core.service import EngineCore
from validate_dataset import validate,InvalidDataset
from a_import_adapter import prepare_import
O=Path(__file__).resolve().parents[1]
D=json.loads((O/'data/competition_ai4_demo_dataset_v1.json').read_text())
class Dataset(unittest.TestCase):
 def test_full_validation(self):self.assertTrue(validate(D))
 def test_fifteen_one_to_one(self):self.assertEqual(len(D['requests']),15);self.assertEqual(len(D['reportDrafts']),15);self.assertEqual(len(D['testResults']),15)
 def test_contains_pass_and_fail(self):self.assertEqual({r['overallResult'] for r in D['testResults']},{'PASS','FAIL'})
 def test_pages_cover_two_to_five(self):self.assertEqual({r['pageCount'] for r in D['reportDrafts']},{2,3,4,5})
 def test_photos_are_requirements_not_files(self):self.assertEqual(len(D['photoReferences']),30);self.assertTrue(all(p['filePath'] is None and p['assetStatus']=='PENDING_CREATION' for p in D['photoReferences']))
 def test_staging_no_writes(self):
  before=deepcopy(D);out=prepare_import(D);self.assertFalse(out['writesPerformed']);self.assertFalse(out['reportStoreDirectImportAllowed']);self.assertFalse(out['workflowTransitionsPerformed']);self.assertEqual(before,D);self.assertEqual(len(out['requestRows']),15)
 def test_staging_request_fields(self):
  for r in prepare_import(D)['requestRows']:self.assertIsInstance(r['id'],str);self.assertIsInstance(r['history'],list);self.assertEqual(len(r['testItems']),1);self.assertIsInstance(r['judgementCriteria'],str)
 def test_no_fabricated_approvals(self):
  self.assertTrue(all(x['signatures']==[] and x['humanReviewStatus']=='PENDING_HUMAN' for x in D['reportDrafts']))
 def test_no_formal_capacity_or_model_claim(self):
  for r in D['engineExecutionEvidence']:self.assertFalse(r['providerCalled']);self.assertFalse(r['formalCapacityVerified']);self.assertIsNone(r['publicResult']);self.assertEqual(r['output']['model_metadata']['provider'],'NONE')
 def test_nine_stage_constants(self):self.assertEqual(D['workflowDemo']['stages'],['待簽核','待審查','待排程','待確認','試驗中','已完成','待審核','待查閱','已結案']);self.assertFalse(D['workflowDemo']['automaticTransitions'])
 def test_network_denied(self):
  import socket
  with self.assertRaises(RuntimeError):socket.socket()
 def test_outside_write_denied(self):
  with self.assertRaises(RuntimeError):open('/tmp/d-ai4-unauthorized-write','w')

def engine_test(case):
 def test(self):
  before=deepcopy(case['input']);out=EngineCore().run(deepcopy(before),actor_id='SYNTH-D-AI4-DATA',occurred_at='2026-11-09T09:00:00+08:00').to_dict();saved=next(x['output'] for x in D['engineExecutionEvidence'] if x['caseId']==case['caseId']);self.assertEqual(out,saved);self.assertEqual(case['input'],before)
 return test
for case in D['engineInputs']:setattr(Dataset,'test_actual_core_'+case['caseId'].replace('-','_'),engine_test(case))

def recompute_case(result):
 def test(self):
  rules={x['metric']:x for x in result['rules']};outcomes={}
  for sample in result['perSampleResults']:
   values=[x for x in result['rawMeasurements'] if x['sampleId']==sample['sampleId']];ok=all(Decimal(rules[x['metric']]['lower'])<=Decimal(x['value'])<=Decimal(rules[x['metric']]['upper']) for x in values);outcomes[sample['sampleId']]='PASS' if ok else 'FAIL';self.assertEqual(sample['result'],outcomes[sample['sampleId']])
  self.assertEqual(result['overallResult'],'FAIL' if 'FAIL' in outcomes.values() else 'PASS')
 return test
for r in D['testResults']:setattr(Dataset,'test_independent_recalculation_'+r['requestId'].replace('-','_'),recompute_case(r))

def mutation_test(fn):
 def test(self):
  x=deepcopy(D);fn(x)
  with self.assertRaises((ValueError,KeyError,StopIteration)):validate(x)
 return test
mutations={
 'core_draft_tampered':lambda x:x['reportDrafts'][0]['coreDraftData'].update(original_result='FAIL'),
 'e1_source_mismatch':lambda x:x['engineInputs'][0]['input']['request_payload']['customer_spec']['ref'].update(version='STALE'),
 'too_few_requests':lambda x:x['requests'].pop(),
 'duplicate_request':lambda x:x['requests'][1].update(requestId=x['requests'][0]['requestId']),
 'duplicate_report':lambda x:x['requests'][1].update(reportId=x['requests'][0]['reportId']),
 'two_test_items':lambda x:x['requests'][0]['testItems'].append('高溫試驗'),
 'illegal_catalog':lambda x:x['requests'][0].update(catalogType='UNSUPPORTED'),
 'report_wrong_type':lambda x:x['reportDrafts'][0].update(catalogType='UNSUPPORTED'),
 'conditions_mismatch':lambda x:x['testResults'][0]['conditions'].update(temperature_max=999),
 'wrong_quantity':lambda x:x['requests'][0].update(quantity=99),
 'wrong_equipment':lambda x:x['equipment'][0].update(kind='UNRELATED'),
 'wrong_units':lambda x:x['testResults'][0]['rawMeasurements'][0].update(unit='UNRELATED'),
 'wrong_pass':lambda x:x['testResults'][3].update(overallResult='PASS'),
 'wrong_sample_pass':lambda x:x['testResults'][3]['perSampleResults'][2].update(result='PASS'),
 'missing_raw':lambda x:x['testResults'][0]['rawMeasurements'].pop(),
 'missing_value':lambda x:x['testResults'][0]['rawMeasurements'][0].pop('value'),
 'wrong_limits':lambda x:x['testResults'][0]['rules'][0].update(upper='999'),
 'wrong_date':lambda x:x['requests'][0].update(endDate='2020-01-01'),
 'hour_schedule':lambda x:x['requests'][0].update(timeUnit='hour'),
 'zero_page':lambda x:x['reportDrafts'][0].update(pageCount=0),
 'empty_section':lambda x:x['reportSections'][0].update(content={}),
 'wrong_chart':lambda x:next(s['content']['chart'] for s in x['reportSections'] if 'chart' in s['content']).update(sourceMeasurementIds=['FAKE']),
 'fake_image':lambda x:x['photoReferences'][0].update(filePath='invented.png'),
 'photo_missing':lambda x:x['photoReferences'].pop(0),
 'not_synthetic':lambda x:x['requests'][0].update(synthetic=False),
 'fake_signature':lambda x:x['reportDrafts'][0]['signatures'].append('invented'),
 'wrong_source_digest':lambda x:x['testResults'][0].update(rawFileBytesSha256='0'*64),
 'wrong_engine_status':lambda x:x['engineExecutionEvidence'][0]['output'].update(status='REJECTED'),
 'missing_expected':lambda x:x['engineExpectedResults'].pop(),
 'fake_model_call':lambda x:x['engineExecutionEvidence'][0].update(providerCalled=True),
}
for name,fn in mutations.items():setattr(Dataset,'test_reject_'+name,mutation_test(fn))
