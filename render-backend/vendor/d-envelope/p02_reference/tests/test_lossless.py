import unittest,json
from copy import deepcopy
from source_context import load_registry,seal
from input_mapper import execute as old_execute
from ai_engine_core.service import EngineCore
from ai_engine_core.models import digest
from lossless_allocation import capture,execute,project_provider_advice,AllocationDenied

REG=load_registry()
def rec(name='e2_original'):return deepcopy(next(x for x in REG['entries'] if x['fixture_name']==name))
def native(record):return [EngineCore().run(deepcopy(i['request']),occurred_at='2026-11-08T12:00:00+08:00').to_dict() for i in record['core_inputs']]
def revised_record(devices=1):
 r=rec();r['wire_payload']['trials']=r['wire_payload']['trials'][:1];r['core_inputs']=r['core_inputs'][:1];p=r['core_inputs'][0]['request']['request_payload'];t=r['wire_payload']['trials'][0]
 p['required_devices']=t['required_devices']=devices;p['samples']['count']=t['quantity']=3
 if devices==2:
  m=deepcopy(p['equipment'][0]);m['id']='SYNTH-SECOND';p['equipment'].append(m)
 return r
class Lossless(unittest.TestCase):
 def test_single_device(self):
  r=revised_record();b=capture(r,native(r));self.assertTrue(b['candidates']);self.assertTrue(all(len(c['allocations'])==1 and c['allocations'][0]['sample_count']==3 for c in b['candidates']))
 def test_multi_device_nonuniform_counts(self):
  r=revised_record(2);b=capture(r,native(r));self.assertTrue(b['candidates']);self.assertTrue(all(sorted(a['sample_count'] for a in c['allocations'])==[1,2] for c in b['candidates']))
 def test_all_candidates_preserved(self):
  r=rec();out=native(r);b=capture(r,out);self.assertEqual(len(b['candidates']),sum(len(x['result_payload']['proposals']) for x in out))
 def test_trial_relations(self):
  r=rec();b=capture(r,native(r));self.assertEqual({c['relation']['trial_id'] for c in b['candidates']},{t['trial_id'] for t in r['wire_payload']['trials']})
 def test_candidate_ids_unique(self):
  r=rec();b=capture(r,native(r));ids=[c['candidate_id'] for c in b['candidates']];self.assertEqual(len(ids),len(set(ids)))
 def test_original_sources_and_request_complete(self):
  r=rec();out=native(r);b=capture(r,out)
  for c in b['candidates']:
   i=c['relation']['trial_ordinal'];self.assertEqual(c['original_request'],r['core_inputs'][i]['request']);self.assertEqual(c['original_result'],out[i]);self.assertEqual(c['source_refs'],out[i]['source_refs'])
 def test_detached_copy(self):
  r=rec();out=native(r);before=deepcopy((r,out));b=capture(r,out);b['candidates'][0]['allocations'][0]['sample_count']=100;self.assertEqual((r,out),before)
 def test_day_independent_dates(self):
  r=rec();b=capture(r,native(r));self.assertEqual({c['original_proposal']['start_date'] for c in b['candidates']},{t['start_date'] for t in r['wire_payload']['trials']});self.assertTrue(all(c['time_unit']=='day' and c['timezone']=='Asia/Taipei' for c in b['candidates']))
 def test_provider_dto_missing_fields_rejected(self):
  r=rec();b=capture(r,native(r));p=project_provider_advice(b);self.assertEqual(p['status'],'BLOCKED');self.assertIn('allocations',p['missing_fields']);self.assertIsNone(p['b_provider_advice'])
 def test_wrapper_cannot_return_old_lossy_success(self):
  r=rec();old=old_execute(r['operation'],r['wire_payload']);self.assertEqual(old['status'],'SUCCESS');new=execute(r['operation'],r['wire_payload']);self.assertEqual(new['status'],'BLOCKED');self.assertTrue(new['lossless_allocation']['candidates']);self.assertGreater(new['core_call_count'],0)
 def test_zero_candidates_indeterminate(self):
  r=rec('e2_zero_candidates');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'INDETERMINATE');self.assertNotIn('NO_FEASIBLE_SCHEDULE',json.dumps(o));self.assertIsNone(o['public_result'])
 def test_missing_capacity_blocked(self):
  r=rec('e2_missing_volume');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'BLOCKED');self.assertIsNone(o['b_provider_advice'])
 def test_decimal_inexact_blocked(self):
  r=rec('e2_inexact_decimal');self.assertEqual(execute(r['operation'],r['wire_payload'])['status'],'BLOCKED')
 def test_decimal_exact_retained(self):
  r=rec('e2_exact_fraction');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'BLOCKED');self.assertTrue(o['lossless_allocation']['candidates']);self.assertEqual(o['lossless_allocation']['candidates'][0]['original_request']['request_payload']['samples']['volume_l'],0.125)
 def test_unknown_input_rejected(self):
  r=rec();r['wire_payload']['case_id']='UNKNOWN';self.assertEqual(execute(r['operation'],r['wire_payload'])['status'],'BLOCKED')
 def test_no_business_actions(self):
  r=rec();o=execute(r['operation'],r['wire_payload']);self.assertFalse(o['reservation_created']);self.assertFalse(o['business_state_modified']);self.assertIsNone(o['public_result'])
 def test_e1_regression(self):
  r=rec('e1_original');self.assertEqual(execute(r['operation'],r['wire_payload']),old_execute(r['operation'],r['wire_payload']))
 def test_e3_regression(self):
  r=rec('e3_registered_complete');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o,old_execute(r['operation'],r['wire_payload']));self.assertEqual(o['core_results'][0]['result_payload']['draft_data']['original_result'],'FAIL')
 def test_e4_regression(self):
  for name in ['e4_registered_match','e4_registered_version_conflict']:
   r=rec(name);self.assertEqual(execute(r['operation'],r['wire_payload']),old_execute(r['operation'],r['wire_payload']))
 def test_no_network(self):
  import socket
  with self.assertRaises(RuntimeError):socket.socket()

def mutation_test(mutator):
 def test(self):
  r=revised_record(2);out=native(r);mutator(r,out)
  # Digest is recomputed for structural attacks so validation is not only a hash check.
  for v in out:v['audit_metadata']['output_digest']=digest(v['result_payload'])
  with self.assertRaises((AllocationDenied,ValueError,KeyError)):capture(r,out)
 return test
mutations={
 'missing_sample_count':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][0].pop('sample_count'),
 'wrong_sum':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][0].update(sample_count=99),
 'zero_count':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][0].update(sample_count=0),
 'bool_count':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][0].update(sample_count=True),
 'unknown_device':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][0].update(equipment_id='UNKNOWN'),
 'duplicate_device':lambda r,o:o[0]['result_payload']['proposals'][0]['allocations'][1].update(equipment_id=o[0]['result_payload']['proposals'][0]['allocations'][0]['equipment_id']),
 'wrong_trial':lambda r,o:o[0]['result_payload']['proposals'][0].update(trial_id='OTHER'),
 'source_swap':lambda r,o:o[0].update(source_refs=[]),
 'request_id_swap':lambda r,o:o[0].update(request_id='OTHER'),
 'required_device_mismatch':lambda r,o:r['wire_payload']['trials'][0].update(required_devices=1),
 'hour_granularity':lambda r,o:o[0]['result_payload']['proposals'][0].update(granularity='HOUR'),
 'applied_schedule':lambda r,o:o[0]['result_payload']['proposals'][0].update(applied=True),
}
for name,mut in mutations.items():setattr(Lossless,'test_reject_'+name,mutation_test(mut))
