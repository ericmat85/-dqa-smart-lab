"""Audited model profiles; credential-specific metadata reads never run inference."""
import json,hashlib,threading,time,re
from pathlib import Path
from decimal import Decimal
from gateway.e4_preview_provider import E4Error
CATALOG=json.loads(Path(__file__).with_suffix('.json').read_text())
PROFILES={row['id']:row for row in CATALOG['models']}
class ModelCatalog:
 def __init__(self,clock=time.time):self.clock=clock;self.cache={};self.lock=threading.Lock()
 def access(self,state,key):
  if not key:return set(),'PROVIDER_CREDENTIAL_REQUIRED'
  fingerprint=hashlib.sha256(key.encode()).hexdigest()
  with self.lock:
   prior=self.cache.get(fingerprint)
   if prior and self.clock()-prior[0]<(15 if prior[2] else 300):return prior[1],prior[2]
  try:
   response=state.service.client.get('https://api.openai.com/v1/models',headers={'Authorization':'Bearer '+key},timeout=5)
   if response.status_code!=200:raise ValueError()
   packet=response.json()
   if packet.get('object')!='list' or not isinstance(packet.get('data'),list):raise ValueError()
   ids={x['id'] for x in packet['data'] if isinstance(x,dict) and isinstance(x.get('id'),str) and re.fullmatch('[A-Za-z0-9_.:-]{1,180}',x['id'])}
   error=None
  except Exception:ids=set();error='MODEL_ACCESS_UNCONFIRMED'
  with self.lock:
   if len(self.cache)>128:self.cache.clear()
   self.cache[fingerprint]=(self.clock(),ids,error)
  return ids,error
 def profile(self,model):
  if not isinstance(model,str) or not PROFILES.get(model,{}).get('compatible'):raise E4Error('AI_MODEL_INCOMPATIBLE',422)
  return PROFILES[model]
 def view(self,state,key,config):
  ids,error=self.access(state,key);cfg=state.service.settings;rows=[]
  for model in sorted(set(PROFILES)|ids):
   p=PROFILES.get(model,{'id':model,'compatible':False,'reason':'模型價格與回應合約尚未核對'});reason=p['reason'];selectable=p['compatible']
   available=not error and model in ids
   if not available:selectable=False;reason='金鑰模型清單無法確認，暫不能選用' if error else '目前金鑰的可用清單未包含此模型'
   estimate=None
   if p.get('input_usd_per_million'):
    estimate=(Decimal(cfg.max_input)*Decimal(p['input_usd_per_million'])+Decimal(config['max_output_tokens'])*Decimal(p['output_usd_per_million']))/1000000
    if selectable and estimate>Decimal(config['per_call_usd']):selectable=False;reason='目前每次費用上限不足以涵蓋最大輸入與輸出'
   rows.append({**p,'available':bool(available),'contract_reason':p['reason'],'selectable':selectable,'reason':reason,'estimated_max_cost_usd':str(estimate) if estimate is not None else None,'max_input_tokens':cfg.max_input,'access_status':error or 'METADATA_CONFIRMED','paid_inference_verified':False})
  return rows
 def require(self,state,key,config,check_budget=True):
  p=self.profile(config['model']);ids,error=self.access(state,key)
  if error:raise E4Error(error,503 if error=='MODEL_ACCESS_UNCONFIRMED' else 403)
  if p['id'] not in ids:raise E4Error('AI_MODEL_ACCESS_DENIED',403)
  if check_budget:
   estimate=(Decimal(state.service.settings.max_input)*Decimal(p['input_usd_per_million'])+Decimal(config['max_output_tokens'])*Decimal(p['output_usd_per_million']))/1000000
   if estimate>Decimal(config['per_call_usd']):raise E4Error('AI_MODEL_BUDGET_INCOMPATIBLE',422)
  return p
