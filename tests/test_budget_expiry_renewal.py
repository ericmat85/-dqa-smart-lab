"""Offline expiry renewal: existing budgets only; no network or paid requests."""
import copy
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'render-backend'))
import httpx
from gateway import budget_expiry_renewal as renewal
from gateway import e4_controlled_provider as e4
from gateway import e2_controlled_provider as e2
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import E4Error

REAL_PATH = Path
REAL_CLIENT = httpx.Client
POLICIES = {engine: json.loads((Path(__file__).parents[1] / 'render-backend/gateway' / (engine.lower() + '_live_policy.json')).read_bytes()) for engine in renewal.ENGINES}

# These are regression fixtures for the already-approved 11/14 operator, not the new runtime policy.
if POLICIES['E4']['expires_at']=='2026-11-16T23:59:00+08:00':
    from gateway.e4_budget_renewal_20261116 import original_policy as original_20261116
    previous_e4=original_20261116(POLICIES['E4'])
    previous_e4['expires_at']=renewal.NEW_EXPIRY
    previous_e4['evidence']['user_budget']=renewal.NEW_REFERENCE
    assert hashlib.sha256(renewal.canonical(previous_e4)).hexdigest()==renewal.ENGINES['E4']['renewed_sha256']
    POLICIES['E4']=previous_e4


class RenewalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.gateway = self.root / 'gateway'
        self.gateway.mkdir()
        self.paths = {}
        self.plan = copy.deepcopy(renewal.PLAN)
        self.states = []
        self.calls = []
        self.now = renewal.PLAN['old_expires'] + 3600
        self.env = {'RENDER': 'true', 'RENDER_SERVICE_ID': renewal.SERVICE, 'AI_SPEND_APPROVED': '1', 'E2_SPEND_APPROVED': '1', 'E4_LIVE_LEDGER_INITIALIZE': '0', 'E2_LEDGER_INITIALIZE': '1', 'LIVE_PROVIDER_ENABLED': 'false', 'LIVE_AI_ENABLED': 'false', 'OPENAI_API_KEY': 'FAKE_OFFLINE_NOT_A_CREDENTIAL'}
        for engine, spec in renewal.ENGINES.items():
            directory = self.root / 'live' / spec['round']
            directory.mkdir(mode=0o700, parents=True)
            db = directory / 'budget.sqlite'
            self.paths[engine] = db
            self.plan['ledgers'][engine]['path'] = str(db)
            Ledger.initialize_local_or_operator(db, spec['identity'], '1.00', renewal.PLAN['old_expires'])
            with sqlite3.connect(db) as c:
                c.execute('UPDATE budget SET spent=? WHERE id=1', (51706800 if engine == 'E4' else 100883600,))
                c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)', ('O-ALREADY-ACCOUNTED', 'synthetic', 'synthetic', 1, 50000000, 'UNKNOWN_COST_ACCOUNTED_AT_CAP', '{"actual_usage_known":false}', 0, 26))
                c.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', ('synthetic-session', 'DEMO-LEVEL1', 'lms', 'level1', self.now * 1000, 3, 1))
            (self.gateway / (engine.lower() + '_live_policy.json')).write_bytes(renewal.canonical(POLICIES[engine]))
            self.env[engine + '_RELEASE_POLICY_SHA256'] = spec['renewed_sha256']
        expected = {'policy_sha256': renewal.ENGINES['E2']['original_sha256'], 'ledger_identity': renewal.ENGINES['E2']['identity'], 'ledger_path': str(self.paths['E2'])}
        with sqlite3.connect(self.paths['E4']) as c:
            for kind in ('E2_INITIALIZATION_RESERVED', 'E2_INITIALIZATION_COMPLETE'):
                c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)', (1, kind, renewal.ENGINES['E2']['round'], '', json.dumps(expected)))
        self.patches = [patch.object(renewal, 'MOUNT', str(self.root)), patch.object(renewal, 'PLAN', self.plan), patch.dict(os.environ, self.env, clear=True), patch.object(renewal.os.path, 'ismount', side_effect=lambda value: REAL_PATH(value) == self.root), patch.object(renewal.Path, 'cwd', return_value=self.root)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for state in self.states:
            state.close()
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def snapshot(self):
        result = {}
        for engine, path in self.paths.items():
            with sqlite3.connect(path) as c:
                result[engine] = {table: c.execute('SELECT * FROM ' + table).fetchall() for table in ('budget', 'attempts', 'sessions', 'events')}
        return result

    def run_renewal(self, approved=True):
        return renewal.renewal(renewal.PLAN_SHA256 if approved else None, now=self.now)

    def test_read_only_inspection_changes_no_file_bytes(self):
        before = {engine: path.read_bytes() for engine, path in self.paths.items()}
        result = self.run_renewal(False)
        self.assertEqual(result['status'], 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL')
        self.assertEqual(before, {engine: path.read_bytes() for engine, path in self.paths.items()})
        self.assertEqual(result['paid_ai_calls'], 0)

    def test_atomic_renewal_preserves_money_identity_history_sessions_and_existing_accounted_unknown(self):
        before = self.snapshot()
        result = self.run_renewal()
        after = self.snapshot()
        self.assertEqual(result['status'], 'EXPIRY_EXTENDED_BOTH_NO_REFILL_NO_RETRY')
        for engine in before:
            self.assertEqual(before[engine]['attempts'], after[engine]['attempts'])
            self.assertEqual(before[engine]['sessions'], after[engine]['sessions'])
            b, a = before[engine]['budget'][0], after[engine]['budget'][0]
            self.assertEqual(a, (*b[:3], renewal.PLAN['new_expires'], *b[4:]))
            self.assertEqual(after[engine]['events'][:-1], before[engine]['events'])
            self.assertEqual(result['budgets'][engine]['available_nano_usd'], 1000000000 - b[5])
        again = self.snapshot()
        self.assertEqual(self.run_renewal()['status'], 'ALREADY_RENEWED_NO_CHANGES')
        self.assertEqual(self.snapshot(), again)

    def test_failure_in_second_ledger_rolls_back_first_deadline_and_audit(self):
        with sqlite3.connect(self.paths['E2']) as c:
            c.execute("CREATE TRIGGER offline_failure BEFORE UPDATE OF expires ON budget BEGIN SELECT RAISE(ABORT,'OFFLINE_FAULT'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.Error):
            self.run_renewal()
        self.assertEqual(self.snapshot(), before)

    def test_exhausted_budget_stays_exhausted_after_renewal_and_deadline_still_enforced(self):
        for engine, path in self.paths.items():
            with sqlite3.connect(path) as c:
                c.execute('UPDATE budget SET spent=cap')
        self.run_renewal()
        for engine, path in self.paths.items():
            ledger = Ledger(path, renewal.ENGINES[engine]['identity'])
            with self.assertRaisesRegex(ValueError, 'TOTAL_BUDGET_LIMIT'):
                ledger.reserve('I-OFFLINE-EXHAUSTED', 'SYNTHETIC', '.05', self.now, 2)
            with self.assertRaisesRegex(ValueError, 'BUDGET_EXPIRED'):
                ledger.reserve('I-OFFLINE-EXPIRED', 'SYNTHETIC', '.05', renewal.PLAN['new_expires'], 2)
            self.assertEqual(ledger.snapshot()['spent_nanos'], 1000000000)
            self.assertEqual(ledger.snapshot()['held_nanos'], 0)

    def test_process_crash_before_second_database_update_recovers_both_original_budgets(self):
        before = self.snapshot()
        original = sqlite3.connect
        def connect(*args, **kwargs):
            c = original(*args, **kwargs)
            c.set_trace_callback(lambda sql: os._exit(17) if sql.startswith('UPDATE e2.budget') else None)
            return c
        pid = os.fork()
        if pid == 0:
            with patch.object(renewal.sqlite3, 'connect', side_effect=connect):
                self.run_renewal()
            os._exit(18)
        _, code = os.waitpid(pid, 0)
        self.assertEqual(os.waitstatus_to_exitcode(code), 17)
        self.assertEqual(self.snapshot(), before)

    def test_wrong_plan_or_expired_or_premature_window_never_changes_budget(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'EXACT_PLAN_APPROVAL_REQUIRED'):
            renewal.renewal('WRONG', self.now)
        for now in (renewal.PLAN['old_expires'] - 1, renewal.PLAN['new_expires'], float('nan')):
            with self.assertRaisesRegex(ValueError, 'RENEWAL_WINDOW_CLOSED'):
                renewal.renewal(renewal.PLAN_SHA256, now)
        self.assertEqual(self.snapshot(), before)

    def test_pending_unknown_active_or_held_reservations_block_without_reconciliation(self):
        for state, active, held in (('UNKNOWN', 0, 0), ('SUCCESS', 1, 0), ('RESERVED_INFLIGHT', 0, 0), ('SUCCESS', 0, 1)):
            with self.subTest(state=state, active=active, held=held):
                with sqlite3.connect(self.paths['E2']) as c:
                    c.execute('UPDATE attempts SET state=?,active=?', (state, active))
                    c.execute('UPDATE budget SET held=?', (held,))
                before = self.snapshot()
                with self.assertRaisesRegex(ValueError, 'UNRESOLVED_OR_ACTIVE_OPERATION|HELD_RESERVATION_REQUIRES_RECONCILIATION'):
                    self.run_renewal()
                self.assertEqual(self.snapshot(), before)

    def test_missing_ledger_or_authority_marker_cannot_reinitialize(self):
        db = self.paths['E2']
        db.rename(db.with_suffix('.preserved'))
        with self.assertRaisesRegex(ValueError, 'EXISTING_LEDGER_REQUIRED'):
            self.run_renewal()
        self.assertFalse(db.exists())
        db.with_suffix('.preserved').rename(db)
        with sqlite3.connect(self.paths['E4']) as c:
            c.execute('DELETE FROM events')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'E2_ORIGINAL_INITIALIZATION_REQUIRED'):
            self.run_renewal()
        self.assertEqual(self.snapshot(), before)

    def test_wrong_identity_cap_or_permissions_and_symlinks_are_rejected(self):
        for field, value in (('cap', 2000000000), ('identity', 'OTHER-BUDGET')):
            with self.subTest(field=field):
                with sqlite3.connect(self.paths['E4']) as c:
                    c.execute('UPDATE budget SET ' + field + '=?', (value,))
                before = self.snapshot()
                with self.assertRaisesRegex(ValueError, 'BUDGET_IDENTITY_OR_CAP_MISMATCH'):
                    self.run_renewal()
                self.assertEqual(self.snapshot(), before)
                with sqlite3.connect(self.paths['E4']) as c:
                    c.execute('UPDATE budget SET cap=1000000000,identity=?', (renewal.ENGINES['E4']['identity'],))
        path = self.paths['E2']
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'PRIVATE_LEDGER_REQUIRED'):
            self.run_renewal()
        path.chmod(0o600)
        preserved = path.with_suffix('.preserved')
        path.rename(preserved)
        path.symlink_to(preserved)
        with self.assertRaisesRegex(ValueError, 'LEDGER_SYMLINK_DENIED'):
            self.run_renewal()

    def test_partial_or_unaudited_manual_deadline_change_is_never_adopted(self):
        with sqlite3.connect(self.paths['E4']) as c:
            c.execute('UPDATE budget SET expires=?', (renewal.PLAN['new_expires'],))
        with self.assertRaisesRegex(ValueError, 'PARTIAL_OR_UNEXPECTED_RENEWAL'):
            self.run_renewal()
        with sqlite3.connect(self.paths['E2']) as c:
            c.execute('UPDATE budget SET expires=?', (renewal.PLAN['new_expires'],))
        with self.assertRaisesRegex(ValueError, 'RENEWAL_AUDIT_REQUIRED'):
            self.run_renewal()

    def test_wal_and_untrusted_environment_or_policy_are_rejected(self):
        with patch.dict(os.environ, {'RENDER_SERVICE_ID': 'OTHER'}):
            with self.assertRaisesRegex(ValueError, 'PROTECTED_RENDER_CONTEXT_REQUIRED'):
                self.run_renewal()
        p = self.gateway / 'e4_live_policy.json'
        original = p.read_bytes()
        p.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'DEPLOYED_POLICY_MISMATCH'):
            self.run_renewal()
        p.write_bytes(original)
        with sqlite3.connect(self.paths['E2']) as c:
            c.execute('PRAGMA journal_mode=WAL')
        with self.assertRaisesRegex(ValueError, 'ATOMIC_ROLLBACK_JOURNAL_REQUIRED'):
            self.run_renewal()
        with self.assertRaisesRegex(ValueError, 'ATOMIC_ROLLBACK_JOURNAL_REQUIRED'):
            self.run_renewal(False)

    def test_policy_binding_rejects_other_limits_or_budget_changes(self):
        for engine in ('E4', 'E2'):
            self.assertEqual(e4.settings_for(renewal.original_policy(POLICIES[engine], engine)).identity(), renewal.ENGINES[engine]['identity'])
            for field, value in (('total_usd', '2.00'), ('approval_id', 'NEW-REFILL-ROUND'), ('expires_at', '2026-11-15T23:59:00+08:00')):
                altered = copy.deepcopy(POLICIES[engine])
                altered[field] = value
                with self.assertRaisesRegex(ValueError, 'EXACT_RENEWAL_POLICY_REQUIRED'):
                    renewal.original_policy(altered, engine)

    def clients(self, **kwargs):
        def response(request):
            self.calls.append((request.method, str(request.url)))
            if request.method != 'GET':
                raise AssertionError('NO_MODEL_INFERENCE_IN_RENEWAL_TESTS')
            return httpx.Response(200, json={'id': 'gpt-6-luna'})
        return REAL_CLIENT(transport=httpx.MockTransport(response), **kwargs)

    def load_pair(self, changes=None):
        env = {**self.env, **(changes or {})}
        mapped = lambda value: REAL_PATH(str(value).replace('/var/data/e4-mock', str(self.root)))
        with patch.object(e4, 'Path', side_effect=mapped), patch.object(e2, 'Path', side_effect=mapped), patch.object(e4, 'POLICY_PATH', self.gateway / 'e4_live_policy.json'), patch.object(e2, 'POLICY_PATH', self.gateway / 'e2_live_policy.json'), patch.object(e4.httpx, 'Client', side_effect=self.clients):
            a = e4.load_provider(env, clock=lambda: self.now)
            self.states.append(a)
            b = e2.load_e2_provider(env, a.ledger, clock=lambda: self.now)
            self.states.append(b)
            return a, b

    def test_both_runtime_loaders_reopen_original_ledgers_with_only_mock_metadata_no_inference(self):
        self.run_renewal()
        before = self.snapshot()
        a, b = self.load_pair()
        for engine, state in (('E4', a), ('E2', b)):
            self.assertFalse(state.initialized)
            self.assertIsNotNone(state.service)
            self.assertEqual(state.ledger.identity, renewal.ENGINES[engine]['identity'])
            self.assertEqual(state.service.settings.expires, renewal.PLAN['new_expires'])
            self.assertEqual(str(state.service.settings.call_cap), '0.05')
            self.assertEqual(str(state.service.settings.total_cap), '1.00')
            self.assertEqual(state.service.settings.max_concurrent, 1)
            self.assertEqual(state.service.settings.rate, 2)
            self.assertEqual(state.service.settings.request_timeout, 20 if engine == 'E4' else 30)
        self.assertEqual(self.calls, [('GET', 'https://api.openai.com/v1/models/gpt-6-luna')] * 2)
        self.assertEqual(self.snapshot(), before)

    def test_runtime_requires_migration_and_cannot_bootstrap_a_new_round(self):
        with self.assertRaisesRegex(ValueError, 'RENEWAL_AUDIT_REQUIRED'):
            self.load_pair()
        self.assertFalse(self.calls)
        self.run_renewal()
        with self.assertRaisesRegex(E4Error, 'RENEWAL_CANNOT_INITIALIZE_LEDGER'):
            self.load_pair({'E4_LIVE_LEDGER_INITIALIZE': '1'})
        self.paths['E2'].unlink()
        with self.assertRaisesRegex(E4Error, 'RENEWAL_EXISTING_LEDGER_REQUIRED'):
            self.load_pair()
        self.assertFalse(self.paths['E2'].exists())

    def test_runtime_wrong_hash_or_unapproved_flags_never_make_paid_requests(self):
        self.run_renewal()
        a, b = self.load_pair({'E4_RELEASE_POLICY_SHA256': 'OLD', 'E2_RELEASE_POLICY_SHA256': 'OLD'})
        self.assertIsNone(a.service)
        self.assertIsNone(b.service)
        self.assertFalse(self.calls)
        a, b = self.load_pair({'AI_SPEND_APPROVED': '0', 'E2_SPEND_APPROVED': '0'})
        self.assertIsNone(a.service)
        self.assertIsNone(b.service)
        self.assertFalse(self.calls)

    def test_runtime_new_expiry_refuses_provider_and_old_environment_hash_does_not_approve_new_policy(self):
        self.run_renewal()
        self.now = renewal.PLAN['new_expires']
        a, b = self.load_pair()
        self.assertEqual((a.code, b.code), ('BUDGET_EXPIRED', 'BUDGET_EXPIRED'))
        self.assertFalse(self.calls)


if __name__ == '__main__':
    unittest.main(verbosity=2)
