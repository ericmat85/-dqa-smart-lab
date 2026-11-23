"""Workspace/engine settings on the existing private persistent ledger.
Secrets are AES-GCM encrypted; public views never return a decryptable key.
No balance, expiration, ledger identity, provider endpoint or pricing changes.
"""
import hashlib,hmac,json,os,re,uuid
from decimal import Decimal,InvalidOperation
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from gateway.e4_preview_provider import E4Error
from gateway.e4_preview_ledger import nanos
from gateway.business_engine_controls import controls,CONTROLS
from gateway.business_model_catalog import ModelCatalog,CATALOG

class AISettings:
 def __init__(self,secret,clock,expires_at):
  self.expires_at=expires_at;self.secret=secret;self.cipher=AESGCM(hashlib.sha256(('business-ai-settings-v1:'+secret).encode()).digest());self.clock=clock;self.catalog=ModelCatalog(clock)
 def initialize(self,ledger):
  with ledger.connect() as c:
   c.execute('CREATE TABLE IF NOT EXISTS business_ai_settings(workspace TEXT NOT NULL,engine TEXT NOT NULL,revision INTEGER NOT NULL,config TEXT NOT NULL,credential BLOB,updated_at REAL NOT NULL,actor TEXT NOT NULL,PRIMARY KEY(workspace,engine))')
   c.execute('CREATE TABLE IF NOT EXISTS business_ai_settings_audit(workspace TEXT NOT NULL,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,at REAL NOT NULL,actor TEXT NOT NULL,PRIMARY KEY(workspace,operation))')
 def scope(self,workspace,engine):
  if not isinstance(workspace,str) or not re.fullmatch('[a-f0-9]{64}',workspace) or engine not in ('E1','E2','E3','E4'):raise E4Error('AI_SETTINGS_FIELDS_INVALID',422)
 def read(self,state,workspace,engine,connection=None):
  self.scope(workspace,engine)
  if connection is None:
   with state.ledger.connect() as c:return self.read(state,workspace,engine,c)
  row=connection.execute('SELECT revision,config,credential,updated_at,actor FROM business_ai_settings WHERE workspace=? AND engine=?',(workspace,engine)).fetchone()
  cfg=state.service.settings
  default={'enabled':True,'model':cfg.model,'per_call_usd':str(cfg.call_cap),'total_cap_usd':str(cfg.total_cap),'max_output_tokens':cfg.max_output,'key_mode':'INHERIT'}
  return {'revision':row[0] if row else 0,'config':json.loads(row[1]) if row else default,'credential':row[2] if row else None,'updated_at':row[3] if row else None,'updated_by':row[4] if row else None}
 def credential(self,state,workspace,engine,row):
  mode=row['config']['key_mode']
  if mode=='NONE':return ''
  if mode=='INHERIT':return state.service.key_source() or ''
  try:
   encrypted=bytes(row['credential']);return self.cipher.decrypt(encrypted[:12],encrypted[12:],(workspace+':'+engine).encode()).decode()
  except Exception:raise E4Error('AI_SETTINGS_CREDENTIAL_UNAVAILABLE') from None
 def public(self,state,workspace,engine,row=None,with_models=True):
  row=row or self.read(state,workspace,engine);row={**row,'config':{**row['config'],'engine_controls':controls(engine,row['config'].get('engine_controls'))}};cfg=state.service.settings
  key=self.credential(state,workspace,engine,row)
  snap=state.ledger.snapshot()
  models=self.catalog.view(state,key,row['config']) if with_models else []
  return {'engine':engine,'revision':row['revision'],**row['config'],'key_configured':bool(key),'key_mask':('••••••••'+key[-4:]) if len(key)>=12 else ('已設定' if key else ''),'updated_at':row['updated_at'],'updated_by':row['updated_by'],'provider':'OpenAI Responses','endpoint':state.service.ENDPOINT,'allowed_models':[r['id'] for r in models if r['selectable']],'models':models,'catalog_version':CATALOG['version'],'control_fields':CONTROLS[engine],'limits':{'per_call_usd':str(min(cfg.call_cap,Decimal('.05'))),'total_cap_usd':str(Decimal(snap['cap_nanos'])/10**9),'max_output_tokens':cfg.max_output},'usage':{'spent_usd':str(Decimal(snap['spent_nanos'])/10**9),'held_usd':str(Decimal(snap['held_nanos'])/10**9)},'expires_at':min(cfg.expires,self.expires_at),'model_call_performed':False}
 def save(self,state,workspace,engine,actor,body):
  self.scope(workspace,engine)
  allowed={'operation_id','expected_revision','enabled','model','per_call_usd','total_cap_usd','max_output_tokens','key_action','api_key','engine_controls'}
  if not isinstance(body,dict) or set(body)-allowed or allowed-{'api_key','engine_controls'}-set(body):raise E4Error('AI_SETTINGS_FIELDS_INVALID',422)
  try:
   operation=str(uuid.UUID(body['operation_id']));revision=body['expected_revision'];cfg=state.service.settings
   assert type(revision) is int and revision>=0 and type(body['enabled']) is bool
   self.catalog.profile(body['model'])
   assert type(body['max_output_tokens']) is int and 16<=body['max_output_tokens']<=cfg.max_output
   for field in ['per_call_usd','total_cap_usd']:
    assert isinstance(body[field],str) and re.fullmatch(r'\d{1,5}(?:\.\d{1,6})?',body[field])
   call,total=Decimal(body['per_call_usd']),Decimal(body['total_cap_usd'])
   assert 0<call<=min(cfg.call_cap,Decimal('.05')) and 0<=total<=cfg.total_cap and (total==0 or call<=total)
   assert body['key_action'] in ('KEEP','REPLACE','REMOVE','INHERIT')
   key=body.get('api_key','');assert isinstance(key,str)
   if body['key_action']=='REPLACE':assert re.fullmatch(r'[A-Za-z0-9_\-]{20,512}',key)
   else:assert not key
  except (AssertionError,ValueError,TypeError,InvalidOperation):raise E4Error('AI_SETTINGS_FIELDS_INVALID',422) from None
  if not isinstance(actor,str) or not re.fullmatch('[a-f0-9]{64}',actor):raise E4Error('AI_SETTINGS_FIELDS_INVALID',422)
  validated_controls=controls(engine,body['engine_controls']) if 'engine_controls' in body else None
  fingerprint=hmac.new(self.secret.encode(),json.dumps({'engine':engine,'actor':actor,'body':body},sort_keys=True).encode(),hashlib.sha256).hexdigest()
  # Read/metadata preflight before taking the ledger's write lock.
  with state.ledger.connect() as c:
   prior=c.execute('SELECT fingerprint,result FROM business_ai_settings_audit WHERE workspace=? AND operation=?',(workspace,operation)).fetchone()
   if prior:
    if not hmac.compare_digest(prior[0],fingerprint):raise E4Error('AI_SETTINGS_OPERATION_CONFLICT',409)
    return {**json.loads(prior[1]),'replayed':True}
   before=self.read(state,workspace,engine,c)
  if revision!=before['revision']:raise E4Error('AI_SETTINGS_REVISION_CONFLICT',409)
  mode='NONE' if body['key_action']=='REMOVE' else 'OVERRIDE' if body['key_action']=='REPLACE' else 'INHERIT' if body['key_action']=='INHERIT' else before['config']['key_mode']
  if body['enabled'] and mode!='NONE' and (body['model']!=before['config']['model'] or body['key_action'] in ('REPLACE','INHERIT') or not before['config']['enabled']):
   effective_key=key if body['key_action']=='REPLACE' else state.service.key_source() if body['key_action']=='INHERIT' else self.credential(state,workspace,engine,before)
   self.catalog.require(state,effective_key,body)
  with state.ledger.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   prior=c.execute('SELECT fingerprint,result FROM business_ai_settings_audit WHERE workspace=? AND operation=?',(workspace,operation)).fetchone()
   if prior:
    if not hmac.compare_digest(prior[0],fingerprint):raise E4Error('AI_SETTINGS_OPERATION_CONFLICT',409)
    return {**json.loads(prior[1]),'replayed':True}
   current=self.read(state,workspace,engine,c)
   if revision!=current['revision']:raise E4Error('AI_SETTINGS_REVISION_CONFLICT',409)
   config={k:body[k] for k in ('enabled','model','per_call_usd','total_cap_usd','max_output_tokens')};config['key_mode']=current['config']['key_mode'];config['engine_controls']=validated_controls if validated_controls is not None else controls(engine,current['config'].get('engine_controls'));encrypted=current['credential']
   if body['key_action']=='REPLACE':
    nonce=os.urandom(12);encrypted=nonce+self.cipher.encrypt(nonce,key.encode(),(workspace+':'+engine).encode());config['key_mode']='OVERRIDE'
   elif body['key_action']!='KEEP':config['key_mode']='NONE' if body['key_action']=='REMOVE' else 'INHERIT';encrypted=None
   row={'revision':revision+1,'config':config,'credential':encrypted,'updated_at':self.clock(),'updated_by':actor}
   c.execute('INSERT INTO business_ai_settings VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace,engine) DO UPDATE SET revision=excluded.revision,config=excluded.config,credential=excluded.credential,updated_at=excluded.updated_at,actor=excluded.actor',(workspace,engine,row['revision'],json.dumps(config),encrypted,row['updated_at'],actor))
   # Audit stores masked configuration only, never raw input/keys or encrypted blobs.
   result={'engine':engine,'revision':row['revision'],'operation_id':operation,'saved':True,'model_call_performed':False}
   c.execute('INSERT INTO business_ai_settings_audit VALUES(?,?,?,?,?,?)',(workspace,operation,fingerprint,json.dumps(result),self.clock(),actor))
  return result
 def guard(self,state,workspace,engine,revision):
  def check(c,amount=None):
   row=self.read(state,workspace,engine,c)
   if row['revision']!=revision:raise ValueError('AI_SETTINGS_CHANGED')
   if not row['config']['enabled']:raise ValueError('AI_ENGINE_DISABLED')
   cap,held,spent=c.execute('SELECT cap,held,spent FROM budget WHERE id=1').fetchone()
   ceiling=min(cap,nanos(row['config']['total_cap_usd']))
   if spent+held+(amount or 0)>ceiling:raise ValueError('AI_ENGINE_BUDGET_LIMIT')
  return check
