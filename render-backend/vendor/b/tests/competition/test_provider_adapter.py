import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import json
import socket
import httpx
import pytest
from pydantic import SecretStr,ValidationError
from app.competition.ai_adapter import OpenAIProviderAdapter,AdapterError
from app.competition.config import OpenAIAdapterSettings
from app.competition.budget import MemoryBudgetLedger,BudgetDenied
from app.competition.provider_models import AIFeature,OPERATION_FEATURE
from app.competition.provider_transport import OfflineHTTPXTransport,ProviderHTTPRequest,ENDPOINT
from app.competition.provider_usage import ModelPrice
from app.competition.schemas import Operation,AssistantRequest,RequestReviewRequest,ReportReviewRequest,ScheduleRequest
from .test_contract import BODIES,PREFIX
from .client import ASGIClient
from app.competition.main import create_app

MODEL='synthetic-offline-model'
FAKE_KEY='OFFLINE_FICTIONAL_CREDENTIAL_NOT_A_REAL_API_KEY'


class FakeSecretSource:
    def __init__(self,value=None):self.value=value if value is not None else SecretStr(FAKE_KEY);self.calls=0
    def load(self):self.calls+=1;return self.value


def payload(endpoint='assistant'):
    types={'assistant':AssistantRequest,'request-review':RequestReviewRequest,'report-review':ReportReviewRequest,'schedule-recommendation':ScheduleRequest}
    return types[endpoint].model_validate(BODIES[endpoint])


def envelope(feature=AIFeature.ASSISTANT):
    output={'summary':'Synthetic offline recommendation.','findings':[]}
    if feature==AIFeature.ASSISTANT:output['answer']='Synthetic answer only, no actions.'
    if feature==AIFeature.SCHEDULE:output['candidates']=[]
    return {'model':MODEL,'status':'completed','output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(output)}]}],
        'usage':{'input_tokens':10,'output_tokens':5,'total_tokens':15}}


def fixture_adapter(*,settings=None,body=None,status=200,handler=None,cap=10000000):
    calls=[]
    async def receive(request):
        calls.append(request)
        if handler is None:return httpx.Response(status,json=body if body is not None else envelope())
        result=handler(request)
        return await result if hasattr(result,'__await__') else result
    transport=OfflineHTTPXTransport(httpx.MockTransport(receive))
    ledger=MemoryBudgetLedger(enabled=True,cap_micro_usd=cap)
    # Explicit SYNTHETIC rates, NOT official OpenAI pricing.
    price=ModelPrice(MODEL,1000000,2000000,'SYNTHETIC_TEST_PRICING_NOT_OFFICIAL')
    secrets=FakeSecretSource()
    adapter=OpenAIProviderAdapter(settings or OpenAIAdapterSettings(enabled=True,model_id=MODEL),
        secret_source=secrets,transport=transport,prices={MODEL:price},ledger=ledger)
    return adapter,calls,secrets


def run(adapter,endpoint='assistant',**kw):
    return asyncio.run(adapter.suggest(Operation(endpoint),payload(endpoint),**kw))


def test_default_adapter_disabled_and_no_secret_or_http():
    a,calls,secrets=fixture_adapter(settings=OpenAIAdapterSettings())
    with pytest.raises(AdapterError,match='PROVIDER_DISABLED'):run(a)
    assert calls==[] and secrets.calls==0 and a.ledger.snapshot()['held_micro_usd']==0


@pytest.mark.parametrize('key',[None,'NOT_SECRETSTR',SecretStr(''),SecretStr('bad\r\nkey-value')])
def test_missing_or_unsafe_key_denied(key):
    a,calls,_=fixture_adapter();a.secret_source=None if key is None else FakeSecretSource(key)
    with pytest.raises(AdapterError,match='KEY_UNAVAILABLE'):run(a)
    assert not calls and a.ledger.snapshot()['held_micro_usd']==0


def test_no_environment_secret_loading(monkeypatch):
    def forbidden(*args,**kwargs):raise RuntimeError('ENV_READ_FORBIDDEN')
    monkeypatch.setattr('os.getenv',forbidden)
    with pytest.raises(AdapterError,match='PROVIDER_DISABLED'):run(OpenAIProviderAdapter())


def test_network_guard_remains_active():
    with pytest.raises(RuntimeError,match='External network forbidden'):socket.create_connection(('api.openai.com',443))


@pytest.mark.parametrize('endpoint',BODIES)
def test_four_feature_schemas_fixed_transport_usage_settlement(endpoint):
    feature=OPERATION_FEATURE[Operation(endpoint)];a,calls,_=fixture_adapter(body=envelope(feature))
    result=run(a,endpoint)
    assert result.usage.source=='FAKE_OFFLINE' and result.usage.charged_micro_usd==0
    assert result.summary.startswith('OFFLINE_SIMULATION:') and len(calls)==1
    request=calls[0];body=json.loads(request.content)
    assert str(request.url)==ENDPOINT and body['model']==MODEL and body['text']['format']['strict'] is True
    assert 'tools' not in body and 'Never approve' in body['input'][0]['content'][0]['text']
    record=a.audit.records()[-1]
    assert record.feature==feature.value and record.execution=='OFFLINE_SIMULATION'
    assert record.input_tokens==10 and record.output_tokens==5 and record.accounted_cost_micro_usd==20
    assert record.actual_billed_cost is None
    assert a.ledger.snapshot()['accounted_micro_usd']==20 and a.ledger.snapshot()['held_micro_usd']==0


@pytest.mark.parametrize('status,code',[(429,'RATE_LIMIT_UNKNOWN'),(500,'UPSTREAM_UNKNOWN'),(503,'UPSTREAM_UNKNOWN'),(401,'PROVIDER_AUTH_UNKNOWN'),(302,'HTTP_ERROR_UNKNOWN')])
def test_http_status_classification_no_retry(status,code):
    a,calls,_=fixture_adapter(status=status)
    with pytest.raises(AdapterError,match=code):run(a)
    assert len(calls)==1 and a.ledger.snapshot()['unknown_reservations']==1
    assert a.ledger.snapshot()['held_micro_usd']>0


def test_http_timeout_retains_reservation():
    def handler(request):raise httpx.ReadTimeout('SENSITIVE_PROVIDER_SECRET')
    a,calls,_=fixture_adapter(handler=handler)
    with pytest.raises(AdapterError,match='PROVIDER_TIMEOUT') as error:run(a)
    assert 'SENSITIVE' not in str(error.value) and len(calls)==1 and a.ledger.snapshot()['unknown_reservations']==1


def test_async_deadline_enforced_for_mock_transport():
    async def slow(request):await asyncio.sleep(1);return httpx.Response(200,json=envelope())
    a,calls,_=fixture_adapter(settings=OpenAIAdapterSettings(enabled=True,model_id=MODEL,timeout_ms=5),handler=slow)
    with pytest.raises(AdapterError,match='PROVIDER_TIMEOUT'):run(a)
    assert len(calls)==1 and a.ledger.snapshot()['unknown_reservations']==1


def test_cancelled_request_retains_reservation():
    async def scenario():
        started=asyncio.Event()
        async def blocked(request):started.set();await asyncio.Event().wait()
        a,_,_=fixture_adapter(handler=blocked)
        task=asyncio.create_task(a.suggest(Operation.ASSISTANT,payload()))
        await started.wait();task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
        assert a.ledger.snapshot()['unknown_reservations']==1 and a.audit.records()[-1].status=='CANCELLED_UNKNOWN'
    asyncio.run(scenario())


@pytest.mark.parametrize('kind',['json','missing_field','extra_field','wrong_type','duplicate_json','tool_call','refusal','incomplete','wrong_model','usage_missing','usage_invalid','usage_mismatch','usage_over_limit','nested_missing'])
def test_invalid_outputs_hold_budget(kind):
    response=envelope();content=response['output'][0]['content'][0]
    if kind=='json':content['text']='```json nope'
    elif kind=='missing_field':content['text']=json.dumps({'summary':'Only summary','findings':[]})
    elif kind=='extra_field':content['text']=json.dumps({'summary':'S','findings':[],'answer':'A','approved':True})
    elif kind=='wrong_type':content['text']=json.dumps({'summary':123,'findings':[],'answer':'A'})
    elif kind=='duplicate_json':content['text']='{"summary":"S","summary":"Other","findings":[],"answer":"A"}'
    elif kind=='tool_call':response['output'][0]['type']='function_call'
    elif kind=='refusal':content.clear();content['type']='refusal'
    elif kind=='incomplete':response['status']='incomplete'
    elif kind=='wrong_model':response['model']='other-model'
    elif kind=='usage_missing':del response['usage']
    elif kind=='usage_invalid':response['usage']['input_tokens']=FAKE_KEY
    elif kind=='usage_mismatch':response['usage']['total_tokens']=100
    elif kind=='usage_over_limit':response['usage']['output_tokens']=1000000
    else:content['text']=json.dumps({'summary':'S','findings':[{'severity':'info','code':'TEST','message':'M'}],'answer':'A'})
    a,_,_=fixture_adapter(body=response)
    with pytest.raises(AdapterError):run(a)
    assert a.ledger.snapshot()['unknown_reservations']==1 and a.ledger.snapshot()['accounted_micro_usd']==0
    assert FAKE_KEY not in repr(a.audit.records())


def test_invalid_top_level_json_sanitized():
    a,_,_=fixture_adapter(handler=lambda request:httpx.Response(200,content=b'NOT_JSON_SECRET_PROVIDER_BODY'))
    with pytest.raises(AdapterError,match='INVALID_JSON_UNKNOWN'):run(a)
    assert 'SECRET' not in repr(a.audit.records())


def test_keys_prompts_not_in_logs_audit_or_request_repr(caplog):
    caplog.set_level('DEBUG')
    a,calls,_=fixture_adapter();request=payload().model_copy(update={'question':'SYNTHETIC_PRIVATE_PROMPT_CANARY'})
    asyncio.run(a.suggest(Operation.ASSISTANT,request))
    safe=repr(a.audit.records())+caplog.text
    assert FAKE_KEY not in safe and 'SYNTHETIC_PRIVATE_PROMPT_CANARY' not in safe and 'Authorization' not in safe
    wire=ProviderHTTPRequest(ENDPOINT,{'Authorization':FAKE_KEY},{'prompt':'SYNTHETIC_PRIVATE_PROMPT_CANARY'},1)
    assert FAKE_KEY not in repr(wire) and 'SYNTHETIC_PRIVATE_PROMPT_CANARY' not in repr(wire)
    assert len(calls)==1


def test_insufficient_budget_rejects_before_transport():
    a,calls,_=fixture_adapter(cap=1)
    with pytest.raises(AdapterError,match='INSUFFICIENT_BUDGET'):run(a)
    assert not calls


def test_ledger_default_denied_and_exact_reservation_settlement():
    with pytest.raises(BudgetDenied,match='LEDGER_DISABLED'):MemoryBudgetLedger().reserve(uuid4(),'AI-01',MODEL,1)
    ledger=MemoryBudgetLedger(enabled=True);r=ledger.reserve(uuid4(),'AI-01',MODEL,100)
    assert ledger.snapshot()['held_micro_usd']==100
    ledger.settle(r,37)
    assert ledger.snapshot()['accounted_micro_usd']==37 and ledger.snapshot()['available_micro_usd']==10000000-37
    with pytest.raises(BudgetDenied):ledger.settle(r,37)


def test_parallel_reservations_never_exceed_ten_dollars():
    ledger=MemoryBudgetLedger(enabled=True)
    def reserve(i):
        try:return ledger.reserve(uuid4(),f'AI-0{i%5+1}',MODEL,1000000)
        except BudgetDenied:return None
    with ThreadPoolExecutor(max_workers=20) as pool:reservations=list(pool.map(reserve,range(60)))
    assert sum(r is not None for r in reservations)==10
    assert ledger.snapshot()['held_micro_usd']==10000000 and ledger.snapshot()['available_micro_usd']==0


def test_unknown_hold_cannot_be_reused_or_assumed_zero():
    ledger=MemoryBudgetLedger(enabled=True);r=ledger.reserve(uuid4(),'AI-01',MODEL,10000000);ledger.mark_unknown(r)
    with pytest.raises(BudgetDenied):ledger.reserve(uuid4(),'AI-05',MODEL,1)
    with pytest.raises(BudgetDenied):ledger.settle(r,0)
    assert ledger.snapshot()['held_micro_usd']==10000000


@pytest.mark.parametrize('amount',[0.1,True,-1])
def test_non_exact_or_negative_money_rejected(amount):
    with pytest.raises(BudgetDenied):MemoryBudgetLedger(enabled=True).reserve(uuid4(),'AI-01',MODEL,amount)


def test_exact_cost_rounds_up_without_float():
    price=ModelPrice(MODEL,1,1,'SYNTHETIC_TEST_PRICE');assert price.cost(1,1)==1
    with pytest.raises(ValueError):price.cost(1.5,2)
    with pytest.raises(BudgetDenied):MemoryBudgetLedger(enabled=True,cap_micro_usd=10000001)


def test_duplicate_request_id_does_not_call_twice():
    a,calls,_=fixture_adapter();rid=uuid4();run(a,request_id=rid)
    with pytest.raises(AdapterError,match='DUPLICATE_REQUEST'):run(a,request_id=rid)
    assert len(calls)==1


@pytest.mark.parametrize('kind',['unknown_model','missing_price','disabled_ledger','input_bound','live_transport'])
def test_configuration_rejects_before_network(kind):
    a,calls,_=fixture_adapter()
    if kind=='unknown_model':a.settings=OpenAIAdapterSettings(enabled=True,model_id='unknown')
    elif kind=='missing_price':a.prices={}
    elif kind=='disabled_ledger':a.ledger=MemoryBudgetLedger()
    elif kind=='input_bound':a.settings=OpenAIAdapterSettings(enabled=True,model_id=MODEL,max_input_tokens=10)
    else:a.transport.offline=False
    with pytest.raises(AdapterError):run(a)
    assert not calls


@pytest.mark.parametrize('config',[{'paid_network_enabled':True},{'workers':2},{'instances':2},{'max_retries':1},{'timeout_ms':0},{'max_input_tokens':True}])
def test_no_live_multi_instance_or_unbounded_config(config):
    with pytest.raises(ValidationError):OpenAIAdapterSettings(**config)


def test_ai04_reserved_no_signature_endpoint():
    a,calls,_=fixture_adapter()
    # COMP-03A-2 adds descriptor AI-04; wrong assistant input must still fail.
    with pytest.raises(AdapterError,match='INPUT_SCHEMA_INVALID'):asyncio.run(a.suggest_feature(AIFeature.SIGNATURE,payload()))
    assert not calls and PREFIX+'signature-quality' in create_app().openapi()['paths']


@pytest.mark.parametrize('endpoint',BODIES)
def test_four_routes_still_refuse_openai_adapter(endpoint):
    a,calls,secrets=fixture_adapter()
    with ASGIClient(create_app(provider=a)) as client:response=client.post(PREFIX+endpoint,json=BODIES[endpoint])
    assert response.status_code==503 and response.json()['status']=='not_implemented'
    assert not calls and secrets.calls==0


def test_transport_no_live_default_or_alternate_endpoint():
    with pytest.raises(RuntimeError,match='TRANSPORT_DISABLED'):
        asyncio.run(OfflineHTTPXTransport().send(ProviderHTTPRequest(ENDPOINT,{}, {},1)))
    transport=OfflineHTTPXTransport(httpx.MockTransport(lambda request:httpx.Response(200,json={})))
    with pytest.raises(RuntimeError,match='ENDPOINT_NOT_ALLOWED'):
        asyncio.run(transport.send(ProviderHTTPRequest('https://untrusted.invalid',{}, {},1)))


@pytest.mark.parametrize('field',['model','provider_url','api_key'])
def test_requests_cannot_select_provider_model_url_or_key(field):
    body=dict(BODIES['assistant']);body[field]='UNTRUSTED_CLIENT_VALUE'
    with ASGIClient(create_app()) as client:response=client.post(PREFIX+'assistant',json=body)
    assert response.status_code==422


def test_transport_mutation_cannot_enable_live_http():
    transport=OfflineHTTPXTransport(httpx.MockTransport(lambda request:httpx.Response(200)))
    transport._transport=object()
    with pytest.raises(RuntimeError,match='LIVE_TRANSPORT_NOT_AUTHORIZED'):
        asyncio.run(transport.send(ProviderHTTPRequest(ENDPOINT,{}, {},1)))


def test_model_construct_cannot_bypass_network_settings():
    bad=OpenAIAdapterSettings.model_construct(enabled=True,model_id=MODEL,paid_network_enabled=True)
    with pytest.raises(ValidationError):OpenAIProviderAdapter(bad)


def test_oversettlement_keeps_reservation():
    ledger=MemoryBudgetLedger(enabled=True);r=ledger.reserve(uuid4(),'AI-01',MODEL,10)
    with pytest.raises(BudgetDenied,match='COST_EXCEEDS_RESERVATION'):ledger.settle(r,11)
    assert ledger.snapshot()['unknown_reservations']==1 and ledger.snapshot()['held_micro_usd']==10


def test_provider_exception_does_not_leak_key_or_prompt(caplog):
    caplog.set_level('DEBUG')
    def handler(request):raise RuntimeError(FAKE_KEY+' SYNTHETIC_PRIVATE_ERROR_CANARY')
    a,_,_=fixture_adapter(handler=handler)
    with pytest.raises(AdapterError,match='PROVIDER_ERROR') as error:run(a)
    safe=str(error.value)+repr(a.audit.records())+caplog.text
    assert FAKE_KEY not in safe and 'SYNTHETIC_PRIVATE_ERROR_CANARY' not in safe
    assert error.value.__suppress_context__ is True
    assert a.ledger.snapshot()['unknown_reservations']==1


def test_unknown_adapter_error_code_cannot_leak_secret():
    def handler(request):raise AdapterError(FAKE_KEY,uuid4())
    a,_,_=fixture_adapter(handler=handler)
    with pytest.raises(AdapterError,match='PROVIDER_ERROR') as error:run(a)
    assert FAKE_KEY not in str(error.value)+repr(a.audit.records())
