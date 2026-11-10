import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import pytest
from app.authentication.errors import AuthError, AuthContextUnavailable
from app.authentication.jwks import JWKSProvider
from .conftest import jwk, raw


@pytest.mark.parametrize('kid', [None, '', 1])
def test_KEY_01(env, kid):
    # Build malformed header without library's own kid validation.
    from .test_jwt import b64
    token = b64(json.dumps({'alg':'RS256','typ':'JWT','kid':kid}).encode())+'.'+b64(json.dumps(env.claims).encode())+'.AA'
    with pytest.raises(AuthError): env.verifier.verify(token)


def test_KEY_02(env):
    env.source.raw = raw(jwk(env.private[1], 'k2'))
    assert env.verifier.verify(env.token(key=env.private[1], headers={'kid':'k2'})).key_version == 2
    assert env.source.calls == 1


def test_KEY_03(env):
    with pytest.raises(AuthError) as error: env.keys.get_key('absent','RS256')
    assert type(error.value) is AuthError
    assert env.source.calls == 1


def test_KEY_04(env):
    with pytest.raises(AuthContextUnavailable):
        JWKSProvider(env.policy, env.limits, env.clock, raw(jwk(env.private[0]),jwk(env.private[1])))
    env.source.raw = raw(jwk(env.private[0]),jwk(env.private[1]))
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('new','RS256')
    assert env.verifier.verify(env.token()).key_version == 1


def test_KEY_05(env):
    env.source.error = True
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('new','RS256')
    assert env.keys._version == 1


def test_KEY_06(env):
    env.source.error = True
    assert env.verifier.verify(env.token())
    assert env.source.calls == 0
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('new','RS256')
    assert env.source.calls == 1


def test_KEY_07(env):
    env.clock.value += 101; env.source.error = True
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('k1','RS256')
    with pytest.raises(AuthContextUnavailable): env.keys.get_key('k1','RS256')


@pytest.mark.parametrize('header', [{'jku':'https://169.254.169.254/'},{'x5u':'https://evil.invalid/'},{'jwk':{}},{'kid':'../../key'}])
def test_KEY_08(env, header):
    with pytest.raises(AuthError): env.verifier.verify(env.token(headers=header))
    assert env.source.calls == 0


def test_KEY_09(env):
    # There is deliberately no URL/transport provider: substitution is impossible.
    with pytest.raises(TypeError): JWKSProvider(env.policy, env.limits, env.clock, raw(jwk(env.private[0])), url='http://127.0.0.1')
    with pytest.raises(AuthContextUnavailable):
        JWKSProvider(env.policy, env.limits, env.clock, b'https://evil.invalid/redirect')


@pytest.mark.parametrize('change', [{'kty':'oct'},{'use':'enc'},{'key_ops':['sign']},{'alg':'HS256'},{'d':'private'},{'n':'AQAB'},{'e':'Aw'},{'crv':'P-384'}])
def test_KEY_10(env, change):
    with pytest.raises(AuthContextUnavailable):
        JWKSProvider(env.policy, env.limits, env.clock, raw({**jwk(env.private[0]), **change}))


def test_KEY_11(env):
    env.source.raw = raw(jwk(env.private[1],'k2'))
    env.keys.get_key('k2','RS256')
    with pytest.raises(AuthError): env.keys.get_key('k1','RS256')


def test_KEY_12(env):
    env.source.raw = raw(jwk(env.private[1],'k2'))
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: env.keys.get_key('k2','RS256'), range(24)))
    assert len(results) == 24 and env.source.calls == 1
    for i in range(50):
        with pytest.raises(AuthError): env.keys.get_key('missing'+str(i),'RS256')
    assert env.source.calls == 1 and len(env.keys._negative) <= env.limits.max_keys
    env.clock.value += 11
    with pytest.raises(AuthError): env.keys.get_key('missing','RS256')
    assert env.source.calls == 2
    for bad in [b' '*65537, raw(*[jwk(env.private[0],str(i)) for i in range(5)])]:
        with pytest.raises(AuthContextUnavailable): JWKSProvider(env.policy, env.limits, env.clock, bad)
