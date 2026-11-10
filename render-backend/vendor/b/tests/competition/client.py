"""Single-loop in-process HTTP transport, no sockets or worker portal.

TestClient's threaded blocking portal stalls in this environment (including the
unchanged P5 health test). This helper exercises the actual ASGI application via
existing httpx; assertions, middleware, validation and network guards stay intact.
"""
import asyncio
import httpx


class ASGIClient:
    def __init__(self,app):self.app=app
    def __enter__(self):return self
    def __exit__(self,*args):return False

    def request(self,method,path,**kwargs):
        async def invoke():
            transport=httpx.ASGITransport(app=self.app,raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport,base_url='http://synthetic.test') as client:
                return await asyncio.wait_for(client.request(method,path,**kwargs),timeout=3)
        return asyncio.run(invoke())

    def post(self,path,**kwargs):return self.request('POST',path,**kwargs)
    def options(self,path,**kwargs):return self.request('OPTIONS',path,**kwargs)
