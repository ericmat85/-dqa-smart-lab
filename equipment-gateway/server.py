"""On-premises, token-authenticated, read-only equipment gateway. No AI dependency."""
import argparse,datetime,hmac,ipaddress,json,os,re,sqlite3,ssl,threading,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from protocols import PortError,check,read,serial_available,target_for,validate

def load_policy(path,allow_loopback=False):
 with open(path,encoding='utf-8') as f:policy=json.load(f)
 check(isinstance(policy,dict) and set(policy)=={'allowedOrigins','targets'} and isinstance(policy['allowedOrigins'],list) and 1<=len(policy['allowedOrigins'])<=10 and isinstance(policy['targets'],list) and len(policy['targets'])<=100,'INVALID_GATEWAY_POLICY')
 for origin in policy['allowedOrigins']:
  u=urlsplit(origin);check(u.scheme=='https' or allow_loopback and u.scheme=='http' and u.hostname in ('127.0.0.1','localhost'),'HTTPS_ORIGIN_REQUIRED');check(not u.username and not u.password and not u.path and not u.query and not u.fragment and bool(u.hostname),'EXACT_ORIGIN_REQUIRED')
 ids=set()
 for target in policy['targets']:
  check(isinstance(target,dict) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}',target.get('id','')) and target['id'] not in ids,'INVALID_TARGET_ID');ids.add(target['id'])
  check(target.get('protocol') in ('modbus-tcp','modbus-rtu','http-json'),'UNSUPPORTED_PROTOCOL')
  base={'id','protocol'}
  if target['protocol']=='modbus-rtu':
   check(set(target)==base|{'serialPort','baudRates','parities','stopBits'} and re.fullmatch(r'(?:COM[1-9][0-9]*|/dev/[A-Za-z0-9_./-]+)',target['serialPort']) and '..' not in target['serialPort'].split('/'),'INVALID_SERIAL_TARGET')
   check(all(isinstance(target[k],list) and 1<=len(target[k])<=10 for k in ('baudRates','parities','stopBits')) and all(type(v) is int and 1200<=v<=230400 for v in target['baudRates']) and all(v in ('N','E','O') for v in target['parities']) and all(type(v) is int and v in (1,2) for v in target['stopBits']),'INVALID_SERIAL_POLICY')
  else:
   fields=base|{'host','port'}
   if target['protocol']=='http-json':fields|={'scheme','paths'}
   check(set(target)-fields <= {'bearerEnv'} and fields<=set(target) and ('bearerEnv' not in target or target['protocol']=='http-json'),'INVALID_NETWORK_TARGET')
   try:address=ipaddress.ip_address(target['host'])
   except ValueError:raise PortError('LITERAL_IP_REQUIRED') from None
   address=getattr(address,'ipv4_mapped',None) or address
   check(not (address.is_unspecified or address.is_multicast or address.is_link_local or address.is_loopback and not allow_loopback),'TARGET_ADDRESS_DENIED');check(type(target['port']) is int and 1<=target['port']<=65535,'INVALID_TARGET_PORT')
   if target['protocol']=='http-json':
    check(target['scheme'] in ('http','https') and isinstance(target['paths'],list) and 1<=len(target['paths'])<=20 and all(isinstance(p,str) and p.startswith('/') and not p.startswith('//') and len(p)<=300 and not any(c in p for c in '?#\\\r\n') for p in target['paths']),'INVALID_READ_PATH_POLICY')
    if 'bearerEnv' in target:check(target['scheme']=='https' and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',target['bearerEnv']),'HTTPS_DEVICE_CREDENTIAL_REQUIRED')
 return policy

class Gateway:
 def __init__(self,policy,database,admin_token,read_token=''):
  check(isinstance(admin_token,str) and len(admin_token)>=32 and admin_token.isascii() and (not read_token or len(read_token)>=32 and read_token.isascii() and read_token!=admin_token),'STRONG_GATEWAY_TOKENS_REQUIRED')
  self.policy=policy;self.database=database;self.admin_token=admin_token;self.read_token=read_token;self.locks={t['id']:threading.Lock() for t in policy['targets']};self.slots=threading.BoundedSemaphore(4)
  with sqlite3.connect(database) as db:db.execute('CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, operation TEXT NOT NULL, role TEXT NOT NULL, port_id TEXT, revision INTEGER, outcome TEXT NOT NULL)')
  os.chmod(database,0o600)
 def role(self,token):
  if hmac.compare_digest(token,self.admin_token):return 'admin'
  if self.read_token and hmac.compare_digest(token,self.read_token):return 'reader'
  raise PortError('GATEWAY_AUTH_REQUIRED',401)
 def audit(self,trace,role,port,outcome):
  with sqlite3.connect(self.database,timeout=3) as db:
   db.execute('INSERT INTO audit VALUES (?,?,?,?,?,?,?)',(trace,datetime.datetime.now(datetime.timezone.utc).isoformat(),'READ',role,port.get('id'),port.get('revision'),outcome));db.execute('DELETE FROM audit WHERE rowid NOT IN (SELECT rowid FROM audit ORDER BY rowid DESC LIMIT 1000)')
 def perform(self,port,role,trace):
  validate(port);target=target_for(port,self.policy);lock=self.locks[target['id']]
  if not self.slots.acquire(blocking=False):raise PortError('GATEWAY_BUSY',409)
  if not lock.acquire(blocking=False):self.slots.release();raise PortError('DEVICE_BUSY',409)
  try:
   self.audit(trace,role,port,'STARTED')
   values=read(port,self.policy)
   # Separate events retain the fact that a read started even if the process is interrupted.
   self.audit(trace+'-result',role,port,'SUCCESS')
   return {'portId':port['id'],'revision':port['revision'],'traceId':trace,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'values':values,'mode':'READ_ONLY'}
  except PortError as e:self.audit(trace+'-result',role,port,e.code);raise
  finally:lock.release();self.slots.release()

def handler_for(gateway):
 class Handler(BaseHTTPRequestHandler):
  protocol_version='HTTP/1.0'
  def setup(self):super().setup();self.connection.settimeout(6)
  def log_message(self,*_):pass  # Never log Authorization or payloads.
  def reply(self,status,packet,origin=None):
   raw=json.dumps(packet,allow_nan=False,separators=(',',':')).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Vary','Origin')
   if origin:self.send_header('Access-Control-Allow-Origin',origin)
   if self.command=='OPTIONS':
    self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type');self.send_header('Access-Control-Max-Age','300')
   self.end_headers();self.wfile.write(raw)
  def handle_api(self):
   origin=None;trace='P-'+uuid.uuid4().hex
   try:
    origins=self.headers.get_all('Origin') or []
    if len(origins)!=1 or origins[0] not in gateway.policy['allowedOrigins']:raise PortError('ORIGIN_DENIED',403)
    origin=origins[0]

    if self.path not in ('/v1/capabilities','/v1/read'):raise PortError('ROUTE_NOT_FOUND',404)
    if self.command=='OPTIONS':return self.reply(200,{'ok':True},origin)
    check(not self.headers.get('Transfer-Encoding') and len(self.headers.get_all('Authorization') or [])==1,'INVALID_REQUEST_HEADERS')
    auth=self.headers.get('Authorization','')
    if not auth.startswith('Bearer ') or not auth.isascii():raise PortError('GATEWAY_AUTH_REQUIRED',401)
    role=gateway.role(auth[7:])
    if self.path=='/v1/capabilities':
     check(self.command=='GET','METHOD_DENIED');return self.reply(200,{'service':'DQA_EQUIPMENT_GATEWAY','version':1,'role':role,'protocols':[{'id':'modbus-tcp','available':True},{'id':'http-json','available':True},{'id':'modbus-rtu','available':serial_available()}],'mode':'READ_ONLY'},origin)
    check(self.command=='POST','METHOD_DENIED');check(self.headers.get('Content-Type','').split(';')[0].strip().lower()=='application/json' and len(self.headers.get_all('Content-Length') or [])==1,'JSON_REQUIRED');length=int(self.headers.get('Content-Length','-1'));check(0<length<=16384,'REQUEST_TOO_LARGE')
    def pairs(values):
     d={}
     for k,v in values:
      if k in d:raise ValueError()
      d[k]=v
     return d
    data=json.loads(self.rfile.read(length),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()));check(isinstance(data,dict) and set(data)=={'port'},'INVALID_REQUEST');result=gateway.perform(data['port'],role,trace);self.reply(200,result,origin)
   except PortError as e:self.reply(e.status,{'error':{'code':e.code},'traceId':trace},origin)
   except (ValueError,TypeError,KeyError,RecursionError):self.reply(422,{'error':{'code':'INVALID_REQUEST'},'traceId':trace},origin)
   except Exception:self.reply(503,{'error':{'code':'GATEWAY_READ_UNAVAILABLE'},'traceId':trace},origin)
  do_GET=handle_api;do_POST=handle_api;do_OPTIONS=handle_api
 return Handler

class Server(ThreadingHTTPServer):
 daemon_threads=True
 def get_request(self):
  sock,address=super().get_request();sock.settimeout(6);return sock,address

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--policy',required=True);parser.add_argument('--database',required=True);parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--tls-cert');parser.add_argument('--tls-key');parser.add_argument('--allow-loopback-targets',action='store_true',help='Local simulator testing only');args=parser.parse_args();os.umask(0o077)
 policy=load_policy(args.policy,args.allow_loopback_targets);gateway=Gateway(policy,args.database,os.environ.get('DQA_EQUIPMENT_ADMIN_TOKEN',''),os.environ.get('DQA_EQUIPMENT_READ_TOKEN',''))
 if args.host not in ('127.0.0.1','::1','localhost') and not(args.tls_cert and args.tls_key):raise RuntimeError('REMOTE_LISTEN_REQUIRES_TLS')
 server=Server((args.host,args.port),handler_for(gateway))
 if args.tls_cert or args.tls_key:
  check(args.tls_cert and args.tls_key,'TLS_PAIR_REQUIRED');context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2;context.load_cert_chain(args.tls_cert,args.tls_key);server.socket=context.wrap_socket(server.socket,server_side=True)
 try:server.serve_forever()
 finally:server.server_close()
if __name__=='__main__':main()
