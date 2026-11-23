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
from gateway import e4_ledger_reconcile as operator
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import E4Error
import test_e4_readonly as readonly
import test_e4_controlled as helpers


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
            c.execute('UPDATE budget SET held=?,spent=? WHERE id=1', (50000000, 1706800))
            c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)', (p['operation_id'], 'SYNTHETIC_SUBJECT', 'SYNTHETIC_HASH', p['created'], p['reserved_nanos'], 'UNKNOWN', json.dumps(self.before_evidence), 0, p['lease_until']))
            c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)', (p['created'], 'DISPATCH_GRANTED', p['operation_id'], 'SYNTHETIC_SID', '{}'))

    def tearDown(self):
        self.temp.cleanup()

    def apply(self):
        return operator.reconcile(self.path, self.identity, operator.PLAN_SHA256, now=operator.PLAN['created'] + 100)

    def test_default_inspection_is_readonly_and_does_not_clear_global_guard(self):
        before = self.path.read_bytes()
        result = operator.reconcile(self.path, self.identity)
        self.assertEqual(result['status'], 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL')
        self.assertEqual(self.path.read_bytes(), before)
        with self.assertRaisesRegex(ValueError, 'OUTCOME_RECONCILIATION_REQUIRED'):
            self.ledger.reserve('I-fresh', 'subject', '.05', operator.PLAN['created'] + 60, 2)

    def test_full_reservation_is_consumed_without_increasing_available_budget(self):
        before = self.ledger.snapshot()
        result = self.apply()
        after = self.ledger.snapshot()
        self.assertEqual(result['status'], 'FULL_RESERVATION_ACCOUNTED_NO_RETRY')
        self.assertFalse(result['actual_charge_claimed'])
        self.assertEqual(after['spent_nanos'], 51706800)
        self.assertEqual(after['held_nanos'], 0)
        self.assertEqual(before['held_nanos'] + before['spent_nanos'], after['held_nanos'] + after['spent_nanos'])
        for name in ('cap_nanos', 'expires', 'max_concurrent'):
            self.assertEqual(before[name], after[name])
        self.assertEqual(result['budget_available_nanos_unchanged'], 948293200)

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
        self.assertEqual(self.ledger.snapshot()['spent_nanos'], 51706800)

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

    def test_new_request_may_reserve_but_original_is_never_replayed(self):
        self.apply()
        with self.assertRaisesRegex(ValueError, 'REQUEST_ALREADY_SEEN'):
            self.ledger.reserve(operator.PLAN['operation_id'], 'SYNTHETIC_SUBJECT', '.05', operator.PLAN['created'] + 60, 2, 'SYNTHETIC_HASH')
        self.ledger.reserve('I-new-operation', 'subject', '.05', operator.PLAN['created'] + 60, 2)
        self.assertEqual(self.ledger.snapshot()['held_nanos'], 50000000)

    def test_future_unknown_and_original_expiry_still_block_requests(self):
        self.apply()
        now = operator.PLAN['created'] + 60
        self.ledger.reserve('I-future-unknown', 'subject', '.05', now, 2)
        self.ledger.unknown('I-future-unknown', 'PROVIDER_TIMEOUT_RESERVATION_HELD', now)
        self.ledger.transport_done('I-future-unknown')
        with self.assertRaisesRegex(ValueError, 'OUTCOME_RECONCILIATION_REQUIRED'):
            self.ledger.reserve('I-blocked', 'subject', '.05', now + 60, 2)
        with self.assertRaisesRegex(ValueError, 'BUDGET_EXPIRED'):
            self.ledger.reserve('I-expired', 'subject', '.05', operator.PLAN['budget_before'][3], 2)


class RejectedUsageTests(unittest.TestCase):
    def setUp(self):
        self.helper = helpers.ControlledTests()
        self.helper.setUp()
        self.h = self.helper
        self.h.bootstrap()
        with patch.object(helpers.controlled.httpx, 'Client', side_effect=self.h.client_factory):
            self.state = self.h.load({'E4_LIVE_LEDGER_INITIALIZE': '0', 'AI_SPEND_APPROVED': '1', 'OPENAI_API_KEY': helpers.FAKE_KEY})
        self.s = self.state.service
        self.context = copy.deepcopy(readonly.FIXTURES['counts'])
        self.context['observed_at'] = int(self.h.now[0] * 1000)

    def tearDown(self):
        self.h.tearDown()

    def fake_result(self, change):
        original = self.h.fake_provider
        def fake(req):
            response = original(req)
            packet = response.json()
            change(packet)
            return helpers.httpx.Response(200, headers=response.headers, json=packet)
        self.s.client._transport.handler = fake

    def test_rejected_answer_charges_verified_usage_and_next_safe_call_works(self):
        def mutation(packet):
            result = json.loads(packet['output'][0]['content'][0]['text'])
            result['summary'] = '已修改委託單。'
            packet['output'][0]['content'][0]['text'] = json.dumps(result)
        self.fake_result(mutation)
        binding = self.h.binding()
        with self.assertRaisesRegex(E4Error, 'READONLY_OUTPUT_WRITE_CLAIM_REJECTED') as error:
            self.s.analyze(binding, '查詢委託單', 'I-reject-usage', 'GENERAL_CHAT', demo_context=self.context)
        self.assertEqual(error.exception.status, 502)
        self.assertEqual(error.exception.request_id, 'I-reject-usage')
        attempt = self.s.ledger.attempt('I-reject-usage')
        self.assertEqual(attempt['state'], 'OUTPUT_REJECTED_ACCOUNTED')
        self.assertFalse(attempt['evidence']['output_released'])
        self.assertEqual(attempt['evidence']['trace_id'], 'I-reject-usage')
        self.assertNotIn('summary', attempt['evidence'])
        self.assertNotIn(helpers.FAKE_KEY, json.dumps(attempt))
        self.assertEqual(attempt['evidence']['cost_usd'], '0.000028')
        self.assertEqual(self.s.ledger.snapshot()['spent_nanos'], 28000)
        self.assertEqual(self.s.ledger.snapshot()['held_nanos'], 0)
        self.assertEqual(len([x for x in self.h.calls if x[0] == 'POST']), 1)
        self.s.client._transport.handler = self.h.fake_provider
        response = self.s.analyze(binding, '你好', 'I-after-rejection', 'GENERAL_CHAT')
        self.assertEqual(response['history_turns_used'], 0)
        self.assertFalse(response['real_ai'])
        self.assertEqual(self.s.ledger.snapshot()['spent_nanos'], 56000)

    def test_invalid_usage_remains_unknown_and_blocks_every_new_dispatch(self):
        self.fake_result(lambda packet: packet['usage'].update(output_tokens=999999))
        with self.assertRaisesRegex(E4Error, 'PROVIDER_OUTPUT_REJECTED_RESERVATION_HELD'):
            self.s.analyze(self.h.binding(), '你好', 'I-bad-usage', 'GENERAL_CHAT')
        with self.assertRaisesRegex(E4Error, 'OUTCOME_RECONCILIATION_REQUIRED'):
            self.s.analyze(self.h.binding(), '你好', 'I-blocked', 'GENERAL_CHAT')
        self.assertEqual(len([x for x in self.h.calls if x[0] == 'POST']), 1)
        self.assertEqual(self.s.ledger.snapshot()['held_nanos'], 50000000)

    def test_accounting_failure_keeps_unknown_hold_and_does_not_release_answer(self):
        def mutation(packet):
            result = json.loads(packet['output'][0]['content'][0]['text'])
            result['summary'] = '已簽核。'
            packet['output'][0]['content'][0]['text'] = json.dumps(result)
        self.fake_result(mutation)
        with patch.object(self.s.ledger, 'settle_rejected_output', side_effect=sqlite3.OperationalError('LOCAL_TEST_FAILURE')):
            with self.assertRaisesRegex(E4Error, 'REJECTED_OUTPUT_ACCOUNTING_FAILED_RESERVATION_HELD'):
                self.s.analyze(self.h.binding(), '查詢', 'I-accounting-failure', 'GENERAL_CHAT', demo_context=self.context)
        self.assertEqual(self.s.ledger.attempt('I-accounting-failure')['state'], 'UNKNOWN')
        self.assertEqual(self.s.ledger.snapshot()['held_nanos'], 50000000)
        self.assertEqual(self.s.ledger.snapshot()['spent_nanos'], 0)

    def test_late_audit_failure_rolls_back_accounting_before_holding_unknown(self):
        def mutation(packet):
            result = json.loads(packet['output'][0]['content'][0]['text'])
            result['summary'] = '已修改委託單。'
            packet['output'][0]['content'][0]['text'] = json.dumps(result)
        self.fake_result(mutation)
        event = self.s.ledger._event
        def fail_audit(c, now, kind, operation, sid, detail):
            if kind == 'OUTPUT_REJECTED_USAGE_ACCOUNTED':
                raise sqlite3.OperationalError('LOCAL_TEST_LATE_AUDIT_FAILURE')
            return event(c, now, kind, operation, sid, detail)
        with patch.object(self.s.ledger, '_event', side_effect=fail_audit):
            with self.assertRaisesRegex(E4Error, 'REJECTED_OUTPUT_ACCOUNTING_FAILED_RESERVATION_HELD'):
                self.s.analyze(self.h.binding(), '查詢', 'I-rollback', 'GENERAL_CHAT', demo_context=self.context)
        self.assertEqual(self.s.ledger.snapshot()['spent_nanos'], 0)
        self.assertEqual(self.s.ledger.snapshot()['held_nanos'], 50000000)
        self.assertEqual(self.s.ledger.attempt('I-rollback')['state'], 'UNKNOWN')
        self.assertFalse(any(e['kind'] == 'OUTPUT_REJECTED_USAGE_ACCOUNTED' for e in self.s.ledger.events()))

    def test_http_refusal_preserves_trace_without_returning_rejected_output(self):
        from gateway.e4_preview_app import create_app
        def mutation(packet):
            result = json.loads(packet['output'][0]['content'][0]['text'])
            result['summary'] = '已簽核。'
            packet['output'][0]['content'][0]['text'] = json.dumps(result)
        self.fake_result(mutation)
        binding = self.h.binding()
        payload = base64.urlsafe_b64encode(json.dumps(binding, separators=(',', ':')).encode()).decode().rstrip('=')
        signature = base64.urlsafe_b64encode(hmac.new(helpers.LIVE_KEY.encode(), ('E4_SESSION_V2.' + payload).encode(), hashlib.sha256).digest()).decode().rstrip('=')
        headers = {'X-Preview-Gateway': helpers.LIVE_KEY, 'X-Preview-Session': payload + '.' + signature, 'X-Preview-System': 'lms', 'X-Demo-Actor': 'level1', 'X-Preview-Request-ID': 'I-http-output-rejection'}
        async def run():
            app = create_app(self.s, helpers.LIVE_KEY, clock=lambda: self.h.now[0])
            async with helpers.httpx.AsyncClient(transport=helpers.httpx.ASGITransport(app=app), base_url='http://test') as client:
                response = await client.post('/__integration_demo/ui/live/E4', headers=headers, json={'synthetic': True, 'question': '查詢', 'mode': 'GENERAL_CHAT', 'demo_context': self.context})
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json()['error']['code'], 'READONLY_OUTPUT_WRITE_CLAIM_REJECTED')
                self.assertEqual(response.headers['X-Trace-ID'], 'I-http-output-rejection')
                self.assertNotIn('已簽核', response.text)
                self.assertNotIn('data', response.json())
                self.assertNotIn(helpers.LIVE_KEY, response.text)
                self.assertNotIn(helpers.FAKE_KEY, response.text)
        asyncio.run(run())
        self.assertEqual(self.s.ledger.snapshot()['spent_nanos'], 28000)


if __name__ == '__main__':
    unittest.main(verbosity=2)
