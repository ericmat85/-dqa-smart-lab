"""Bounded read-only adapters. Network targets come exclusively from operator policy."""
import http.client,ipaddress,json,math,os,socket,ssl,struct,time
class PortError(Exception):
 def __init__(self,code,status=422):self.code=code;self.status=status

def check(value,code='INVALID_PORT_CONFIGURATION'):
 if not value:raise PortError(code)
def integer(value,low,high):return type(value) is int and low<=value<=high
def text(value,size=100):return isinstance(value,str) and len(value)<=size and not any(ord(c)<32 for c in value)
FIELDS={'id','revision','equipmentId','protocol','host','port','scheme','path','serialPort','baudRate','parity','stopBits','unitId','functionCode','timeoutMs','channels'}
TYPES={'uint16':('H',1),'int16':('h',1),'uint32':('I',2),'int32':('i',2),'float32':('f',2)}
def validate(port):
 check(isinstance(port,dict) and set(port)==FIELDS)
 check(port['protocol'] in ('modbus-tcp','modbus-rtu','http-json') and text(port['id'],80) and port['id'] and integer(port['revision'],1,10**9) and text(port['equipmentId']) and port['equipmentId'])
 check(integer(port['timeoutMs'],500,5000) and integer(port['port'],1,65535) and port['scheme'] in ('http','https') and text(port['host'],64) and text(port['serialPort'],120) and text(port['path'],300))
 check(type(port['functionCode']) is int and port['functionCode'] in (3,4) and integer(port['unitId'],1,255) and (port['unitId']<=247 or port['unitId']==255) and integer(port['baudRate'],1200,230400) and port['parity'] in ('N','E','O') and type(port['stopBits']) is int and port['stopBits'] in (1,2))
 if port['protocol']=='modbus-rtu':check(bool(port['serialPort']) and port['unitId']<=247)
 else:
  try:ipaddress.ip_address(port['host'])
  except ValueError:raise PortError('IP_ADDRESS_REQUIRED') from None
 if port['protocol']=='http-json':check(port['path'].startswith('/') and not port['path'].startswith('//') and not any(c in port['path'] for c in '?#\\'),'APPROVED_READ_PATH_REQUIRED')
 check(isinstance(port['channels'],list) and 1<=len(port['channels'])<=8)
 names=set()
 for c in port['channels']:
  check(isinstance(c,dict) and set(c)=={'name','address','pointer','dataType','wordOrder','scale','offset','unit'})
  check(text(c['name'],60) and c['name'] and c['name'] not in names and text(c['unit'],20) and text(c['pointer'],300));names.add(c['name'])
  check(c['dataType'] in TYPES and c['wordOrder'] in ('high-first','low-first') and all(type(c[k]) in (int,float) and math.isfinite(c[k]) for k in ('scale','offset')))
  if port['protocol']=='http-json':
   check(c['pointer'].startswith('/') and all('~' not in part.replace('~0','').replace('~1','') for part in c['pointer'].split('/')),'JSON_POINTER_REQUIRED')
  else:check(integer(c['address'],0,65536-TYPES[c['dataType']][1]),'REGISTER_ADDRESS_REQUIRED')
 return port

def target_for(port,policy):
 for t in policy['targets']:
  if t['protocol']!=port['protocol']:continue
  if port['protocol']=='modbus-rtu':
   match=t['serialPort']==port['serialPort'] and port['baudRate'] in t['baudRates'] and port['parity'] in t['parities'] and port['stopBits'] in t['stopBits']
  else:
   match=ipaddress.ip_address(t['host'])==ipaddress.ip_address(port['host']) and t['port']==port['port']
   if port['protocol']=='http-json':match=match and t['scheme']==port['scheme'] and port['path'] in t['paths']
  if match:return t
 raise PortError('DEVICE_TARGET_NOT_APPROVED',403)

def decode(raw,channel):
 fmt,count=TYPES[channel['dataType']];check(len(raw)==count*2,'INVALID_REGISTER_LENGTH')
 if count==2 and channel['wordOrder']=='low-first':raw=raw[2:]+raw[:2]
 value=struct.unpack('>'+fmt,raw)[0]*channel['scale']+channel['offset'];check(math.isfinite(value),'NON_FINITE_DEVICE_VALUE');return value

def exact(stream,count):
 result=b''
 while len(result)<count:
  part=stream.recv(count-len(result))
  if not part:raise PortError('DEVICE_CONNECTION_CLOSED',502)
  result+=part
 return result

def tcp_read(port,target):
 values=[];deadline=time.monotonic()+10;timeout=port['timeoutMs']/1000
 with socket.create_connection((target['host'],target['port']),timeout=timeout) as stream:
  for index,c in enumerate(port['channels']):
   remaining=deadline-time.monotonic();check(remaining>0,'DEVICE_READ_TIMEOUT');stream.settimeout(min(timeout,remaining));tid=index+1;count=TYPES[c['dataType']][1]
   stream.sendall(struct.pack('>HHHBBHH',tid,0,6,port['unitId'],port['functionCode'],c['address'],count))
   trans,protocol,length,unit=struct.unpack('>HHHB',exact(stream,7));check((trans,protocol,unit)==(tid,0,port['unitId']) and 2<=length<=254,'MODBUS_HEADER_REJECTED')
   data=exact(stream,length-1);check(data[0]==port['functionCode'],'MODBUS_FUNCTION_REJECTED');check(len(data)==2+count*2 and data[1]==count*2,'MODBUS_PAYLOAD_REJECTED');values.append({'name':c['name'],'value':decode(data[2:],c)})
 return values

def crc16(data):
 crc=0xffff
 for byte in data:
  crc^=byte
  for _ in range(8):crc=(crc>>1)^0xa001 if crc&1 else crc>>1
 return struct.pack('<H',crc)

def serial_available():
 try:import serial;return hasattr(serial,'Serial')
 except ImportError:return False

def rtu_read(port,target):
 try:import serial
 except ImportError:raise PortError('SERIAL_DRIVER_REQUIRED',503) from None
 result=[];deadline=time.monotonic()+10;timeout=port['timeoutMs']/1000
 with serial.Serial(target['serialPort'],baudrate=port['baudRate'],bytesize=8,parity=port['parity'],stopbits=port['stopBits'],timeout=timeout,write_timeout=timeout,exclusive=True) as stream:
  for c in port['channels']:
   remaining=deadline-time.monotonic();check(remaining>0,'DEVICE_READ_TIMEOUT');stream.timeout=min(timeout,remaining);stream.reset_input_buffer();count=TYPES[c['dataType']][1];frame=struct.pack('>BBHH',port['unitId'],port['functionCode'],c['address'],count)
   stream.write(frame+crc16(frame));raw=stream.read(3)
   check(len(raw)==3 and raw[0]==port['unitId'] and raw[1]==port['functionCode'] and raw[2]==count*2,'MODBUS_RTU_HEADER_REJECTED');body=stream.read(raw[2]+2);check(len(body)==raw[2]+2 and crc16(raw+body[:-2])==body[-2:],'MODBUS_CRC_REJECTED');result.append({'name':c['name'],'value':decode(body[:-2],c)})
 return result

def pointer(data,path):
 for piece in path.split('/')[1:]:
  key=piece.replace('~1','/').replace('~0','~')
  if isinstance(data,list):check(key.isdecimal() and (key=='0' or not key.startswith('0')) and int(key)<len(data),'JSON_FIELD_NOT_FOUND');data=data[int(key)]
  else:check(isinstance(data,dict) and key in data,'JSON_FIELD_NOT_FOUND');data=data[key]
 check(type(data) in (float,int) and math.isfinite(data),'NUMERIC_JSON_FIELD_REQUIRED');return data

def http_read(port,target):
 connection=(http.client.HTTPSConnection(target['host'],target['port'],timeout=port['timeoutMs']/1000,context=ssl.create_default_context()) if port['scheme']=='https' else http.client.HTTPConnection(target['host'],target['port'],timeout=port['timeoutMs']/1000))
 headers={'Accept':'application/json'}
 if target.get('bearerEnv'):
  credential=os.environ.get(target['bearerEnv'],'');check(bool(credential) and '\r' not in credential and '\n' not in credential,'DEVICE_CREDENTIAL_UNAVAILABLE');headers['Authorization']='Bearer '+credential
 try:
  deadline=time.monotonic()+10;connection.request('GET',port['path'],headers=headers);response=connection.getresponse();check(response.status==200,'DEVICE_HTTP_STATUS_REJECTED');check(response.getheader('Content-Type','').split(';')[0].strip().lower()=='application/json','DEVICE_JSON_REQUIRED');parts=[];size=0
  while True:
   check(time.monotonic()<deadline,'DEVICE_READ_TIMEOUT');chunk=response.read1(16384)
   if not chunk:break
   size+=len(chunk);check(size<=65536,'DEVICE_RESPONSE_TOO_LARGE');parts.append(chunk)
  raw=b''.join(parts)
  try:data=json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
  except (ValueError,RecursionError):raise PortError('DEVICE_JSON_REJECTED') from None
  values=[]
  for c in port['channels']:
   value=pointer(data,c['pointer'])*c['scale']+c['offset'];check(math.isfinite(value),'NON_FINITE_DEVICE_VALUE');values.append({'name':c['name'],'value':value})
  return values
 finally:connection.close()

def read(port,policy):
 validate(port);target=target_for(port,policy)
 try:return {'modbus-tcp':tcp_read,'modbus-rtu':rtu_read,'http-json':http_read}[port['protocol']](port,target)
 except PortError:raise
 except (TimeoutError,socket.timeout):raise PortError('DEVICE_READ_TIMEOUT',504) from None
 except Exception:raise PortError('DEVICE_READ_FAILED',502) from None
