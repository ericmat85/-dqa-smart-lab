"""Signed private E4/E2 routes; public DTOs and the offline worker are untouched."""
import asyncio,hmac,re,threading,time,uuid
from fastapi import FastAPI,Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,field_validator
from gateway.e4_preview_provider import E4Error
from gateway.e4_session import verify_session
class Advice(BaseModel):
 model_config=ConfigDict(strict=True,extra='forbid')
 synthetic:bool
 mode:Literal['GENERAL_CHAT','DOCUMENT_QA']='DOCUMENT_QA'
 question:str=Field(min_length=1,max_length=1500)
 demo_context:dict|None=None
 @field_validator('synthetic',mode='before')
 @classmethod
 def synthetic_true(cls,value):
  if type(value) is not bool or value is not True:raise ValueError('SYNTHETIC_REQUIRED')
  return value

class EngineAdvice(BaseModel):
 model_config=ConfigDict(strict=True,extra='forbid')
 synthetic:bool
 question:str=Field(min_length=1,max_length=1500)
 @field_validator('synthetic',mode='before')
 @classmethod
 def synthetic_true(cls,value):
  if type(value) is not bool or value is not True:raise ValueError('SYNTHETIC_REQUIRED')
  return value

def create_app(service=None,gateway_key='',legacy_uds=None,clock=time.time,session_store=None,advisory=None,disabled_code='LIVE_PROVIDER_DISABLED',disabled_status=503,e2_advisory=None):
 if not isinstance(gateway_key,str) or not gateway_key.isascii() or len(gateway_key)<32:raise E4Error('GATEWAY_SECRET_REQUIRED')
 store=session_store or (service.ledger if service else None)
 app=FastAPI(docs_url=None,openapi_url=None,redoc_url=None)
 @app.middleware('http')
 async def gate(req,call_next):
  req.state.trace='I-'+uuid.uuid4().hex
  supplied=req.headers.getlist('x-preview-gateway')
  valid_gateway=len(supplied)==1 and supplied[0].isascii() and hmac.compare_digest(supplied[0].encode('ascii'),gateway_key.encode('ascii'))
  if req.url.path!='/healthz' and not valid_gateway:
   return JSONResponse({'trace_id':req.state.trace,'error':{'code':'AUTHENTICATION_REQUIRED'}},401,headers={'Cache-Control':'no-store','X-Trace-ID':req.state.trace})
  incoming=req.headers.get('x-preview-request-id','')
  if re.fullmatch(r'I-[A-Za-z0-9_-]{1,80}',incoming):req.state.trace=incoming
  if req.method=='POST':
   raw=bytearray()
   async for chunk in req.stream():
    raw.extend(chunk)
    if len(raw)>8192:return JSONResponse({'trace_id':req.state.trace,'error':{'code':'PAYLOAD_TOO_LARGE'}},413,headers={'Cache-Control':'no-store','X-Trace-ID':req.state.trace})
   req._body=bytes(raw)
  response=await call_next(req);response.headers['Cache-Control']='no-store';response.headers.setdefault('X-Trace-ID',req.state.trace);return response
 @app.exception_handler(RequestValidationError)
 async def invalid(req,error):return JSONResponse({'trace_id':req.state.trace,'error':{'code':'INVALID_SYNTHETIC_PAYLOAD'}},422)
 @app.exception_handler(E4Error)
 async def controlled(req,error):return JSONResponse({'trace_id':req.state.trace,'error':{'code':error.code},**({'request_id':error.request_id} if error.request_id else {})},error.status)
 @app.exception_handler(Exception)
 async def unexpected(req,error):return JSONResponse({'trace_id':req.state.trace,'error':{'code':'E4_SERVICE_UNAVAILABLE'}},503)
 @app.get('/healthz')
 def health():return {'status':'alive','e4_provider':'DISABLED' if service is None else 'MOCK_HTTP_ONLY' if service.simulation else 'RELEASE_GATES_CONFIGURED_NOT_MODEL_PROOF'}
 if e2_advisory is not None:
  from gateway.e2_scheduling import E2Advice
  @app.post('/__integration_demo/ui/live/E2')
  async def e2_schedule(body:E2Advice,req:Request):
   try:binding=verify_session(req.headers.get('x-preview-session',''),gateway_key,req.headers.get('x-demo-actor',''),req.headers.get('x-preview-system',''),clock())
   except ValueError as error:raise E4Error(str(error),403 if str(error)=='AUTHORIZATION_DENIED' else 401) from None
   cancel=threading.Event()
   async def disconnected():
    while True:
     event=await req.receive()
     if event['type']=='http.disconnect':cancel.set();return
   watcher=asyncio.create_task(disconnected())
   task=asyncio.create_task(asyncio.to_thread(e2_advisory.analyze,binding,body.schedule_context.model_dump(),req.state.trace,req.headers.get('x-preview-operation-id') or req.state.trace,cancel))
   try:data=await task
   except asyncio.CancelledError:
    cancel.set()
    try:await asyncio.shield(task)
    except Exception:pass
    raise
   finally:
    watcher.cancel()
    try:await watcher
    except asyncio.CancelledError:pass
   return {'scope':'SYNTHETIC_PREVIEW_SCHEDULING_ADVICE_ONLY','synthetic':True,'trace_id':req.state.trace,'data':data}
 @app.post('/__integration_demo/ui/live/E4')
 async def chat(body:Advice,req:Request):
  try:
   binding=verify_session(req.headers.get('x-preview-session',''),gateway_key,req.headers.get('x-demo-actor',''),req.headers.get('x-preview-system',''),clock())
   if store:store.bind_session(binding,clock())
  except ValueError as e:raise E4Error(str(e),403 if str(e)=='AUTHORIZATION_DENIED' else 401) from None
  trace=req.state.trace
  from gateway.e4_readonly_context import validate_context
  context=validate_context(body.demo_context,binding,clock())
  if context is not None and body.mode!='GENERAL_CHAT':raise E4Error('READONLY_CONTEXT_MODE_DENIED',422)
  if service is None:
   if body.question in ('/clear','/logout'):
    if store is None:raise E4Error('SESSION_STORE_REQUIRED')
    store.control(binding,clock(),'logout' if body.question=='/logout' else 'clear')
    data={'engine':'E4','control':'SESSION_REVOKED' if body.question=='/logout' else 'CONVERSATION_CLEARED','conversation_id':binding['sid'],'trace_id':trace,'synthetic':True,'real_ai':False}
    return {'scope':'SANDBOX_ONLY','synthetic':True,'trace_id':trace,'data':data}
   raise E4Error(disabled_code,disabled_status)
  cancel=threading.Event()
  async def watch_disconnect():
   try:
    while True:
     message=await req.receive()
     if message['type']=='http.disconnect':cancel.set();return
   except asyncio.CancelledError:raise
   except Exception:cancel.set()
  watcher=asyncio.create_task(watch_disconnect())
  task=asyncio.create_task(asyncio.to_thread(service.analyze,binding,body.question,trace,body.mode,req.headers.get('x-preview-operation-id') or trace,cancel,**({'demo_context':context} if context is not None else {})))
  try:
   data=await task
  except asyncio.CancelledError:
   cancel.set()
   # Keep task ownership until accounting has recorded cancellation; never retry.
   try:await asyncio.shield(task)
   except Exception:pass
   raise
  finally:
   watcher.cancel()
   try:await watcher
   except asyncio.CancelledError:pass
  return {'scope':'PRIVATE_PREVIEW_GENERAL_INFORMATION_ONLY' if body.mode=='GENERAL_CHAT' else 'SYNTHETIC_PREVIEW_ADVICE_ONLY','synthetic':True,'trace_id':trace,'data':data}
 async def engine_advice(engine:str,body:EngineAdvice,req:Request):
  try:
   binding=verify_session(req.headers.get('x-preview-session',''),gateway_key,req.headers.get('x-demo-actor',''),req.headers.get('x-preview-system',''),clock())
  except ValueError as e:raise E4Error(str(e),403 if str(e)=='AUTHORIZATION_DENIED' else 401) from None
  data=await asyncio.to_thread(advisory.analyze,engine,binding,body.question,req.state.trace,req.headers.get('x-preview-operation-id') or req.state.trace)
  return {'scope':'SYNTHETIC_PREVIEW_ADVICE_ONLY','synthetic':True,'trace_id':req.state.trace,'data':data}
 if advisory is not None:app.add_api_route('/__integration_demo/ui/live/{engine}',engine_advice,methods=['POST'])
 @app.api_route('/{path:path}',methods=['GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'])
 async def legacy(path:str,req:Request):
  if not legacy_uds or req.method not in ['GET','POST'] or not re.fullmatch(r'__integration_demo/(?:health/(?:live|ready)|ui/(?:bootstrap|knowledge|live/E[1-3]|requests(?:/REQ-\d{4}-[0-9a-f]{8}(?:/actions|/engines/E[1-4])?)?))',path):raise E4Error('ROUTE_NOT_FOUND',404)
  import httpx
  transport=httpx.AsyncHTTPTransport(uds=legacy_uds)
  async with httpx.AsyncClient(transport=transport,base_url='http://legacy.internal',timeout=10) as client:
   response=await client.request(req.method,'/'+path,content=await req.body(),headers={'Content-Type':'application/json','X-Preview-Gateway':gateway_key,'X-Demo-Actor':req.headers.get('x-demo-actor','')})
  packet=response.json();return JSONResponse(packet,response.status_code,headers={'X-Trace-ID':packet.get('trace_id',req.state.trace)})
 return app
