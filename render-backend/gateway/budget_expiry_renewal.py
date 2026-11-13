"""Exact E2/E4 expiry-only renewal. Standalone, offline, no credentials or refill.

Default CLI is read-only. A matching --approve-plan permits one atomic update
of the two existing ledger deadlines and an audit event in each ledger.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import stat
import time
from datetime import datetime
from pathlib import Path

OLD_EXPIRY = '2026-11-13T23:59:00+08:00'
NEW_EXPIRY = '2026-11-14T23:59:00+08:00'
NEW_REFERENCE = 'USER_APPROVED_EXPIRY_ONLY_USD0.05_PER_CALL_USD1_CUMULATIVE_UNTIL_2026-11-14T23:59+08:00_NO_REFILL'
MOUNT = '/var/data/e4-mock'
SERVICE = 'srv-dbqssc5bedkc73ekrnf0'
EVENT = 'BUDGET_EXPIRY_EXTENDED_NO_REFILL'
ENGINES = {
    'E4': {
        'round': 'E4-LIVE-20261112-US1',
        'identity': 'd7dd2fd4d5f9f1531d49b6883c2f0bd1ac299f8d755c8c5e214b36c09b0e9ee6',
        'original_sha256': 'f128fb769bf913707678e7d1fdc74c8482e0b3ee2e6af61279d9a094ac1097cd',
        'deployed_sha256': 'f128fb769bf913707678e7d1fdc74c8482e0b3ee2e6af61279d9a094ac1097cd',
        'renewed_sha256': '4e4a99a7d1a66bf307260208904788266def0099b4d5333127005d14f2a594fb',
        'original_reference': 'USER_APPROVED_USD0.05_PER_CALL_USD1_TOTAL_UNTIL_2026-11-13T23:59+08:00',
    },
    'E2': {
        'round': 'E2-PREVIEW-20261113-US1',
        'identity': 'a0ec51869824c428578f7086547d558eb1a34f3f5860a996a539578f9fdbdfbb',
        'original_sha256': '2b2cd315d2b9a134af54bfb66d7ce583c1f9a61af0d17b58bce89be4dedbbd0b',
        'deployed_sha256': '8dde7a962796c90ce5e6ebd0f876194050477ee0da1b24575247a4f395aa9250',
        'renewed_sha256': '46d8cc9f96e629fc5f5f4cc2cb09336803ad8655e23aea04ee81b84183354015',
        'original_reference': 'E2_SEPARATE_BUDGET_PROPOSAL_REQUIRES_EXPLICIT_USER_APPROVAL_USD0.05_PER_CALL_USD1_TOTAL_UNTIL_2026-11-13T23:59+08:00',
    },
}


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def require(condition, code):
    if not condition:
        raise ValueError(code)


def original_policy(policy, engine):
    """Only the fixed renewed policy may retain the original ledger identity."""
    spec = ENGINES[engine]
    require(hashlib.sha256(canonical(policy)).hexdigest() == spec['renewed_sha256'], 'EXACT_RENEWAL_POLICY_REQUIRED')
    old = json.loads(json.dumps(policy))
    old['expires_at'] = OLD_EXPIRY
    old['evidence']['user_budget'] = spec['original_reference']
    if engine == 'E2':
        old['limits']['request_timeout_seconds'] = 20
    require(hashlib.sha256(canonical(old)).hexdigest() == spec['original_sha256'], 'ORIGINAL_POLICY_BINDING_REQUIRED')
    return old


def ledger_path(engine):
    return Path(MOUNT) / 'live' / ENGINES[engine]['round'] / 'budget.sqlite'


PLAN = {
    'service_id': SERVICE,
    'old_expires': datetime.fromisoformat(OLD_EXPIRY).timestamp(),
    'new_expires': datetime.fromisoformat(NEW_EXPIRY).timestamp(),
    'cap_nano_usd_each': 1000000000,
    'max_concurrent_each': 1,
    'action': 'EXTEND_BOTH_EXISTING_DEADLINES_ONLY_NO_REFILL_NO_RETRY',
    'ledgers': {engine: {'path': str(ledger_path(engine)), **spec} for engine, spec in ENGINES.items()},
}
PLAN_SHA256 = hashlib.sha256(json.dumps(PLAN, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify_renewed_ledger(ledger, engine):
    """New runtime must see the authorized, audited renewal on its existing DB."""
    with ledger.connect() as c:
        rows = c.execute('SELECT operation,detail FROM events WHERE kind=?', (EVENT,)).fetchall()
    require(len(rows) == 1 and rows[0][0] == PLAN_SHA256, 'RENEWAL_AUDIT_REQUIRED')
    detail = json.loads(rows[0][1])
    require(detail.get('engine') == engine and detail.get('plan_sha256') == PLAN_SHA256 and detail.get('old_expires') == PLAN['old_expires'] and detail.get('new_expires') == PLAN['new_expires'] and detail.get('cap_nano_usd') == PLAN['cap_nano_usd_each'], 'RENEWAL_AUDIT_MISMATCH')


def check_context():
    require(os.environ.get('RENDER') == 'true' and os.environ.get('RENDER_SERVICE_ID') == SERVICE, 'PROTECTED_RENDER_CONTEXT_REQUIRED')
    mount = Path(MOUNT)
    require(not mount.is_symlink() and os.path.ismount(mount), 'PERSISTENT_MOUNT_REQUIRED')
    for engine, spec in ENGINES.items():
        policy = Path.cwd() / 'gateway' / (engine.lower() + '_live_policy.json')
        require(policy.is_file(), 'DEPLOYED_POLICY_REQUIRED')
        require(hashlib.sha256(policy.read_bytes()).hexdigest() in (spec['deployed_sha256'], spec['renewed_sha256']), 'DEPLOYED_POLICY_MISMATCH')
        path = ledger_path(engine)
        for parent in [path, *path.parents]:
            require(not parent.is_symlink(), 'LEDGER_SYMLINK_DENIED')
        require(path.is_file(), 'EXISTING_LEDGER_REQUIRED')
        metadata, directory = path.stat(), path.parent.stat()
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1 and metadata.st_uid == os.getuid() and stat.S_IMODE(metadata.st_mode) == 0o600, 'PRIVATE_LEDGER_REQUIRED')
        require(directory.st_uid == os.getuid() and stat.S_IMODE(directory.st_mode) == 0o700, 'PRIVATE_STATE_DIRECTORY_REQUIRED')
        require(metadata.st_dev == mount.stat().st_dev, 'PERSISTENT_LEDGER_DEVICE_REQUIRED')


def renewal(approve_plan=None, now=None):
    """Fail closed on unknown usage, active calls, missing files, or partial renewal."""
    if approve_plan is not None:
        require(approve_plan == PLAN_SHA256, 'EXACT_PLAN_APPROVAL_REQUIRED')
    check_context()
    now = time.time() if now is None else now
    require(PLAN['old_expires'] <= now < PLAN['new_expires'], 'RENEWAL_WINDOW_CLOSED')
    mode = 'rw' if approve_plan else 'ro'
    c = sqlite3.connect(ledger_path('E4').as_uri() + '?mode=' + mode, uri=True, timeout=5)
    try:
        c.execute('ATTACH DATABASE ? AS e2', (ledger_path('E2').as_uri() + '?mode=' + mode,))
        for db in ('main', 'e2'):
            require(c.execute('PRAGMA ' + db + '.journal_mode').fetchone()[0] == 'delete', 'ATOMIC_ROLLBACK_JOURNAL_REQUIRED')
            if approve_plan:
                c.execute('PRAGMA ' + db + '.synchronous=FULL')
        if not approve_plan:
            c.execute('PRAGMA query_only=ON')
        c.execute('BEGIN IMMEDIATE' if approve_plan else 'BEGIN')
        before, audits = {}, {}
        for engine, db in (('E4', 'main'), ('E2', 'e2')):
            require(c.execute('PRAGMA ' + db + '.user_version').fetchone() == (3,), 'LEDGER_SCHEMA_MISMATCH')
            rows = c.execute('SELECT identity,cap,held,spent,expires,max_concurrent FROM ' + db + '.budget').fetchall()
            require(len(rows) == 1, 'SINGLE_BUDGET_REQUIRED')
            row = rows[0]
            require(row[0] == ENGINES[engine]['identity'] and row[1] == PLAN['cap_nano_usd_each'] and row[5] == 1, 'BUDGET_IDENTITY_OR_CAP_MISMATCH')
            require(all(type(value) is int and value >= 0 for value in row[1:4]) and row[2] + row[3] <= row[1], 'INVALID_BUDGET_BALANCE')
            require(row[2] == 0, 'HELD_RESERVATION_REQUIRES_RECONCILIATION')
            require(c.execute("SELECT COUNT(*) FROM " + db + ".attempts WHERE active!=0 OR state IN ('UNKNOWN','RESERVED_INFLIGHT')").fetchone() == (0,), 'UNRESOLVED_OR_ACTIVE_OPERATION')
            before[engine] = row
            audits[engine] = c.execute('SELECT operation,detail FROM ' + db + '.events WHERE kind=?', (EVENT,)).fetchall()
        e2 = ENGINES['E2']
        expected = {'policy_sha256': e2['original_sha256'], 'ledger_identity': e2['identity'], 'ledger_path': PLAN['ledgers']['E2']['path']}
        markers = c.execute('SELECT kind,detail FROM main.events WHERE operation=? AND kind IN (?,?) ORDER BY sequence', (e2['round'], 'E2_INITIALIZATION_RESERVED', 'E2_INITIALIZATION_COMPLETE')).fetchall()
        require(len(markers) == 2 and [r[0] for r in markers] == ['E2_INITIALIZATION_RESERVED', 'E2_INITIALIZATION_COMPLETE'] and all(json.loads(r[1]) == expected for r in markers), 'E2_ORIGINAL_INITIALIZATION_REQUIRED')
        renewed = [row[4] == PLAN['new_expires'] for row in before.values()]
        result = {'plan_sha256': PLAN_SHA256, 'new_expires_at': NEW_EXPIRY, 'original_requests_retried': False, 'budget_refilled': False, 'paid_ai_calls': 0, 'budgets': {engine: {'cap_nano_usd': row[1], 'held_nano_usd': row[2], 'spent_nano_usd': row[3], 'available_nano_usd': row[1] - row[2] - row[3]} for engine, row in before.items()}}
        if all(renewed):
            for engine, rows in audits.items():
                require(len(rows) == 1 and rows[0][0] == PLAN_SHA256, 'RENEWAL_AUDIT_REQUIRED')
                detail = json.loads(rows[0][1])
                require(detail.get('engine') == engine and detail.get('plan_sha256') == PLAN_SHA256 and detail.get('old_expires') == PLAN['old_expires'] and detail.get('new_expires') == PLAN['new_expires'] and detail.get('cap_nano_usd') == before[engine][1], 'RENEWAL_AUDIT_MISMATCH')
            return {**result, 'status': 'ALREADY_RENEWED_NO_CHANGES'}
        require(not any(renewed) and all(row[4] == PLAN['old_expires'] for row in before.values()) and not any(audits.values()), 'PARTIAL_OR_UNEXPECTED_RENEWAL')
        if not approve_plan:
            return {**result, 'status': 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL'}
        for engine, db in (('E4', 'main'), ('E2', 'e2')):
            row = before[engine]
            changed = c.execute('UPDATE ' + db + '.budget SET expires=? WHERE id=1 AND identity=? AND expires=? AND cap=? AND held=? AND spent=? AND max_concurrent=1', (PLAN['new_expires'], row[0], PLAN['old_expires'], *row[1:4])).rowcount
            require(changed == 1, 'BUDGET_CHANGED_DURING_RENEWAL')
            detail = {'engine': engine, 'plan_sha256': PLAN_SHA256, 'old_expires': row[4], 'new_expires': PLAN['new_expires'], 'cap_nano_usd': row[1], 'held_nano_usd': row[2], 'spent_nano_usd': row[3], 'actual_charge_claimed': False, 'original_requests_retried': False}
            c.execute('INSERT INTO ' + db + '.events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)', (now, EVENT, PLAN_SHA256, '', json.dumps(detail, sort_keys=True)))
            after = c.execute('SELECT identity,cap,held,spent,expires,max_concurrent FROM ' + db + '.budget').fetchone()
            require(after == (*row[:4], PLAN['new_expires'], row[5]), 'BUDGET_CONSERVATION_FAILED')
        c.commit()
        return {**result, 'status': 'EXPIRY_EXTENDED_BOTH_NO_REFILL_NO_RETRY'}
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-plan')
    args = parser.parse_args()
    try:
        print(json.dumps(renewal(args.approve_plan), sort_keys=True))
    except (ValueError, OSError, sqlite3.Error, KeyError, json.JSONDecodeError) as exc:
        # No raw SQL, paths, environment values, exception messages, or credentials.
        code = str(exc) if type(exc) is ValueError and str(exc).replace('_', '').isalnum() and str(exc).isupper() else 'SAFE_RENEWAL_CHECK_FAILED'
        print(json.dumps({'status': 'STOPPED', 'error_code': code, 'paid_ai_calls': 0}, sort_keys=True))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
