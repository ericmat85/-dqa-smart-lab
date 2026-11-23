"""Bounded database clock. No AI, SMTP, human sessions or simulated results."""
import base64,json,threading,time
import httpx
from gateway.business_mail import REF,URL,UUID

class LabScheduleClock:
 def __init__(self,env,client=None):
  self.enabled=False;self.thread=None;self.stop_event=threading.Event();self.code='DISABLED';self.last_tick=None
  if env.get('BUSINESS_LAB_AUTOSTART_ENABLED')!='1':return
  try:
   self.key=env['BUSINESS_MAIL_SERVICE_KEY'];payload=json.loads(base64.urlsafe_b64decode(self.key.split('.')[1]+'='*(-len(self.key.split('.')[1])%4)))
   assert payload['role']=='service_role' and payload['ref']==REF
   assert env['BUSINESS_MAIL_SUPABASE_URL']==URL and UUID.fullmatch(env['BUSINESS_MAIL_TENANT'])
   self.tenant=env['BUSINESS_MAIL_TENANT'];self.client=client or httpx.Client(timeout=httpx.Timeout(12,connect=4),follow_redirects=False,trust_env=True)
   self.enabled=True;self.code='WAITING'
  except Exception:self.code='NOT_CONFIGURED'
 def tick(self):
  if not self.enabled:return
  response=self.client.post(URL+'/rest/v1/rpc/start_due_lab_trials',headers={'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json','Content-Profile':'dqa_business'},json={'p_tenant':self.tenant})
  response.raise_for_status();result=response.json()
  if not isinstance(result,dict) or result.get('state') not in ('READY','DISABLED') or any(type(result.get(k)) is not int for k in ('started','blocked')):raise ValueError('INVALID_CLOCK_RECEIPT')
  self.code=result['state'];self.last_tick=time.time();return result
 def run(self):
  while not self.stop_event.is_set():
   try:self.tick()
   except Exception:self.code='DATABASE_UNAVAILABLE'
   self.stop_event.wait(30)
 def start(self):
  if self.enabled and self.thread is None:
   self.thread=threading.Thread(target=self.run,daemon=True,name='lab-schedule-clock');self.thread.start()
 def stop(self):
  self.stop_event.set()
  if self.thread:self.thread.join(timeout=15)
 def status(self):return {'enabled':self.enabled,'running':bool(self.thread and self.thread.is_alive()),'code':self.code,'last_tick':self.last_tick}
