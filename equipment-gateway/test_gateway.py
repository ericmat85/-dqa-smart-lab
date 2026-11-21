import contextlib,copy,http.client,json,os,select,socketserver,sqlite3,struct,tempfile,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from protocols import PortError,crc16,decode,read,serial_available
from server import Gateway,Server,handler_for,load_policy
ORIGIN='https://lab.example';TOKEN='test-admin-'+('a'*40);READER='test-read-'+('b'*40)
def port(protocol='modbus-tcp',**extra):
 p={'id':'test-port','revision':1,'equipmentId':'EQ-001','protocol':protocol,'host':'127.0.0.1','port':502,'scheme':'http','path':'/telemetry','serialPort':'/dev/ttyUSB0','baudRate':9600,'parity':'N','stopBits':1,'unitId':1,'functionCode':3,'timeoutMs':500,'channels':[{'name':'Temperature','address':0,'pointer':'/temperature','dataType':'uint16','wordOrder':'high-first','scale':.1,'offset':0,'unit':'C'}]};p.update(extra);return p
class PLC(socketserver.BaseRequestHandler):
 frames=[];bad=False
 def handle(self):
  while True:
   raw=b''
   while len(raw)<12:
    try:chunk=self.request.recv(12-len(raw))
    except ConnectionResetError:return
    if not chunk:return
    raw+=chunk
   tid,_,_,unit,fc,address,count=struct.unpack('>HHHBBHH',raw);type(self).frames.append((fc,address,count));data=bytes([fc,count*2])+struct.pack('>'+'H'*count,*([250]*count));self.request.sendall(struct.pack('>HHHB',tid+int(type(self).bad),0,len(data)+1,unit)+data)
class JsonSensor(BaseHTTPRequestHandler):
 paths=[]
 def log_message(self,*_):pass
 def do_GET(self):
  type(self).paths.append(self.path)
  if self.path=='/redirect':self.send_response(302);self.send_header('Location','http://169.254.169.254/');self.end_headers();return
  raw=json.dumps({'temperature':25.5,'sensors':[{'rh':60}]}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
@contextlib.contextmanager
def running(server):
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:yield server
 finally:server.shutdown();server.server_close();thread.join(2)
class GatewayTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);PLC.frames=[];PLC.bad=False;JsonSensor.paths=[]
 def target(self,server,protocol='modbus-tcp'):
  t={'id':'test-device','protocol':protocol,'host':'127.0.0.1','port':server.server_address[1]}
  if protocol=='http-json':t.update(scheme='http',paths=['/telemetry','/redirect'])
  return t
 def policy(self,target):return {'allowedOrigins':[ORIGIN],'targets':[target]}
 def test_real_modbus_tcp_frames_are_read_only_and_scaled(self):
  with running(socketserver.ThreadingTCPServer(('127.0.0.1',0),PLC)) as device:
   p=port(port=device.server_address[1]);values=read(p,self.policy(self.target(device)));self.assertEqual(values,[{'name':'Temperature','value':25.0}]);self.assertEqual(PLC.frames,[(3,0,1)]);p['functionCode']=4;read(p,self.policy(self.target(device)));self.assertEqual(PLC.frames[-1][0],4)
 def test_write_function_and_unapproved_address_never_open_socket(self):
  with running(socketserver.ThreadingTCPServer(('127.0.0.1',0),PLC)) as device:
   p=port(port=device.server_address[1]);policy=self.policy(self.target(device))
   for function in [5,6,15,16,23]:
    p['functionCode']=function
    with self.assertRaises(PortError):read(p,policy)
   p['functionCode']=3;p['host']='127.0.0.2'
   with self.assertRaisesRegex(PortError,''):read(p,policy)
   self.assertEqual(PLC.frames,[])
 def test_wrong_transaction_and_incomplete_map_are_not_success(self):
  with running(socketserver.ThreadingTCPServer(('127.0.0.1',0),PLC)) as device:
   p=port(port=device.server_address[1]);policy=self.policy(self.target(device));PLC.bad=True
   with self.assertRaises(PortError) as result:read(p,policy)
   self.assertEqual(result.exception.code,'MODBUS_HEADER_REJECTED');p['channels'][0]['address']=None
   with self.assertRaises(PortError):read(p,policy)
 def test_http_pointer_read_and_redirect_path_rejection(self):
  with running(ThreadingHTTPServer(('127.0.0.1',0),JsonSensor)) as device:
   p=port('http-json',port=device.server_address[1]);p['channels'][0].update(scale=1,pointer='/temperature');policy=self.policy(self.target(device,'http-json'));self.assertEqual(read(p,policy)[0]['value'],25.5)
   p['path']='/control/start'
   with self.assertRaises(PortError) as result:read(p,policy)
   self.assertEqual(result.exception.code,'DEVICE_TARGET_NOT_APPROVED');self.assertEqual(JsonSensor.paths,['/telemetry'])
   p['path']='/redirect'
   with self.assertRaises(PortError) as result:read(p,policy)
   self.assertEqual(result.exception.code,'DEVICE_HTTP_STATUS_REJECTED');self.assertEqual(JsonSensor.paths,['/telemetry','/redirect'])
 def test_policy_default_denies_targets_and_metadata(self):
  path=Path(self.temp.name)/'policy.json';path.write_text(json.dumps({'allowedOrigins':[ORIGIN],'targets':[]}));self.assertEqual(load_policy(path)['targets'],[])
  for host in ['169.254.169.254','0.0.0.0','224.0.0.1','127.0.0.1','example.com']:
   path.write_text(json.dumps(self.policy({'id':'bad','protocol':'modbus-tcp','host':host,'port':80})))
   with self.assertRaises(PortError):load_policy(path)
 def test_numeric_formats_byteorder_and_crc(self):
  c=port()['channels'][0];c.update(dataType='float32',scale=1);self.assertEqual(decode(struct.pack('>f',12.5),c),12.5);c['wordOrder']='low-first';raw=struct.pack('>f',12.5);self.assertEqual(decode(raw[2:]+raw[:2],c),12.5)
  c['wordOrder']='high-first'
  with self.assertRaises(PortError):decode(struct.pack('>f',float('nan')),c)
  self.assertEqual(crc16(bytes.fromhex('010300000001')).hex(),'840a')
 def test_api_auth_origin_audit_and_no_secret_echo(self):
  with running(socketserver.ThreadingTCPServer(('127.0.0.1',0),PLC)) as device:
   policy=self.policy(self.target(device));gateway=Gateway(policy,str(Path(self.temp.name)/'audit.sqlite'),TOKEN,READER)
   with running(Server(('127.0.0.1',0),handler_for(gateway))) as api:
    def request(path='/v1/capabilities',method='GET',body=None,origin=ORIGIN,token=TOKEN):
     client=http.client.HTTPConnection('127.0.0.1',api.server_address[1],timeout=3);client.request(method,path,body=json.dumps(body) if body else None,headers={'Origin':origin,'Authorization':'Bearer '+token,'Content-Type':'application/json'});r=client.getresponse();raw=r.read();status=r.status;client.close();self.assertNotIn(TOKEN.encode(),raw);return status,json.loads(raw)
    self.assertEqual(request(token='bad')[0],401);self.assertEqual(request(origin='https://evil.example')[0],403);self.assertEqual(request()[1]['role'],'admin');self.assertEqual(request(token=READER)[1]['role'],'reader')
    status,data=request('/v1/read','POST',{'port':port(port=device.server_address[1])});self.assertEqual(status,200);self.assertEqual(data['mode'],'READ_ONLY');self.assertEqual(data['values'][0]['value'],25.0)
    before=len(PLC.frames);self.assertNotEqual(request('/v1/read','POST',{'port':port(port=device.server_address[1]),'write':True})[0],200);self.assertEqual(len(PLC.frames),before)
   with sqlite3.connect(gateway.database) as db:self.assertEqual(db.execute('SELECT outcome FROM audit ORDER BY rowid').fetchall(),[('STARTED',),('SUCCESS',)])
 def test_same_target_busy_rejects_without_a_device_request(self):
  with running(socketserver.ThreadingTCPServer(('127.0.0.1',0),PLC)) as device:
   gateway=Gateway(self.policy(self.target(device)),str(Path(self.temp.name)/'audit.sqlite'),TOKEN);gateway.locks['test-device'].acquire()
   try:
    with self.assertRaises(PortError) as error:gateway.perform(port(port=device.server_address[1]),'admin','P-test')
    self.assertEqual(error.exception.code,'DEVICE_BUSY');self.assertEqual(PLC.frames,[])
   finally:gateway.locks['test-device'].release()
 @unittest.skipUnless(os.name=='posix' and serial_available(),'RTU integration requires pyserial and POSIX pseudo-terminal')
 def test_real_serial_pseudo_terminal_frame_and_crc(self):
  master,slave=os.openpty();device=os.ttyname(slave);frames=[];failure=[]
  def plc():
   try:
    if not select.select([master],[],[],3)[0]:raise RuntimeError('RTU request missing')
    raw=os.read(master,8);frames.append(raw);self.assertEqual(crc16(raw[:-2]),raw[-2:]);response=bytes.fromhex('01030200fa');os.write(master,response+crc16(response))
   except BaseException as e:failure.append(e)
  thread=threading.Thread(target=plc,daemon=True);thread.start()
  try:
   target={'id':'serial-device','protocol':'modbus-rtu','serialPort':device,'baudRates':[9600],'parities':['N'],'stopBits':[1]};p=port('modbus-rtu',serialPort=device);self.assertEqual(read(p,self.policy(target))[0]['value'],25.0);thread.join(3);self.assertFalse(failure);self.assertEqual(frames[0][1],3)
  finally:os.close(master);os.close(slave)
if __name__=='__main__':unittest.main()
