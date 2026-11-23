"""PR46 UI data adapter. Sandbox view only, no Public DTO or formal receipt."""
from datetime import datetime,timezone
from uuid import uuid4
from copy import deepcopy
import re
from fastapi import APIRouter,Request
from gateway.server import Strict,packet,error,store,lock,actor,allowed
from gateway.adapter import create_case,approve,validate_request,run_engine
from gateway.c_mapping import map_native
from app.core.errors import DomainError
from typing import Literal
from pydantic import Field
router=APIRouter(prefix='/__integration_demo/ui')
CACHE_GENERATION='CACHE-'+uuid4().hex # in-memory cache generation only, NOT Execution Epoch
ROWS={}
ACCOUNTS=[dict(id=i,name=n,email=e,role=r,department='合成研究室',status='啟用中',lastLogin='尚未登入',**({'supervisorId':'DEMO-SUPERVISOR'} if r=='委託者' else {})) for i,n,e,r in [
('U001','合成管理員','level0@example.com','系統管理員'),('U003','合成工程師','chen@example.com','實驗室工程師'),('U004','合成檢視者','wang@example.com','檢視者'),('DEMO-REQUESTER','示範委託者','requester@example.com','委託者'),('DEMO-SUPERVISOR','示範委託者主管','supervisor@example.com','委託者主管'),('DEMO-LEVEL1','示範一階主管','level1@example.com','一階主管'),('DEMO-LEVEL2','示範二階主管','level2@example.com','二階主管'),('DEMO-LEVEL3','示範三階主管','level3@example.com','三階主管')]]
MAPPING={'DEMO-REQUESTER':'requester','DEMO-SUPERVISOR':'manager','DEMO-LEVEL1':'level1','DEMO-LEVEL2':'level2'}
class UiCreate(Strict):
 synthetic:Literal[True]
 row:dict
class UiAction(Strict):
 synthetic:Literal[True]
 actor_id:str=Field(max_length=40)
 expected_version:int=Field(ge=1)
 decision:Literal['approve','return']
class Knowledge(Strict):
 synthetic:Literal[True]
 question:str=Field(min_length=1,max_length=256)
FIELDS={'id','product','productCode','productType','project','customer','customerPartNo','department','requester','priority','dueDate','quantity','testItems','purpose','purposeOther','sampleSource','sampleSourceOther','productVersion','pcbaVersion','softwareVersion','manufactureDate','sampleDescription','specification','judgementRequired','judgementCriteria','notes','requestDate','ownerId','supervisorId'}
def timestamp():return datetime.now(timezone.utc).isoformat()
def canonical(uiid):
 row=deepcopy(ROWS[uiid]);case=store[row['sandbox']['request_id']]['state'];stage=int(case.stage);sub=case.substate.value
 row['sandbox'].update(version=case.version,stage=stage,substate=sub,scope='SANDBOX_ONLY')
 row['status']='待主管簽核' if stage==1 else '待排程' if stage==3 else '已核准'
 if stage>=2:
  row.update(approver='示範委託者主管',approvalDate=row['updatedAt'])
  if sub=='request_level2' or stage==3:
   count=2 if stage==3 else 1
   row['lmsReview']=dict(approval=count,status='完成' if count==2 else '待審查',approvalRecords=[dict(stage=i,actorId='DEMO-LEVEL'+str(i),action='核准',at=row['updatedAt']) for i in range(1,count+1)],history=[f"SANDBOX_ONLY · LMS {i} 人工審核" for i in range(1,count+1)])
 return row
@router.get('/bootstrap')
def bootstrap(req:Request):
 with lock:return packet(req,dict(cache_generation=CACHE_GENERATION,authority='SANDBOX_ONLY_NOT_EXECUTION_EPOCH',accounts=ACCOUNTS,requests=[canonical(k) for k in ROWS]))
@router.post('/requests')
def create(req:Request,data:UiCreate):
 if actor(req)!='requester':return error('AUTHORIZATION_DENIED',403,req.state.trace)
 row=data.row
 if set(row)-FIELDS or len(str(row))>7000:return error('INVALID_SYNTHETIC_PAYLOAD',422,req.state.trace)
 if not re.fullmatch(r'REQ-\d{4}-[0-9a-f]{8}',str(row.get('id',''))):return error('INVALID_UI_ID',422,req.state.trace)
 if row.get('ownerId')!='DEMO-REQUESTER' or row.get('supervisorId')!='DEMO-SUPERVISOR':return error('AUTHORIZATION_DENIED',403,req.state.trace)
 for key in ('product','productCode','customer','project','customerPartNo','specification','judgementCriteria','notes'):
  value=row.get(key,'')
  if value and (type(value) is not str or not value.startswith('SYNTH')):return error('SYNTHETIC_PREFIX_REQUIRED',422,req.state.trace)
 if len(row.get('testItems',[]))!=1:return error('ONE_REQUEST_ONE_TRIAL',422,req.state.trace)
 try:q=int(row['quantity']);assert str(q)==str(row['quantity']) and 1<=q<=100
 except (KeyError,ValueError,TypeError,AssertionError):return error('INVALID_QUANTITY',422,req.state.trace)
 with lock:
  if row['id'] in ROWS:return error('DUPLICATE_UI_ID',409,req.state.trace)
  bid=uuid4();bdata=dict(schema_version='1.0',synthetic=True,case_id='SYNTH-'+bid.hex,product_code=row['productCode'],specification=row['specification'],judgment_criteria=row.get('judgementCriteria') or 'SYNTHETIC_REVIEW',quantity=q,sop_excerpts=['SYNTHETIC_SOP_ONLY'],customer_spec_excerpts=['SYNTHETIC_SPEC_ONLY'])
  validated=validate_request(bdata);now=timestamp()
  store[str(bid)]=dict(state=create_case(bid),request=validated.model_dump(mode='json'),test_id=row['testItems'][0],history=[dict(action='create_synthetic_ui_proposal',trace_id=req.state.trace,actor='requester')],engine_calls=[])
  ROWS[row['id']]={**deepcopy(row), 'createdAt':now,'updatedAt':now,'requesterSignatureAt':now,'supervisorSignatureAt':'','lmsReview':None,'signatureRecords':[], 'sandbox':dict(request_id=str(bid),version=1,stage=1,scope='SANDBOX_ONLY')}
  return packet(req,canonical(row['id']))
@router.post('/requests/{uiid}/actions')
def review(req:Request,uiid:str,data:UiAction):
 identity=MAPPING.get(data.actor_id)
 if identity is None or actor(req)!=identity:return error('AUTHORIZATION_DENIED',403,req.state.trace)
 with lock:
  if uiid not in ROWS:return error('CASE_NOT_FOUND',404,req.state.trace)
  row=ROWS[uiid];item=store[row['sandbox']['request_id']]
  if item['state'].version!=data.expected_version:return error('VERSION_CONFLICT',409,req.state.trace)
  if data.decision!='approve':return error('RULE_NOT_APPROVED',409,req.state.trace)
  try:result=approve(item['state'],identity)
  except DomainError as exc:return error(exc.code,exc.status_code,req.state.trace)
  item['state']=result.state;row['updatedAt']=timestamp()
  if identity=='manager':row['supervisorSignatureAt']=row['updatedAt']
  item['history'].append(dict(action='approve_synthetic_ui_proposal',actor=identity,trace_id=req.state.trace,stage=int(result.state.stage)))
  return packet(req,canonical(uiid))
@router.post('/requests/{uiid}/engines/{engine}')
def engine_ui(req:Request,uiid:str,engine:str,data:Knowledge):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 with lock:
  if uiid not in ROWS:return error('CASE_NOT_FOUND',404,req.state.trace)
  if engine not in ('E1','E2','E3','E4'):return error('ENGINE_UNKNOWN',404,req.state.trace)
  item=store[ROWS[uiid]['sandbox']['request_id']]
  if engine=='E3' and int(item['state'].stage)<6:return error('REPORT_STAGE_REQUIRED',409,req.state.trace)
  if engine in ('E1','E2') and int(item['state'].stage)<2:return error('MANAGER_REVIEW_REQUIRED',409,req.state.trace)
  payload={'synthetic':True,'case':canonical(uiid),'capacity_evidence':'UNKNOWN','measurement_policy':'SUPPLIED_ONLY'}
 from gateway.live_routes import invoke
 return invoke(req,engine,payload)
@router.post('/knowledge')
def knowledge(req:Request,data:Knowledge):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 from gateway.live_routes import invoke
 return invoke(req,'E4',{'synthetic':True,'question':data.question})
