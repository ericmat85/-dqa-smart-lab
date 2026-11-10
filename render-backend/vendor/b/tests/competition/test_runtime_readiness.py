"""ASGI in-process checks only: these do NOT prove a Uvicorn server started."""
import asyncio
import hashlib
import inspect
import json
import os
import httpx
import pytest
from fastapi import FastAPI
from app.competition.main import create_app
from .client import ASGIClient
from .test_contract import BODIES,PREFIX
from .test_signature_quality import PAYLOAD
from .test_security_wiring import setup_wiring

BODIES5=dict(BODIES,**{'signature-quality':PAYLOAD})


def test_factory_is_zero_required_arguments():
    required=[p for p in inspect.signature(create_app).parameters.values() if p.default is inspect.Parameter.empty]
    assert required==[] and isinstance(create_app(),FastAPI)


def test_in_process_lifespan_and_schema_liveness():
    async def run():
        app=create_app()
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://synthetic.test',trust_env=False) as client:
                response=await client.get('/openapi.json')
                assert response.status_code==200
                assert set(response.json()['paths'])=={PREFIX+p for p in BODIES5}
    asyncio.run(run())


@pytest.mark.parametrize('endpoint',BODIES5)
def test_asgi_default_feature_disabled(endpoint):
    result=ASGIClient(create_app()).post(PREFIX+endpoint,json=BODIES5[endpoint])
    assert result.status_code==503 and result.json()['status']=='not_implemented'
    assert result.json()['business_commit_gate']=='RULE_NOT_APPROVED'


def test_runtime_openapi_canonical_unchanged():
    raw=json.dumps(create_app().openapi(),sort_keys=True,separators=(',',':')).encode()
    assert hashlib.sha256(raw).hexdigest()=='aa8fefdabd411049950c81ef841d1d5ca411c30c75a7e7c7958edb6c175f9b55'


def test_schema_liveness_does_not_grant_advice_access():
    service,_,calls,*_=setup_wiring()
    app=create_app(security_wiring=service)
    client=ASGIClient(app)
    assert client.request('GET','/openapi.json').status_code==200
    assert client.post(PREFIX+'assistant',json=BODIES['assistant']).status_code==401
    assert not calls


def test_factory_does_not_load_environment_secrets(monkeypatch):
    def denied(*args,**kwargs):raise RuntimeError('Environment secret access forbidden')
    monkeypatch.setattr(os,'getenv',denied)
    app=create_app()
    assert app.state.competition_advice_service.__class__.__name__=='DisabledAdviceService'
