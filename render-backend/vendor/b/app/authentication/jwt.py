"""Strict bounded compact-JWS validation; cryptography delegated to PyJWT."""
import base64
import json
import math
import re
from dataclasses import dataclass
from typing import Protocol
import jwt
from .errors import AuthError, AuthContextUnavailable


class Clock(Protocol):
    def now(self) -> float: ...


@dataclass(frozen=True)
class TrustedIssuerPolicy:
    # No defaults: every limit is explicitly injected; only TEST_ONLY supported.
    mode: str
    issuer: str
    audience: str
    algorithm: str
    skew: float
    max_lifetime: float
    max_token_bytes: int
    require_nbf: bool
    extra_audiences: frozenset[str]

    def __post_init__(self):
        if (self.mode != 'TEST_ONLY' or not isinstance(self.issuer, str) or not self.issuer
                or not isinstance(self.audience, str) or not self.audience
                or self.algorithm not in {'RS256', 'ES256'}
                or type(self.require_nbf) is not bool
                or not isinstance(self.extra_audiences, frozenset)
                or not all(isinstance(x, str) and x for x in self.extra_audiences)
                or type(self.max_token_bytes) is not int or not 1 <= self.max_token_bytes <= 65536
                or not number(self.skew) or not 0 <= self.skew <= 120
                or not number(self.max_lifetime) or not 0 < self.max_lifetime <= 86400):
            raise AuthContextUnavailable()


@dataclass(frozen=True)
class VerifiedIdentity:
    issuer: str
    subject: str
    issued_at: float
    expires_at: float
    not_before: float | None
    key_version: int


def number(value):
    return type(value) in (int, float) and abs(value) <= 2**53 and math.isfinite(value)


def decode_segment(segment):
    if not isinstance(segment, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', segment):
        raise AuthError()
    try:
        raw = base64.urlsafe_b64decode(segment + '=' * (-len(segment) % 4))
        if base64.urlsafe_b64encode(raw).decode().rstrip('=') != segment:
            raise AuthError()
        return raw
    except Exception:
        raise AuthError() from None


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise AuthError()
            result[key] = value
        return result
    try:
        result = json.loads(raw, object_pairs_hook=pairs,
                            parse_constant=lambda _: (_ for _ in ()).throw(AuthError()))
        if not isinstance(result, dict):
            raise AuthError()
        return result
    except Exception:
        raise AuthError() from None


class AuthorizationParser:
    def __init__(self, max_bytes):
        if type(max_bytes) is not int or not 1 <= max_bytes <= 65536:
            raise AuthContextUnavailable()
        self.max_bytes = max_bytes

    def parse(self, headers: list[str]) -> str:
        if not isinstance(headers, list) or len(headers) != 1 or not isinstance(headers[0], str):
            raise AuthError()
        value = headers[0]
        if len(value) > self.max_bytes + 7 or not re.fullmatch(r'(?i:Bearer) [A-Za-z0-9_.-]+', value):
            raise AuthError()
        return value[7:]


class JWTVerifier:
    def __init__(self, policy, clock, keys):
        if not isinstance(policy, TrustedIssuerPolicy) or keys.policy != policy:
            raise AuthContextUnavailable()
        self.policy, self.clock, self.keys = policy, clock, keys

    def verify(self, token):
        p = self.policy
        if not isinstance(token, str) or len(token) > p.max_token_bytes:
            raise AuthError()
        parts = token.split('.')
        if len(parts) != 3:
            raise AuthError()
        header, claims = (strict_json(decode_segment(x)) for x in parts[:2])
        decode_segment(parts[2])
        if (set(header) - {'alg', 'typ', 'kid'} or header.get('alg') != p.algorithm
                or header.get('typ') != 'JWT' or not isinstance(header.get('kid'), str)
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', header['kid'])):
            raise AuthError()
        # Validate claims before key refresh: malformed tokens cannot force I/O.
        aud = claims.get('aud')
        audiences = [aud] if isinstance(aud, str) else aud
        if (claims.get('iss') != p.issuer or not isinstance(claims.get('sub'), str)
                or not claims['sub'] or len(claims['sub']) > 256
                or any(ord(c) < 32 for c in claims['sub'])
                or not isinstance(audiences, list) or not audiences
                or not all(isinstance(a, str) for a in audiences)
                or len(audiences) != len(set(audiences)) or p.audience not in audiences
                or set(audiences) - {p.audience, *p.extra_audiences}):
            raise AuthError()
        exp, iat, nbf = (claims.get(x) for x in ('exp', 'iat', 'nbf'))
        if (not number(exp) or not number(iat) or (p.require_nbf and 'nbf' not in claims)
                or ('nbf' in claims and not number(nbf))):
            raise AuthError()
        try:
            now = self.clock.now()
        except Exception:
            raise AuthContextUnavailable() from None
        if not number(now):
            raise AuthContextUnavailable()
        if (exp <= now - p.skew or iat > now + p.skew or exp <= iat
                or exp - iat > p.max_lifetime
                or (nbf is not None and (nbf > now + p.skew or nbf >= exp))):
            raise AuthError()
        key, version = self.keys.get_key(header['kid'], p.algorithm)
        try:
            jwt.decode(token, key, algorithms=[p.algorithm], options={
                'verify_exp': False, 'verify_iat': False, 'verify_nbf': False,
                'verify_aud': False, 'verify_iss': False, 'verify_sub': False})
        except Exception:
            raise AuthError() from None
        return VerifiedIdentity(p.issuer, claims['sub'], iat, exp, nbf, version)
