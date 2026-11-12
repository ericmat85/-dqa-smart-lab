"""E4-only Mock Preview entrypoint. No E1-E3 service registration or real transport."""
import argparse,fcntl,json,os,socket,time,uuid
from decimal import Decimal
from pathlib import Path
import httpx
from gateway.e4_preview_provider import E4Service,Settings,DOCS
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_app import create_app

def require_mock_environment(env):
 if any(name in env for name in ['OPENAI_API_KEY','AZURE_OPENAI_API_KEY','ANTHROPIC_API_KEY']):raise RuntimeError('MOCK_RUNTIME_CREDENTIALS_FORBIDDEN')
 if env.get('AI_SPEND_APPROVED','0')!='0' or str(env.get('LIVE_PROVIDER_ENABLED','false')).lower() not in ['false','0'] or str(env.get('LIVE_AI_ENABLED','false')).lower() not in ['false','0']:raise RuntimeError('MOCK_RUNTIME_LIVE_FLAGS_FORBIDDEN')

def block_outbound_tcp():
 original=socket.socket.connect;original_ex=socket.socket.connect_ex
 def connect(self,*args,**kwargs):
  if self.family in (socket.AF_INET,socket.AF_INET6):raise RuntimeError('MOCK_EXTERNAL_TCP_DENIED')
  return original(self,*args,**kwargs)
 def connect_ex(self,*args,**kwargs):
  if self.family in (socket.AF_INET,socket.AF_INET6):raise RuntimeError('MOCK_EXTERNAL_TCP_DENIED')
  return original_ex(self,*args,**kwargs)
 socket.socket.connect=connect;socket.socket.connect_ex=connect_ex

class MockRuntime:
 def __init__(self,state_dir,gateway_key,env,initialize=False,clock=time.time,delay=0):
  require_mock_environment(env)
  self.directory=Path(state_dir)
  if not self.directory.is_absolute():raise RuntimeError('ABSOLUTE_MOCK_STATE_DIRECTORY_REQUIRED')
  if initialize:self.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
  for p in [self.directory,*self.directory.parents]:
   if p.is_symlink():raise RuntimeError('MOCK_STATE_SYMLINK_DENIED')
  stat=self.directory.stat()
  if stat.st_uid!=os.getuid() or stat.st_mode&0o077:raise RuntimeError('PRIVATE_MOCK_STATE_REQUIRED')
  self.owner=(self.directory/'owner.lock').open('a+')
  try:fcntl.flock(self.owner.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:self.owner.close();raise RuntimeError('SINGLE_INSTANCE_MOCK_ONLY') from None
  self.clock=clock;self.delay=delay;self.calls=[]
  try:
   config=self.directory/'mock-round.json';db=self.directory/'mock-ledger.sqlite'
   if not config.exists():
    if not initialize or db.exists():raise RuntimeError('EXPLICIT_MOCK_INITIALIZATION_REQUIRED')
    data={'round_id':'MOCK_ONLY_'+uuid.uuid4().hex,'expires':clock()+86400,'scope':'SIMULATED_ONLY_NOT_A_PAID_BUDGET'}
    fd=os.open(config,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(data,stream)
    cfg=self.settings(data);Ledger.initialize_local_or_operator(db,cfg.identity(),cfg.total_cap,cfg.expires,cfg.max_concurrent)
   else:
    data=json.loads(config.read_text());cfg=self.settings(data)
   if data.get('scope')!='SIMULATED_ONLY_NOT_A_PAID_BUDGET':raise RuntimeError('MOCK_ROUND_SCOPE_REQUIRED')
   if clock()>=cfg.expires:raise RuntimeError('MOCK_ROUND_EXPIRED_REQUIRES_OPERATOR_ACTION')
   ledger=Ledger(db,cfg.identity())
   client=httpx.Client(transport=httpx.MockTransport(self.respond))
   self.service=E4Service(cfg,ledger,lambda:'MOCK_NOT_A_REAL_CREDENTIAL',client=client,clock=clock)
   self.app=create_app(self.service,gateway_key,clock=clock,session_store=ledger)
   self.app.state.mock_runtime=self
  except Exception:self.owner.close();raise
 def settings(self,data):return Settings('MOCK_ONLY',Decimal('.10'),Decimal('.50'),Decimal('.05'),Decimal('1'),data['expires'],data['round_id'],rate=4)
 def respond(self,req):
  request=json.loads(req.content);context=json.loads(request['input']);mode='GENERAL_CHAT' if request['text']['format']['name']=='e4_general_chat' else 'DOCUMENT_QA';q=context['question'];history=context['history']
  self.calls.append({'mode':mode,'history_pairs':len(history)});del self.calls[:-100]
  if self.delay:time.sleep(self.delay)
  if 'MOCK_TIMEOUT' in q:raise httpx.ReadTimeout('MOCK_ONLY')
  if 'MOCK_DENIED' in q:return httpx.Response(403,json={'error':'MOCK_ONLY'})
  citations=[]
  if mode=='DOCUMENT_QA':
   if any(word in q for word in ['溫度','合成條件','試驗條件']):citations=[{'document_id':DOCS[0]['id'],'version':DOCS[0]['version'],'quote':DOCS[0]['text']}];summary='Mock 文件問答：合成文件要求明示溫度、持續時間與允收條件；這不是正式公司規範。'
   else:summary='Mock 文件問答：目前合成文件沒有足夠依據。'
  elif '剛剛' in q or '前一' in q:summary='Mock 上下文回顧：'+(history[-1]['user'] if history else '目前沒有前一組對話。')
  elif '故障' in q:summary='Mock 一般建議：先停止受影響作業、隔離設備並通知工程師；保留紀錄，依已核准程序人工處理。'
  else:summary='Mock 智慧工作助理：你好，DQA Smart Lab 展示合成委託、實驗室與試驗流程；不會自動修改資料或簽核。'
  result={'engine':'E4','summary':summary,'issues':[],'advice':[],'citations':citations}
  packet={'id':'resp_MOCK_'+uuid.uuid4().hex,'status':'completed','model':'MOCK_ONLY','usage':{'input_tokens':80,'output_tokens':40},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result,ensure_ascii=False)}]}]}
  return httpx.Response(200,headers={'x-request-id':'req_MOCK_'+uuid.uuid4().hex},json=packet)
 def close(self):
  self.service.executor.shutdown(wait=True);self.service.client.close();self.owner.close()

def validate_cloud_binding(state_dir,host,env):
 # ismount is a structural fail-closed check, not proof of cloud durability.
 if env.get('RENDER')=='true':
  mount=Path('/var/data/e4-mock')
  if Path(state_dir)!=mount/'state' or mount.is_symlink() or not os.path.ismount(mount):raise RuntimeError('PERSISTENT_MOCK_MOUNT_REQUIRED')
  if host!='0.0.0.0':raise RuntimeError('RENDER_BIND_CONFIGURATION_REQUIRED')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--state-dir',required=True);parser.add_argument('--initialize',action='store_true');parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','10000')));parser.add_argument('--host',choices=['127.0.0.1','0.0.0.0'],default='127.0.0.1');args=parser.parse_args()
 if not 1024<=args.port<=65535:parser.error('VALID_UNPRIVILEGED_PORT_REQUIRED')
 validate_cloud_binding(args.state_dir,args.host,os.environ)
 require_mock_environment(os.environ)
 key=os.environ.get('PREVIEW_GATEWAY_SECRET','')
 runtime=MockRuntime(args.state_dir,key,os.environ,initialize=args.initialize)
 block_outbound_tcp()
 import uvicorn
 try:uvicorn.run(runtime.app,host=args.host,port=args.port,workers=1,log_level='warning',access_log=False)
 finally:runtime.close()
if __name__=='__main__':main()
