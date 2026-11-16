"""Fixed E2/E4 deadline renewal through 2026-12-31. No refill or model calls.
Existing private ledgers only; read-only by default; atomic two-database update.
"""
import argparse,hashlib,json,os,sqlite3,stat,time
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from gateway import budget_expiry_renewal as previous
from gateway import e4_budget_renewal_20261116 as e4_previous

NEW_EXPIRY='2026-12-31T23:59:00+08:00'
NEW_REFERENCE='USER_APPROVED_EXPIRY_ONLY_USD0.05_PER_CALL_USD1_CUMULATIVE_UNTIL_2026-12-31T23:59+08:00_NO_REFILL'
OLD_EXPIRIES={'E4':e4_previous.NEW_EXPIRY,'E2':previous.NEW_EXPIRY}
CURRENT_POLICY_HASHES={'E4':e4_previous.POLICY_SHA256,'E2':previous.ENGINES['E2']['renewed_sha256']}
NEW_POLICY_HASHES={'E4': 'aeefb04a53d90ae0a52d7bcfdc5cf93990fbaa03e1292ac57fbbfb21dd4b3227', 'E2': '51d6f3c0059fd7d035fc400ce432a101e63bfb872a96e80b28c73d37b399c304'}
MOUNT=previous.MOUNT
SERVICE=previous.SERVICE
EVENT='E2_E4_EXPIRY_EXTENDED_20261231_NO_REFILL'
ENGINES=deepcopy(previous.ENGINES)
for _engine in ENGINES:ENGINES[_engine]['renewed_sha256']=NEW_POLICY_HASHES[_engine]
canonical=previous.canonical
require=previous.require

def original_policy(policy,engine):
    require(engine in ENGINES,'ENGINE_REQUIRED')
    require(hashlib.sha256(canonical(policy)).hexdigest()==NEW_POLICY_HASHES[engine],'EXACT_DECEMBER_RENEWAL_POLICY_REQUIRED')
    old=deepcopy(policy);old['expires_at']=OLD_EXPIRIES[engine]
    old['evidence']['user_budget']=e4_previous.REFERENCE if engine=='E4' else previous.NEW_REFERENCE
    require(hashlib.sha256(canonical(old)).hexdigest()==CURRENT_POLICY_HASHES[engine],'PREVIOUS_POLICY_BINDING_REQUIRED')
    return e4_previous.original_policy(old) if engine=='E4' else previous.original_policy(old,engine)

def validate_prior_audits(c,engine,db):
    rows=c.execute('SELECT operation,detail FROM '+db+'.events WHERE kind=?',(previous.EVENT,)).fetchall()
    require(len(rows)==1 and rows[0][0]==previous.PLAN_SHA256,'PRIOR_RENEWAL_AUDIT_REQUIRED')
    d=json.loads(rows[0][1]);require(d.get('engine')==engine and d.get('plan_sha256')==previous.PLAN_SHA256 and d.get('old_expires')==previous.PLAN['old_expires'] and d.get('new_expires')==previous.PLAN['new_expires'] and d.get('cap_nano_usd')==1000000000,'PRIOR_RENEWAL_AUDIT_MISMATCH')
    if engine=='E4':e4_previous.validate_new_audit(c)

def ledger_path(engine):
    return Path(MOUNT) / 'live' / ENGINES[engine]['round'] / 'budget.sqlite'


PLAN = {
    'service_id': SERVICE,
    'old_expires': {engine: datetime.fromisoformat(OLD_EXPIRIES[engine]).timestamp() for engine in ENGINES},
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
        validate_prior_audits(c,engine,'main')
        rows = c.execute('SELECT operation,detail FROM events WHERE kind=?', (EVENT,)).fetchall()
    require(len(rows) == 1 and rows[0][0] == PLAN_SHA256, 'RENEWAL_AUDIT_REQUIRED')
    detail = json.loads(rows[0][1])
    require(detail.get('engine') == engine and detail.get('plan_sha256') == PLAN_SHA256 and detail.get('old_expires') == PLAN['old_expires'][engine] and detail.get('new_expires') == PLAN['new_expires'] and detail.get('cap_nano_usd') == PLAN['cap_nano_usd_each'], 'RENEWAL_AUDIT_MISMATCH')


def check_context():
    require(os.environ.get('RENDER') == 'true' and os.environ.get('RENDER_SERVICE_ID') == SERVICE, 'PROTECTED_RENDER_CONTEXT_REQUIRED')
    mount = Path(MOUNT)
    require(not mount.is_symlink() and os.path.ismount(mount), 'PERSISTENT_MOUNT_REQUIRED')
    for engine, spec in ENGINES.items():
        policy = Path.cwd() / 'gateway' / (engine.lower() + '_live_policy.json')
        require(policy.is_file(), 'DEPLOYED_POLICY_REQUIRED')
        require(hashlib.sha256(policy.read_bytes()).hexdigest() in (CURRENT_POLICY_HASHES[engine], spec['renewed_sha256']), 'DEPLOYED_POLICY_MISMATCH')
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
    require(min(PLAN['old_expires'].values()) <= now < PLAN['new_expires'], 'RENEWAL_WINDOW_CLOSED')
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
        for engine,db in (('E4','main'),('E2','e2')):
            validate_prior_audits(c,engine,db)
        renewed = [row[4] == PLAN['new_expires'] for row in before.values()]
        result = {'plan_sha256': PLAN_SHA256, 'new_expires_at': NEW_EXPIRY, 'original_requests_retried': False, 'budget_refilled': False, 'paid_ai_calls': 0, 'budgets': {engine: {'cap_nano_usd': row[1], 'held_nano_usd': row[2], 'spent_nano_usd': row[3], 'available_nano_usd': row[1] - row[2] - row[3]} for engine, row in before.items()}}
        if all(renewed):
            for engine, rows in audits.items():
                require(len(rows) == 1 and rows[0][0] == PLAN_SHA256, 'RENEWAL_AUDIT_REQUIRED')
                detail = json.loads(rows[0][1])
                require(detail.get('engine') == engine and detail.get('plan_sha256') == PLAN_SHA256 and detail.get('old_expires') == PLAN['old_expires'][engine] and detail.get('new_expires') == PLAN['new_expires'] and detail.get('cap_nano_usd') == before[engine][1], 'RENEWAL_AUDIT_MISMATCH')
            return {**result, 'status': 'ALREADY_RENEWED_NO_CHANGES'}
        require(not any(renewed) and all(row[4] == PLAN['old_expires'][engine] for engine,row in before.items()) and not any(audits.values()), 'PARTIAL_OR_UNEXPECTED_RENEWAL')
        if not approve_plan:
            return {**result, 'status': 'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL'}
        for engine, db in (('E4', 'main'), ('E2', 'e2')):
            row = before[engine]
            changed = c.execute('UPDATE ' + db + '.budget SET expires=? WHERE id=1 AND identity=? AND expires=? AND cap=? AND held=? AND spent=? AND max_concurrent=1', (PLAN['new_expires'], row[0], PLAN['old_expires'][engine], *row[1:4])).rowcount
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
