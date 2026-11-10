"""Single-organization signed credential verification; no login or token issuer.

This is a dedicated HMAC credential format, NOT a JWT parser. Authority and
signing key provenance must be approved before deployment. No role/admin claims.
"""
import base64
import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from typing import Protocol
from pydantic import SecretStr
from .access_control import AccessDenied
from .provider_models import AIFeature


@dataclass(frozen=True)
class VerifiedAIIdentity:
    subject: str
    credential_id: str
    epoch: int


class CredentialAuthority(Protocol):
    def authorize(self, subject: str, credential_id: str, epoch: int, feature: AIFeature) -> bool: ...


class SignedCredentialVerifier:
    mode = 'SIGNED_CREDENTIAL_OFFLINE_VALIDATED_NOT_DEPLOYED'

    def __init__(self, *, secret_source=None, authority=None, issuer='dqa-competition', audience='dqa-ai', clock=time.time):
        if issuer != 'dqa-competition' or audience != 'dqa-ai':
            raise ValueError('Unapproved credential boundary')
        self._source=secret_source;self._authority=authority;self._clock=clock
        self._issuer=issuer;self._audience=audience

    def authorize(self, token, feature):
        self.verify(token, feature)

    def verify(self, token, feature):
        try:
            if type(feature) is not AIFeature or self._source is None or self._authority is None:
                raise AccessDenied()
            if type(token) is not str or len(token)>4096 or not re.fullmatch(r'v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}',token):
                raise AccessDenied()
            version,payload,signature=token.split('.')
            key=self._source.load()
            if type(key) is not SecretStr or not 32 <= len(key.get_secret_value()) <= 256:
                raise AccessDenied()
            expected=base64.urlsafe_b64encode(hmac.new(key.get_secret_value().encode(),(version+'.'+payload).encode(),hashlib.sha256).digest()).decode().rstrip('=')
            if not hmac.compare_digest(expected,signature):raise AccessDenied()
            raw=base64.urlsafe_b64decode(payload+'='*((-len(payload))%4))
            if base64.urlsafe_b64encode(raw).decode().rstrip('=') != payload:raise AccessDenied()
            def exact(pairs):
                result={}
                for k,v in pairs:
                    if k in result:raise AccessDenied()
                    result[k]=v
                return result
            claims=json.loads(raw,object_pairs_hook=exact)
            if set(claims) != {'iss','aud','sub','jti','epoch','iat','nbf','exp','scopes'}:raise AccessDenied()
            if claims['iss']!=self._issuer or claims['aud']!=self._audience:raise AccessDenied()
            if any(type(claims[k]) is not int for k in ['epoch','iat','nbf','exp']):raise AccessDenied()
            now=self._clock()
            if not claims['iat']<=claims['nbf']<=now<claims['exp'] or not 0<claims['exp']-claims['iat']<=900 or claims['epoch']<0:raise AccessDenied()
            if any(type(claims[k]) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',claims[k]) for k in ['sub','jti']):raise AccessDenied()
            scopes=claims['scopes']
            if type(scopes) is not list or len(scopes)>5 or len(set(scopes))!=len(scopes) or any(s not in {f.value for f in AIFeature} for s in scopes) or feature.value not in scopes:raise AccessDenied()
            # Current server authority must recheck active identity/epoch/scope;
            # valid signature alone is insufficient. Exact True is mandatory.
            if self._authority.authorize(claims['sub'],claims['jti'],claims['epoch'],feature) is not True:
                raise AccessDenied()
            return VerifiedAIIdentity(claims['sub'],claims['jti'],claims['epoch'])
        except Exception:
            raise AccessDenied() from None
