import ast
import importlib
from dataclasses import replace
from pathlib import Path
import socket
import pytest
from app.authentication.errors import AuthError, AuthorizationDenied, ResourceNotFound, AuthContextUnavailable


def test_ERR_01():
    for cls,status in [(AuthError,401),(AuthorizationDenied,403),(ResourceNotFound,404)]:
        error=cls()
        assert error.status_code==status
        assert error.response()=={'code':error.code}


def test_ERR_02(env,context):
    env.source.error=True
    with pytest.raises(AuthContextUnavailable) as error: env.keys.get_key('new','RS256')
    assert error.value.status_code==503
    context.ports.error=True
    with pytest.raises(AuthContextUnavailable): context.resolve()


def test_ERR_03(env,caplog):
    secret='TEST_ONLY JWT private-key session subject@example.invalid'
    def fail(): raise RuntimeError(secret)
    env.source.refresh=fail
    with pytest.raises(AuthContextUnavailable) as error: env.keys.get_key('new','RS256')
    assert secret not in str(error.value.response())+repr(error.value)+caplog.text
    assert error.value.__suppress_context__ is True
    assert caplog.text==''


def test_ERR_04(env,caplog):
    malicious='https://evil.invalid/\r\nAuthorization: secret SQL Traceback'
    with pytest.raises(AuthError) as error: env.verifier.verify(env.token(headers={'kid':malicious}))
    assert malicious not in str(error.value.response())+caplog.text
    assert caplog.text==''


@pytest.mark.parametrize('address', [('192.0.2.1',443), ('2001:db8::1',443,0,0)])
def test_OFF_01(address):
    # Call the installed guard with a socket-less receiver. No FD is allocated.
    receiver=object()
    for method in (socket.socket.connect, socket.socket.connect_ex):
        with pytest.raises(RuntimeError,match='network forbidden'):
            method(receiver,address)
    for method in (socket.socket.sendto, socket.socket.sendmsg):
        with pytest.raises(RuntimeError,match='network forbidden'):
            method(receiver,b'TEST_ONLY',address)
    for call in [lambda:socket.getaddrinfo('example.invalid',443),
                 lambda:socket.create_connection(address[:2]),
                 lambda:socket.gethostbyname('example.invalid'),
                 lambda:socket.gethostbyname_ex('example.invalid'),
                 lambda:socket.gethostbyaddr(address[0]),
                 lambda:socket.getnameinfo(address,0)]:
        with pytest.raises(RuntimeError,match='network forbidden'):
            call()


def test_OFF_02(env):
    for module in ['app.authentication.jwt','app.authentication.jwks','app.authz.adapters.context','app.authz.adapters.evaluator']:
        importlib.import_module(module)
    assert env.source.calls==0
    with pytest.raises(AuthContextUnavailable): replace(env.policy,mode='production')
    from app.main import create_app
    from fastapi.testclient import TestClient
    app=create_app()
    # FastAPI includes lazy router wrappers and Swagger's oauth2 redirect.
    # Validate actual API operations rather than substring-matching docs URLs.
    assert set(app.openapi()['paths'])=={'/health/live'}
    assert set(app.openapi()['paths']['/health/live'])=={'get'}
    with TestClient(app) as client:
        assert client.get('/health/live').status_code==200
        assert client.get('/auth').status_code==404
    assert env.source.calls==0


def test_OFF_03(env):
    for path in [*Path('app/authentication').glob('*.py'),*Path('app/authz/adapters').glob('*.py')]:
        assert not any(isinstance(node,ast.Assert) for node in ast.walk(ast.parse(path.read_text())))
    try: env.verifier.verify('invalid')
    except AuthError: pass
    else: pytest.fail('Explicit authentication guard absent')
    try: replace(env.policy,mode='production')
    except AuthContextUnavailable: pass
    else: pytest.fail('Production policy was accepted')


def test_OFF_04(context):
    from app.authz.deny import DenyByDefaultEvaluator
    from app.authz.interfaces import ActorContext
    from app.domain.permissions import Permission
    from app.domain.workflow import require_committable_business_operation
    from app.core.errors import RuleNotApprovedError
    s=context.resolve()
    assert isinstance(s.actor,ActorContext)
    assert not DenyByDefaultEvaluator().evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed
    with pytest.raises(RuleNotApprovedError): require_committable_business_operation(None)

    from app.schemas.commands import PendingRule
    from app.domain.workflow import transition
    for action in PendingRule.model_fields['action'].annotation.__args__:
        command=PendingRule(action=action,expected_version=1,idempotency_key='TEST_ONLY')
        with pytest.raises(RuleNotApprovedError):
            transition(None,command,s.actor,DenyByDefaultEvaluator(),event_id=s.request_id,now=None)
