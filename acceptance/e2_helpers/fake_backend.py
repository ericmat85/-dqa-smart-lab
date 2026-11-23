"""Loopback E2 paired ASGI with Fake HTTP, private temporary ledgers, no real key."""
import json,os,socket,sys,time
from pathlib import Path
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).parents[2]/'render-backend'))
import httpx
import uvicorn
from gateway.e4_preview_ledger import Ledger
from gateway.e4_preview_provider import Settings
from gateway.e4_controlled_provider import ProviderState
from gateway.e2_preview_provider import E2Provider
from gateway.e4_paired_preview import PairedApp

port=int(sys.argv[1]);root=Path(sys.argv[2]);root.chmod(0o700)
for name in ['e4','e2']:(root/name).mkdir(mode=0o700)
class StrictLedger(Ledger):require_unknown_reconciliation=True
Ledger.initialize_local_or_operator(root/'e4/auth.sqlite','LOCAL_ONLY_AUTHORITY',1,time.time()+86400,1)
authority=StrictLedger(root/'e4/auth.sqlite','LOCAL_ONLY_AUTHORITY')
cfg=Settings('gpt-6-luna',Decimal('.10'),Decimal('.50'),Decimal('.05'),Decimal('1'),time.time()+3600,'E2-LOCAL-BROWSER',max_input=16384,max_output=768,rate=4)
Ledger.initialize_local_or_operator(root/'e2/budget.sqlite',cfg.identity(),1,cfg.expires,1)
cost=StrictLedger(root/'e2/budget.sqlite',cfg.identity());calls=[]
def fake(req):
    request=json.loads(req.content);context=json.loads(request['input']);calls.append({'operation_id':req.headers['x-client-request-id'],'model':request['model']})
    (root/'provider-calls.json').write_text(json.dumps(calls))
    time.sleep(.65)
    answer={'selected_candidate_id':context['assessment']['candidates'][0]['id']}
    return httpx.Response(200,headers={'x-request-id':'req_MOCK_E2_BROWSER'},json={'id':'resp_MOCK_E2_BROWSER','status':'completed','model':cfg.model,'usage':{'input_tokens':90,'output_tokens':40},'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(answer)}]}]})
client=httpx.Client(transport=httpx.MockTransport(fake))
provider=E2Provider(cfg,cost,authority,lambda:'FAKE_E2_PROVIDER_NOT_A_REAL_CREDENTIAL',client)
app=PairedApp('/tmp/NO_MOCK_E4_SOCKET_NEEDED',ProviderState(ledger=authority),'FAKE_E2_GATEWAY_BROWSER_ONLY_123456789',False,e2_state=ProviderState(service=provider,ledger=cost))
original=socket.socket.connect
def deny(sock,address):
    if sock.family in (socket.AF_INET,socket.AF_INET6):raise RuntimeError('E2_LOCAL_TEST_EXTERNAL_TCP_DENIED')
    return original(sock,address)
socket.socket.connect=deny
try:uvicorn.run(app,host='127.0.0.1',port=port,workers=1,log_level='warning',access_log=False)
finally:provider.executor.shutdown(wait=True);client.close()
