from pathlib import Path
import sys,os,json,uuid,threading
from typing import Literal
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel,ConfigDict,Field,field_validator
from starlette.exceptions import HTTPException
from gateway.adapter import create_case,approve,validate_request,run_engine,IDS,ROLES
from app.core.errors import DomainError
from pydantic import ValidationError
PREFIX='/__integration_demo'
ALLOWED={'http://127.0.0.1:8712'}
app=FastAPI(openapi_url=None,docs_url=None,redoc_url=None)
store={}; lock=threading.RLock()
class Strict(BaseModel):
 model_config=ConfigDict(extra='forbid',strict=True)
 @field_validator('synthetic',mode='before',check_fields=False)
 @classmethod
 def synthetic_boolean(cls,value):
  if type(value) is not bool or value is not True:raise ValueError('SYNTHETIC_BOOLEAN_REQUIRED')
  return value
class Create(Strict):
    synthetic:Literal[True]
    test_id:Literal['SYNTH-TEST-001']
    product_code:Literal['SYNTHETIC_PRODUCT']
    quantity:int=Field(ge=1,le=100)
class Action(Strict):
    synthetic:Literal[True]
    action:Literal['approve','schedule','start','complete','submit_report','approve_report','close']
    expected_version:int=Field(ge=1)
class EngineInput(Strict):
    synthetic:Literal[True]
    fixture_id:str|None=Field(default=None,max_length=80)

def error(code,status,trace):return JSONResponse({'scope':'SANDBOX_ONLY','synthetic':True,'trace_id':trace,'error':{'code':code}},status_code=status)
@app.middleware('http')
async def gate(req:Request,call_next):
    trace='I-'+uuid.uuid4().hex;req.state.trace=trace
    if os.environ.get('INTEGRATION_DEMO_ENABLED')!='1':return error('DEMO_DISABLED',503,trace)
    if req.client and req.client.host not in ('127.0.0.1','::1','testclient'):return error('LOOPBACK_ONLY',403,trace)
    if req.headers.get('host') not in ('127.0.0.1:8713','127.0.0.1','testserver'):return error('HOST_DENIED',403,trace)
    origin=req.headers.get('origin')
    if origin is not None and origin not in ALLOWED:return error('ORIGIN_DENIED',403,trace)
    # Require browser origin on mutations; CORS alone is insufficient.
    if req.method in ('POST','PUT','DELETE','PATCH') and origin not in ALLOWED:return error('ORIGIN_REQUIRED',403,trace)
    if req.method=='OPTIONS':
        if origin not in ALLOWED:return error('ORIGIN_DENIED',403,trace)
        response=JSONResponse({})
    else:
        if req.method=='POST':
            if req.headers.get('content-type','').split(';')[0]!='application/json':return error('JSON_REQUIRED',415,trace)
            body=bytearray()
            async for chunk in req.stream():
                body.extend(chunk)
                if len(body)>8192:return error('PAYLOAD_TOO_LARGE',413,trace)
            req._body=bytes(body)
        response=await call_next(req)
    response.headers['X-Trace-ID']=trace
    response.headers['Cache-Control']='no-store'
    if origin in ALLOWED:
        response.headers['Access-Control-Allow-Origin']=origin
        response.headers['Vary']='Origin'
        response.headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers']='content-type, x-demo-actor'
        response.headers['Access-Control-Expose-Headers']='X-Trace-ID'
    return response
@app.exception_handler(RequestValidationError)
async def invalid(req,exc):return error('INVALID_SYNTHETIC_PAYLOAD',422,req.state.trace)
@app.exception_handler(HTTPException)
async def http_error(req,exc):return error('ROUTE_NOT_FOUND' if exc.status_code==404 else 'METHOD_DENIED',exc.status_code,req.state.trace)
@app.exception_handler(Exception)
async def internal(req,exc):return error('INTERNAL_ERROR',500,req.state.trace)

def actor(req):return req.headers.get('x-demo-actor','')
def allowed(req):return actor(req) in ROLES

def packet(req,data):return {'scope':'SANDBOX_ONLY','synthetic':True,'trace_id':req.state.trace,'data':data}
def view(row):
 return dict(request_id=str(row['state'].request_id),request=row['request'],test_id=row['test_id'],state=row['state'].model_dump(mode='json'),
    semantics='SANDBOX_PROPOSAL_SNAPSHOT_NOT_B_COMMITTED_OPERATION',history=row['history'],engine_calls=row['engine_calls'],restart_policy='IN_MEMORY_RESET_ON_RESTART')
@app.get(PREFIX+'/status')
def status(req:Request):return packet(req,dict(gateway='LOCAL_GATEWAY_PASS',b='B_PURE_DTO_TRANSITION_ONLY',persistence='SANDBOX_ONLY',engines='OFFLINE_RULES_CORE',formal_routes='BLOCKED',nine_stages=list(range(1,10)),fixture_ids=['DYN-001-E1','DYN-001-E2','DYN-001-E3','DYN-001-E4','NEG-E2-LOW-CAPACITY','NEG-E2-MISSING-CAPACITY','NEG-E4-NO-SOURCE']))
@app.get(PREFIX+'/cases')
def cases(req:Request):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 with lock:return packet(req,[view(r) for r in store.values()])
@app.post(PREFIX+'/cases')
def create(req:Request,data:Create):
 if actor(req)!='requester':return error('AUTHORIZATION_DENIED',403,req.state.trace)
 bid=uuid.uuid4();bdata=dict(schema_version='1.0',synthetic=True,case_id='SYNTH-'+bid.hex,product_code=data.product_code,specification='SYNTHETIC_SPEC_ONLY',judgment_criteria='SYNTHETIC_CRITERIA_ONLY',quantity=data.quantity,sop_excerpts=['SYNTHETIC_SOP_ONLY'],customer_spec_excerpts=['SYNTHETIC_SPEC_ONLY'])
 bvalidated=validate_request(bdata)
 with lock:
  store[str(bid)]=dict(state=create_case(bid),request=bvalidated.model_dump(mode='json'),test_id=data.test_id,history=[dict(action='create_synthetic_proposal',trace_id=req.state.trace,actor=actor(req))],engine_calls=[])
  return packet(req,view(store[str(bid)]))
@app.get(PREFIX+'/cases/{case_id}')
def get(req:Request,case_id:str):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 with lock:
  if case_id not in store:return error('CASE_NOT_FOUND',404,req.state.trace)
  return packet(req,view(store[case_id]))
@app.post(PREFIX+'/cases/{case_id}/actions')
def action(req:Request,case_id:str,data:Action):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 with lock:
  row=store.get(case_id)
  if not row:return error('CASE_NOT_FOUND',404,req.state.trace)
  try:
   if data.expected_version!=row['state'].version:return error('VERSION_CONFLICT',409,req.state.trace)
   if data.action!='approve':return error('RULE_NOT_APPROVED',409,req.state.trace)
   result=approve(row['state'],actor(req))
   assert result.side_effects_authorized is False
   row['state']=result.state
   row['history'].append(dict(action='approve_synthetic_proposal',actor=actor(req),trace_id=req.state.trace,stage=int(result.state.stage)))
   return packet(req,view(row))
  except DomainError as exc:
   row['history'].append(dict(action=data.action,actor=actor(req),trace_id=req.state.trace,error=exc.code))
   return error(exc.code,exc.status_code,req.state.trace)
@app.post(PREFIX+'/cases/{case_id}/engines/{engine}')
def engine(req:Request,case_id:str,engine:str,data:EngineInput):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 if engine not in ('E1','E2','E3','E4'):return error('ENGINE_UNKNOWN',404,req.state.trace)
 with lock:
  row=store.get(case_id)
  if not row:return error('CASE_NOT_FOUND',404,req.state.trace)
  # Report review needs a report stage; explicit independent fixture previews remain available.
  if not data.fixture_id and engine=='E3' and int(row['state'].stage)<6:return error('REPORT_STAGE_REQUIRED',409,req.state.trace)
  if not data.fixture_id and engine in ('E1','E2') and int(row['state'].stage)<2:return error('MANAGER_REVIEW_REQUIRED',409,req.state.trace)
  try:out=run_engine(engine,req.state.trace,case=None if data.fixture_id else row,fixture_id=data.fixture_id)
  except ValueError:return error('FIXTURE_NOT_ALLOWED',422,req.state.trace)
  row['engine_calls'].append(dict(trace_id=req.state.trace,actor=actor(req),**out))
  return packet(req,out)


@app.get(PREFIX+'/health/live')
def health_live(req:Request):
    from app.api.routes.health import live
    return packet(req,dict(status='alive',b_original_health=live().model_dump(),mode='SANDBOX_ONLY'))

@app.get(PREFIX+'/health/ready')
def health_ready(req:Request):
    from gateway.verify_runtime import verify
    try: count=verify()
    except Exception:return error('SOURCE_HASH_MISMATCH',503,req.state.trace)
    return packet(req,dict(status='ready',source_files=count,scope='SANDBOX_ONLY',production_ready=False,persistence='IN_MEMORY_RESET_ON_RESTART'))

@app.post(PREFIX+'/cases/{case_id}/paired-fixtures/{engine}')
def paired_fixture(req:Request,case_id:str,engine:str,data:EngineInput):
    if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
    if engine not in ('E1','E2','E3','E4'):return error('ENGINE_UNKNOWN',404,req.state.trace)
    from gateway.b_adapter import run_paired
    with lock:
        row=store.get(case_id)
        if not row:return error('CASE_NOT_FOUND',404,req.state.trace)
        try:out=run_paired(engine,req.state.trace,data.fixture_id)
        except ValueError:return error('FIXTURE_NOT_ALLOWED',422,req.state.trace)
        row['engine_calls'].append(dict(actor=actor(req),**out))
        return packet(req,out)

# Boot the verified B factory unchanged. Only its real liveness route is mounted;
# business/Public API, docs and speculative operations remain unreachable.
from app.main import create_app as create_b_original
from app.core.config import Settings as BSettings
b_original=create_b_original(BSettings())
b_original.router.routes=[route for route in b_original.router.routes if getattr(route,'path',None) not in ('/openapi.json','/docs','/docs/oauth2-redirect','/redoc')]
app.mount(PREFIX+'/b-product-runtime',b_original)

from gateway.ui_adapter import router as ui_router
app.include_router(ui_router)

from gateway.live_routes import router as live_router
app.include_router(live_router)
