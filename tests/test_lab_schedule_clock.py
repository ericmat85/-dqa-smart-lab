"""No external calls: clock transport, opt-in gate and network boundaries."""
import base64,json,socket,sys,threading,unittest
from pathlib import Path
from unittest.mock import patch
import httpx
sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
from gateway.lab_schedule_clock import LabScheduleClock,URL

class Tests(unittest.TestCase):
 def setUp(self):
  self.calls=[];payload=base64.urlsafe_b64encode(json.dumps({'role':'service_role','ref':'mmazbwzdiizabikmiily'}).encode()).decode().rstrip('=')
  self.env={'BUSINESS_LAB_AUTOSTART_ENABLED':'1','BUSINESS_MAIL_SERVICE_KEY':'synthetic.'+payload+'.synthetic','BUSINESS_MAIL_SUPABASE_URL':URL,'BUSINESS_MAIL_TENANT':'a0000000-0000-4000-8000-000000000001'}
 def client(self,status=200,packet=None):
  def handle(request):
   self.calls.append(request)
   return httpx.Response(status,json=packet or {'started':1,'blocked':0,'state':'READY'})
  return httpx.Client(transport=httpx.MockTransport(handle))
 def test_tick_only_calls_bound_database_rpc(self):
  clock=LabScheduleClock(self.env,self.client());self.assertTrue(clock.enabled)
  self.assertEqual(clock.tick()['started'],1);self.assertEqual(len(self.calls),1)
  r=self.calls[0];self.assertEqual(str(r.url),URL+'/rest/v1/rpc/start_due_lab_trials')
  self.assertEqual(json.loads(r.content),{'p_tenant':self.env['BUSINESS_MAIL_TENANT']})
 def test_disabled_does_not_call(self):
  del self.env['BUSINESS_LAB_AUTOSTART_ENABLED'];clock=LabScheduleClock(self.env,self.client());clock.tick();self.assertEqual(self.calls,[])
 def test_wrong_project_or_role_fails_closed(self):
  for field,value in [('BUSINESS_MAIL_SUPABASE_URL','https://other.invalid'),('BUSINESS_MAIL_TENANT','bad'),('BUSINESS_MAIL_SERVICE_KEY','invalid')]:
   clock=LabScheduleClock({**self.env,field:value},self.client());self.assertFalse(clock.enabled);clock.tick()
  self.assertEqual(self.calls,[])
 def test_lost_ack_is_safe_to_reconcile_on_next_tick(self):
  clock=LabScheduleClock(self.env,self.client(status=503))
  with self.assertRaises(httpx.HTTPStatusError):clock.tick()
  clock.client=self.client(packet={'started':0,'blocked':0,'state':'READY'});self.assertEqual(clock.tick()['started'],0)
 def test_no_smtp_configuration_needed(self):
  self.assertTrue(LabScheduleClock(self.env,self.client()).enabled)
 def test_clock_thread_may_only_connect_to_project_database(self):
  from gateway.e4_paired_preview import install_openai_egress_guard
  original_resolve=socket.getaddrinfo;original_connect=socket.socket.connect;original_connect_ex=socket.socket.connect_ex
  try:
   socket.getaddrinfo=lambda host,port,*a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('192.0.2.8',int(port)))]
   socket.socket.connect=lambda s,a:None;socket.socket.connect_ex=lambda s,a:0
   install_openai_egress_guard(lab_clock_enabled=True)
   with patch('threading.current_thread') as current_thread:
    current_thread.return_value.name='lab-schedule-clock'
    socket.getaddrinfo('mmazbwzdiizabikmiily.supabase.co',443)
    sock=socket.socket();sock.connect(('192.0.2.8',443))
    with self.assertRaises(OSError):sock.connect(('192.0.2.8',465))
    with self.assertRaises(OSError):sock.connect(('192.0.2.9',443))
    sock.close()
   sock=socket.socket()
   with self.assertRaises(OSError):sock.connect(('192.0.2.8',443))
   sock.close()
  finally:socket.getaddrinfo=original_resolve;socket.socket.connect=original_connect;socket.socket.connect_ex=original_connect_ex

if __name__=='__main__':unittest.main(verbosity=2)
