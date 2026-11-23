"""E4 parent with separately approved E2; credential-free Mock worker over Unix IPC."""
import argparse,asyncio,hashlib,json,os,socket,subprocess,sys,tempfile,threading,time,uuid
from pathlib import Path
import httpx
from gateway.e4_controlled_provider import load_provider,ProviderState
from gateway.e4_preview_app import create_app
from gateway.e4_preview_provider import E4Error

MOCK_PATH='/__integration_demo/ui/live/E4'
LIVE_PATH='/__integration_live/ui/live/E4'
E2_PATH='/__integration_live/ui/live/E2'

def mock_environment(env):
 result={k:env[k] for k in ['PATH','LANG','PYTHONDONTWRITEBYTECODE','RENDER','RENDER_SERVICE_ID','PREVIEW_GATEWAY_SECRET'] if k in env}
 result.update(AI_SPEND_APPROVED='0',LIVE_PROVIDER_ENABLED='false',LIVE_AI_ENABLED='false',PYTHONDONTWRITEBYTECODE='1')
 return result

def install_openai_egress_guard(mail_enabled=False):
 allowed=set();mail_allowed=set();resolve=socket.getaddrinfo;connect=socket.socket.connect;connect_ex=socket.socket.connect_ex
 def getaddrinfo(host,port,*args,**kwargs):
  rows=resolve(host,port,*args,**kwargs)
  if host in ('api.openai.com',b'api.openai.com') and str(port)=='443':allowed.update(r[4][0] for r in rows)
  name=host.decode() if isinstance(host,bytes) else host
  if mail_enabled and threading.current_thread().name=='business-mail-outbox' and (name,str(port)) in {('smtp.gmail.com','465'),('smtp.gmail.com','587'),('mmazbwzdiizabikmiily.supabase.co','443')}:mail_allowed.update((r[4][0],int(port)) for r in rows)
  return rows
 def permitted(sock,address):
  if sock.family not in (socket.AF_INET,socket.AF_INET6):return
  if isinstance(address,tuple) and len(address)>=2:
   if address[1]==443 and address[0] in allowed:return
   if mail_enabled and threading.current_thread().name=='business-mail-outbox' and (address[0],address[1]) in mail_allowed:return
  raise OSError('LIVE_EGRESS_DENIED')
 def guarded_connect(sock,address):permitted(sock,address);return connect(sock,address)
 def guarded_connect_ex(sock,address):permitted(sock,address);return connect_ex(sock,address)
 socket.getaddrinfo=getaddrinfo;socket.socket.connect=guarded_connect;socket.socket.connect_ex=guarded_connect_ex

class PairedApp:
 def __init__(self,mock_uds,live_state,live_key,mock_available=True,mock_process=None,e2_state=None):
  from gateway.business_ai import BusinessAI
  self.business_ai=BusinessAI(os.environ,live_state,e2_state)
  from gateway.business_mail import BusinessMailWorker
  self.business_mail=BusinessMailWorker(os.environ)
  self.mock_uds=mock_uds;self.live_state=live_state;self.mock_available=mock_available;self.mock_process=mock_process;self.e2_state=e2_state
  from gateway.e2_preview_provider import E2SchedulingService
  e2=E2SchedulingService(live_state.ledger,e2_state.service if e2_state else None,disabled_code=e2_state.code if e2_state else 'E2_SPEND_APPROVAL_REQUIRED')
  self.live_app=create_app(live_state.service,live_key,session_store=live_state.ledger,disabled_code=live_state.code,disabled_status=live_state.status,e2_advisory=e2)
 async def __call__(self,scope,receive,send):
  if scope['type']=='lifespan':
   async def lifecycle():
    message=await receive()
    if message['type']=='lifespan.startup':self.business_mail.start()
    elif message['type']=='lifespan.shutdown':await asyncio.to_thread(self.business_mail.stop)
    return message
   return await self.live_app(scope,lifecycle,send)
  if scope['type']!='http':return await self.live_app(scope,receive,send)
  trace='I-'+uuid.uuid4().hex;path=scope['path'];method=scope['method']
  if path.startswith('/__business_ai/'):
   return await self.business_ai(scope,receive,send)
  async def reply(status,packet):
   await send({'type':'http.response.start','status':status,'headers':[(b'content-type',b'application/json'),(b'cache-control',b'no-store'),(b'x-trace-id',trace.encode())]})
   await send({'type':'http.response.body','body':json.dumps(packet).encode()})
  async def error(status,code):return await reply(status,{'trace_id':trace,'error':{'code':code}})
  mock_available=self.mock_available and (self.mock_process is None or self.mock_process.poll() is None)
  live_ready=self.live_state.service is not None and time.time()<self.live_state.service.settings.expires
  live_code='BUDGET_EXPIRED' if self.live_state.service is not None and not live_ready else self.live_state.code
  if path=='/healthz' and method=='GET':
   # An expired Provider budget disables inference, while the signed Session
   # and explicit policy-error endpoints remain usable with a readable ledger.
   # This is process health, never Provider readiness or spending approval.
   healthy=mock_available or live_ready
   if not healthy and live_code=='BUDGET_EXPIRED' and self.live_state.ledger is not None:
    try:
     self.live_state.ledger.snapshot()  # Read-only; never initialize or reconcile.
     healthy=True
    except Exception:pass
   e2_ready=self.e2_state is not None and self.e2_state.service is not None and time.time()<self.e2_state.service.settings.expires
   e2_code=('BUDGET_EXPIRED' if self.e2_state and self.e2_state.service and not e2_ready else self.e2_state.code) if self.e2_state else 'E2_SPEND_APPROVAL_REQUIRED'
   return await reply(200 if healthy else 503,{'status':'alive' if healthy else 'unavailable','business_mail':self.business_mail.status(),'e4_provider':'MOCK_HTTP_ONLY' if mock_available else 'DISABLED','mock_provider':'MOCK_HTTP_ONLY' if mock_available else 'UNAVAILABLE_OR_EXPIRED','live_provider':live_code,'live_ledger':'AVAILABLE' if self.live_state.ledger else 'UNAVAILABLE','paid_inference_approved':live_ready and not self.live_state.service.simulation,'e2_provider':e2_code,'e2_ledger':'AVAILABLE' if self.e2_state and self.e2_state.ledger else 'UNAVAILABLE','e2_paid_inference_approved':bool(e2_ready and not self.e2_state.service.simulation)})
  if path==LIVE_PATH:
   if method!='POST':return await error(405,'METHOD_DENIED')
   return await self.live_app({**scope,'path':MOCK_PATH,'raw_path':MOCK_PATH.encode()},receive,send)
  if path==E2_PATH:
   if method!='POST':return await error(405,'METHOD_DENIED')
   mapped='/__integration_demo/ui/live/E2'
   return await self.live_app({**scope,'path':mapped,'raw_path':mapped.encode()},receive,send)
  if path!=MOCK_PATH:return await error(404,'ROUTE_NOT_FOUND')
  if method!='POST':return await error(405,'METHOD_DENIED')
  if not mock_available:return await error(503,'MOCK_RUNTIME_UNAVAILABLE_OR_EXPIRED')
  body=bytearray()
  while True:
   message=await receive()
   if message['type']=='http.disconnect':return
   if message['type']!='http.request':return await error(400,'REQUEST_DENIED')
   body.extend(message.get('body',b''))
   if len(body)>8192:return await error(413,'PAYLOAD_TOO_LARGE')
   if not message.get('more_body',False):break
  names={b'content-type',b'x-preview-gateway',b'x-preview-session',b'x-preview-system',b'x-demo-actor',b'x-preview-request-id',b'x-preview-operation-id'}
  headers=[(k,v) for k,v in scope['headers'] if k.lower() in names]
  try:
   transport=httpx.AsyncHTTPTransport(uds=self.mock_uds)
   async with httpx.AsyncClient(transport=transport,base_url='http://mock.internal',timeout=30,trust_env=False) as client:
    async def disconnected():
     while True:
      message=await receive()
      if message['type']=='http.disconnect':return
    watcher=asyncio.create_task(disconnected());request=asyncio.create_task(client.post(MOCK_PATH,content=bytes(body),headers=headers))
    try:
     done,_=await asyncio.wait([watcher,request],return_when=asyncio.FIRST_COMPLETED)
     if watcher in done:
      request.cancel()
      try:await request
      except asyncio.CancelledError:pass
      return
     r=await request
    finally:
     if not request.done():
      request.cancel()
      try:await request
      except asyncio.CancelledError:pass
     watcher.cancel()
     try:await watcher
     except asyncio.CancelledError:pass
   packet=r.json();trace=packet.get('trace_id',trace);return await reply(r.status_code,packet)
  except Exception:return await error(503,'MOCK_WORKER_UNAVAILABLE')

def mock_worker(uds,state_dir='/var/data/e4-mock/state'):
 from gateway.e4_mock_preview import MockRuntime,block_outbound_tcp,validate_cloud_binding
 env=os.environ;validate_cloud_binding(state_dir,'0.0.0.0',env)
 runtime=MockRuntime(state_dir,env.get('PREVIEW_GATEWAY_SECRET',''),env,initialize=False)
 block_outbound_tcp()
 import uvicorn
 try:uvicorn.run(runtime.app,uds=uds,workers=1,log_level='warning',access_log=False)
 finally:runtime.close()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--mock-worker',action='store_true');parser.add_argument('--uds');parser.add_argument('--mock-state-dir',default='/var/data/e4-mock/state');args=parser.parse_args()
 if args.mock_worker:
  if not args.uds:raise RuntimeError('PRIVATE_UDS_REQUIRED')
  return mock_worker(args.uds,args.mock_state_dir)
 env=os.environ;live_key=env.get('E4_LIVE_GATEWAY_SECRET','')
 if not live_key.isascii() or len(live_key)<32:raise RuntimeError('LIVE_GATEWAY_SECRET_REQUIRED')
 from gateway.business_mail import POLICY as MAIL_POLICY
 mail_approved=env.get('BUSINESS_MAIL_ENABLED')=='1' and env.get('BUSINESS_MAIL_POLICY_SHA256')==hashlib.sha256(MAIL_POLICY.read_bytes()).hexdigest()
 install_openai_egress_guard(mail_approved)
 state=ProviderState()
 try:state=load_provider(env)
 except E4Error as error:state=ProviderState(code=error.code,status=error.status)
 except Exception:state=ProviderState(code='LIVE_RELEASE_CONFIGURATION_INVALID')
 from gateway.e2_controlled_provider import load_e2_provider
 e2_state=ProviderState(code='E2_SPEND_APPROVAL_REQUIRED')
 try:e2_state=load_e2_provider(env,state.ledger)
 except E4Error as error:e2_state=ProviderState(code=error.code,status=error.status)
 except Exception:e2_state=ProviderState(code='E2_RELEASE_CONFIGURATION_INVALID')
 with tempfile.TemporaryDirectory(prefix='e4-mock-ipc-') as directory:
  os.chmod(directory,0o700);uds=str(Path(directory)/'mock.sock')
  child=subprocess.Popen([sys.executable,'-B','-m','gateway.e4_paired_preview','--mock-worker','--uds',uds],env=mock_environment(env),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  available=False
  for _ in range(200):
   if child.poll() is not None:break
   if Path(uds).is_socket():available=True;break
   time.sleep(.025)
  import uvicorn
  try:uvicorn.run(PairedApp(uds,state,live_key,available,child,e2_state),host='0.0.0.0',port=int(env.get('PORT','10000')),workers=1,log_level='warning',access_log=False)
  finally:
   e2_state.close();state.close()
   if child.poll() is None:child.terminate()
   child.wait(timeout=10)
if __name__=='__main__':main()
