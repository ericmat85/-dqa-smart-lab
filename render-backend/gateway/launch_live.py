"""New opt-in LIVE development launcher; loopback only, no cloud entrypoint yet."""
import os,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
NAMES=('PATH','LANG','SYSTEMROOT','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE','INTEGRATION_DEMO_ENABLED','LIVE_AI_ENABLED','LIVE_PROVIDER_ENABLED','OPENAI_API_KEY','OPENAI_MODEL','AI_SPEND_APPROVED','AI_MODEL_ACCESS_VERIFIED','AI_PROJECT_BUDGET_VERIFIED','AI_ROUND_BUDGET_CONTROL_VERIFIED','AI_COST_LEDGER_PATH','AI_APPROVAL_REFERENCE','AI_PRICING_REFERENCE','AI_INPUT_USD_PER_MILLION','AI_OUTPUT_USD_PER_MILLION','AI_MAX_CALL_USD','AI_MAX_SESSION_USD','AI_MAX_OUTPUT_TOKENS')
if '--clean' not in sys.argv:
 env={k:os.environ[k] for k in NAMES if k in os.environ};env.update(PYTHONDONTWRITEBYTECODE='1',PYTHONPATH=str(R))
 os.execve(sys.executable,[sys.executable,'-B',str(Path(__file__).resolve()),'--clean'],env)
if os.environ.get('INTEGRATION_DEMO_ENABLED')!='1':raise SystemExit('DEMO_DISABLED')
os.chdir(R)
from gateway.verify_runtime import verify
verify()
import uvicorn
uvicorn.run('gateway.server:app',host='127.0.0.1',port=8713,workers=1,log_level='warning')
