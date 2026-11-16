"""E4-only Responses service. Default-off; fixed endpoint; zero automatic retries."""
import json,re,hashlib,threading,time,math
from dataclasses import dataclass,asdict
from decimal import Decimal
import httpx
from concurrent.futures import ThreadPoolExecutor,TimeoutError as FutureTimeout
from gateway.e4_session import validate_binding,subject
from jsonschema import Draft202012Validator
from gateway.live_provider import DOCS,SCHEMA,SENSITIVE
from gateway.e4_chat_contract import DOCUMENT_QA,GENERAL_CHAT,MODES,schema_for,instructions_for,language_instruction
def _require_safe(condition):
 if not condition:raise ValueError('PROVIDER_VALIDATION_FAILED')

class E4Error(Exception):
 def __init__(self,code,status=503,request_id=None):super().__init__(code);self.code=code;self.status=status;self.request_id=request_id
@dataclass(frozen=True)
class Settings:
 model:str
 input_rate:Decimal
 output_rate:Decimal
 call_cap:Decimal
 total_cap:Decimal
 expires:float
 round_id:str
 max_input:int=8192
 max_output:int=512
 rate:int=2
 history_pairs:int=4
 approved:bool=False
 approval_reference:str=''
 model_access_reference:str=''
 pricing_reference:str=''
 durable_storage_reference:str=''
 network_reference:str=''
 max_concurrent:int=1
 request_timeout:float=20
 def validate(self):
  if self.max_concurrent not in (1,2) or not math.isfinite(self.request_timeout) or not 0<self.request_timeout<=30:raise E4Error('INVALID_EXECUTION_LIMITS')
  if not math.isfinite(self.expires) or self.expires<=0 or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}',self.model) or not self.round_id:raise E4Error('MODEL_OR_ROUND_REQUIRED')
  if any(not x.is_finite() or x<=0 for x in [self.input_rate,self.output_rate,self.call_cap,self.total_cap]) or self.call_cap>self.total_cap:raise E4Error('INVALID_BUDGET')
  if not 1024<=self.max_input<=16384 or not 16<=self.max_output<=1000 or not 1<=self.rate<=4 or not 1<=self.history_pairs<=4:raise E4Error('INVALID_LIMITS')
 def identity(self):return hashlib.sha256(json.dumps(asdict(self),default=str,sort_keys=True).encode()).hexdigest()
class E4Service:
 ENDPOINT='https://api.openai.com/v1/responses'
 def __init__(self,settings,ledger,key_source,client=None,clock=time.time):
  settings.validate();self.settings=settings;self.ledger=ledger;self.clock=clock;self.key_source=key_source
  from gateway.e4_preview_ledger import nanos
  ledger.recover_unknown(clock())
  snap=ledger.snapshot()
  if snap['cap_nanos']!=nanos(settings.total_cap) or snap['expires']!=settings.expires or snap['max_concurrent']!=settings.max_concurrent:raise E4Error('LEDGER_CONFIG_MISMATCH')
  self.simulation=client is not None and isinstance(getattr(client,'_transport',None),httpx.MockTransport)
  if not self.simulation:
   if not settings.approved:raise E4Error('AI_SPEND_NOT_APPROVED')
   if not all([settings.approval_reference,settings.model_access_reference,settings.pricing_reference,settings.durable_storage_reference,settings.network_reference]):raise E4Error('VERIFIED_RELEASE_EVIDENCE_REQUIRED')
   if clock()>=settings.expires:raise E4Error('BUDGET_EXPIRED')
   if not getattr(ledger,'cloud_coordination_verified',False):raise E4Error('CLOUD_COORDINATION_NOT_VERIFIED')
  self.client=client or httpx.Client(timeout=httpx.Timeout(20,connect=5),follow_redirects=False,trust_env=True)
  self.histories={};self.locks={};self.cancellations={};self.guard=threading.Lock();self.executor=ThreadPoolExecutor(max_workers=settings.max_concurrent,thread_name_prefix="e4-local-provider")
 def _session(self,sid,mode):
  lock_sid=sid
  sid=sid if mode==DOCUMENT_QA else sid+':'+mode
  now=self.clock()
  with self.guard:
   stale=[s for s,v in self.histories.items() if now-v['at']>=1800]
   for s in stale:self.histories.pop(s,None)
   active={s.split(':',1)[0] for s in self.histories}
   for s in list(self.locks):
    if s not in active and not self.locks[s].locked():self.locks.pop(s,None)
   if sid not in self.histories:
    if len(self.histories)>=1000:raise E4Error('SESSION_LIMIT',429)
    self.histories[sid]={'at':now,'pairs':[],'turns':0}
   self.locks.setdefault(lock_sid,threading.Lock())
   return self.histories[sid],self.locks[lock_sid]
 def analyze(self,binding,question,trace,mode=DOCUMENT_QA,request_id=None,cancel=None,demo_context=None,language='zh-TW'):
  if mode not in MODES:raise E4Error('INVALID_CHAT_MODE',422)
  if language not in ('zh-TW','en'):raise E4Error('INVALID_RESPONSE_LANGUAGE',422)
  try:validate_binding(binding,self.clock());generation=self.ledger.bind_session(binding,self.clock())
  except ValueError as e:raise E4Error(str(e),403 if str(e)=='AUTHORIZATION_DENIED' else 401) from None
  from gateway.lab_scope import ensure_lab_scope
  ensure_lab_scope(question,mode==DOCUMENT_QA)
  from gateway.e4_readonly_context import validate_context
  context=validate_context(demo_context,binding,self.clock())
  if context is not None and mode!=GENERAL_CHAT:raise E4Error('READONLY_CONTEXT_MODE_DENIED',422)
  if context is not None and context['intent']=='REPORT_DRAFT':
   requested=set(re.findall(r'REQ-\d{4}-(?:\d{3}|[a-f0-9]{8})',question))
   if len(requested)!=1 or {x['id'] for x in context['items'] if x['kind']=='requests'}!=requested:raise E4Error('REPORT_CONTEXT_CASE_MISMATCH',422)
  if not re.fullmatch(r'I-[A-Za-z0-9_-]{1,80}',trace):raise E4Error('INVALID_TRACE',422)
  request_id=request_id or trace
  if not re.fullmatch(r'(?:I-|O-)[A-Za-z0-9_-]{1,100}',request_id):raise E4Error('INVALID_REQUEST_ID',422)
  if not isinstance(question,str) or not 1<=len(question)<=1500 or SENSITIVE.search(question) or re.search('公司|股份',question):raise E4Error('SYNTHETIC_INPUT_REQUIRED',422)
  sid=subject(binding)
  history,lock=self._session(sid,mode)
  if question in ('/clear','/logout'):
   self.ledger.control(binding,self.clock(),'logout' if question=='/logout' else 'clear')
   with self.guard:
    pending=self.cancellations.get(sid)
    if pending is not None:pending.set()
    for name in [sid,sid+':GENERAL_CHAT']:self.histories.pop(name,None)
   return {'engine':'E4','control':'SESSION_REVOKED' if question=='/logout' else 'CONVERSATION_CLEARED','conversation_id':binding['sid'],'trace_id':trace,'real_ai':False,'synthetic':True}
  if not lock.acquire(blocking=False):raise E4Error('SESSION_REQUEST_IN_PROGRESS',409)
  cancel=cancel or threading.Event()
  with self.guard:self.cancellations[sid]=cancel
  try:
   if history.get('generation')!=generation:history.update(pairs=[],turns=0,generation=generation)
   return self._analyze(history,binding,question,trace,mode,request_id,cancel,context,language)
  finally:
   with self.guard:self.cancellations.pop(sid,None)
   lock.release()
 def _analyze(self,history,binding,question,trace,mode,request_id,cancel,demo_context=None,language='zh-TW'):
  cfg=self.settings
  if self.clock()>=cfg.expires:raise E4Error('BUDGET_EXPIRED',403)
  if not isinstance(history.get('pairs'),list) or len(history['pairs'])>cfg.history_pairs:raise E4Error('INVALID_HISTORY',422)
  for pair in history['pairs']:
   if not isinstance(pair,dict) or set(pair)!={'user','assistant'} or not all(isinstance(pair[k],str) and 0<len(pair[k])<=limit for k,limit in [('user',1500),('assistant',2400)]):raise E4Error('INVALID_HISTORY',422)
  pairs=list(history['pairs']);truncated=history['turns']>len(pairs)
  instructions=instructions_for(mode)+' Laboratory/testing topics only. DQA is not built; refuse identities, permissions, credentials and unrelated topics.'
  if demo_context is not None:
   from gateway.e4_readonly_context import READ_CHAT_INSTRUCTIONS
   if demo_context.get('version')==2:
    from gateway.e4_lab_context import LAB_CHAT_INSTRUCTIONS
    instructions=LAB_CHAT_INSTRUCTIONS
   else:instructions=READ_CHAT_INSTRUCTIONS
  instructions+=language_instruction(language)
  while True:
   inp={'history':pairs,'question':question}
   if demo_context is not None:inp['demo_context']=demo_context
   if mode==DOCUMENT_QA:inp['documents']=DOCS
   request={'model':cfg.model,'store':False,'service_tier':'default','instructions':instructions,'input':json.dumps(inp,ensure_ascii=False,separators=(',',':')),'max_output_tokens':cfg.max_output,'text':{'format':{'type':'json_schema','name':'e4_'+mode.lower(),'strict':True,'schema':schema_for(mode)}}}
   bound=len(json.dumps(request,ensure_ascii=False,separators=(',',':')).encode())+4096
   if bound<=cfg.max_input:break
   if not pairs:raise E4Error('INPUT_TOKEN_LIMIT',422)
   pairs.pop(0);truncated=True
  estimate=(Decimal(bound)*cfg.input_rate+Decimal(cfg.max_output)*cfg.output_rate)/1000000
  if estimate>cfg.call_cap:raise E4Error('PER_CALL_BUDGET_LIMIT',429)
  if cancel is not None and cancel.is_set():raise E4Error('REQUEST_CANCELLED_NOT_SENT',409)
  fingerprint_data={'mode':mode,'question':question,'language':language}
  if demo_context is not None:fingerprint_data['demo_context']=demo_context
  fingerprint=hashlib.sha256(json.dumps(fingerprint_data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  key=self.key_source()
  if not key:
   self.ledger.denied(request_id,subject(binding),fingerprint,'PROVIDER_CREDENTIAL_REQUIRED',self.clock())
   raise E4Error('PROVIDER_CREDENTIAL_REQUIRED')
  if self.executor._shutdown:
   self.ledger.denied(request_id,subject(binding),fingerprint,'SERVICE_EXECUTOR_UNAVAILABLE',self.clock())
   raise E4Error('SERVICE_EXECUTOR_UNAVAILABLE')
  try:self.ledger.reserve(request_id,subject(binding),cfg.call_cap,self.clock(),cfg.rate,fingerprint,cfg.request_timeout+5,trace,binding,history['generation'])
  except Exception as e:
   code=str(e) if str(e) in ['BUDGET_EXPIRED','RATE_LIMIT','TOTAL_BUDGET_LIMIT','SERVICE_BUSY','CONCURRENCY_RECOVERY_REQUIRED','OUTCOME_RECONCILIATION_REQUIRED','REQUEST_ID_CONFLICT','REQUEST_ALREADY_COMPLETED','REQUEST_OUTCOME_UNKNOWN','REQUEST_ALREADY_SEEN','SESSION_REVOKED_OR_EXPIRED','SESSION_CONTEXT_CHANGED'] else 'LEDGER_RESERVATION_DENIED'
   raise E4Error(code,401 if code=='SESSION_REVOKED_OR_EXPIRED' else 403 if code=='BUDGET_EXPIRED' else 409 if code.startswith(('REQUEST_','SESSION_')) else 429) from None
  def unknown(code,status=502):
   try:self.ledger.unknown(request_id,code,self.clock())
   except Exception:raise E4Error('LEDGER_FAILURE_RECORD_UNCONFIRMED',503) from None
   raise E4Error(code,status,request_id)
  def perform():
   try:
    try:self.ledger.authorize_dispatch(request_id,binding,history['generation'],self.clock(),cancel.is_set() if cancel else False)
    except ValueError as error:raise E4Error(str(error),401 if str(error)=='SESSION_REVOKED_OR_EXPIRED' else 403 if str(error)=='BUDGET_EXPIRED' else 409,request_id) from None
    return self.client.post(self.ENDPOINT,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-Client-Request-Id':request_id},json=request)
   finally:
    try:self.ledger.transport_done(request_id)
    except Exception:pass  # Fail closed: an unreleased lease blocks new work.
  try:future=self.executor.submit(perform)
  except Exception:
   # Submission can fail after enqueueing: never assume that no charge is possible.
   unknown('EXECUTOR_SUBMISSION_OUTCOME_UNKNOWN',503)
  deadline=time.monotonic()+cfg.request_timeout
  while True:
   if cancel is not None and cancel.is_set():unknown('REQUEST_CANCELLED_OUTCOME_UNKNOWN',409)
   left=deadline-time.monotonic()
   if left<=0:unknown('PROVIDER_DEADLINE_OUTCOME_UNKNOWN',504)
   try:r=future.result(timeout=min(left,.05));break
   except FutureTimeout:continue
   except E4Error:raise
   except httpx.TimeoutException:unknown('PROVIDER_TIMEOUT_RESERVATION_HELD',504)
   except httpx.HTTPError:unknown('PROVIDER_NETWORK_ERROR_RESERVATION_HELD',502)
   except Exception:unknown('PROVIDER_TRANSPORT_ERROR_RESERVATION_HELD',502)
  if cancel is not None and cancel.is_set():unknown('REQUEST_CANCELLED_OUTCOME_UNKNOWN',409)
  if r.status_code!=200:unknown({401:'MODEL_AUTHENTICATION_FAILED',403:'MODEL_ACCESS_DENIED',404:'MODEL_UNAVAILABLE',429:'PROVIDER_RATE_LIMIT'}.get(r.status_code,'PROVIDER_HTTP_ERROR'))
  try:
   raw=r.json();usage=raw['usage'];i=usage['input_tokens'];o=usage['output_tokens']
   _require_safe(type(i) is int and type(o) is int and 0<=i<=bound and 0<=o<=cfg.max_output)
   _require_safe(raw['status']=='completed' and raw['model']==cfg.model and raw.get('service_tier','default')=='default')
   rid=r.headers['x-request-id'];response_id=raw['id'];_require_safe(re.fullmatch(r'[A-Za-z0-9_-]{1,160}',rid) and re.fullmatch(r'resp_[A-Za-z0-9_-]{1,160}',response_id));_require_safe(key not in rid and key not in response_id)
   parts=[c for item in raw['output'] if item.get('type')=='message' for c in item['content']];_require_safe(parts and all(x['type']=='output_text' for x in parts))
   result=json.loads(''.join(x['text'] for x in parts));Draft202012Validator(schema_for(mode)).validate(result);_require_safe(result['engine']=='E4')
   serialized=json.dumps(result,ensure_ascii=False);_require_safe(key not in serialized and not SENSITIVE.search(serialized))
   for cite in result['citations']:_require_safe(any(cite['document_id']==d['id'] and cite['version']==d['version'] and cite['quote'] and cite['quote'] in d['text'] for d in DOCS))
  except Exception:unknown('PROVIDER_OUTPUT_REJECTED_RESERVATION_HELD',502)
  cost=(Decimal(i)*cfg.input_rate+Decimal(o)*cfg.output_rate)/1000000
  record={'request_id':request_id,'chat_mode':mode,'response_language':language,'trace_id':trace,'provider_request_id':rid,'provider_response_id':response_id,'model':cfg.model,'input_tokens':i,'output_tokens':o,'cost_usd':str(cost),'transport':'MOCK_HTTP_ONLY' if self.simulation else 'LIVE_PROVIDER'}
  def reject_accounted_output(code):
   # Usage and schema have been verified. A refused answer is not an unknown charge.
   try:self.ledger.settle_rejected_output(request_id,cost,record,code,self.clock())
   except Exception:unknown('REJECTED_OUTPUT_ACCOUNTING_FAILED_RESERVATION_HELD',503)
   raise E4Error(code,502,request_id)
  evidence='GENERAL_INFORMATION_ONLY' if mode==GENERAL_CHAT else 'VALIDATED'
  if demo_context is not None:
   # This layer exposes no mutators; reject claims that a write/signoff occurred.
   if re.search(r'已(?:經)?(?:自動)?(?:修改|刪除|更新|寫入|簽核|簽名|排程|提交報告)|\b(?:I|we)\s+(?:have\s+)?(?:already\s+)?(?:updated|modified|deleted|saved|signed|approved|scheduled|submitted)\b',result['summary'],re.I):reject_accounted_output('READONLY_OUTPUT_WRITE_CLAIM_REJECTED')
   if demo_context['intent']=='REPORT_DRAFT' and re.search(r'(?:實測|測得|量測結果)[^。\n]{0,24}\d|(?:判定|結果)[：:]\s*(?:合格|不合格|PASS|FAIL)|(?:已完成|已代為)(?:簽核|簽名)|(?:measured|measurement results?)[^。\n]{0,24}\d|(?:verdict|result)[：:]\s*(?:PASS|FAIL)',result['summary'],re.I):reject_accounted_output('REPORT_DRAFT_UNSUPPORTED_RESULT_REJECTED')
  if mode==DOCUMENT_QA and not result['citations']:result={'engine':'E4','summary':('Insufficient evidence: no verifiable citations are available.' if language=='en' else '資料不足：沒有可驗證引用，無法回答。'),'issues':[],'advice':[],'citations':[]};evidence='EVIDENCE_INSUFFICIENT_REFUSED'
  try:self.ledger.settle(request_id,cost,record)
  except Exception:unknown('LEDGER_SETTLEMENT_FAILED_RESERVATION_HELD',503)
  try:
   with self.ledger.session_guard(binding,self.clock(),history['generation']):
    history['pairs']=(pairs+[{'user':question,'assistant':result['summary']}])[-cfg.history_pairs:];history['at']=self.clock();history['turns']+=1
  except ValueError as e:raise E4Error(str(e),409 if str(e)=='SESSION_CONTEXT_CHANGED' else 401) from None
  packet={'engine':'E4','conversation_id':binding['sid'],'request_id':request_id,'chat_mode':mode,'response_language':language,'execution_mode':'MOCK' if self.simulation else 'LIVE_PROVIDER','real_ai':not self.simulation,'synthetic':True,'provider':'MOCK_HTTP_TRANSPORT' if self.simulation else 'openai_responses','model':cfg.model,'provider_request_id':rid,'provider_response_id':response_id,'usage':{'input_tokens':i,'output_tokens':o},'estimated_cost_usd':str(cost),'trace_id':trace,'result':result,'evidence_validation':evidence,'history_turns_used':len(pairs),'history_truncated':truncated,'history_policy':'BOUNDED_RECENT_PAIRS_RESET_ON_RESTART','human_final_decision':True}
  if demo_context is not None:
   from gateway.e4_readonly_context import draft_metadata
   packet['read_context']={'source':demo_context['source'],'observed_at':demo_context['observed_at'],'totals':demo_context['totals'],'coverage':demo_context['coverage'],'selection':demo_context['selection'],'writes':'NONE'}
   if demo_context.get('version')==2:packet['read_context']['references']=[{'kind':x['kind'],'id':x['id'],'name':x['fields'].get('name',x['fields'].get('title','')),'version':x['fields'].get('version','')} for x in demo_context['items']]
   draft=draft_metadata(demo_context)
   if draft:packet['report_draft']=draft
  return packet
