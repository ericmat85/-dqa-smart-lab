"""Operator-only E2 reconciliation of one fixed operation. E4 is untouched. No HTTP endpoint or inference.

Default: read-only inspection. --approve-plan requires the exact reviewed plan hash.
An unknown charge is consumed at its full reserved bound, never refunded or retried.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import stat
import time
from pathlib import Path

PLAN = {'service_id': 'srv-dbqssc5bedkc73ekrnf0', 'policy_sha256': '2b2cd315d2b9a134af54bfb66d7ce583c1f9a61af0d17b58bce89be4dedbbd0b', 'ledger_path': '/var/data/e4-mock/live/E2-PREVIEW-20261113-US1/budget.sqlite', 'operation_id': 'O-14ecbb8ade2d45f4aa94fde7c20dfe463a8cb238e0dd41f7873026996fb7d1b9', 'trace_id': 'I-3eecf11235c0477296f11c4bd5864779', 'error_code': 'E2_PROVIDER_HTTP_ERROR_RESERVATION_HELD', 'created_min': 1794538787.037, 'created_max': 1794538847.037, 'lease_seconds': 25, 'reserved_nanos': 50000000, 'budget_before': [1000000000, 50000000, 0, 1794585540.0, 1], 'disposition': 'CONSUME_FULL_RESERVATION_NO_RETRY_NO_BUDGET_INCREASE'}
PLAN_SHA256 = hashlib.sha256(json.dumps(PLAN, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
FINAL_STATE = 'UNKNOWN_COST_ACCOUNTED_AT_CAP'
EVENT = 'UNKNOWN_RESERVATION_CONSERVATIVELY_ACCOUNTED'


def reconcile(path, identity, approve_plan=None, now=None):
    if approve_plan is not None and approve_plan != PLAN_SHA256:
        raise ValueError('EXACT_PLAN_APPROVAL_REQUIRED')
    p = Path(path)
    if not p.is_absolute() or any(x.is_symlink() for x in [p, *p.parents]):
        raise ValueError('PRIVATE_EXISTING_LEDGER_REQUIRED')
    s, d = p.stat(), p.parent.stat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_nlink != 1 or s.st_mode & 0o077 or d.st_uid != os.getuid() or d.st_mode & 0o077:
        raise ValueError('PRIVATE_EXISTING_LEDGER_REQUIRED')
    c = sqlite3.connect(p.as_uri() + ('?mode=rw' if approve_plan else '?mode=ro'), uri=True, timeout=5)
    try:
        c.execute('PRAGMA synchronous=FULL' if approve_plan else 'PRAGMA query_only=ON')
        c.execute('BEGIN IMMEDIATE' if approve_plan else 'BEGIN')
        if c.execute('PRAGMA user_version').fetchone()[0] != 3:
            raise ValueError('LEDGER_SCHEMA_MISMATCH')
        if c.execute('SELECT identity FROM budget WHERE id=1').fetchone() != (identity,):
            raise ValueError('LEDGER_IDENTITY_MISMATCH')
        b = c.execute('SELECT cap,held,spent,expires,max_concurrent FROM budget WHERE id=1').fetchone()
        if not b or (b[0], b[3], b[4]) != (PLAN['budget_before'][0], PLAN['budget_before'][3], 1):
            raise ValueError('BUDGET_POLICY_MISMATCH')
        row = c.execute('SELECT state,created,reserved,active,lease_until,evidence FROM attempts WHERE trace=?', (PLAN['operation_id'],)).fetchone()
        if not row:
            raise ValueError('EXACT_OPERATION_REQUIRED')
        original = json.loads(row[5])
        result = {'plan_sha256': PLAN_SHA256, 'operation_id': PLAN['operation_id'], 'reserved_nanos': PLAN['reserved_nanos'], 'actual_usage_known': False, 'actual_charge_claimed': False, 'original_request_retried': False}
        if row[0] == FINAL_STATE:
            audit = original.get('operator_reconciliation', {})
            events = c.execute('SELECT COUNT(*) FROM events WHERE operation=? AND kind=?', (PLAN['operation_id'], EVENT)).fetchone()[0]
            if audit.get('plan_sha256') != PLAN_SHA256 or audit.get('accounted_nanos') != PLAN['reserved_nanos'] or events != 1 or b[2] < PLAN['budget_before'][2] + PLAN['reserved_nanos']:
                raise ValueError('RECONCILIATION_AUDIT_MISMATCH')
            return {**result, 'status': 'ALREADY_ACCOUNTED_NO_CHANGES'}
        if row[0] != 'UNKNOWN' or not PLAN['created_min'] <= row[1] <= PLAN['created_max'] or row[2:4] != (PLAN['reserved_nanos'], 0) or abs(row[4] - row[1] - PLAN['lease_seconds']) > .001 or original.get('error_code') != PLAN['error_code'] or original.get('trace_id') != PLAN['trace_id']:
            raise ValueError('EXACT_OPERATION_EVIDENCE_MISMATCH')
        if (time.time() if now is None else now) <= row[4]:
            raise ValueError('OPERATION_LEASE_NOT_EXPIRED')
        if list(b) != PLAN['budget_before']:
            raise ValueError('BUDGET_SNAPSHOT_CHANGED')
        if c.execute('SELECT COUNT(*) FROM attempts WHERE active=1').fetchone()[0]:
            raise ValueError('ACTIVE_OPERATION_PRESENT')
        if c.execute("SELECT COUNT(*) FROM attempts WHERE state='UNKNOWN'").fetchone()[0] != 1:
            raise ValueError('ADDITIONAL_UNKNOWN_OPERATION_PRESENT')
        if c.execute('SELECT COUNT(*) FROM events WHERE operation=? AND kind=?', (PLAN['operation_id'], 'DISPATCH_GRANTED')).fetchone()[0] != 1:
            raise ValueError('DISPATCH_EVIDENCE_REQUIRED')
        if not approve_plan:
            return {**result, 'status': 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL'}
        stamp = time.time() if now is None else now
        audit = {'plan_sha256': PLAN_SHA256, 'accounted_nanos': PLAN['reserved_nanos'], 'basis': 'FULL_ORIGINAL_RESERVATION', 'actual_usage_known': False, 'at': stamp}
        detail = {'reconciliation': audit, 'original_state': row[0], 'original_evidence': original, 'original_budget': list(b)}
        c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)', (stamp, EVENT, PLAN['operation_id'], '', json.dumps(detail, sort_keys=True)))
        c.execute('UPDATE budget SET held=held-?,spent=spent+? WHERE id=1', (PLAN['reserved_nanos'], PLAN['reserved_nanos']))
        c.execute('UPDATE attempts SET state=?,evidence=? WHERE trace=?', (FINAL_STATE, json.dumps({**original, 'operator_reconciliation': audit}, sort_keys=True), PLAN['operation_id']))
        after = c.execute('SELECT cap,held,spent,expires,max_concurrent FROM budget WHERE id=1').fetchone()
        if after != (b[0], 0, b[2] + PLAN['reserved_nanos'], b[3], b[4]) or after[1] + after[2] != b[1] + b[2]:
            raise ValueError('BUDGET_CONSERVATION_FAILED')
        c.commit()
        return {**result, 'status': 'FULL_RESERVATION_ACCOUNTED_NO_RETRY', 'budget_available_nanos_unchanged': after[0] - after[1] - after[2]}
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-plan')
    args = parser.parse_args()
    from gateway.e2_controlled_provider import POLICY_PATH
    from gateway.e4_controlled_provider import settings_for
    raw = POLICY_PATH.read_bytes(); policy = json.loads(raw); digest = hashlib.sha256(raw).hexdigest()
    if digest != PLAN['policy_sha256'] or os.environ.get('RENDER_SERVICE_ID') != PLAN['service_id'] or policy['render_service_id'] != PLAN['service_id']:
        raise ValueError('EXACT_RENDER_SERVICE_AND_POLICY_REQUIRED')
    path = Path(policy['live_state_directory']) / 'budget.sqlite'
    if str(path) != PLAN['ledger_path']:
        raise ValueError('EXACT_E2_LEDGER_REQUIRED')
    result = reconcile(path, settings_for(policy).identity(), args.approve_plan)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).replace('_', '').isupper() else type(error).__name__
        print(json.dumps({'status': 'STOPPED_NO_AUTOMATIC_RETRY', 'error': code}))
        raise SystemExit(1)
