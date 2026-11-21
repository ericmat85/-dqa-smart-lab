"""Create a new network-disabled local PostgreSQL with synthetic fixtures only.

Stores generated credentials and runtime state outside this source worktree.
Refuses an existing state directory; never connects to Supabase or a cloud DSN.
Requires the official postgres:17-bookworm image to be available locally.
"""
import argparse
import json
import os
import secrets
import subprocess
import time
import uuid
from pathlib import Path
from build_bundle import bundle

parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
directory = Path(args.directory).resolve()
if directory == root or root in directory.parents:
    raise SystemExit('STATE_MUST_BE_OUTSIDE_SOURCE_DATABASE_DIRECTORY')
directory.mkdir(parents=True, exist_ok=True)
state_file = directory / 'LOCAL_DATABASE.json'
if state_file.exists():
    raise SystemExit('LOCAL_STATE_EXISTS_REVIEW_BEFORE_REPROVISION')
private = directory / 'private'
private.mkdir(mode=0o700, exist_ok=True)
credential_file = private / 'postgres.env'
fd = os.open(credential_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write('POSTGRES_USER=dqa_dev_owner\nPOSTGRES_PASSWORD=' + secrets.token_urlsafe(48) + '\nPOSTGRES_DB=dqa_business_dev\n')
env = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    env.pop(key, None)
docker = ['docker', '--host=unix:///var/run/docker.sock']


def run(command, data=None):
    result = subprocess.run(command, input=data, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-2000:])
    return result.stdout


run(docker + ['image', 'inspect', 'postgres:17-bookworm', '--format', '{{.Id}}'])
name = 'dqa-business-local-' + uuid.uuid4().hex[:10]
volume = name + '-data'
run(docker + ['run', '--detach', '--network', 'none', '--label', 'dqa.scope=business-database-isolated-development', '--name', name, '--env-file', str(credential_file), '--mount', 'type=volume,src=' + volume + ',dst=/var/lib/postgresql/data', 'postgres:17-bookworm'])
state = {'container': name, 'volume': volume, 'network': 'none', 'published_ports': [], 'scope': 'synthetic local development only', 'database': 'dqa_business_dev', 'owner': 'dqa_dev_owner'}
state_file.write_text(json.dumps(state, indent=2) + '\n')
base = docker + ['exec', '-i', name]
for _ in range(80):
    # The image's temporary initialization server has only a Unix socket.
    # Loopback readiness waits for the final server, avoiding init/restart races.
    probe = subprocess.run(base + ['pg_isready', '-h', '127.0.0.1', '-U', state['owner'], '-d', state['database']], env=env, capture_output=True)
    if probe.returncode == 0:
        break
    time.sleep(0.25)
else:
    raise SystemExit('LOCAL_POSTGRES_NOT_READY_STATE_PRESERVED')
psql = base + ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', state['owner'], '-d', state['database']]
run(psql, (root / 'tests/000_local_platform.sql').read_bytes())
sql, manifest = bundle()
run(psql, sql.encode())
run(psql, (root / 'tests/010_synthetic_seed.sql').read_bytes())
(directory / 'APPLIED_MIGRATIONS.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'status': 'LOCAL_SYNTHETIC_DATABASE_READY', 'state_file': str(state_file), 'network': 'none', 'published_ports': 0}))
