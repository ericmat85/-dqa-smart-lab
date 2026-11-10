"""Isolated Preview schema; no C Public DTO claim and no domain-state writes."""
import threading
from fastapi import APIRouter,Request
from gateway.server import Strict,packet,error,allowed,actor,lock,store
from gateway.live_provider import Config,LiveProvider,ProviderError
from pydantic import Field
from typing import Literal
router=APIRouter(prefix='/__integration_demo/ui')
_guard=threading.Lock();_provider=None
class Advice(Strict):
 synthetic:Literal[True]
 question:str=Field(min_length=1,max_length=1500)
def invoke(req,engine,payload):
 global _provider
 try:
  with _guard:
   if _provider is None:_provider=LiveProvider(Config())
  return packet(req,_provider.analyze(engine,payload,req.state.trace))
 except ProviderError as e:return error(e.code,e.status,req.state.trace)
@router.post('/live/{engine}')
def standalone(req:Request,engine:str,data:Advice):
 if not allowed(req):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 if engine not in ('E1','E2','E3','E4'):return error('ENGINE_UNKNOWN',404,req.state.trace)
 if engine!='E4' and actor(req) not in ('manager','level1','level2'):return error('AUTHORIZATION_DENIED',403,req.state.trace)
 if engine!='E4' and not data.question.startswith('SYNTH'):return error('SYNTHETIC_PREFIX_REQUIRED',422,req.state.trace)
 return invoke(req,engine,{'synthetic':True,'analysis_only':True,'question':data.question,'capacity_evidence':'UNKNOWN','measurement_policy':'SUPPLIED_DATA_ONLY_NO_INVENTED_VALUES'})
