"""Timeout-only approval preserves the exact original durable budget binding."""
import copy
import hashlib
import json
import threading
import unittest
from dataclasses import replace
from datetime import timedelta, date
from types import SimpleNamespace
from unittest.mock import patch
import httpx
import test_e2_scheduling as helpers
from gateway import e2_controlled_provider as loader
from gateway import e2_preview_provider as provider_module
from gateway.e2_scheduling import evaluate
from gateway.e4_preview_provider import E4Error


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads(loader.POLICY_PATH.read_text())

    def test_only_execution_deadline_changes_original_storage_identity_is_retained(self):
        current = loader.settings_for(self.policy)
        original, digest = loader.ledger_binding_for_policy(self.policy)
        self.assertEqual(current.request_timeout, 30)
        self.assertEqual(original.request_timeout, 20)
        self.assertEqual(digest, loader.ORIGINAL_BUDGET_POLICY_SHA256)
        self.assertEqual(replace(current, request_timeout=20), original)
        self.assertNotEqual(current.identity(), original.identity())
        self.assertEqual(original.call_cap, current.call_cap)
        self.assertEqual(original.total_cap, current.total_cap)
        self.assertEqual(original.expires, current.expires)

    def test_budget_deadline_price_round_and_approval_changes_cannot_alias_old_ledger(self):
        for group, key, value in [(None, 'total_usd', '2.00'), (None, 'per_call_usd', '0.10'),
                (None, 'expires_at', '2026-11-14T23:59:00+08:00'), (None, 'approval_id', 'E2-OTHER'),
                (None, 'input_usd_per_million', '0.01'), ('limits', 'max_output_tokens', 999),
                ('evidence', 'user_budget', 'DIFFERENT_APPROVAL')]:
            with self.subTest(key=key):
                p = copy.deepcopy(self.policy)
                (p[group] if group else p)[key] = value
                with self.assertRaisesRegex(E4Error, 'E2_ORIGINAL_BUDGET_BINDING_REQUIRED'):
                    loader.ledger_binding_for_policy(p)

    def test_timeout_above_reviewed_value_is_not_accepted(self):
        for timeout in [0, 21, 45, 300, True]:
            p = copy.deepcopy(self.policy)
            p['limits']['request_timeout_seconds'] = timeout
            with self.assertRaisesRegex(E4Error, 'E2_EXECUTION_TIMEOUT_POLICY_REQUIRED'):
                loader.ledger_binding_for_policy(p)


class DurableReopenTests(unittest.TestCase):
    def setUp(self):
        self.h = helpers.LoaderTests()
        self.h.setUp()

    def tearDown(self):
        self.h.tearDown()

    def test_new_hash_is_required_and_original_approval_cannot_enable_new_timeout(self):
        h = self.h
        state = h.load({'E2_RELEASE_POLICY_SHA256': loader.ORIGINAL_BUDGET_POLICY_SHA256})
        self.assertIsNone(state.ledger)
        self.assertIsNone(state.service)
        self.assertFalse(h.h.calls)

    def test_restart_keeps_identity_spent_held_unknown_and_old_initialization_audit(self):
        h = self.h
        state = h.load()
        self.assertEqual(state.service.settings.request_timeout, 30)
        identity = state.ledger.identity
        original, digest = loader.ledger_binding_for_policy(json.loads(loader.POLICY_PATH.read_text()))
        self.assertEqual(identity, original.identity())
        state.ledger.reserve('I-SYNTH-SPENT', 'synthetic', '.05', h.h.now[0], 2)
        state.ledger.transport_done('I-SYNTH-SPENT')
        state.ledger.settle('I-SYNTH-SPENT', '.001', {'synthetic': True})
        state.ledger.reserve('I-SYNTH-UNKNOWN', 'synthetic', '.05', h.h.now[0]+61, 2)
        state.ledger.unknown('I-SYNTH-UNKNOWN', 'PROVIDER_DEADLINE_OUTCOME_UNKNOWN', h.h.now[0]+61)
        state.ledger.transport_done('I-SYNTH-UNKNOWN')
        before = state.ledger.snapshot()
        audit = h.authority.events('E2-PREVIEW-20261113-US1')
        self.assertTrue(all(event['detail']['policy_sha256'] == digest for event in audit))
        state.close()
        reopened = h.load()
        self.assertFalse(reopened.initialized)
        self.assertEqual(reopened.ledger.identity, identity)
        self.assertEqual(reopened.ledger.snapshot(), before)
        self.assertEqual(h.authority.events('E2-PREVIEW-20261113-US1'), audit)
        self.assertEqual(reopened.ledger.attempt('I-SYNTH-UNKNOWN')['state'], 'UNKNOWN')
        with self.assertRaisesRegex(ValueError, 'OUTCOME_RECONCILIATION_REQUIRED'):
            reopened.ledger.reserve('I-NO-RETRY', 'synthetic', '.05', h.h.now[0]+122, 2)
        self.assertFalse(any(method == 'POST' for method, url in h.h.calls))


class StableFormatAndDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.h = helpers.ProviderTests()
        self.h.setUp()

    def tearDown(self):
        self.h.tearDown()

    def test_private_output_schema_does_not_change_with_verified_candidate_ids(self):
        h = self.h
        h.call()
        first = json.loads(h.calls[0].content)
        h.context['request']['earliest'] = (date.fromisoformat(h.context['request']['earliest'])+timedelta(days=1)).isoformat()
        h.call('O-SECOND-SYNTHETIC')
        second = json.loads(h.calls[1].content)
        self.assertNotEqual(json.loads(first['input'])['assessment']['candidates'], json.loads(second['input'])['assessment']['candidates'])
        self.assertEqual(first['text']['format'], second['text']['format'])

    def test_correctly_shaped_foreign_candidate_id_still_fails_membership(self):
        h = self.h
        original = h.fake
        def foreign(request):
            response = original(request)
            packet = response.json()
            packet['output'][0]['content'][0]['text'] = '{"selected_candidate_id":"P-00000000000000000000"}'
            return httpx.Response(200, headers=response.headers, json=packet)
        h.client._transport.handler = foreign
        with self.assertRaisesRegex(E4Error, 'E2_OUTPUT_REJECTED'):
            h.call()
        self.assertEqual(h.ledger.attempt('O-local-1')['state'], 'OUTPUT_REJECTED_ACCOUNTED')
        self.assertEqual(len(h.calls), 1)

    def test_twenty_one_second_response_fits_new_thirty_second_deadline_without_retry(self):
        h = self.h
        h.provider.settings = replace(h.cfg, request_timeout=30)
        moments = iter([0, 21])
        with patch.object(provider_module, 'time', SimpleNamespace(monotonic=lambda: next(moments))):
            result = h.call()
        self.assertEqual(result['execution_mode'], 'MOCK')
        self.assertFalse(result['real_ai'])
        self.assertEqual(len(h.calls), 1)
        self.assertEqual(h.ledger.snapshot()['held_nanos'], 0)
        with h.ledger.connect() as c:
            created, lease = c.execute('SELECT created,lease_until FROM attempts WHERE trace=?', ('O-local-1',)).fetchone()
        self.assertEqual(lease-created, 35)

    def test_over_thirty_seconds_remains_unknown_and_blocks_new_dispatch(self):
        h = self.h
        h.provider.settings = replace(h.cfg, request_timeout=30)
        entered, release = threading.Event(), threading.Event()
        original = h.fake
        def delayed(request):
            entered.set()
            release.wait(2)
            return original(request)
        h.client._transport.handler = delayed
        count = [0]
        def monotonic():
            count[0] += 1
            if count[0] == 1:
                return 0
            self.assertTrue(entered.wait(2))
            return 31
        try:
            with patch.object(provider_module, 'time', SimpleNamespace(monotonic=monotonic)):
                with self.assertRaisesRegex(E4Error, 'PROVIDER_DEADLINE_OUTCOME_UNKNOWN'):
                    h.call()
        finally:
            release.set()
            h.provider.executor.shutdown(wait=True)
        self.assertEqual(h.ledger.attempt('O-local-1')['state'], 'UNKNOWN')
        self.assertEqual(h.ledger.snapshot()['held_nanos'], 50000000)
        with self.assertRaisesRegex(E4Error, 'OUTCOME_RECONCILIATION_REQUIRED'):
            h.call('O-DO-NOT-RETRY')
        self.assertEqual(len(h.calls), 1)


if __name__ == '__main__':
    unittest.main()
