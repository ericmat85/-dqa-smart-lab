"""Separate E2 spend approval, exact policy hash and private durable ledger."""
import hashlib
import json
import os
import time
from pathlib import Path
from decimal import Decimal
from datetime import datetime
import httpx
from gateway.e4_controlled_provider import ProviderState, OwnerLock, SingleInstanceLiveLedger, verify_mount, prepare_live_directory, settings_for
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import E4Error
from gateway.e2_preview_provider import E2Provider
from gateway.budget_expiry_renewal import OLD_EXPIRY,NEW_EXPIRY,original_policy,verify_renewed_ledger

from gateway.budget_renewal_20261231 import NEW_EXPIRY as DEC_EXPIRY,original_policy as december_original,verify_renewed_ledger as verify_december

POLICY_PATH=Path(__file__).with_name('e2_live_policy.json')
ORIGINAL_BUDGET_POLICY_SHA256='2b2cd315d2b9a134af54bfb66d7ce583c1f9a61af0d17b58bce89be4dedbbd0b'

def ledger_binding_for_policy(policy):
    """A reviewed timeout change must reopen the original budget, never refill it.

    Settings.identity includes execution limits. Keep the original storage binding
    only when every policy field except the explicitly bounded timeout is exactly
    the original approved policy. The release gate still requires the NEW policy
    hash; this is not an alias accepting an old environment approval for new code.
    """
    original=december_original(policy,'E2') if policy['expires_at']==DEC_EXPIRY else original_policy(policy,'E2') if policy['expires_at']==NEW_EXPIRY else json.loads(json.dumps(policy))
    if original['limits']['request_timeout_seconds'] not in (20,30):
        raise E4Error('E2_EXECUTION_TIMEOUT_POLICY_REQUIRED')
    original['limits']['request_timeout_seconds']=20
    raw=(json.dumps(original,sort_keys=True,indent=2)+'\n').encode()
    if hashlib.sha256(raw).hexdigest()!=ORIGINAL_BUDGET_POLICY_SHA256:
        raise E4Error('E2_ORIGINAL_BUDGET_BINDING_REQUIRED')
    return settings_for(original),ORIGINAL_BUDGET_POLICY_SHA256

def initialization_guard(authority,db,cfg,digest,initialize,now):
    """Persist a one-time permit in the existing authority before creating E2 state.

    The permit survives loss of the separate E2 file. Missing E4 authority already
    fails closed, so neither an E2-only loss nor whole-disk loss refills this round.
    """
    expected={'policy_sha256':digest,'ledger_identity':cfg.identity(),'ledger_path':str(db)}
    with authority.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        rows=c.execute('SELECT kind,detail FROM events WHERE operation=? AND kind IN (?,?) ORDER BY sequence',(cfg.round_id,'E2_INITIALIZATION_RESERVED','E2_INITIALIZATION_COMPLETE')).fetchall()
        if rows:
            if len(rows)!=2 or [r[0] for r in rows]!=['E2_INITIALIZATION_RESERVED','E2_INITIALIZATION_COMPLETE'] or any(json.loads(r[1])!=expected for r in rows) or not db.is_file():
                raise E4Error('E2_LEDGER_RECOVERY_REQUIRED')
            return False
        if db.exists():raise E4Error('E2_UNMARKED_LEDGER_REQUIRES_REVIEW')
        if initialize!='1':raise E4Error('E2_EXPLICIT_INITIALIZATION_REQUIRED')
        c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(now,'E2_INITIALIZATION_RESERVED',cfg.round_id,'',json.dumps(expected,sort_keys=True)))
    return True

def complete_initialization(authority,cfg,db,digest,now):
    expected={'policy_sha256':digest,'ledger_identity':cfg.identity(),'ledger_path':str(db)}
    with authority.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        rows=c.execute('SELECT kind,detail FROM events WHERE operation=? AND kind IN (?,?) ORDER BY sequence',(cfg.round_id,'E2_INITIALIZATION_RESERVED','E2_INITIALIZATION_COMPLETE')).fetchall()
        if len(rows)!=1 or rows[0][0]!='E2_INITIALIZATION_RESERVED' or json.loads(rows[0][1])!=expected:raise E4Error('E2_LEDGER_RECOVERY_REQUIRED')
        c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(now,'E2_INITIALIZATION_COMPLETE',cfg.round_id,'',json.dumps(expected,sort_keys=True)))


def load_e2_provider(env,authority,clock=time.time):
    state=ProviderState(code='E2_SPEND_APPROVAL_REQUIRED')
    raw=POLICY_PATH.read_bytes();p=json.loads(raw);digest=hashlib.sha256(raw).hexdigest();state.policy_sha256=digest
    # Existing E4 approval flags or budget can never enable E2.
    if env.get('E2_SPEND_APPROVED')!='1' or env.get('E2_RELEASE_POLICY_SHA256')!=digest:return state
    if p['scope']!='E2_PRIVATE_PREVIEW_SYNTHETIC_ONLY' or p['approval_id']!='E2-PREVIEW-20261113-US1' or p['model']!='gpt-6-luna' or p['expires_at'] not in (OLD_EXPIRY,NEW_EXPIRY,DEC_EXPIRY) or Decimal(p['per_call_usd'])>Decimal('.05') or Decimal(p['total_usd'])>Decimal('1') or p['max_instances']!=1 or p['max_workers']!=1:raise E4Error('E2_APPROVED_POLICY_REQUIRED')
    if p['input_usd_per_million']!='0.10' or p['output_usd_per_million']!='0.50':raise E4Error('E2_VERIFIED_PRICING_REQUIRED')
    if str(env.get('LIVE_PROVIDER_ENABLED','false')).lower() not in ('0','false') or str(env.get('LIVE_AI_ENABLED','false')).lower() not in ('0','false'):raise E4Error('LEGACY_LIVE_FLAGS_MUST_REMAIN_DISABLED')
    proof=verify_mount(env,p);cfg=settings_for(p);cfg.validate()
    ledger_cfg,ledger_policy_digest=ledger_binding_for_policy(p)
    if clock()>=cfg.expires:state.code='BUDGET_EXPIRED';state.status=403;return state
    if authority is None:state.code='E2_SESSION_STORE_UNAVAILABLE';return state
    directory=Path(p['live_state_directory'])
    if directory!=Path('/var/data/e4-mock/live')/p['approval_id']:raise E4Error('E2_APPROVED_STATE_PATH_REQUIRED')
    initialize=env.get('E2_LEDGER_INITIALIZE','0')
    if initialize not in ('0','1'):raise E4Error('E2_EXPLICIT_INITIALIZATION_REQUIRED')
    renewed=p['expires_at'] in (NEW_EXPIRY,DEC_EXPIRY)
    if renewed and initialize!='0':raise E4Error('RENEWAL_CANNOT_INITIALIZE_LEDGER')
    if renewed and not (directory/'budget.sqlite').is_file():raise E4Error('RENEWAL_EXISTING_LEDGER_REQUIRED')
    if initialize=='1' and not renewed:prepare_live_directory(directory)
    state.owner=OwnerLock(directory)
    try:
        db=directory/'budget.sqlite'
        created=initialization_guard(authority,db,ledger_cfg,ledger_policy_digest,initialize,clock())
        if created:
            Ledger.initialize_local_or_operator(db,ledger_cfg.identity(),cfg.total_cap,cfg.expires,1);state.initialized=True
        state.ledger=SingleInstanceLiveLedger(db,ledger_cfg.identity(),state.owner,proof)
        if p['expires_at']==DEC_EXPIRY:verify_december(state.ledger,'E2')
        elif renewed:verify_renewed_ledger(state.ledger,'E2')
        if created:complete_initialization(authority,ledger_cfg,db,ledger_policy_digest,clock())
        if not env.get('OPENAI_API_KEY'):state.code='PROVIDER_CREDENTIAL_REQUIRED';return state
        client=httpx.Client(timeout=httpx.Timeout(cfg.request_timeout,connect=5),follow_redirects=False,trust_env=False)
        try:
            metadata=client.get('https://api.openai.com/v1/models/'+cfg.model,headers={'Authorization':'Bearer '+env['OPENAI_API_KEY']},timeout=5)
            if metadata.status_code!=200 or metadata.json().get('id')!=cfg.model:raise E4Error('E2_MODEL_METADATA_NOT_VERIFIED')
            state.service=E2Provider(cfg,state.ledger,authority,lambda:env.get('OPENAI_API_KEY',''),client,clock)
        except Exception:client.close();raise
        state.code='E2_CONTROLLED_LIVE_CONFIGURED_NOT_MODEL_PROOF';return state
    except Exception:
        state.close();raise
