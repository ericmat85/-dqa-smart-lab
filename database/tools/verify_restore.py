"""Back up and restore only an existing isolated local synthetic database.

Does not accept a cloud DSN or credentials. The target is a fresh database in
the same network-disabled local PostgreSQL container. No DROP is performed.
"""
import argparse
import hashlib
import json
import os
import subprocess
import uuid
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--state', required=True)
parser.add_argument('--evidence', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
state = json.loads(Path(args.state).read_text())
assert state['network'] == 'none' and state['published_ports'] == []
assert state['container'].startswith('dqa-business-local-')
env = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    env.pop(key, None)
docker = ['docker', '--host=unix:///var/run/docker.sock']
assert json.loads(subprocess.check_output(docker + ['inspect', '--format', '{{json .HostConfig.NetworkMode}}', state['container']], env=env)) == 'none'
base = docker + ['exec', '-i', state['container']]
evidence = Path(args.evidence)
evidence.mkdir(parents=True, exist_ok=True)


def run(command, data=None):
    result = subprocess.run(command, input=data, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-3000:])
    return result.stdout


dump = run(base + ['pg_dump', '-U', state['owner'], '-d', state['database'], '-Fc', '--no-owner', '--schema=dqa_business', '--schema=dqa_private'])
backup = evidence / 'synthetic-business.dump'
backup.write_bytes(dump)
backup.chmod(0o600)
restore_db = 'dqa_business_restore_' + uuid.uuid4().hex[:8]
run(base + ['createdb', '-U', state['owner'], restore_db])
psql = base + ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', state['owner'], '-d', restore_db]
run(psql, (root / 'tests/000_local_platform.sql').read_bytes())
# The custom dump intentionally excludes the platform-owned extension. Install its
# dependency in this empty local restore target before restoring schema objects.
run(psql, b'CREATE SCHEMA extensions; CREATE EXTENSION btree_gist WITH SCHEMA extensions;')
run(base + ['pg_restore', '-U', state['owner'], '-d', restore_db, '--no-owner', '--exit-on-error', '--single-transaction'], dump)
fingerprint_sql = b"""SELECT format($q$SELECT %L AS t,count(*) AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS content FROM %I.%I t;$q$,schemaname||'.'||tablename,schemaname,tablename) FROM pg_tables WHERE schemaname IN ('dqa_business','dqa_private') ORDER BY schemaname,tablename
\\gexec
"""


def fingerprint(database):
    return run(base + ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', state['owner'], '-d', database], fingerprint_sql)


source = fingerprint(state['database'])
restored = fingerprint(restore_db)
assert source == restored, 'RESTORE_DATA_FINGERPRINT_MISMATCH'
(evidence / 'RESTORE_TABLE_FINGERPRINTS.txt').write_bytes(restored)
migration_count = int(run(base + ['psql', '-X', '-qAt', '-U', state['owner'], '-d', state['database'], '-c', 'SELECT count(*) FROM dqa_business.schema_migrations']).decode().strip())
check = subprocess.run(['python', str(root / 'tests/verify_database.py'), '--state', args.state, '--database', restore_db, '--result', str(evidence / 'RESTORE_ACCEPTANCE.json'), '--migration-count', str(migration_count)], capture_output=True, text=True, env=env)
(evidence / 'RESTORE_ACCEPTANCE.log').write_text(check.stdout + check.stderr)
connection_passed = True
if migration_count >= 4:
    connection = subprocess.run(['python', str(root / 'tests/verify_connection.py'), '--state', args.state, '--database', restore_db, '--result', str(evidence / 'RESTORE_CONNECTION_ACCEPTANCE.json')], capture_output=True, text=True, env=env)
    (evidence / 'RESTORE_CONNECTION_ACCEPTANCE.log').write_text(connection.stdout + connection.stderr)
    connection_passed = connection.returncode == 0
result = {'connection_security_tests_pass': connection_passed, 'tables_compared': len(restored.decode().splitlines()), 'backup_sha256': hashlib.sha256(dump).hexdigest(), 'backup_bytes': len(dump), 'restore_database': restore_db, 'all_business_and_private_table_contents_match': source == restored, 'restored_security_tests_pass': check.returncode == 0, 'synthetic_only': True, 'cloud_calls': 0}
(evidence / 'RESTORE_VERIFICATION.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(check.returncode or (0 if connection_passed else 1))
