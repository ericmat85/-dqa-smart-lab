"""Bounded offline snapshots. Refresh is an injected port, never an HTTP client."""
from dataclasses import dataclass
from threading import Lock
from typing import Protocol
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from .jwt import strict_json, number, TrustedIssuerPolicy
from .errors import AuthError, AuthContextUnavailable


class SnapshotSource(Protocol):
    def refresh(self) -> bytes: ...


@dataclass(frozen=True)
class SnapshotPolicy:
    mode: str
    ttl: float
    cooldown: float
    negative_ttl: float
    max_response: int
    max_keys: int

    def __post_init__(self):
        if (self.mode != 'TEST_ONLY' or any(not number(x) or x <= 0 for x in
                (self.ttl, self.cooldown, self.negative_ttl))
                or type(self.max_response) is not int or not 1 <= self.max_response <= 1048576
                or type(self.max_keys) is not int or not 1 <= self.max_keys <= 128):
            raise AuthContextUnavailable()


class JWKSProvider:
    def __init__(self, policy, limits, clock, initial: bytes, source: SnapshotSource | None = None):
        if not isinstance(policy, TrustedIssuerPolicy) or not isinstance(limits, SnapshotPolicy):
            raise AuthContextUnavailable()
        self.policy, self.limits, self.clock, self.source = policy, limits, clock, source
        self._lock = Lock()
        self._keys = self._parse(initial)
        self._expires = self._now() + limits.ttl
        self._version = 1
        self._next_refresh = float('-inf')
        self._negative = {}  # bounded to max_keys; one issuer/provider
        self._refresh_failed = False

    def _now(self):
        try:
            now = self.clock.now()
        except Exception:
            raise AuthContextUnavailable() from None
        if not number(now):
            raise AuthContextUnavailable()
        return now

    def _parse(self, raw):
        try:
            if not isinstance(raw, bytes) or len(raw) > self.limits.max_response:
                raise ValueError()
            obj = strict_json(raw)
            if set(obj) != {'keys'} or not isinstance(obj['keys'], list) or not 1 <= len(obj['keys']) <= self.limits.max_keys:
                raise ValueError()
            keys = {}
            for item in obj['keys']:
                if not isinstance(item, dict):
                    raise ValueError()
                kid = item.get('kid')
                if (not isinstance(kid, str) or not kid or len(kid) > 128 or kid in keys
                        or item.get('alg') != self.policy.algorithm or item.get('use') != 'sig'
                        or item.get('key_ops') != ['verify']):
                    raise ValueError()
                fields = {'kty', 'kid', 'alg', 'use', 'key_ops'}
                if self.policy.algorithm == 'RS256':
                    if item.get('kty') != 'RSA' or set(item) != fields | {'n', 'e'}:
                        raise ValueError()
                else:
                    if item.get('kty') != 'EC' or item.get('crv') != 'P-256' or set(item) != fields | {'crv', 'x', 'y'}:
                        raise ValueError()
                key = jwt.PyJWK.from_dict(item, algorithm=self.policy.algorithm).key
                if self.policy.algorithm == 'RS256':
                    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048 or key.public_numbers().e < 65537:
                        raise ValueError()
                elif not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
                    raise ValueError()
                keys[kid] = key
            return keys
        except Exception:
            raise AuthContextUnavailable() from None

    def get_key(self, kid, algorithm):
        if algorithm != self.policy.algorithm or not isinstance(kid, str) or not 1 <= len(kid) <= 128:
            raise AuthError()
        # Serialize lookup+refresh: concurrent callers reuse one completed snapshot.
        with self._lock:
            now = self._now()
            fresh = now < self._expires
            if fresh and kid in self._keys:
                return self._keys[kid], self._version
            self._negative = {k: v for k, v in self._negative.items() if v > now}
            if fresh and kid in self._negative:
                raise AuthError()
            if now < self._next_refresh:
                if fresh and not self._refresh_failed:
                    raise AuthError()
                raise AuthContextUnavailable()
            self._next_refresh = now + self.limits.cooldown
            try:
                if self.source is None:
                    raise AuthContextUnavailable()
                new_keys = self._parse(self.source.refresh())
                new_expiry = self._now() + self.limits.ttl
            except Exception:
                self._refresh_failed = True
                raise AuthContextUnavailable() from None
            # Only complete valid response replaces old keys; failure never extends TTL.
            self._keys = new_keys
            self._expires = new_expiry
            self._refresh_failed = False
            self._version += 1
            self._negative.clear()
            if kid not in self._keys:
                if len(self._negative) >= self.limits.max_keys:
                    self._negative.pop(next(iter(self._negative)))
                self._negative[kid] = now + self.limits.negative_ttl
                raise AuthError()
            return self._keys[kid], self._version
