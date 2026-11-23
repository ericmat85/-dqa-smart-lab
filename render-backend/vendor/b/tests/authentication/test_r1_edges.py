"""Additional variants of reviewed matrix IDs; not new business policies."""
from dataclasses import replace
from pathlib import Path
import subprocess
import sys
import pytest
from app.authentication.errors import AuthError, AuthContextUnavailable
from app.authentication.jwt import AuthorizationParser, number
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.domain.permissions import Permission
from .conftest import jwk, raw


def test_JWT_12_huge_numeric_date(env):
    assert number(10**1000) is False
    with pytest.raises(AuthError): env.verifier.verify(env.token({'exp':10**1000}))


def test_JWT_14_invalid_parser_configuration():
    for value in (None, True, 0, -1):
        with pytest.raises(AuthContextUnavailable): AuthorizationParser(value)


def test_ERR_02_clock_failure_redacted(env):
    def fail(): raise RuntimeError('TEST_ONLY secret provider URL')
    env.clock.now=fail
    with pytest.raises(AuthContextUnavailable) as error: env.verifier.verify(env.token())
    assert str(error.value)=='AUTH_CONTEXT_UNAVAILABLE'


def test_KEY_05_failed_refresh_cooldown_remains_unavailable(env):
    env.source.error=True
    for _ in range(3):
        with pytest.raises(AuthContextUnavailable): env.keys.get_key('new','RS256')
    assert env.source.calls==1
    assert env.verifier.verify(env.token())


def test_KEY_11_rotation_is_atomic_on_post_refresh_clock_failure(env):
    old=env.keys._keys
    def refresh():
        env.clock.value=float('nan')
        return raw(jwk(env.private[1],'k2'))
    env.source.refresh=refresh
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('k2','RS256')
    assert env.keys._keys is old and env.keys._version==1
    env.clock.value=10000
    assert env.verifier.verify(env.token())


def test_RBAC_04_string_grants_not_authoritative(env,context):
    p=context.ports
    p.case=replace(p.case,grants=frozenset({('level2','review_report',2)}))
    s=context.resolve()
    evaluator=SnapshotPermissionEvaluator(s,p,env.clock,mode='TEST_ONLY',review_level=2)
    assert not evaluator.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed


def test_RBAC_07_invalid_review_level(env,context):
    with pytest.raises(AuthContextUnavailable):
        SnapshotPermissionEvaluator(context.resolve(),context.ports,env.clock,mode='TEST_ONLY',review_level=True)


def test_CTX_10_invalid_snapshot_expiry(env,context):
    s=replace(context.resolve(),expires_at=float('nan'))
    evaluator=SnapshotPermissionEvaluator(s,context.ports,env.clock,mode='TEST_ONLY',review_level=2)
    assert not evaluator.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed


@pytest.mark.parametrize('optimized',[False,True])
def test_OFF_02_fresh_interpreter_factory(optimized):
    script = '''
import socket

def blocked(*args, **kwargs): raise RuntimeError('external I/O forbidden')
for name in ('connect','connect_ex','sendto','sendmsg'):
    if hasattr(socket.socket,name): setattr(socket.socket,name,blocked)
for name in ('create_connection','getaddrinfo','gethostbyname','gethostbyname_ex','gethostbyaddr','getnameinfo'):
    setattr(socket,name,blocked)
import app.authentication.jwt
import app.authentication.jwks
import app.authz.adapters.context
import app.authz.adapters.evaluator
from app.main import create_app
from fastapi.testclient import TestClient
app=create_app()
paths=app.openapi()['paths']
if set(paths) != {'/health/live'} or set(paths['/health/live']) != {'get'}:
    raise SystemExit('unexpected route')
with TestClient(app) as client:
    if client.get('/health/live').status_code!=200: raise SystemExit('health failed')
    if client.get('/auth').status_code!=404: raise SystemExit('unexpected auth route')
'''
    args=[sys.executable]+(['-O'] if optimized else [])+['-c',script]
    result=subprocess.run(args,cwd=Path(__file__).parents[2],capture_output=True,text=True,timeout=30)
    assert result.returncode==0,result.stderr
