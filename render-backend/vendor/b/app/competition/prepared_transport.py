"""Prepared HTTPX transport. Live execution locked off in COMP-03B-2A.

Only exact MockTransport may be exercised. The existing shared Adapter remains
strictly offline; this transport is deliberately not auto-wired or activated.
"""
import asyncio
import math
import httpx
from .provider_transport import ENDPOINT, ProviderHTTPRequest, ProviderHTTPResponse


class PreparedTransportTimeout(httpx.TimeoutException, RuntimeError):
    """Safe timeout recognized by the shared adapter and prior offline callers."""


class PreparedProviderTransport:
    offline = True

    def __init__(self, *, mock_transport=None, enabled=False, connect_timeout=2.0, read_timeout=10.0, total_timeout=15.0):
        if enabled is not False:raise ValueError('LIVE_EXECUTION_NOT_AUTHORIZED')
        if mock_transport is not None and type(mock_transport) is not httpx.MockTransport:
            raise ValueError('TRANSPORT_NOT_AUTHORIZED')
        for value in (connect_timeout,read_timeout,total_timeout):
            if type(value) not in (int,float) or not math.isfinite(value) or not 0<value<=60:
                raise ValueError('INVALID_TIMEOUT')
        if connect_timeout>total_timeout or read_timeout>total_timeout:raise ValueError('INVALID_TIMEOUT')
        self._mock=mock_transport
        self._connect=connect_timeout;self._read=read_timeout;self._total=total_timeout

    @property
    def offline_ready(self):
        return type(self._mock) is httpx.MockTransport

    async def send(self, request):
        if self._mock is None:raise RuntimeError('LIVE_TRANSPORT_DISABLED')
        if type(request) is not ProviderHTTPRequest or request.endpoint != ENDPOINT:
            raise RuntimeError('ENDPOINT_NOT_ALLOWED')
        if type(self._mock) is not httpx.MockTransport:raise RuntimeError('LIVE_TRANSPORT_DISABLED')
        if type(request.timeout_seconds) not in (float,int) or not math.isfinite(request.timeout_seconds) or not 0<request.timeout_seconds<=60:
            raise RuntimeError('INVALID_TIMEOUT')
        if set(request.headers) != {'Authorization','Content-Type'} or request.headers['Content-Type'] != 'application/json':
            raise RuntimeError('INVALID_HEADERS')
        auth=request.headers['Authorization']
        if type(auth) is not str or not auth.startswith('Bearer ') or any(ord(c)<33 or ord(c)>126 for c in auth[7:]) or not 8<=len(auth[7:])<=256:
            raise RuntimeError('INVALID_HEADERS')
        async def invoke():
            # Shared wire implementation is ready; no default network transport
            # can be selected. Live grant + integration require separate review.
            timeout=httpx.Timeout(connect=self._connect,read=self._read,write=self._read,pool=self._connect)
            async with httpx.AsyncClient(transport=self._mock if self._mock is not None else httpx.AsyncHTTPTransport(retries=0),timeout=timeout,follow_redirects=False,trust_env=False) as client:
                async with client.stream('POST',ENDPOINT,headers=request.headers,json=request.body) as response:
                    chunks=bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunks)+len(chunk)>1048576:raise RuntimeError('RESPONSE_TOO_LARGE')
                        chunks.extend(chunk)
                    return ProviderHTTPResponse(response.status_code,bytes(chunks))
        try:
            return await asyncio.wait_for(invoke(),timeout=min(self._total,request.timeout_seconds))
        except asyncio.CancelledError:raise
        except (httpx.TimeoutException,TimeoutError):raise PreparedTransportTimeout('PROVIDER_TIMEOUT') from None
        except Exception:raise RuntimeError('PROVIDER_TRANSPORT_FAILED') from None
