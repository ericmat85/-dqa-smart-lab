"""No network or email: exercise actual SMTP/DB adapter against transport doubles."""
import sys,json,hashlib,base64,uuid,smtplib,unittest,socket,threading
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
import httpx
from gateway.business_mail import BusinessMailWorker,POLICY,URL
class SMTP:
 def __init__(self,owner,*args,**kwargs):self.owner=owner;owner.commands.append('TLS');assert args[:2]==('smtp.gmail.com',465);assert kwargs['context'].verify_mode==2
 def ehlo(self):self.owner.commands.append('EHLO')
 def login(self,*args):
  self.owner.commands.append('AUTH')
  if self.owner.mode=='auth':raise smtplib.SMTPAuthenticationError(535,b'no')
 def mail(self,who):self.owner.commands.append('MAIL');return 250,b'ok'
 def rcpt(self,who):self.owner.commands.append('RCPT');return (550,b'rejected') if self.owner.mode=='recipient' else (250,b'ok')
 def data(self,raw):
  self.owner.commands.append('DATA');self.owner.message=raw
  if self.owner.mode=='timeout':raise TimeoutError()
  if self.owner.mode=='transient':raise smtplib.SMTPDataError(451,b'retry')
  return 250,b'ok'
 def quit(self):self.owner.commands.append('QUIT')
 def close(self):self.owner.commands.append('CLOSE')
class Tests(unittest.TestCase):
 def setUp(self):
  self.mode='ok';self.commands=[];self.calls=[];self.message=None;self.finish=[];self.authorized=True
  key='synthetic.'+base64.urlsafe_b64encode(json.dumps({'ref':'mmazbwzdiizabikmiily','role':'service_role'}).encode()).decode().rstrip('=')+'.synthetic'
  self.env={'BUSINESS_MAIL_ENABLED':'1','BUSINESS_MAIL_POLICY_SHA256':hashlib.sha256(POLICY.read_bytes()).hexdigest(),'BUSINESS_MAIL_SERVICE_KEY':key,'BUSINESS_MAIL_SUPABASE_URL':URL,'BUSINESS_MAIL_TENANT':str(uuid.uuid4()),'BUSINESS_MAIL_SMTP_HOST':'smtp.gmail.com','BUSINESS_MAIL_SMTP_PORT':'465','BUSINESS_MAIL_SMTP_USER':'synthetic@gmail.com','BUSINESS_MAIL_SMTP_PASSWORD':'SYNTHETIC_PASSWORD','BUSINESS_MAIL_SITE_ORIGIN':'https://synthetic-ericmat85.vercel.app'}
  self.grant={'state':'DISPATCH_GRANTED','id':str(uuid.uuid4()),'dispatch_id':str(uuid.uuid4()),'email':'recipient@example.invalid','request_code':'REQ-SYNTHETIC','kind':'REQUEST_MANAGER','system':'request','event_state':'AWAITING_REQUEST_MANAGER','created_at':'2026-11-23T00:00:00+00:00'}
  def transport(req):
   self.calls.append(req);name=req.url.path.split('/')[-1];body=json.loads(req.content)
   if name=='claim_business_mail':return httpx.Response(200,json=self.grant)
   if name=='authorize_business_mail':self.commands.append('AUTHORIZE');return httpx.Response(200,json=self.authorized)
   if name=='finish_business_mail':
    self.finish.append(body)
    if self.mode=='receipt_lost':return httpx.Response(503)
    return httpx.Response(200,json=True)
   if name=='business_mail_heartbeat':return httpx.Response(200,json=True)
   raise AssertionError(name)
  self.worker=BusinessMailWorker(self.env,httpx.Client(transport=httpx.MockTransport(transport)),lambda *a,**kw:SMTP(self,*a,**kw));self.assertTrue(self.worker.enabled)
 def tearDown(self):self.worker.client.close()
 def test_smtp_ready_checks_auth_without_message(self):self.worker.verify();self.assertTrue(self.worker.ready);self.assertNotIn('MAIL',self.commands);self.assertNotIn('DATA',self.commands)
 def test_success_authorizes_before_data_and_receipts(self):
  self.assertEqual(self.worker.process_one(),'SENT');self.assertLess(self.commands.index('AUTHORIZE'),self.commands.index('DATA'));self.assertEqual(self.finish[-1]['p_state'],'SENT');self.assertNotIn(b'SYNTHETIC_PASSWORD',self.message);self.assertNotIn(self.env['BUSINESS_MAIL_SERVICE_KEY'].encode(),self.message);self.assertIn(b'/request/dashboard',self.message)
 def test_preference_revoked_after_claim(self):self.authorized=False;self.assertEqual(self.worker.process_one(),'SKIPPED');self.assertNotIn('DATA',self.commands)
 def test_network_loss_during_data_never_retries(self):self.mode='timeout';self.assertEqual(self.worker.process_one(),'UNKNOWN');self.assertFalse(self.finish[-1]['p_retryable']);self.assertEqual(self.commands.count('DATA'),1)
 def test_known_transient_rejection_can_retry(self):self.mode='transient';self.assertEqual(self.worker.process_one(),'FAILED');self.assertTrue(self.finish[-1]['p_retryable'])
 def test_permanent_recipient_rejection_no_retry(self):self.mode='recipient';self.assertEqual(self.worker.process_one(),'FAILED');self.assertFalse(self.finish[-1]['p_retryable']);self.assertNotIn('DATA',self.commands)
 def test_auth_failure_is_not_ready(self):self.mode='auth';self.worker.verify();self.assertFalse(self.worker.ready);self.assertEqual(self.worker.code,'SMTP_AUTH_REJECTED')
 def test_lost_receipt_cannot_send_again(self):
  self.mode='receipt_lost'
  with self.assertRaises(Exception):self.worker.process_one()
  self.assertEqual(self.commands.count('DATA'),1);self.assertEqual(self.finish[-1]['p_state'],'UNKNOWN')
 def test_header_injection_rejected_before_smtp(self):self.grant['email']='victim@example.invalid\r\nBcc: other@example.invalid';self.assertEqual(self.worker.process_one(),'FAILED');self.assertNotIn('TLS',self.commands)
 def test_unknown_grant_keys_rejected(self):self.grant['bcc']='other@example.invalid';self.assertEqual(self.worker.process_one(),'FAILED');self.assertNotIn('DATA',self.commands)
 def test_no_queue_no_connection(self):self.grant={'state':'EMPTY'};self.assertEqual(self.worker.process_one(),'EMPTY');self.assertFalse(self.commands)
 def test_smtp_and_database_egress_is_exclusive_to_mail_thread(self):
  from gateway.e4_paired_preview import install_openai_egress_guard,mock_environment
  original=(socket.getaddrinfo,socket.socket.connect,socket.socket.connect_ex);current=threading.current_thread();oldname=current.name
  def resolve(host,port,*a,**kw):return [(socket.AF_INET,socket.SOCK_STREAM,6,'',('203.0.113.5' if host=='api.openai.com' else '203.0.113.6',int(port)))]
  try:
   socket.getaddrinfo=resolve;socket.socket.connect=lambda s,a:None;socket.socket.connect_ex=lambda s,a:0;install_openai_egress_guard(mail_enabled=True)
   with socket.socket() as conn:
    current.name='business-mail-outbox';socket.getaddrinfo('smtp.gmail.com',465);conn.connect(('203.0.113.6',465));socket.getaddrinfo('mmazbwzdiizabikmiily.supabase.co',443);conn.connect(('203.0.113.6',443))
    with self.assertRaisesRegex(OSError,'LIVE_EGRESS_DENIED'):conn.connect(('203.0.113.6',25))
    current.name=oldname
    for port in [443,465]:
     with self.assertRaisesRegex(OSError,'LIVE_EGRESS_DENIED'):conn.connect(('203.0.113.6',port))
    socket.getaddrinfo('api.openai.com',443);conn.connect(('203.0.113.5',443))
   self.assertFalse(any(k.startswith('BUSINESS_MAIL_') for k in mock_environment(self.env)))
  finally:current.name=oldname;socket.getaddrinfo,socket.socket.connect,socket.socket.connect_ex=original
 def test_policy_and_origin_must_match(self):
  for key,value in [('BUSINESS_MAIL_POLICY_SHA256','bad'),('BUSINESS_MAIL_SITE_ORIGIN','https://attacker.invalid'),('BUSINESS_MAIL_SMTP_HOST','attacker.invalid')]:
   w=BusinessMailWorker({**self.env,key:value});self.assertFalse(w.enabled);self.assertFalse(w.status()['ready'])
if __name__=='__main__':unittest.main(verbosity=2)
