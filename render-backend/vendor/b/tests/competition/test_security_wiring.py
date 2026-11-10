"""COMP-03B-2C synthetic disk/evidence/role/transport only. No Render calls."""
import asyncio
from dataclasses import replace
import hashlib
import json
from uuid import uuid4
import httpx
import pytest
from pydantic import ValidationError
from app.competition.main import create_app
from app.competition.security_wiring import (SecurityWiring,RenderConfiguration,FeatureGrant,
    OfflineDiskProof,OfflinePricePermit)
from app.competition.signed_access import SignedCredentialVerifier
from app.competition.provider_models import AIFeature,OPERATION_FEATURE
from app.competition.schemas import Operation
from app.competition.provider_usage import ModelPrice
from app.competition.prepared_transport import PreparedProviderTransport
from app.competition.budget import MemoryBudgetLedger,BudgetDenied
from .client import ASGIClient
from .test_contract import BODIES,PREFIX
from .test_signature_quality import PAYLOAD
from .test_provider_adapter import envelope,FakeSecretSource,MODEL
from .test_persistent_readiness import SyntheticSecret,credential

BODIES5=dict(BODIES,**{'signature-quality':PAYLOAD})


class SyntheticAuthority:
    def __init__(self):self.active=True;self.epoch=3
    def authorize(self,subject,cid,epoch,feature):
        return self.active and subject=='synthetic-subject' and cid=='synthetic-id' and epoch==self.epoch and feature in AIFeature


class SyntheticPermissions:
    def __init__(self):self.allow=True;self.role='SYNTHETIC_TEST_ROLE';self.calls=[]
    def grant(self,actor,feature):
        self.calls.append((actor,feature))
        if not self.allow or not self.role:raise PermissionError('not granted')
        return FeatureGrant(actor.subject,actor.credential_id,actor.epoch,feature,self.role,'SYNTHETIC_FEATURE_PERMISSION')


class SyntheticPricing:
    def __init__(self):self.available=True
    def resolve(self,feature):
        if not self.available:raise ValueError('official evidence unavailable')
        return OfflinePricePermit(ModelPrice(MODEL,1000000,2000000,'SYNTHETIC_TEST_PRICE_NOT_OFFICIAL'),32000,1000)


class FakeDiskState:
    """Simulated filesystem, not a real mount. Memory survives only test reopen."""
    def __init__(self,lid):
        self.lid=lid;self.root_mode=0o700;self.file_mode=0o600
        self.present=True;self.regular=True;self.corrupt=False;self.restored=False
        self.reconciled=True;self.stale=False;self.ledger=MemoryBudgetLedger(enabled=True)


class FakeLedger:
    def __init__(self,disk):self.disk=disk
    def _health(self):
        if not self.disk.present or self.disk.corrupt:raise BudgetDenied('LEDGER_UNAVAILABLE')
    def reserve(self,*args):self._health();return self.disk.ledger.reserve(*args)
    def settle(self,*args):self._health();return self.disk.ledger.settle(*args)
    def mark_unknown(self,*args):self._health();return self.disk.ledger.mark_unknown(*args)
    def snapshot(self):
        self._health();return {**self.disk.ledger.snapshot(),'ledger_id':str(self.disk.lid)}


class FakeDiskEvidence:
    def __init__(self,disk):self.disk=disk
    def inspect(self,config,runtime_id,ledger_id):
        if config.budget_directory!='/var/data/competition-budget' or self.disk.root_mode!=0o700 or self.disk.file_mode!=0o600 or not self.disk.present or not self.disk.regular:
            raise OSError('synthetic disk is unsafe')
        return OfflineDiskProof(uuid4() if self.disk.stale else runtime_id,self.disk.lid,'a'*64,
            restored_from_snapshot=self.disk.restored,restart_reconciled=self.disk.reconciled)


def setup_wiring(endpoint='assistant',fault=None):
    lid=uuid4();disk=FakeDiskState(lid);calls=[];authority=SyntheticAuthority()
    permissions=SyntheticPermissions();pricing=SyntheticPricing()
    async def receive(request):
        calls.append(request)
        if fault=='timeout':raise httpx.ReadTimeout('SENSITIVE_SYNTHETIC_PROVIDER_DETAIL')
        if fault=='cancel':raise asyncio.CancelledError()
        body=envelope(OPERATION_FEATURE[Operation(endpoint)])
        if endpoint=='signature-quality':body['output'][0]['content'][0]['text']=json.dumps({'summary':'Synthetic descriptor only','findings':[], 'overall_quality':'needs_review','quality_score':30,'manual_review_required':True})
        if fault=='invalid_json':return httpx.Response(200,content=b'{invalid')
        if fault=='invalid_schema':body['output'][0]['content'][0]['text']='{}'
        if fault=='usage_missing':del body['usage']
        return httpx.Response(429 if fault=='429' else 503 if fault=='5xx' else 200,json=body)
    service=SecurityWiring(verifier=SignedCredentialVerifier(secret_source=SyntheticSecret(),authority=authority,clock=lambda:100),
        permissions=permissions,enabled_features=tuple(AIFeature),pricing=pricing,
        disk_evidence=FakeDiskEvidence(disk),ledger=FakeLedger(disk),ledger_id=lid,
        secret_source=FakeSecretSource(),transport=PreparedProviderTransport(mock_transport=httpx.MockTransport(receive)))
    return service,disk,calls,authority,permissions,pricing


def send(endpoint,service,token=None,body=None):
    headers={} if token is None else {'Authorization':'Bearer '+token}
    return ASGIClient(create_app(security_wiring=service)).post(PREFIX+endpoint,json=body if body is not None else BODIES5[endpoint],headers=headers)


def all_token(**changes):return credential(scopes=[f.value for f in AIFeature],**changes)


@pytest.mark.parametrize('endpoint',BODIES5)
def test_five_wired_fake_success(endpoint):
    service,disk,calls,*_=setup_wiring(endpoint)
    before=json.dumps(BODIES5[endpoint],sort_keys=True)
    response=send(endpoint,service,all_token())
    assert response.status_code==200
    out=response.json();assert out['provider_mode']=='FAKE_OFFLINE' and out['business_commit_gate']=='RULE_NOT_APPROVED' and out['business_actions_authorized'] is False
    assert len(calls)==1 and disk.ledger.snapshot()['accounted_micro_usd']==20
    assert json.dumps(BODIES5[endpoint],sort_keys=True)==before
    assert service.audit[-1]['status']=='OFFLINE_SIMULATED_SUCCESS'
    if endpoint=='signature-quality':assert out['image_decoding']=='NOT_IMPLEMENTED' and out['identity_verification']=='NOT_PERFORMED'


@pytest.mark.parametrize('endpoint',BODIES5)
@pytest.mark.parametrize('fault',['anonymous','expired','forged','no_permission','no_role','authority_revoked'])
def test_auth_permission_denied_before_transport(endpoint,fault):
    service,disk,calls,authority,permissions,_=setup_wiring(endpoint)
    token=all_token()
    if fault=='anonymous':token=None
    if fault=='expired':token=all_token(exp=99)
    if fault=='forged':token=token[:-1]+('X' if token[-1]!='X' else 'Y')
    if fault=='no_permission':permissions.allow=False
    if fault=='no_role':permissions.role=''
    if fault=='authority_revoked':authority.active=False
    response=send(endpoint,service,token)
    assert response.status_code==(403 if fault in ('no_permission','no_role') else 401)
    assert not calls and disk.ledger.snapshot()['held_micro_usd']==0


@pytest.mark.parametrize('fault',['no_verifier','no_feature','no_price','no_disk','no_reconcile','rollback','stale_proof','mode','file_mode','missing','special_file','corrupt','wrong_ledger','no_secret','no_transport'])
def test_prerequisite_failure_closed(fault):
    s,disk,calls,_,_,pricing=setup_wiring()
    if fault=='no_verifier':s.verifier=None
    if fault=='no_feature':s.enabled_features=frozenset()
    if fault=='no_price':pricing.available=False
    if fault=='no_disk':s.disk_evidence=None
    if fault=='no_reconcile':disk.reconciled=False
    if fault=='rollback':disk.restored=True
    if fault=='stale_proof':disk.stale=True
    if fault=='mode':disk.root_mode=0o777
    if fault=='file_mode':disk.file_mode=0o644
    if fault=='missing':disk.present=False
    if fault=='special_file':disk.regular=False
    if fault=='corrupt':disk.corrupt=True
    if fault=='wrong_ledger':s.ledger_id=uuid4()
    if fault=='no_secret':s.secret_source=None
    if fault=='no_transport':s.transport=PreparedProviderTransport()
    response=send('assistant',s,all_token())
    assert response.status_code==503 and not calls


@pytest.mark.parametrize('change',[{'workers':2},{'instances':2},{'workers':True},{'instances':True},{'paid_network_enabled':True},{'paid_network_enabled':0},{'budget_directory':'/tmp/free-budget'},{'disk_mount':'/tmp'}])
def test_render_configuration_fail_closed(change):
    with pytest.raises(ValidationError):RenderConfiguration(**change)


@pytest.mark.parametrize('endpoint',BODIES5)
@pytest.mark.parametrize('fault',['timeout','429','5xx','invalid_json','invalid_schema','usage_missing'])
def test_wired_upstream_errors_retain_budget(endpoint,fault,caplog):
    service,disk,calls,*_=setup_wiring(endpoint,fault)
    response=send(endpoint,service,all_token())
    expected=502
    if endpoint=='signature-quality' and fault=='429':expected=429
    if endpoint=='signature-quality' and fault=='timeout':expected=504
    assert response.status_code==expected and len(calls)==1
    assert disk.ledger.snapshot()['unknown_reservations']==1 and disk.ledger.snapshot()['held_micro_usd']>0
    assert 'SENSITIVE_SYNTHETIC_PROVIDER_DETAIL' not in response.text+caplog.text+str(service.audit)


def test_insufficient_budget_no_transport():
    service,disk,calls,*_=setup_wiring()
    disk.ledger.reserve(uuid4(),'AI-01','synthetic',10000000)
    response=send('assistant',service,all_token())
    assert response.status_code==502 and not calls


def test_fake_filesystem_reopen_not_reset_and_rollback_blocked():
    service,disk,calls,*_=setup_wiring()
    assert send('assistant',service,all_token()).status_code==200
    service.ledger=FakeLedger(disk)
    assert service.ledger.snapshot()['accounted_micro_usd']==20
    assert send('assistant',service,all_token()).status_code==200
    assert service.ledger.snapshot()['accounted_micro_usd']==40
    disk.restored=True
    assert send('assistant',service,all_token()).status_code==503 and len(calls)==2


def test_schema_precedes_signed_auth_and_not_client_authority():
    service,disk,calls,*_=setup_wiring()
    body={**BODIES['assistant'],'role':'ADMIN','provider_url':'https://attacker.test'}
    assert send('assistant',service,None,body).status_code==422
    assert not calls and not service.audit


def test_default_factory_and_conflicting_dependencies():
    assert ASGIClient(create_app()).post(PREFIX+'assistant',json=BODIES['assistant']).status_code==503
    service,*_=setup_wiring()
    with pytest.raises(ValueError):create_app(security_wiring=service,provider=object())
    with pytest.raises(ValueError):create_app(security_wiring=service,access_verifier=object())


def test_no_raw_provider_bypass():
    service,disk,calls,*_=setup_wiring()
    app=create_app(security_wiring=service)
    class Bypass:
        mode='FAKE_OFFLINE'
        async def suggest(self,*args):raise RuntimeError('bypass invoked')
    app.state.competition_provider=Bypass()
    response=ASGIClient(app).post(PREFIX+'assistant',json=BODIES['assistant'])
    assert response.status_code==401 and not calls


def test_openapi_canonical_unchanged():
    service,*_=setup_wiring()
    schema=create_app(security_wiring=service).openapi()
    digest=hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    assert digest=='aa8fefdabd411049950c81ef841d1d5ca411c30c75a7e7c7958edb6c175f9b55'


@pytest.mark.parametrize('field',['raw_image','image_base64','image_url','file_path'])
def test_ai04_real_images_still_rejected(field):
    service,_,calls,*_=setup_wiring('signature-quality')
    body={**PAYLOAD,field:'synthetic-rejected-value'}
    assert send('signature-quality',service,all_token(),body).status_code==422 and not calls

from .test_persistent_readiness import journal


def test_wired_local_journal_restart(journal):
    from app.competition.persistent_budget import LocalBudgetJournal
    ledger,path,lid=journal
    service,disk,calls,*_=setup_wiring()
    disk.lid=lid;service.ledger_id=lid;service.ledger=ledger
    assert send('assistant',service,all_token()).status_code==200
    with LocalBudgetJournal(path,lid) as reopened:
        assert reopened.snapshot()['accounted_micro_usd']==20
        service.ledger=reopened
        assert send('assistant',service,all_token()).status_code==200
    assert ledger.snapshot()['accounted_micro_usd']==40


def test_wired_corrupt_local_journal_refused(journal):
    ledger,path,lid=journal
    service,disk,calls,*_=setup_wiring()
    disk.lid=lid;service.ledger_id=lid;service.ledger=ledger
    (path/'budget.checkpoint').write_bytes(b'corrupt')
    assert send('assistant',service,all_token()).status_code==503
    assert not calls


def test_admin_label_without_feature_permission_refused():
    service,_,calls,_,permissions,_=setup_wiring()
    permissions.role='ADMIN';permissions.allow=False
    assert send('assistant',service,all_token()).status_code==403 and not calls


def test_secret_and_prompt_not_in_audit_or_error(caplog):
    service,_,calls,*_=setup_wiring(fault='timeout')
    token=all_token()
    response=send('assistant',service,token)
    combined=response.text+caplog.text+repr(service.audit)+repr(service.usage_audit.records())
    assert token not in combined
    assert service.secret_source.value.get_secret_value() not in combined
    assert BODIES['assistant']['question'] not in combined
    assert len(calls)==1


@pytest.mark.parametrize('mode',['duplicate_header','missing_signing_key','permission_scope_mismatch','unverified_price'])
def test_additional_denials(mode):
    service,_,calls,_,permissions,pricing=setup_wiring()
    if mode=='missing_signing_key':service.verifier=SignedCredentialVerifier(authority=SyntheticAuthority(),clock=lambda:100)
    if mode=='permission_scope_mismatch':
        original=permissions.grant
        permissions.grant=lambda a,f:replace(original(a,f),feature=AIFeature.REPORT)
    if mode=='unverified_price':pricing.resolve=lambda f:OfflinePricePermit(ModelPrice(MODEL,1,1,'OFFICIAL_SELF_DECLARED'),32000,1000)
    if mode=='duplicate_header':
        token=all_token()
        response=ASGIClient(create_app(security_wiring=service)).post(PREFIX+'assistant',json=BODIES['assistant'],headers=[('Authorization','Bearer '+token)]*2)
    else:response=send('assistant',service,all_token())
    assert response.status_code in (401,403,503) and not calls


def test_fake_success_never_clears_live_readiness():
    service,_,_,*_=setup_wiring()
    assert send('assistant',service,all_token()).status_code==200
    readiness=service.live_readiness('AI-04')
    assert readiness['status']=='BLOCKED' and readiness['paid_enabled'] is False
    assert 'IMAGE_DECODING_NOT_IMPLEMENTED' in readiness['blockers']
    assert readiness['business_commit_gate']=='RULE_NOT_APPROVED'
