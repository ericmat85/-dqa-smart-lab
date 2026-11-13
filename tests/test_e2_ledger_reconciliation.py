"""Synthetic local ledgers and Fake HTTP only; never use the mounted cloud ledger."""
import asyncio
import base64
import copy
import hashlib
import hmac
import json
import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[1] / 'render-backend'))
from gateway import e2_ledger_reconcile as operator
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import E4Error


class StrictLedger(Ledger):
    require_unknown_reconciliation = True


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'budget.sqlite'
        self.identity = 'SYNTHETIC_LOCAL_TEST_IDENTITY'
        p = operator.PLAN
        Ledger.initialize_local_or_operator(self.path, self.identity, '1.00', p['budget_before'][3], 1)
        self.ledger = StrictLedger(self.path, self.identity)
        self.before_evidence = {'trace_id': p['trace_id'], 'error_code': p['error_code'], 'outcome': 'UNKNOWN', 'reservation': 'HELD', 'dispatch_sequence': 1}
        with self.ledger.connect() as c:
            c.execute('UPDATE budget SET held=?,spent=? WHERE id=1', (50000000, 0))
            c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)', (p['operation_id'], 'SYNTHETIC_SUBJECT', 'SYNTHETIC_HASH', (p['created_min'] + 1), p['reserved_nanos'], 'UNKNOWN', json.dumps(self.before_evidence), 0, (p['created_min'] + 26)))
            c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)', ((p['created_min'] + 1), 'DISPATCH_GRANTED', p['operation_id'], 'SYNTHETIC_SID', '{}'))

    def tearDown(self):
        self.temp.cleanup()

    def apply(self):
        return operator.reconcile(self.path, self.identity, operator.PLAN_SHA256, now=(operator.PLAN['created_min'] + 1) + 100)

    def test_default_inspection_is_readonly_and_does_not_clear_global_guard(self):
        before = self.path.read_bytes()
        result = operator.reconcile(self.path, self.identity)
        self.assertEqual(result['status'], 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL')
        self.assertEqual(self.path.read_bytes(), before)
        with self.assertRaisesRegex(ValueError, 'OUTCOME_RECONCILIATION_REQUIRED'):
            self.ledger.reserve('I-fresh', 'subject', '.05', (operator.PLAN['created_min'] + 1) + 60, 2)

    def test_full_reservation_is_consumed_without_increasing_available_budget(self):
        before = self.ledger.snapshot()
        result = self.apply()
        after = self.ledger.snapshot()
        self.assertEqual(result['status'], 'FULL_RESERVATION_ACCOUNTED_NO_RETRY')
        self.assertFalse(result['actual_charge_claimed'])
        self.assertEqual(after['spent_nanos'], 50000000)
        self.assertEqual(after['held_nanos'], 0)
        self.assertEqual(before['held_nanos'] + before['spent_nanos'], after['held_nanos'] + after['spent_nanos'])
        for name in ('cap_nanos', 'expires', 'max_concurrent'):
            self.assertEqual(before[name], after[name])
        self.assertEqual(result['budget_available_nanos_unchanged'], 950000000)

    def test_original_unknown_evidence_and_append_only_audit_are_retained(self):
        self.apply()
        attempt = self.ledger.attempt(operator.PLAN['operation_id'])
        self.assertEqual(attempt['state'], operator.FINAL_STATE)
        for key, value in self.before_evidence.items():
            self.assertEqual(attempt['evidence'][key], value)
        self.assertFalse(attempt['evidence']['operator_reconciliation']['actual_usage_known'])
        event = self.ledger.events(operator.PLAN['operation_id'])[-1]
        self.assertEqual(event['kind'], operator.EVENT)
        self.assertEqual(event['detail']['original_state'], 'UNKNOWN')
        self.assertEqual(event['detail']['original_evidence'], self.before_evidence)

    def test_repeated_and_concurrent_apply_cannot_double_account(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: self.apply()['status'], range(2)))
        self.assertEqual(sorted(results), ['ALREADY_ACCOUNTED_NO_CHANGES', 'FULL_RESERVATION_ACCOUNTED_NO_RETRY'])
        before = self.path.read_bytes()
        self.assertEqual(self.apply()['status'], 'ALREADY_ACCOUNTED_NO_CHANGES')
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.ledger.snapshot()['spent_nanos'], 50000000)

    def test_wrong_approval_or_identity_never_modifies_ledger(self):
        before = self.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'EXACT_PLAN_APPROVAL_REQUIRED'):
            operator.reconcile(self.path, self.identity, 'NOT_APPROVED')
        with self.assertRaisesRegex(ValueError, 'LEDGER_IDENTITY_MISMATCH'):
            operator.reconcile(self.path, 'OTHER', operator.PLAN_SHA256)
        self.assertEqual(self.path.read_bytes(), before)

    def test_changed_budget_or_operation_fails_closed(self):
        for sql in ["UPDATE budget SET cap=2000000000", "UPDATE budget SET spent=1800000", "UPDATE attempts SET reserved=40000000", "UPDATE attempts SET evidence='{}'"]:
            with self.subTest(sql=sql):
                with self.ledger.connect() as c:
                    original = list(c.execute('SELECT * FROM budget'))
                    attempt = list(c.execute('SELECT * FROM attempts'))
                    c.execute(sql)
                before = self.path.read_bytes()
                with self.assertRaises(ValueError):
                    self.apply()
                self.assertEqual(self.path.read_bytes(), before)
                with self.ledger.connect() as c:
                    c.execute('DELETE FROM budget')
                    c.executemany('INSERT INTO budget VALUES(?,?,?,?,?,?,?)', original)
                    c.execute('DELETE FROM attempts')
                    c.executemany('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)', attempt)

    def test_active_or_additional_unknown_requests_are_not_cleared(self):
        with self.ledger.connect() as c:
            c.execute('INSERT INTO attempts SELECT ?,session_hash,request_hash,created,reserved,state,evidence,active,lease_until FROM attempts', ('I-extra',))
        with self.assertRaisesRegex(ValueError, 'ADDITIONAL_UNKNOWN_OPERATION_PRESENT'):
            self.apply()
        with self.ledger.connect() as c:
            c.execute('UPDATE attempts SET active=1 WHERE trace=?', ('I-extra',))
        with self.assertRaisesRegex(ValueError, 'ACTIVE_OPERATION_PRESENT'):
            self.apply()
        self.assertEqual(self.ledger.snapshot()['held_nanos'], 50000000)

    def test_missing_dispatch_proof_is_not_guessed_as_free_or_sent(self):
        with self.ledger.connect() as c:
            c.execute('DELETE FROM events')
        before = self.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'DISPATCH_EVIDENCE_REQUIRED'):
            self.apply()
        self.assertEqual(self.path.read_bytes(), before)

    def test_wrong_time_window_or_live_lease_is_never_reconciled(self):
        with self.assertRaisesRegex(ValueError,'OPERATION_LEASE_NOT_EXPIRED'):
            operator.reconcile(self.path,self.identity,operator.PLAN_SHA256,now=operator.PLAN['created_min']+2)
        with self.ledger.connect() as c:
            c.execute('UPDATE attempts SET created=?,lease_until=?',(operator.PLAN['created_min']-100,operator.PLAN['created_min']-75))
        before=self.path.read_bytes()
        with self.assertRaisesRegex(ValueError,'EXACT_OPERATION_EVIDENCE_MISMATCH'):self.apply()
        self.assertEqual(self.path.read_bytes(),before)

    def test_e4_ledger_cannot_be_used_instead_of_the_fixed_e2_identity(self):
        before=self.path.read_bytes()
        with self.assertRaisesRegex(ValueError,'LEDGER_IDENTITY_MISMATCH'):
            operator.reconcile(self.path,'E4-LIVE-20261112-US1',operator.PLAN_SHA256)
        self.assertEqual(self.path.read_bytes(),before)

    def test_new_request_may_reserve_but_original_is_never_replayed(self):
        self.apply()
        with self.assertRaisesRegex(ValueError, 'REQUEST_ALREADY_SEEN'):
            self.ledger.reserve(operator.PLAN['operation_id'], 'SYNTHETIC_SUBJECT', '.05', (operator.PLAN['created_min'] + 1) + 60, 2, 'SYNTHETIC_HASH')
        self.ledger.reserve('I-new-operation', 'subject', '.05', (operator.PLAN['created_min'] + 1) + 60, 2)
        self.assertEqual(self.ledger.snapshot()['held_nanos'], 50000000)

    def test_future_unknown_and_original_expiry_still_block_requests(self):
        self.apply()
        now = (operator.PLAN['created_min'] + 1) + 60
        self.ledger.reserve('I-future-unknown', 'subject', '.05', now, 2)
        self.ledger.unknown('I-future-unknown', 'PROVIDER_TIMEOUT_RESERVATION_HELD', now)
        self.ledger.transport_done('I-future-unknown')
        with self.assertRaisesRegex(ValueError, 'OUTCOME_RECONCILIATION_REQUIRED'):
            self.ledger.reserve('I-blocked', 'subject', '.05', now + 60, 2)
        with self.assertRaisesRegex(ValueError, 'BUDGET_EXPIRED'):
            self.ledger.reserve('I-expired', 'subject', '.05', operator.PLAN['budget_before'][3], 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
