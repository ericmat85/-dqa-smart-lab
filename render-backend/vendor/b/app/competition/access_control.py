"""Offline single-organization access seam; not production authentication."""
from dataclasses import dataclass, field
from hashlib import sha256
from hmac import compare_digest
from threading import RLock
from time import monotonic
from typing import Protocol
from .provider_models import AIFeature
from .routes import error_response
from .signature_contracts import SIGNATURE_PATH, signature_error_response

PATH_FEATURE = {
    "/api/competition/ai/request-review": AIFeature.REQUEST,
    "/api/competition/ai/schedule-recommendation": AIFeature.SCHEDULE,
    "/api/competition/ai/report-review": AIFeature.REPORT,
    SIGNATURE_PATH: AIFeature.SIGNATURE,
    "/api/competition/ai/assistant": AIFeature.ASSISTANT,
}

class AccessDenied(Exception):
    pass

class AccessVerifier(Protocol):
    def authorize(self, token: str, feature: AIFeature) -> None: ...

class DenyVerifier:
    def authorize(self, token, feature):
        raise AccessDenied()

@dataclass(frozen=True)
class OfflineSession:
    session_id: str
    subject_id: str
    token_digest: str = field(repr=False)
    scopes: frozenset[AIFeature]
    expires_at: float
    active: bool = True

    def __post_init__(self):
        import math
        if (not self.session_id or not self.subject_id or len(self.token_digest) != 64
            or any(c not in "0123456789abcdef" for c in self.token_digest)
            or not isinstance(self.scopes, frozenset)
            or any(not isinstance(s, AIFeature) for s in self.scopes)
            or type(self.active) is not bool or type(self.expires_at) not in (float, int)
            or not math.isfinite(self.expires_at)):
            raise ValueError("Invalid offline session")

class MemorySessionVerifier:
    mode = "OFFLINE_MEMORY_ONLY"
    def __init__(self, records=(), *, clock=monotonic):
        self._records = tuple(records)
        if any(type(r) is not OfflineSession for r in self._records):
            raise ValueError("Invalid offline record")
        if len({r.session_id for r in self._records}) != len(self._records) or len({r.token_digest for r in self._records}) != len(self._records):
            raise ValueError("Duplicate offline record")
        self._revoked = set()
        self._lock = RLock()
        self._clock = clock

    def revoke(self, session_id):
        with self._lock:
            self._revoked.add(session_id)

    def authorize(self, token, feature):
        if type(token) is not str or not 32 <= len(token) <= 256 or not token.isascii() or not all(c.isalnum() or c in "_-" for c in token):
            raise AccessDenied()
        digest = sha256(token.encode("ascii")).hexdigest()
        with self._lock:
            for record in self._records:
                if compare_digest(digest, record.token_digest):
                    if record.active and record.session_id not in self._revoked and self._clock() < record.expires_at and feature in record.scopes:
                        return
                    raise AccessDenied()
        raise AccessDenied()

class AccessGate:
    def __init__(self, app, verifier):
        self.app = app
        self.verifier = verifier

    async def __call__(self, scope, receive, send):
        feature = PATH_FEATURE.get(scope.get("path"))
        if scope["type"] == "http" and scope.get("method") == "POST" and feature is not None:
            headers = [v for k,v in scope.get("headers", []) if k.lower() == b"authorization"]
            try:
                if len(headers) != 1 or not headers[0].startswith(b"Bearer "):
                    raise AccessDenied()
                token = headers[0][7:].decode("ascii")
                self.verifier.authorize(token, feature)
            except Exception:
                factory = signature_error_response if scope.get("path") == SIGNATURE_PATH else error_response
                response = factory(401, "validation_error", "ACCESS_DENIED", "Trusted access could not be verified.")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
