"""Relaunch with an environment allowlist before importing application code."""
import os,sys,socket
from pathlib import Path
root=Path(__file__).resolve().parents[1]
if '--clean' not in sys.argv:
 env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL','SYSTEMROOT') if k in os.environ}
 env.update(INTEGRATION_DEMO_ENABLED=os.environ.get('INTEGRATION_DEMO_ENABLED','0'),PYTHONDONTWRITEBYTECODE='1',PYTHONPATH=str(root))
 os.execve(sys.executable,[sys.executable,'-B',str(Path(__file__).resolve()),'--clean'],env)
if os.environ.get('INTEGRATION_DEMO_ENABLED')!='1':
 print('DEMO_DISABLED: set INTEGRATION_DEMO_ENABLED=1 explicitly');sys.exit(2)
# Outbound network denied even if a future import attempts to connect.
def denied(*a,**kw):raise RuntimeError('OUTBOUND_NETWORK_FORBIDDEN')
socket.socket.connect=denied;socket.socket.connect_ex=denied;socket.create_connection=denied
os.chdir(root)
from gateway.verify_runtime import verify
verify()
import uvicorn
uvicorn.run('gateway.server:app',host='127.0.0.1',port=8713,log_level='warning')
