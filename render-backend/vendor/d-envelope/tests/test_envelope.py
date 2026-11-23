import unittest,json,hashlib
from copy import deepcopy
from pathlib import Path
from source_context import load_registry,seal,fingerprint
from ai_engine_core.service import EngineCore
from allocation_envelope import Binding,Envelope,build,encode,decode,sha,canonical,raw_bytes_sha
from input_mapper import execute
R=load_registry()
B={'jobId':'SYNTH-JOB','attemptId':'SYNTH-ATTEMPT','snapshotId':'SYNTH-SNAPSHOT','snapshotRevision':'SYNTH-R1','sourceRevision':'SYNTH-SOURCE-1','fenceToken':'SYNTH-FENCE','executionEpoch':1}
def rec(name='e2_original'):return deepcopy(next(x for x in R['entries'] if x['fixture_name']==name))
def native(r):return [EngineCore().run(deepcopy(i['request']),occurred_at='2026-11-08T12:00:00+08:00').to_dict() for i in r['core_inputs']]
def reseal(r):r['fingerprint']=fingerprint(r['operation'],r['wire_payload']);r['record_digest']=seal(r);return r
def record(devices=1):
 r=rec();r['core_inputs']=r['core_inputs'][:1];r['wire_payload']['trials']=r['wire_payload']['trials'][:1];p=r['core_inputs'][0]['request']['request_payload'];t=r['wire_payload']['trials'][0];p['required_devices']=t['required_devices']=devices;p['samples']['count']=t['quantity']=3
 if devices==2:
  m=deepcopy(p['equipment'][0]);m['id']='SYNTH-SECOND';p['equipment'].append(m)
  ctx=r['core_inputs'][0]['context'];v=deepcopy(ctx['capacity_evidence']['equipment'][0]);v['id']=m['id'];ctx['capacity_evidence']['equipment'].append(v)
  w=deepcopy(ctx['availability'][0]);w['equipment_id']=m['id'];ctx['availability'].append(w)
 return reseal(r)
def env(r=None):
 r=rec() if r is None else r;return build(B,r,native(r))
def altered(e,fn,reseal_wire=False):
 d=e.model_dump(mode='json');fn(d)
 if reseal_wire:
  d.pop('digest');d['digest']=sha(d)
 return canonical(d)
class EnvelopeTests(unittest.TestCase):
 def test_single_device(self):
  e=env(record());self.assertTrue(e.trials[0].candidates);self.assertTrue(all(c.allocations[0].sample_count==3 for c in e.trials[0].candidates))
 def test_unequal_multi_device(self):
  e=env(record(2));self.assertTrue(all(sorted(a.sample_count for a in c.allocations)==[1,2] for c in e.trials[0].candidates))
 def test_all_trials_and_candidates(self):
  r=rec();out=native(r);e=build(B,r,out);self.assertEqual(len(e.trials),len(out));self.assertEqual(sum(len(t.candidates) for t in e.trials),sum(len(v['result_payload']['proposals']) for v in out))
 def test_binding_round_trip(self):
  e=decode(encode(env()),expected_binding=B);self.assertEqual(e.binding.model_dump(),B);self.assertIs(type(e.binding.executionEpoch),int)
 def test_wire_stable(self):self.assertEqual(encode(env()),encode(env()))
 def test_candidate_identity_stable(self):self.assertEqual(env().trials[0].candidates[0].candidate_id,env().trials[0].candidates[0].candidate_id)
 def test_binding_changes_identity(self):
  r=rec();b=deepcopy(B);b['attemptId']='SYNTH-ATTEMPT-2';self.assertNotEqual(build(B,r,native(r)).trials[0].candidates[0].candidate_id,build(b,r,native(r)).trials[0].candidates[0].candidate_id)
 def test_candidate_ids_distinct(self):
  e=env();ids=[c.candidate_id for t in e.trials for c in t.candidates];self.assertEqual(len(ids),len(set(ids)))
 def test_native_proposal_digest(self):
  from ai_engine_core.models import digest
  for t in env().trials:
   for c in t.candidates:self.assertEqual(c.proposal_digest,digest(c.original_proposal))
 def test_raw_bytes_digest_is_distinct(self):self.assertNotEqual(raw_bytes_sha(b'hello'),sha('hello'))
 def test_raw_digest_rejects_string(self):
  with self.assertRaises(ValueError):raw_bytes_sha('hello')
 def test_empty_proposals_preserve_source(self):
  e=env(rec('e2_zero_candidates'));self.assertEqual(e.status,'INDETERMINATE');self.assertTrue(e.trials[0].source_refs);self.assertTrue(e.trials[0].original_request);self.assertIsNotNone(e.trials[0].original_result);self.assertIsNotNone(e.trials[0].result_digest)
 def test_no_trials_preserves_record(self):
  r=rec();r['core_inputs']=[];r['wire_payload']['trials']=[];reseal(r);e=build(B,r,[]);self.assertEqual(e.status,'INDETERMINATE');self.assertEqual(e.original_record,r);self.assertEqual(len(e.trials),0)
 def test_missing_sources_refused(self):
  r=record();r['core_inputs'][0]['request']['source_refs']=[];reseal(r);e=build(B,r,[None]);self.assertEqual(e.status,'REFUSED');self.assertEqual(e.trials[0].source_status,'MISSING');self.assertIn('MISSING_SOURCE',e.trials[0].reasons);self.assertEqual(e.trials[0].original_request,r['core_inputs'][0]['request'])
 def test_missing_result_refused(self):
  r=record();e=build(B,r,[None]);self.assertEqual(e.status,'REFUSED');self.assertIn('MISSING_RESULT',e.trials[0].reasons);self.assertIsNone(e.trials[0].result_digest)
 def test_missing_slot_not_silent(self):
  with self.assertRaises(ValueError):build(B,rec(),[])
 def test_expected_binding_mismatch(self):
  b=deepcopy(B);b['fenceToken']='OTHER'
  with self.assertRaises(ValueError):decode(encode(env()),expected_binding=b)
 def test_mutable_evidence_cannot_escape(self):
  e=env();e.original_record['wire_payload']['case_id']='TAMPER'
  with self.assertRaises(ValueError):encode(e)
 def test_valid_zero_not_no_feasible(self):self.assertNotIn('NO_FEASIBLE_SCHEDULE',encode(env(rec('e2_zero_candidates'))).decode())
 def test_no_public_success(self):
  for name in ['e2_original','e2_zero_candidates']:
   e=env(rec(name));self.assertEqual(e.public_projection,'BLOCKED');self.assertEqual(e.full_enumeration,'NOT_PROVEN');self.assertEqual(e.source_trust,'SYNTHETIC_ONLY')
 def test_day_dates(self):
  e=env()
  for t in e.trials:
   p=t.original_request['request_payload']
   for c in t.candidates:self.assertEqual(c.original_proposal['granularity'],'DAY');self.assertEqual(c.original_proposal['start_date'],p['start_date'])
 def test_dyadic_decimal_unchanged(self):
  e=env(rec('e2_exact_fraction'));self.assertEqual(e.trials[0].original_request['request_payload']['samples']['volume_l'],0.125);self.assertEqual(decode(encode(e),expected_binding=B),e)
 def test_inexact_decimal_still_blocked(self):
  r=rec('e2_inexact_decimal');self.assertEqual(execute(r['operation'],r['wire_payload'])['status'],'BLOCKED')
 def test_refuse_invalid_source_digest(self):
  r=record();r['core_inputs'][0]['request']['source_refs'][0]['digest']='bad';reseal(r)
  with self.assertRaises(ValueError):build(B,r,[None])
 def test_unknown_wire_version(self):
  with self.assertRaises(ValueError):decode(altered(env(),lambda d:d.update(wire_version='approved'),True),expected_binding=B)
 def test_duplicate_json_key(self):
  b=encode(env());bad=b'{"status":"ADVISORY",'+b[1:]
  with self.assertRaises(ValueError):decode(bad,expected_binding=B)
 def test_nan_rejected(self):
  with self.assertRaises(ValueError):decode(b'{"x":NaN}',expected_binding=B)
 def test_unsupported_decimal_not_coerced(self):
  from decimal import Decimal
  with self.assertRaises(TypeError):canonical({'volume':Decimal('0.1')})
 def test_e1_regression(self):
  r=rec('e1_original');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'SUCCESS');self.assertGreater(o['core_call_count'],0);self.assertEqual(o['core_results'][0]['result_payload']['human_technical_review_status'],'UNKNOWN')
 def test_e3_original_fail(self):
  r=rec('e3_registered_complete');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'SUCCESS');self.assertEqual(o['core_results'][0]['result_payload']['draft_data']['original_result'],'FAIL')
 def test_e4_version_conflict(self):
  r=rec('e4_registered_version_conflict');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'REFUSED');self.assertIsNone(o['core_results'][0]['result_payload']['answer'])
 def test_e4_valid_source(self):
  r=rec('e4_registered_match');o=execute(r['operation'],r['wire_payload']);self.assertEqual(o['status'],'SUCCESS');self.assertTrue(o['core_results'][0]['result_payload']['citations'])
 def test_socket_blocked(self):
  import socket
  with self.assertRaises(RuntimeError):socket.socket()

def binding_missing(k):
 def test(self):
  b=deepcopy(B);b.pop(k)
  with self.assertRaises(ValueError):Binding.model_validate(b)
 return test
def binding_type(k):
 def test(self):
  b=deepcopy(B);b[k]='1' if k=='executionEpoch' else 1
  with self.assertRaises(ValueError):Binding.model_validate(b)
 return test
for k in B:
 setattr(EnvelopeTests,'test_binding_missing_'+k,binding_missing(k));setattr(EnvelopeTests,'test_binding_type_'+k,binding_type(k))
def tamper(fn,seal_again=False):
 def test(self):
  with self.assertRaises(ValueError):decode(altered(env(),fn,seal_again),expected_binding=B)
 return test
cases={
 'sample_count':lambda d:d['trials'][0]['candidates'][0]['allocations'][0].update(sample_count=99),
 'zero_count':lambda d:d['trials'][0]['candidates'][0]['allocations'][0].update(sample_count=0),
 'bool_count':lambda d:d['trials'][0]['candidates'][0]['allocations'][0].update(sample_count=True),
 'device':lambda d:d['trials'][0]['candidates'][0]['allocations'][0].update(equipment_id='UNKNOWN'),
 'candidate_id':lambda d:d['trials'][0]['candidates'][0].update(candidate_id='a'*64),
 'proposal_digest':lambda d:d['trials'][0]['candidates'][0].update(proposal_digest='a'*64),
 'request_digest':lambda d:d['trials'][0].update(request_digest='a'*64),
 'result_digest':lambda d:d['trials'][0].update(result_digest='a'*64),
 'source_refs':lambda d:d['trials'][0].update(source_refs=[]),
 'drop_candidate':lambda d:d['trials'][0]['candidates'].pop(),
 'drop_trial':lambda d:d['trials'].pop(),
 'demand':lambda d:d['trials'][0]['candidates'][0].update(requested_quantity=99),
 'unapproved_public':lambda d:d.update(public_projection='SUCCESS'),
 'full_proof':lambda d:d.update(full_enumeration='PROVEN'),
 'trusted_source':lambda d:d.update(source_trust='TRUSTED'),
 'epoch_bool':lambda d:d['binding'].update(executionEpoch=True),
}
for k,v in cases.items():setattr(EnvelopeTests,'test_tamper_'+k,tamper(v,True))
setattr(EnvelopeTests,'test_unsealed_change',tamper(lambda d:d['binding'].update(jobId='OTHER')))

class EvidenceNegatives(unittest.TestCase):
 def test_stale_source_refused(self):
  r=record();r['core_inputs'][0]['context']['sources'][0]['state']='STALE';reseal(r);e=build(B,r,native(r));self.assertEqual(e.status,'REFUSED');self.assertEqual(e.trials[0].source_status,'INVALID');self.assertEqual(e.trials[0].candidates,())
 def test_revoked_source_refused(self):
  r=record();r['core_inputs'][0]['context']['sources'][0]['state']='REVOKED';reseal(r);self.assertEqual(build(B,r,native(r)).status,'REFUSED')
 def test_source_version_mismatch_refused(self):
  r=record();r['core_inputs'][0]['context']['sources'][0]['ref']['version']='OTHER';reseal(r);self.assertEqual(build(B,r,native(r)).status,'REFUSED')
 def test_capacity_missing_refused(self):
  r=record();r['core_inputs'][0]['context'].pop('capacity_evidence');reseal(r);e=build(B,r,native(r));self.assertEqual(e.status,'REFUSED');self.assertIn('CAPACITY_EVIDENCE_MISSING_OR_INVALID',e.trials[0].reasons)
 def test_space_unit_not_litres(self):
  r=record();r['core_inputs'][0]['context']['capacity_evidence']['unit']='SPACE_UNIT';reseal(r);self.assertEqual(build(B,r,native(r)).status,'REFUSED')
 def test_epoch_bounds_and_bool(self):
  for x in [0,-1,9007199254740992,True,1.0,None]:
   b=deepcopy(B);b['executionEpoch']=x
   with self.assertRaises(ValueError):Binding.model_validate(b)
 def test_duplicate_devices_rejected(self):
  e=env(record(2))
  def change(d):d['trials'][0]['candidates'][0]['allocations'][1]['equipment_id']=d['trials'][0]['candidates'][0]['allocations'][0]['equipment_id']
  with self.assertRaises(ValueError):decode(altered(e,change,True),expected_binding=B)
 def test_binding_extra_rejected(self):
  b=deepcopy(B);b['admin']=True
  with self.assertRaises(ValueError):Binding.model_validate(b)
