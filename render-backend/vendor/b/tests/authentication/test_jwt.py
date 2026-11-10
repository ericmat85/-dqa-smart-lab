"""Each test name maps to the reviewed 55-ID matrix; variants are extra evidence."""
import base64
import json
from dataclasses import replace
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from app.authentication.jwt import (JWTVerifier, AuthorizationParser, TrustedIssuerPolicy)
from app.authentication.jwks import JWKSProvider
from app.authentication.errors import AuthError, AuthContextUnavailable
from .conftest import jwk, raw


def b64(value): return base64.urlsafe_b64encode(value).decode().rstrip('=')


def test_JWT_01(env):
    identity = env.verifier.verify(env.token())
    assert identity.subject == 'TEST_ONLY_subject'
    assert not hasattr(identity, 'roles')
    # Also verify maintained-library EC path, not just RSA.
    key = ec.generate_private_key(ec.SECP256R1())
    policy = replace(env.policy, algorithm='ES256')
    keys = JWKSProvider(policy, env.limits, env.clock, raw(jwk(key, algorithm='ES256')))
    token = jwt.encode(env.claims, key, algorithm='ES256', headers={'kid':'k1'})
    assert JWTVerifier(policy, env.clock, keys).verify(token).issuer == policy.issuer


def test_JWT_02(env):
    with pytest.raises(AuthError): env.verifier.verify(env.token(key=env.private[1]))


@pytest.mark.parametrize('exp', [9994, 9995])
def test_JWT_03(env, exp):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'exp':exp, 'iat':9900, 'nbf':9900}))
    assert env.verifier.verify(env.token({'exp':9996, 'iat':9900, 'nbf':9900}))


def test_JWT_04(env):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'nbf':10006}))


@pytest.mark.parametrize('issuer', ['https://issuer.test.invalid/', 'https://evil.invalid'])
def test_JWT_05(env, issuer):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'iss':issuer}))


@pytest.mark.parametrize('aud', ['wrong', ['TEST_ONLY','wrong'], [], 12])
def test_JWT_06(env, aud):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'aud':aud}))


@pytest.mark.parametrize('sub', [None, '', 1, 'bad\nsubject'])
def test_JWT_07(env, sub):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'sub':sub}))


def test_JWT_08(env):
    token = b64(b'{"alg":"none","kid":"k1","typ":"JWT"}')+'.'+b64(json.dumps(env.claims).encode())+'.'
    with pytest.raises(AuthError): env.verifier.verify(token)


def test_JWT_09(env):
    token = jwt.encode(env.claims, b'TEST_ONLY_HMAC', algorithm='HS256', headers={'kid':'k1'})
    with pytest.raises(AuthError): env.verifier.verify(token)
    assert env.source.calls == 0


@pytest.mark.parametrize('field', ['exp','iat'])
def test_JWT_10(env, field):
    claims = dict(env.claims); claims.pop(field)
    with pytest.raises(AuthError): env.verifier.verify(jwt.encode(claims, env.private[0], algorithm='RS256', headers={'kid':'k1'}))


@pytest.mark.parametrize('change', [{'iat':10006}, {'exp':9990}, {'exp':11000}, {'nbf':10100}])
def test_JWT_11(env, change):
    with pytest.raises(AuthError): env.verifier.verify(env.token(change))


@pytest.mark.parametrize('value', [True, '10001', float('nan'), float('inf'), 2**60, None])
def test_JWT_12(env, value):
    with pytest.raises(AuthError): env.verifier.verify(env.token({'exp':value}))


def test_JWT_13(env):
    claims = dict(env.claims); claims.pop('nbf')
    token = jwt.encode(claims, env.private[0], algorithm='RS256', headers={'kid':'k1'})
    with pytest.raises(AuthError): env.verifier.verify(token)
    p = replace(env.policy, require_nbf=False, extra_audiences=frozenset({'extra'}))
    keys = JWKSProvider(p, env.limits, env.clock, raw(jwk(env.private[0])))
    assert JWTVerifier(p, env.clock, keys).verify(token).not_before is None
    assert JWTVerifier(p, env.clock, keys).verify(env.token({'aud':['TEST_ONLY','extra']}))


@pytest.mark.parametrize('headers', [[], ['Basic abc'], ['Bearer '], ['Bearer a b'], ['Bearer a','Bearer b'], ['Bearer a\r\n']])
def test_JWT_14(env, headers):
    with pytest.raises(AuthError): AuthorizationParser(8192).parse(headers)
    assert AuthorizationParser(8192).parse(['Bearer '+env.token()]) == env.token()


@pytest.mark.parametrize('token', ['a.b', 'a.b.c.d', '!.e30.AA', 'e30=.e30.AA', 'a'*8193,
    b64(b'{"alg":"RS256","alg":"RS256"}')+'.e30.AA', 'W10.e30.AA'])
def test_JWT_15(env, token):
    with pytest.raises(AuthError): env.verifier.verify(token)


@pytest.mark.parametrize('header', [{'crit':['x']},{'b64':False},{'typ':'refresh'},{'jku':'https://evil.invalid'},{'jwk':{}}])
def test_JWT_16(env, header):
    with pytest.raises(AuthError): env.verifier.verify(env.token(headers=header))
