"""Isolated Render entrypoint. Shared proxy authentication precedes the original loopback guards."""
import os,secrets,socket,json,re
from pathlib import Path
# Never import production settings with inherited database/provider credentials.
KEEP=('PATH','LANG','PORT','PREVIEW_GATEWAY_SECRET','PREVIEW_PUBLIC_HOST','PYTHONDONTWRITEBYTECODE')
for name in list(os.environ):
 if name not in KEEP:os.environ.pop(name,None)
os.environ.update(INTEGRATION_DEMO_ENABLED='1',LIVE_PROVIDER_ENABLED='FALSE',LIVE_AI_ENABLED='0',PYTHONDONTWRITEBYTECODE='1')
SECRET=os.environ.get('PREVIEW_GATEWAY_SECRET','')
if len(SECRET)<32:raise RuntimeError('PREVIEW_GATEWAY_SECRET_REQUIRED')
# No outbound TCP: this candidate cannot reach an AI provider or a formal DB.
_connect=socket.socket.connect
_connect_ex=socket.socket.connect_ex
def connect(self,*a,**kw):
 if self.family in (socket.AF_INET,socket.AF_INET6):raise RuntimeError('PREVIEW_OUTBOUND_FORBIDDEN')
 return _connect(self,*a,**kw)
def connect_ex(self,*a,**kw):
 if self.family in (socket.AF_INET,socket.AF_INET6):raise RuntimeError('PREVIEW_OUTBOUND_FORBIDDEN')
 return _connect_ex(self,*a,**kw)
socket.socket.connect=connect;socket.socket.connect_ex=connect_ex
from gateway.verify_runtime import verify
verify()
from gateway.server import app as original
async def app(scope,receive,send):
 if scope['type']!='http':return await original(scope,receive,send)
 async def error(status,code):
  await send({'type':'http.response.start','status':status,'headers':[(b'content-type',b'application/json'),(b'cache-control',b'no-store')]})
  await send({'type':'http.response.body','body':json.dumps({'error':{'code':code}}).encode()})
 if scope['path']=='/healthz' and scope['method']=='GET':
  await send({'type':'http.response.start','status':200,'headers':[(b'content-type',b'application/json'),(b'cache-control',b'no-store')]})
  return await send({'type':'http.response.body','body':b'{"status":"alive","mode":"private-preview","real_ai":"NOT_LIVE"}'})
 headers=dict(scope['headers'])
 if not secrets.compare_digest(headers.get(b'x-preview-gateway',b''),SECRET.encode()):return await error(401,'AUTHENTICATION_REQUIRED')
 path=scope['path'].removeprefix('/__integration_demo')
 if not scope['path'].startswith('/__integration_demo/') or not re.fullmatch(r'/(?:health/(?:live|ready)|ui/(?:bootstrap|knowledge|live/E[1-4]|requests(?:/REQ-\d{4}-[0-9a-f]{8}(?:/actions|/engines/E[1-4])?)?))',path):return await error(404,'ROUTE_NOT_FOUND')
 # This verified server-to-server channel is the only allowed adapter to the unchanged local gateway.
 clean=[(k,v) for k,v in scope['headers'] if k not in (b'host',b'origin',b'x-preview-gateway')]
 clean.extend([(b'host',b'127.0.0.1:8713'),(b'origin',b'http://127.0.0.1:8712')])
 return await original({**scope,'headers':clean,'client':('127.0.0.1',0)},receive,send)
if __name__=='__main__':
 import uvicorn
 uvicorn.run(app,host='0.0.0.0',port=int(os.environ.get('PORT','10000')),workers=1,log_level='warning')
