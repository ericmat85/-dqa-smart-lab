import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4
import httpx
import pytest
from pydantic import SecretStr,ValidationError
from app.competition.persistent_budget import LocalBudgetJournal
from app.competition.budget import BudgetDenied
from app.competition.signed_access import SignedCredentialVerifier
from app.competition.access_control import AccessDenied
from app.competition.provider_models import AIFeature
from app.competition.provider_transport import ProviderHTTPRequest,ENDPOINT
from app.competition.prepared_transport import PreparedProviderTransport
from app.competition.pricing_evidence import PricingEvidenceSubmission
from app.competition.main import create_app
from .client import ASGIClient
from .test_contract import BODIES,PREFIX
from .test_signature_quality import SignatureFakeProvider

@pytest.fixture
def journal():
    with tempfile.TemporaryDirectory(prefix='dqa-b2a-ledger-',dir='/workspace') as directory:
        path=Path(directory);lid=uuid4()
        obj=LocalBudgetJournal.provision(path,lid)
        try:
            yield obj,path,lid
        finally:
            obj.close()

def reserve(obj,maximum=100):return obj.reserve(uuid4(),'AI-01','synthetic-offline-model',maximum)

def test_restart_preserves_spent_reserved_unknown(journal):
    obj,path,lid=journal
    a=reserve(obj,100);obj.settle(a,30)
    b=reserve(obj,200);obj.mark_unknown(b);reserve(obj,300)
    with LocalBudgetJournal(path,lid) as reopened:
        state=reopened.snapshot()
        assert state['accounted_micro_usd']==30 and state['held_micro_usd']==500 and state['available_micro_usd']==9999470
        with pytest.raises(BudgetDenied):reopened.settle(b,0)

def test_fresh_process_restart(journal):
    obj,path,lid=journal;reserve(obj,6000000)
    code='from app.competition.persistent_budget import LocalBudgetJournal;from uuid import UUID;import sys;x=LocalBudgetJournal(sys.argv[1],UUID(sys.argv[2]));print(x.snapshot()["available_micro_usd"]);x.close()'
    result=subprocess.run([os.sys.executable,'-c',code,str(path),str(lid)],capture_output=True,text=True,timeout=10)
    assert result.returncode==0 and result.stdout.strip()=='4000000'

def test_competing_handles(journal):
    _,path,lid=journal
    def attempt(_):
        with LocalBudgetJournal(path,lid) as obj:
            try:reserve(obj,6000000);return True
            except BudgetDenied:return False
    with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(attempt,range(8)))
    assert sum(results)==1

@pytest.mark.parametrize('failure',['missing','corrupt','truncated','wrong_identity','wrong_mode','hardlink','symlink'])
def test_journal_fail_closed(journal,failure,tmp_path):
    obj,path,lid=journal;reserve(obj);f=path/'budget.journal'
    if failure=='missing':f.unlink()
    elif failure=='corrupt':f.write_bytes(b'not a journal\n')
    elif failure=='truncated':f.write_bytes(f.read_bytes()[:-1])
    elif failure=='wrong_identity':lid=uuid4()
    elif failure=='wrong_mode':f.chmod(0o644)
    elif failure=='hardlink':os.link(f,path/'alias')
    elif failure=='symlink':f.rename(path/'old');f.symlink_to(path/'old')
    with pytest.raises(BudgetDenied):LocalBudgetJournal(path,lid)
    if failure!='wrong_identity':
        with pytest.raises(BudgetDenied):reserve(obj)

@pytest.mark.parametrize('kind',['write','fsync'])
def test_write_failure(journal,monkeypatch,kind):
    obj,_,_=journal
    def fail(*args):raise OSError('synthetic failure')
    monkeypatch.setattr(os,kind,fail)
    with pytest.raises(BudgetDenied):reserve(obj)

def test_duplicate_unknown_overage_and_no_reset(journal):
    obj,path,lid=journal;rid=uuid4();r=obj.reserve(rid,'AI-02','synthetic',100)
    with pytest.raises(BudgetDenied):obj.reserve(rid,'AI-02','synthetic',100)
    with pytest.raises(BudgetDenied):obj.settle(r,101)
    assert obj.snapshot()['unknown_reservations']==1 and obj.snapshot()['held_micro_usd']==100
    with pytest.raises(BudgetDenied):obj.settle(r,0)
    with pytest.raises(BudgetDenied):LocalBudgetJournal.provision(path,lid)

class SyntheticSecret:
    def load(self):return SecretStr('synthetic-credential-signing-key-not-real-1234567890')
class SyntheticAuthority:
    active=True
    def authorize(self,subject,cid,epoch,feature):
        return self.active and subject=='synthetic-subject' and cid=='synthetic-id' and epoch==3 and feature is AIFeature.ASSISTANT

def credential(**changes):
    claims=dict(iss='dqa-competition',aud='dqa-ai',sub='synthetic-subject',jti='synthetic-id',epoch=3,iat=90,nbf=90,exp=200,scopes=['AI-05']);claims.update(changes)
    payload=base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    signature=base64.urlsafe_b64encode(hmac.new(SyntheticSecret().load().get_secret_value().encode(),('v1.'+payload).encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return 'v1.'+payload+'.'+signature

@pytest.mark.parametrize('change',[{'exp':99},{'nbf':101},{'iat':101},{'epoch':2},{'aud':'attacker'},{'iss':'attacker'},{'scopes':[]},{'admin':True},{'exp':True}])
def test_signed_rejections(change):
    v=SignedCredentialVerifier(secret_source=SyntheticSecret(),authority=SyntheticAuthority(),clock=lambda:100)
    with pytest.raises(AccessDenied):v.authorize(credential(**change),AIFeature.ASSISTANT)

def test_authority_revocation_missing_invalid_signature():
    authority=SyntheticAuthority();v=SignedCredentialVerifier(secret_source=SyntheticSecret(),authority=authority,clock=lambda:100)
    v.authorize(credential(),AIFeature.ASSISTANT);authority.active=False
    with pytest.raises(AccessDenied):v.authorize(credential(),AIFeature.ASSISTANT)
    with pytest.raises(AccessDenied):SignedCredentialVerifier().authorize(credential(),AIFeature.ASSISTANT)
    with pytest.raises(AccessDenied):v.authorize(credential()[:-1]+'X',AIFeature.ASSISTANT)

def test_signed_api_integration():
    v=SignedCredentialVerifier(secret_source=SyntheticSecret(),authority=SyntheticAuthority(),clock=lambda:100)
    app=create_app(provider=SignatureFakeProvider(),access_verifier=v)
    result=ASGIClient(app).post(PREFIX+'assistant',json=BODIES['assistant'],headers={'Authorization':'Bearer '+credential()})
    assert result.status_code==200 and result.json()['provider_mode']=='FAKE_OFFLINE'
    assert ASGIClient(app).post(PREFIX+'assistant',json=BODIES['assistant']).status_code==401

def wire(endpoint=ENDPOINT):return ProviderHTTPRequest(endpoint,{'Authorization':'Bearer synthetic-not-real','Content-Type':'application/json'},{'synthetic':True},0.1)

@pytest.mark.parametrize('status',[200,429,500,503])
def test_transport_fake_status(status):
    calls=[]
    def handle(request):calls.append(request);return httpx.Response(status,content=b'{"synthetic":true}')
    response=asyncio.run(PreparedProviderTransport(mock_transport=httpx.MockTransport(handle)).send(wire()))
    assert response.status_code==status and len(calls)==1

def test_transport_disabled_endpoint():
    with pytest.raises(RuntimeError):asyncio.run(PreparedProviderTransport().send(wire()))
    with pytest.raises(ValueError):PreparedProviderTransport(enabled=True)
    t=PreparedProviderTransport(mock_transport=httpx.MockTransport(lambda r:httpx.Response(200)))
    with pytest.raises(RuntimeError):asyncio.run(t.send(wire('https://attacker.test')))

@pytest.mark.parametrize('kind',['timeout','cancel','exception','oversize'])
def test_transport_faults(kind):
    async def handle(request):
        if kind=='timeout':await asyncio.sleep(1)
        if kind=='cancel':raise asyncio.CancelledError()
        if kind=='exception':raise RuntimeError('synthetic secret prompt')
        return httpx.Response(200,content=b'x'*1048577)
    with pytest.raises(asyncio.CancelledError if kind=='cancel' else RuntimeError) as exc:
        asyncio.run(PreparedProviderTransport(mock_transport=httpx.MockTransport(handle)).send(wire()))
    assert 'synthetic secret prompt' not in str(exc.value)

def evidence():return dict(model_id='synthetic-placeholder',official_source='https://openai.com/api/pricing/',version_date=date(2026,11,6),captured_at=date(2026,11,6),snapshot_sha256='0'*64,input_micro_usd_per_million=1,output_micro_usd_per_million=1,context_limit=100,max_output_tokens=10)

def test_price_submission_not_official():
    x=PricingEvidenceSubmission(**evidence())
    assert x.status=='PRICING_UNVERIFIED' and x.activation_policy().enabled is False

@pytest.mark.parametrize('change',[{'status':'PRICING_VERIFIED'},{'official_source':'https://attacker.test'},{'input_micro_usd_per_million':1.1},{'snapshot_sha256':'bad'},{'model_id':'https://attacker.test'}])
def test_invalid_price(change):
    data=evidence();data.update(change)
    with pytest.raises(ValidationError):PricingEvidenceSubmission(**data)

@pytest.mark.parametrize('fault',['429','5xx','invalid_json','invalid_schema','usage_missing','timeout','cancel','key_missing','insufficient'])
def test_shared_adapter_persistent_budget_faults(journal,fault):
    from .test_provider_adapter import fixture_adapter,run,envelope
    from app.competition.ai_adapter import AdapterError
    obj,path,lid=journal
    body=envelope();status=200
    if fault=='429':status=429
    if fault=='5xx':status=503
    if fault=='invalid_json':body['output'][0]['content'][0]['text']='{invalid'
    if fault=='invalid_schema':body['output'][0]['content'][0]['text']='{}'
    if fault=='usage_missing':del body['usage']
    def handler(request):
        if fault=='timeout':raise httpx.ReadTimeout('synthetic private data')
        if fault=='cancel':raise asyncio.CancelledError()
        return httpx.Response(status,json=body)
    adapter,calls,_=fixture_adapter(handler=handler);adapter.ledger=obj
    if fault=='key_missing':adapter.secret_source=None
    if fault=='insufficient':reserve(obj,10000000)
    with pytest.raises(asyncio.CancelledError if fault=='cancel' else AdapterError):run(adapter)
    with LocalBudgetJournal(path,lid) as reopened:
        state=reopened.snapshot()
        if fault not in ('key_missing','insufficient'):
            assert state['unknown_reservations']==1 and state['held_micro_usd']>0
        else:assert not calls


def test_shared_adapter_persistent_settlement(journal):
    from .test_provider_adapter import fixture_adapter,run
    obj,path,lid=journal
    adapter,_,_=fixture_adapter();adapter.ledger=obj
    assert run(adapter).usage.source=='FAKE_OFFLINE'
    with LocalBudgetJournal(path,lid) as reopened:
        assert reopened.snapshot()['accounted_micro_usd']==20


def test_parent_symlink_rejected(journal,tmp_path):
    _,path,lid=journal
    alias=tmp_path/'alias';alias.symlink_to(path.parent,target_is_directory=True)
    with pytest.raises(BudgetDenied):LocalBudgetJournal(alias/path.name,lid)


def test_no_live_transport_in_app_or_adapter():
    from .test_provider_adapter import fixture_adapter,run
    from app.competition.ai_adapter import AdapterError
    adapter,calls,secret=fixture_adapter();adapter.transport=PreparedProviderTransport()
    with pytest.raises(AdapterError,match='LIVE_NETWORK_NOT_AUTHORIZED'):run(adapter)
    assert not calls and secret.calls==0

@pytest.mark.parametrize('endpoint',list(BODIES)+['signature-quality'])
def test_original_five_api_contracts_and_default_denial(endpoint):
    from .test_signature_quality import PAYLOAD
    body=PAYLOAD if endpoint=='signature-quality' else BODIES[endpoint]
    app=create_app()
    assert PREFIX+endpoint in app.openapi()['paths']
    assert ASGIClient(app).post(PREFIX+endpoint,json=body).status_code==503


def test_processes_compete_without_overspending(journal):
    _,path,lid=journal
    code='''from app.competition.persistent_budget import LocalBudgetJournal
from app.competition.budget import BudgetDenied
from uuid import UUID,uuid4
import sys
with LocalBudgetJournal(sys.argv[1],UUID(sys.argv[2])) as x:
 try:
  x.reserve(uuid4(),'AI-01','synthetic',6000000)
  print('RESERVED')
 except BudgetDenied:
  print('DENIED')
'''
    processes=[subprocess.Popen([os.sys.executable,'-c',code,str(path),str(lid)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(3)]
    results=[p.communicate(timeout=10)[0].strip() for p in processes]
    assert all(p.returncode==0 for p in processes)
    assert results.count('RESERVED')==1 and results.count('DENIED')==2


def test_signature_wrong_key_and_authority_failure():
    class WrongKey:
        def load(self):return SecretStr('another-synthetic-secret-key-not-real-123456')
    class Unavailable:
        def authorize(self,*args):raise RuntimeError('synthetic secret must not leak')
    for secret,authority in [(WrongKey(),SyntheticAuthority()),(SyntheticSecret(),Unavailable()),(None,SyntheticAuthority())]:
        v=SignedCredentialVerifier(secret_source=secret,authority=authority,clock=lambda:100)
        with pytest.raises(AccessDenied) as exc:v.authorize(credential(),AIFeature.ASSISTANT)
        assert not str(exc.value)


def test_journal_failed_read_and_partial_write(journal,monkeypatch):
    obj,_,_=journal
    original=os.write
    def partial(fd,raw):
        original(fd,raw[:10]);raise OSError('synthetic partial write')
    with monkeypatch.context() as m:
        m.setattr(os,'write',partial)
        with pytest.raises(BudgetDenied):reserve(obj)
    with pytest.raises(BudgetDenied):reserve(obj)


def test_no_environment_or_network_used(monkeypatch):
    import socket
    def deny(*args,**kw):raise RuntimeError('forbidden operation')
    monkeypatch.setattr(os,'getenv',deny)
    monkeypatch.setattr(socket,'create_connection',deny)
    with pytest.raises(RuntimeError,match='DISABLED'):asyncio.run(PreparedProviderTransport().send(wire()))

@pytest.mark.parametrize('kind',['missing_checkpoint','corrupt_checkpoint','valid_prefix_truncation'])
def test_checkpoint_detects_incomplete_history(journal,kind):
    obj,path,lid=journal
    reserve(obj)
    if kind=='missing_checkpoint':(path/'budget.checkpoint').unlink()
    elif kind=='corrupt_checkpoint':(path/'budget.checkpoint').write_bytes(b'wrong\n')
    else:
        f=path/'budget.journal';f.write_bytes(f.read_bytes().splitlines(keepends=True)[0])
    with pytest.raises(BudgetDenied):reserve(obj)
    with pytest.raises(BudgetDenied):LocalBudgetJournal(path,lid)

@pytest.mark.parametrize('fault',['success','429','5xx','invalid_json','usage_missing'])
def test_prepared_transport_shared_adapter_pipeline(journal,fault):
    from .test_provider_adapter import fixture_adapter,run,envelope
    from app.competition.ai_adapter import AdapterError
    obj,_,_=journal
    body=envelope();status=200
    if fault=='429':status=429
    elif fault=='5xx':status=500
    elif fault=='invalid_json':body['output'][0]['content'][0]['text']='not JSON'
    elif fault=='usage_missing':del body['usage']
    def handler(request):return httpx.Response(status,json=body)
    adapter,_,_=fixture_adapter();adapter.ledger=obj
    adapter.transport=PreparedProviderTransport(mock_transport=httpx.MockTransport(handler))
    if fault=='success':
        assert run(adapter).usage.source=='FAKE_OFFLINE'
        assert obj.snapshot()['accounted_micro_usd']==20
    else:
        with pytest.raises(AdapterError):run(adapter)
        assert obj.snapshot()['unknown_reservations']==1
