"""TEST_ONLY: generated ephemeral keys, fake sources, fixed clocks; no real identities."""
import json
import socket
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from app.authentication.jwt import TrustedIssuerPolicy, JWTVerifier
from app.authentication.jwks import SnapshotPolicy, JWKSProvider
from app.authz.adapters.context import (Membership, CaseAuthorization, ActorContextResolver)
from app.authz.interfaces import CaseScope
from app.domain.permissions import Role, Permission


class TestClock:
    __test__ = False
    def __init__(self): self.value = 10000
    def now(self): return self.value


class Source:
    def __init__(self, raw): self.raw, self.calls, self.error = raw, 0, False
    def refresh(self):
        self.calls += 1
        if self.error: raise RuntimeError('TEST_ONLY secret URL\nSQL stack session')
        return self.raw


def jwk(key, kid='k1', algorithm='RS256'):
    cls = jwt.algorithms.RSAAlgorithm if algorithm == 'RS256' else jwt.algorithms.ECAlgorithm
    return {**json.loads(cls.to_jwk(key.public_key())), 'kid': kid, 'alg': algorithm,
            'use': 'sig', 'key_ops': ['verify']}


def raw(*keys): return json.dumps({'keys': keys}).encode()


@pytest.fixture(scope='session')
def rsa_keys():
    return [rsa.generate_private_key(public_exponent=65537, key_size=2048) for _ in range(2)]


@pytest.fixture
def env(rsa_keys):
    clock = TestClock()
    policy = TrustedIssuerPolicy('TEST_ONLY', 'https://issuer.test.invalid', 'TEST_ONLY',
                                  'RS256', 5, 300, 8192, True, frozenset())
    limits = SnapshotPolicy('TEST_ONLY', 100, 10, 10, 65536, 4)
    initial = raw(jwk(rsa_keys[0]))
    source = Source(initial)
    keys = JWKSProvider(policy, limits, clock, initial, source)
    claims = dict(iss=policy.issuer, aud=policy.audience, sub='TEST_ONLY_subject',
                  iat=9990, exp=10100, nbf=9990)
    def token(changes=None, headers=None, key=None):
        return jwt.encode({**claims, **(changes or {})}, key or rsa_keys[0], algorithm='RS256',
                          headers={'kid':'k1', **(headers or {})})
    return SimpleNamespace(clock=clock, policy=policy, limits=limits, keys=keys, source=source,
                           claims=claims, token=token, verifier=JWTVerifier(policy, clock, keys),
                           private=rsa_keys)


class Ports:
    def __init__(self):
        self.actor, self.tenant, self.case_id = uuid4(), uuid4(), uuid4()
        self.fresh, self.error, self.calls = True, False, []
        self.member = Membership(self.actor, self.tenant, 'active', frozenset({Role.LEVEL2}), 'm1')
        scope = CaseScope(self.tenant, self.case_id, uuid4(), uuid4(), frozenset({uuid4()}))
        self.case = CaseAuthorization(scope, frozenset({self.actor}), frozenset(), (),
                    frozenset({(Role.LEVEL2, Permission.REPORT_REVIEW, 2)}), 'c1')
    def actor_for(self, issuer, subject):
        self.calls.append(('identity', issuer, subject))
        return self.actor if subject == 'TEST_ONLY_subject' else None
    def read(self, *args):
        self.calls.append(args)
        if self.error: raise RuntimeError('TEST_ONLY provider secret\r\nURL stack')
        if len(args) == 2:
            return self.member if args == (self.actor, self.member.tenant_id) else None
        return self.case if args[:2] == (self.case.scope.tenant_id, self.case_id) else None
    def validate(self, *args):
        if self.error: raise RuntimeError('TEST_ONLY freshness secret')
        return self.fresh and args[2] == self.member.version and args[4] == self.case.version


@pytest.fixture
def context(env):
    ports = Ports()
    resolver = ActorContextResolver(ports, ports, ports, ports, env.clock,
                                    mode='TEST_ONLY', snapshot_ttl=20)
    identity = env.verifier.verify(env.token())
    def resolve(tenant=None):
        return resolver.resolve(identity, tenant or ports.tenant, ports.case_id, uuid4())
    return SimpleNamespace(ports=ports, resolver=resolver, identity=identity, resolve=resolve)


# Supplement, never weaken, the unchanged P5-01 session/fixture guards.
# Installed on collection import so these extra entrypoints are blocked then too.
_extra_network_guard = pytest.MonkeyPatch()


def _deny_extra_network(*args, **kwargs):
    raise RuntimeError('External network forbidden in P5-02 tests')


for _name in ('sendto', 'sendmsg', 'sendmsg_afalg'):
    if hasattr(socket.socket, _name):
        _extra_network_guard.setattr(socket.socket, _name, _deny_extra_network)
for _name in ('gethostbyname', 'gethostbyname_ex', 'gethostbyaddr', 'getnameinfo'):
    _extra_network_guard.setattr(socket, _name, _deny_extra_network)


def pytest_unconfigure(config):
    _extra_network_guard.undo()
