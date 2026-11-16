import copy
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from gateway import e4_budget_renewal_20261116 as renewal
from gateway import e4_controlled_provider as runtime
from gateway.e4_preview_ledger import Ledger

class RenewalTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'budget.sqlite';self.e2=Path(self.tmp.name)/'e2-preserved';self.e2.write_bytes(b'unchanged')
  Ledger.initialize_local_or_operator(self.path,renewal.SPEC['identity'],__import__('decimal').Decimal('1'),renewal.PLAN['old_expires'],1)
  with sqlite3.connect(self.path) as c:
   d={'engine':'E4','plan_sha256':renewal.previous.PLAN_SHA256,'old_expires':renewal.previous.PLAN['old_expires'],'new_expires':renewal.PLAN['old_expires'],'cap_nano_usd':1000000000}
   c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(1,renewal.previous.EVENT,renewal.previous.PLAN_SHA256,'',json.dumps(d)))
   c.execute('UPDATE budget SET spent=1234567 WHERE id=1')
  self.p1=patch.object(renewal,'PATH',self.path);self.p2=patch.object(renewal,'check_context',lambda:None);self.p1.start();self.p2.start();self.now=renewal.PLAN['new_expires']-100
 def tearDown(self):self.p1.stop();self.p2.stop();self.tmp.cleanup()
 def row(self):
  with sqlite3.connect(self.path) as c:return c.execute('SELECT identity,cap,held,spent,expires,max_concurrent FROM budget').fetchone()
 def test_read_only_plan_does_not_mutate_any_database(self):
  before=self.path.read_bytes();out=renewal.renewal(now=self.now);self.assertEqual(out['status'],'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL');self.assertEqual(before,self.path.read_bytes());self.assertEqual(self.e2.read_bytes(),b'unchanged')
 def test_exact_approved_update_only_changes_expiry_and_audit(self):
  before=self.row();out=renewal.renewal(renewal.PLAN_SHA256,now=self.now);after=self.row();self.assertEqual(after,(*before[:4],renewal.PLAN['new_expires'],before[5]));self.assertFalse(out['budget_refilled']);self.assertFalse(out['original_requests_retried']);self.assertFalse(out['e2_accessed']);self.assertEqual(out['paid_ai_calls'],0);self.assertEqual(self.e2.read_bytes(),b'unchanged')
  with sqlite3.connect(self.path) as c:renewal.validate_prior_audit(c);renewal.validate_new_audit(c)
 def test_repeat_is_idempotent_without_second_event(self):
  renewal.renewal(renewal.PLAN_SHA256,now=self.now);before=self.path.read_bytes();out=renewal.renewal(renewal.PLAN_SHA256,now=self.now);self.assertEqual(out['status'],'ALREADY_RENEWED_NO_CHANGES');self.assertEqual(before,self.path.read_bytes())
 def test_wrong_plan_and_deadline_refuse_without_changes(self):
  before=self.path.read_bytes()
  with self.assertRaisesRegex(ValueError,'EXACT_PLAN'):renewal.renewal('wrong',now=self.now)
  with self.assertRaisesRegex(ValueError,'WINDOW_CLOSED'):renewal.renewal(renewal.PLAN_SHA256,now=renewal.PLAN['new_expires'])
  self.assertEqual(before,self.path.read_bytes())
 def test_held_budget_is_not_silently_released(self):
  with sqlite3.connect(self.path) as c:c.execute('UPDATE budget SET held=50000000')
  before=self.path.read_bytes()
  with self.assertRaisesRegex(ValueError,'RECONCILIATION'):renewal.renewal(renewal.PLAN_SHA256,now=self.now)
  self.assertEqual(before,self.path.read_bytes())
 def test_unknown_or_active_operation_blocks_renewal(self):
  for state,active in [('UNKNOWN',0),('RESERVED_INFLIGHT',1),('COMPLETED',1)]:
   with sqlite3.connect(self.path) as c:
    c.execute('DELETE FROM attempts');c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',('O-test','session','request',1,50000000,state,'{}',active,20))
   before=self.path.read_bytes()
   with self.assertRaisesRegex(ValueError,'UNRESOLVED_OR_ACTIVE'):renewal.renewal(renewal.PLAN_SHA256,now=self.now)
   self.assertEqual(before,self.path.read_bytes())
 def test_tampered_prior_and_new_audit_are_rejected(self):
  renewal.renewal(renewal.PLAN_SHA256,now=self.now)
  with sqlite3.connect(self.path) as c:c.execute('UPDATE events SET detail=? WHERE kind=?',('{}',renewal.EVENT))
  with self.assertRaisesRegex(ValueError,'AUDIT_MISMATCH'):renewal.renewal(now=self.now)
 def test_policy_retains_original_identity_and_refuses_unapproved_edits(self):
  policy,digest=runtime.load_policy();self.assertEqual(digest,renewal.POLICY_SHA256);original=renewal.original_policy(policy);self.assertEqual(runtime.settings_for(original).identity(),renewal.SPEC['identity']);self.assertEqual(policy['limits'],original['limits']);self.assertEqual(policy['total_usd'],original['total_usd'])
  for key,value in [('total_usd','2.00'),('model','another-model'),('expires_at','2026-11-17T23:59:00+08:00')]:
   changed=copy.deepcopy(policy);changed[key]=value
   with self.assertRaises(ValueError):renewal.original_policy(changed)
 def test_real_context_is_mandatory(self):
  self.p2.stop()
  with patch.dict('os.environ',{},clear=True):
   with self.assertRaisesRegex(ValueError,'PROTECTED_RENDER'):renewal.check_context()
  self.p2.start()

if __name__=='__main__':unittest.main()
