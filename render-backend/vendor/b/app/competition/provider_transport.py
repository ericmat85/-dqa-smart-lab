"""Only injected httpx.MockTransport supported. No live transport fallback."""
from dataclasses import dataclass,field
from typing import Protocol
import httpx
from pydantic import SecretStr

ENDPOINT='https://api.openai.com/v1/responses'


class SecretSource(Protocol):
    def load(self) -> SecretStr: ...


@dataclass(frozen=True)
class ProviderHTTPRequest:
    endpoint: str
    headers: dict=field(repr=False)
    body: dict=field(repr=False)
    timeout_seconds: float


@dataclass(frozen=True)
class ProviderHTTPResponse:
    status_code: int
    body: bytes=field(repr=False)


class OfflineHTTPXTransport:
    offline=True

    def __init__(self,transport=None):
        if transport is not None and type(transport) is not httpx.MockTransport:
            raise ValueError('Only explicit offline MockTransport is supported')
        self._transport=transport

    async def send(self,request):
        if self._transport is None:raise RuntimeError('TRANSPORT_DISABLED')
        if type(self._transport) is not httpx.MockTransport:raise RuntimeError('LIVE_TRANSPORT_NOT_AUTHORIZED')
        if request.endpoint!=ENDPOINT:raise RuntimeError('ENDPOINT_NOT_ALLOWED')
        async with httpx.AsyncClient(transport=self._transport,timeout=request.timeout_seconds,
                follow_redirects=False,trust_env=False) as client:
            async with client.stream('POST',ENDPOINT,headers=request.headers,json=request.body) as response:
                chunks=bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks)>1048576:raise RuntimeError('RESPONSE_TOO_LARGE')
                return ProviderHTTPResponse(response.status_code,bytes(chunks))


class HTTPTransport(Protocol):
    offline: bool
    async def send(self,request: ProviderHTTPRequest) -> ProviderHTTPResponse: ...
