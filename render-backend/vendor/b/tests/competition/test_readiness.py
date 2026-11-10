from hashlib import sha256
import pytest
from pydantic import ValidationError
from app.competition.model_policy import ModelPolicy
from app.competition.readiness import DeploymentPlan, paid_readiness
from app.competition.access_control import OfflineSession, MemorySessionVerifier, DenyVerifier
from app.competition.main import create_app
from app.competition.provider_models import AIFeature
from .client import ASGIClient
from .test_contract import BODIES, PREFIX
from .test_signature_quality import PAYLOAD

TOKEN='synthetic_offline_test_token_not_a_real_secret_123'
BODIES5=dict(BODIES, **{'signature-quality':PAYLOAD})
def verifier(scopes=frozenset(AIFeature),active=True,expiry=200):
    return MemorySessionVerifier([OfflineSession('synthetic-session','synthetic-subject',sha256(TOKEN.encode()).hexdigest(),scopes,expiry,active)],clock=lambda:100)

@pytest.mark.parametrize('endpoint',BODIES5)
def test_registered_default_denied(endpoint):
    app=create_app()
    assert PREFIX+endpoint in app.openapi()['paths']
    result=ASGIClient(app).post(PREFIX+endpoint,json=BODIES5[endpoint])
    assert result.status_code==503 and result.json()['status']=='not_implemented'

@pytest.mark.parametrize('endpoint',BODIES5)
def test_missing_access_denied(endpoint):
    result=ASGIClient(create_app(access_verifier=DenyVerifier())).post(PREFIX+endpoint,json=BODIES5[endpoint])
    assert result.status_code==401 and result.json()['business_commit_gate']=='RULE_NOT_APPROVED'

@pytest.mark.parametrize('endpoint',BODIES5)
def test_offline_session_not_paid_authorization(endpoint):
    result=ASGIClient(create_app(access_verifier=verifier())).post(PREFIX+endpoint,json=BODIES5[endpoint],headers={'Authorization':'Bearer '+TOKEN})
    assert result.status_code==503

@pytest.mark.parametrize('change',[{'enabled':True},{'enabled':0},{'admin':True},{'context_limit':True},{'max_output_tokens':-1},{'pricing_status':'PRICING_VERIFIED'},{'pricing_source':'https://attacker.test'},{'pricing_verified_at':'2026-11-06'},{'input_token_price':0.1},{'context_limit':2,'max_output_tokens':3}])
def test_invalid_model_policy(change):
    with pytest.raises(ValidationError):ModelPolicy(**change)

@pytest.mark.parametrize('feature',[f.value for f in AIFeature])
def test_paid_features_blocked(feature):
    result=paid_readiness(ModelPolicy(),feature=feature)
    assert not result['paid_enabled'] and result['status']=='BLOCKED'
    assert 'RESTART_BUDGET_RECONCILIATION_NOT_IMPLEMENTED' in result['blockers']
    assert 'PRICING_UNVERIFIED' in result['blockers']
    if feature=='AI-04':assert 'IMAGE_DECODING_NOT_IMPLEMENTED' in result['blockers']

@pytest.mark.parametrize('workers,instances',[(1,1),(2,1),(1,2)])
def test_deployment_restart_and_no_secret_read(workers,instances):
    class Secret:
        def load(self):raise RuntimeError('must never read')
    result=paid_readiness(ModelPolicy(),deployment=DeploymentPlan(workers=workers,instances=instances),secret_source=Secret(),access_verifier=verifier())
    assert not result['paid_enabled'] and 'DURABLE_SHARED_LEDGER_NOT_IMPLEMENTED' in result['blockers']

@pytest.mark.parametrize('kind',['revoked','expired','inactive','no_scope','admin_token','bad_header','duplicate'])
def test_session_negative_redacted(kind):
    v=verifier(scopes=frozenset() if kind=='no_scope' else frozenset(AIFeature),active=kind!='inactive',expiry=99 if kind=='expired' else 200)
    if kind=='revoked':v.revoke('synthetic-session')
    headers=[('Authorization','Bearer '+TOKEN)]
    if kind=='admin_token':headers=[('Authorization','Bearer admin')]
    if kind=='bad_header':headers=[('Authorization',TOKEN)]
    if kind=='duplicate':headers*=2
    result=ASGIClient(create_app(access_verifier=v)).post(PREFIX+'assistant',json=BODIES['assistant'],headers=headers)
    assert result.status_code==401 and TOKEN not in result.text

def test_openapi_unchanged_and_origin_not_identity():
    app=create_app(access_verifier=verifier())
    assert app.openapi()==create_app().openapi()
    result=ASGIClient(app).post(PREFIX+'assistant',json=BODIES['assistant'],headers={'Origin':'https://unapproved.test','Authorization':'Bearer '+TOKEN})
    assert result.status_code==403

def test_synthetic_prices_not_official():
    policy=ModelPolicy(pricing_status='SYNTHETIC_TEST_ONLY',pricing_source='SYNTHETIC_TEST_FIXTURE',input_token_price=1,output_token_price=2)
    assert not paid_readiness(policy)['paid_enabled']

@pytest.mark.parametrize('endpoint',BODIES5)
def test_authorized_fake_advisory_only(endpoint):
    from .test_signature_quality import SignatureFakeProvider
    result=ASGIClient(create_app(provider=SignatureFakeProvider(),access_verifier=verifier())).post(PREFIX+endpoint,json=BODIES5[endpoint],headers={'Authorization':'Bearer '+TOKEN})
    assert result.status_code==200
    assert result.json()['provider_mode']=='FAKE_OFFLINE'
    assert result.json()['business_actions_authorized'] is False
