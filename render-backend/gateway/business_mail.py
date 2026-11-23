"""Durable business mail worker. No HTTP send route; recipients are database grants."""
import base64,hashlib,json,os,re,smtplib,socket,ssl,threading,time,uuid
from datetime import datetime,timezone,timedelta
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urlparse
import httpx

REF='mmazbwzdiizabikmiily';URL='https://'+REF+'.supabase.co'
POLICY=Path(__file__).with_name('business_mail_policy.json')
TITLES={'TEST':'電子郵件通知測試','REQUEST_MANAGER':'委託待主管簽核','REQUEST_LMS':'委託待實驗室審查','SCHEDULING':'委託已核准，待安排排程','REQUEST_APPROVED':'試驗委託已核准','LAB_RECEIPT':'試驗已排程，請確認接收','LAB_RECEIVED':'執行人員已確認接收試驗','TRIAL_STARTED':'試驗已開始','TRIAL_COMPLETED':'試驗已完成','REQUEST_RETURNED':'委託已退回補正','REQUEST_CHANGED':'委託狀態已更新','REPORT_REVIEW':'試驗報告待審核','REPORT_VIEW':'報告已完成審核，待主管查閱','REPORT_RETURNED':'試驗報告已退回補正','REPORT_ARCHIVED':'試驗報告已確認封存'}
ROUTES={'lms':'/lms/requests','request':'/request/dashboard','lab':'/lab/dashboard'}
UUID=re.compile(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
class MailError(Exception):
 def __init__(self,code,retryable=False,unknown=False):self.code=code;self.retryable=retryable;self.unknown=unknown
class BusinessMailWorker:
 def __init__(self,env,client=None,smtp_factory=None,clock=time.time,starttls_factory=None):
  self.env=env;self.clock=clock;self.worker=str(uuid.uuid4());self.stop_event=threading.Event();self.thread=None;self.ready=False;self.code='NOT_CONFIGURED';self.last_check=0;self.last_heartbeat=0;self.failure_code='';self.failure_stage='';self.last_port=465
  self.enabled=env.get('BUSINESS_MAIL_ENABLED')=='1' and env.get('BUSINESS_MAIL_POLICY_SHA256')==hashlib.sha256(POLICY.read_bytes()).hexdigest();self.client=client;self.smtp_factory=smtp_factory or smtplib.SMTP_SSL;self.starttls_factory=starttls_factory or smtplib.SMTP
  self.simulated=client is not None and isinstance(getattr(client,'_transport',None),httpx.MockTransport)
  if not self.enabled:return
  try:
   key=env['BUSINESS_MAIL_SERVICE_KEY'];payload=json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'='*(-len(key.split('.')[1])%4)));assert payload['role']=='service_role' and payload['ref']==REF
   assert env['BUSINESS_MAIL_SUPABASE_URL']==URL and UUID.fullmatch(env['BUSINESS_MAIL_TENANT'])
   assert env['BUSINESS_MAIL_SMTP_HOST']=='smtp.gmail.com' and env['BUSINESS_MAIL_SMTP_PORT']=='465'
   self.sender=env['BUSINESS_MAIL_SMTP_USER'];assert re.fullmatch(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@gmail\.com',self.sender) and env['BUSINESS_MAIL_SMTP_PASSWORD']
   self.origin=env['BUSINESS_MAIL_SITE_ORIGIN'];u=urlparse(self.origin);assert u.scheme=='https' and not u.username and not u.password and not u.query and not u.fragment and not u.path and u.hostname.endswith('-ericmat85.vercel.app') and u.port is None
   self.tenant=env['BUSINESS_MAIL_TENANT'];self.key=key;self.client=client or httpx.Client(timeout=httpx.Timeout(8,connect=4),follow_redirects=False,trust_env=True)
  except Exception:self.enabled=False;self.code='NOT_CONFIGURED'
 def rpc(self,name,args):
  r=self.client.post(URL+'/rest/v1/rpc/'+name,headers={'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json','Content-Profile':'dqa_business'},json=args)
  if r.status_code!=200:raise MailError('MAIL_RPC_UNAVAILABLE')
  return r.json()
 def heartbeat(self):
  self.rpc('business_mail_heartbeat',{'p_tenant':self.tenant,'p_worker':self.worker,'p_ready':self.ready,'p_code':self.code});self.last_heartbeat=self.clock()
 def diagnose(self,error):
  self.failure_code=('SMTP_AUTH_REJECTED' if isinstance(error,smtplib.SMTPAuthenticationError) else 'DNS_UNAVAILABLE' if isinstance(error,socket.gaierror) else 'NETWORK_TIMEOUT' if isinstance(error,TimeoutError) else 'TLS_REJECTED' if isinstance(error,ssl.SSLError) else 'EGRESS_DENIED' if isinstance(error,OSError) and error.args==('LIVE_EGRESS_DENIED',) else 'SMTP_REJECTED_'+str(error.smtp_code) if isinstance(error,smtplib.SMTPResponseException) else 'NETWORK_ERROR_'+str(error.errno) if isinstance(error,OSError) and isinstance(error.errno,int) else 'CONNECTION_UNAVAILABLE')
 def connection(self):
  for port in [465,587]:
   server=None;self.last_port=port;self.failure_stage='CONNECT_TLS' if port==465 else 'CONNECT_STARTTLS'
   try:
    if port==465:server=self.smtp_factory('smtp.gmail.com',465,timeout=8,context=ssl.create_default_context())
    else:
     server=self.starttls_factory('smtp.gmail.com',587,timeout=8);server.ehlo();self.failure_stage='STARTTLS';server.starttls(context=ssl.create_default_context())
    server.ehlo();self.failure_stage='AUTH';server.login(self.sender,self.env['BUSINESS_MAIL_SMTP_PASSWORD']);self.failure_stage='';self.failure_code='';return server
   except Exception as error:
    self.diagnose(error)
    if server:server.close()
    if isinstance(error,smtplib.SMTPAuthenticationError) or port==587:raise
 def verify(self):
  try:
   server=self.connection()
   try:server.quit()
   except Exception:server.close()
   self.ready=True;self.code='SMTP_AUTH_READY'
  except smtplib.SMTPAuthenticationError:self.ready=False;self.code='SMTP_AUTH_REJECTED'
  except Exception:self.ready=False;self.code='SMTP_CONNECTION_UNAVAILABLE'
  self.last_check=self.clock();self.heartbeat()
 def message(self,grant):
  if set(grant)-{'state','id','dispatch_id','email','request_code','kind','system','event_state','created_at'}:raise MailError('INVALID_DATABASE_MAIL_GRANT')
  if not UUID.fullmatch(grant.get('id','')) or not UUID.fullmatch(grant.get('dispatch_id','')) or grant.get('kind') not in TITLES or grant.get('system') not in ROUTES or not re.fullmatch(r'[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+',grant.get('email','')) or len(grant['email'])>254:raise MailError('INVALID_DATABASE_MAIL_GRANT')
  request=grant.get('request_code') or '';state=grant.get('event_state','');assert isinstance(request,str) and len(request)<=150 and not re.search(r'[\r\n\x00-\x1f]',request)
  at=datetime.fromisoformat(grant['created_at']).astimezone(timezone(timedelta(hours=8))).strftime('%Y/%m/%d %H:%M')
  title=TITLES[grant['kind']];message=EmailMessage(policy=SMTP);message['From']='DQA Smart Lab <'+self.sender+'>';message['To']=grant['email'];message['Subject']='[DQA Smart Lab] '+title+(' — '+request if request else '');message['Message-ID']='<dqa-'+grant['id']+'@gmail.com>';message['Auto-Submitted']='auto-generated';message['Date']=format_datetime(datetime.now(timezone.utc))
  text=title+'\n\n'+(('委託編號：'+request+'\n') if request else '')+'事件時間：'+at+'（台灣時間）\n\n'+('這是一封由你本人要求寄送的通知測試信。\n' if grant['kind']=='TEST' else '請登入系統查看目前資料與待辦；此信不代表已代為簽核或完成操作。\n')+'\n開啟工作清單：'+self.origin+ROUTES[grant['system']]+'\n\n你已開啟電子郵件通知；可在個人設定中關閉。\n';message.set_content(text,charset='utf-8',cte='quoted-printable');return message
 def finish(self,grant,state,code,retryable=False):
  return self.rpc('finish_business_mail',{'p_tenant':self.tenant,'p_id':grant['id'],'p_worker':self.worker,'p_dispatch':grant['dispatch_id'],'p_state':state,'p_code':code,'p_retryable':retryable})
 def process_one(self):
  grant=self.rpc('claim_business_mail',{'p_tenant':self.tenant,'p_worker':self.worker})
  if grant.get('state')!='DISPATCH_GRANTED':return grant.get('state','EMPTY')
  stage='VALIDATING';server=None
  try:
   message=self.message(grant);stage='CONNECT';server=self.connection();code,_=server.mail(self.sender)
   if code!=250:raise MailError('SMTP_ENVELOPE_REJECTED',400<=code<500)
   code,_=server.rcpt(grant['email'])
   if code not in (250,251):raise MailError('SMTP_RECIPIENT_REJECTED',400<=code<500)
   stage='AUTHORIZING';authorized=self.rpc('authorize_business_mail',{'p_tenant':self.tenant,'p_id':grant['id'],'p_worker':self.worker,'p_dispatch':grant['dispatch_id']})
   if authorized is not True:self.finish(grant,'SKIPPED','RECIPIENT_OR_EVENT_NO_LONGER_ELIGIBLE');return 'SKIPPED'
   stage='DATA';code,_=server.data(message.as_bytes())
   if code!=250:raise MailError('SMTP_DATA_REJECTED',400<=code<500)
   stage='ACCEPTED';self.finish(grant,'SENT','SMTP_ACCEPTED');return 'SENT'
  except smtplib.SMTPAuthenticationError:self.ready=False;self.code='SMTP_AUTH_REJECTED';self.finish(grant,'FAILED','SMTP_AUTH_REJECTED');return 'FAILED'
  except smtplib.SMTPResponseException as error:
   state='FAILED';code='SMTP_REJECTED';retry=400<=error.smtp_code<500
   if stage=='ACCEPTED':state='UNKNOWN';code='SMTP_RECEIPT_UNKNOWN';retry=False
   self.finish(grant,state,code,retry);return state
  except MailError as error:
   unknown=error.unknown or stage in ('DATA','ACCEPTED','AUTHORIZING') and error.code!='SMTP_DATA_REJECTED';state='UNKNOWN' if unknown else 'FAILED';self.finish(grant,state,error.code,error.retryable and not unknown);return state
  except Exception:
   unknown=stage in ('DATA','ACCEPTED','AUTHORIZING');state='UNKNOWN' if unknown else 'FAILED';self.finish(grant,state,'SMTP_DELIVERY_UNKNOWN' if unknown else 'SMTP_CONNECTION_UNAVAILABLE',not unknown);return state
  finally:
   if server:
    try:server.quit()
    except Exception:server.close()
 def run(self):
  while not self.stop_event.is_set():
   delay=10
   try:
    if not self.last_check or self.clock()-self.last_check>(900 if self.ready else 60):self.verify()
    elif self.clock()-self.last_heartbeat>30:self.heartbeat()
    if self.ready:
     result=self.process_one();delay=60 if result=='DAILY_LIMIT' else 10 if result in ('EMPTY','PAUSED','BUSY') else 2
   except Exception:self.ready=False;self.code='MAIL_RPC_UNAVAILABLE'
   self.stop_event.wait(delay)
 def start(self):
  if self.enabled and self.thread is None:self.thread=threading.Thread(target=self.run,daemon=True,name='business-mail-outbox');self.thread.start()
 def stop(self):
  self.stop_event.set()
  if self.thread:self.thread.join(timeout=10)
 def status(self):return {'enabled':bool(self.enabled),'ready':bool(self.enabled and self.ready),'code':self.code,'mock_transport':self.simulated,'smtp_port':self.last_port,'failure_stage':self.failure_stage,'failure_code':self.failure_code}
