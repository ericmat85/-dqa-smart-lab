"""Local-only PLC/JSON fixtures; never deployed or used as hardware evidence."""
import json,sys,threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'equipment-gateway'))
from server import Gateway,Server,handler_for
from test_gateway import PLC,JsonSensor
from http.server import ThreadingHTTPServer
from socketserver import ThreadingTCPServer
import tempfile
servers=[]
with tempfile.TemporaryDirectory() as directory:
 plc=ThreadingTCPServer(('127.0.0.1',0),PLC);sensor=ThreadingHTTPServer(('127.0.0.1',0),JsonSensor);servers.extend([plc,sensor])
 targets=[{'id':'fixture-tcp','protocol':'modbus-tcp','host':'127.0.0.1','port':plc.server_address[1]},{'id':'fixture-json','protocol':'http-json','host':'127.0.0.1','port':sensor.server_address[1],'scheme':'http','paths':['/telemetry']}]
 gateway=Gateway({'allowedOrigins':['http://127.0.0.1:4173'],'targets':targets},str(Path(directory)/'audit.sqlite'),'fixture-only-token-'+('a'*40));api=Server(('127.0.0.1',0),handler_for(gateway));servers.append(api)
 for server in servers:threading.Thread(target=server.serve_forever,daemon=True).start()
 print(json.dumps({'gateway':f'http://127.0.0.1:{api.server_address[1]}','tcpPort':plc.server_address[1],'httpPort':sensor.server_address[1]}),flush=True)
 try:sys.stdin.read()
 finally:
  for server in servers:server.shutdown();server.server_close()
