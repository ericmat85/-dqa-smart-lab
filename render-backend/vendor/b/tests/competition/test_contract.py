from copy import deepcopy
from pathlib import Path
import ast
import socket
from uuid import UUID
import pytest
from pydantic import ValidationError
from .client import ASGIClient
from app.competition.main import create_app
from app.competition.config import CompetitionSettings
from app.competition.ai_adapter import ProviderNotImplemented
from app.competition.budget import UsageRecord,BudgetContract
from app.competition.schemas import Operation
from .fakes import FakeProvider

PREFIX='/api/competition/ai/'
ORIGIN='https://competition.example.test'
BODIES={
 'request-review':{'schema_version':'1.0','synthetic':True,'case_id':'CASE_SYNTH_1','product_code':'SYNTHETIC_PRODUCT','specification':'Synthetic requirement','judgment_criteria':'Synthetic acceptance criterion','quantity':2,'sop_excerpts':['Synthetic SOP'],'customer_spec_excerpts':['Synthetic specification']},
 'report-review':{'schema_version':'1.0','synthetic':True,'case_id':'CASE_SYNTH_1','revision_id':'REV_1','template_id':'TEMPLATE_SYNTH','cells':[{'sheet':'Synthetic','cell':'B4','value':'12','criterion':'Synthetic limit 15'}]},
 'schedule-recommendation':{'schema_version':'1.0','synthetic':True,'case_id':'CASE_SYNTH_1','snapshot_version':1,'trials':[{'trial_id':'TRIAL_SYNTH_1','conditions':'Synthetic dry conditions','quantity':1,'planned_hours':2}],'equipment':[{'resource_id':'EQ_SYNTH_1','capabilities':['Synthetic test'],'availability':['Synthetic slot']}],'engineers':[{'resource_id':'ENG_SYNTH_1','capabilities':['Synthetic qualification'],'availability':['Synthetic slot']}]},
 'assistant':{'schema_version':'1.0','synthetic':True,'question':'Explain the synthetic case without changing it.','context':['Synthetic case only.']}}


@pytest.mark.parametrize('endpoint',BODIES)
def test_four_fake_endpoints_valid_and_explicit(endpoint):
    fake=FakeProvider();body=deepcopy(BODIES[endpoint]);before=deepcopy(body)
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+endpoint,json=body)
    assert response.status_code==200
    result=response.json()
    assert result['schema_version']=='1.0' and UUID(result['request_id'])
    assert result['status']=='fake_result' and result['provider_mode']=='FAKE_OFFLINE'
    assert 'FAKE/OFFLINE' in result['summary']
    assert result['business_actions_authorized'] is False and result['business_commit_gate']=='RULE_NOT_APPROVED'
    assert result['usage']['source']=='FAKE_OFFLINE' and result['usage']['charged_micro_usd']==0
    assert result['budget']=={'currency':'USD','total_test_cap_usd':'10.00','enforcement':'CONTRACT_ONLY_NOT_ENFORCED','remaining_budget':None}
    assert len(fake.calls)==1 and fake.calls[0][0]==Operation(endpoint)
    assert body==before
    if endpoint=='schedule-recommendation':assert result['candidates'][0]['deterministic_validation']=='REQUIRED_NOT_PERFORMED'
    if endpoint=='assistant':assert 'FAKE/OFFLINE' in result['answer']


@pytest.mark.parametrize('endpoint',BODIES)
@pytest.mark.parametrize('change',['missing','extra','long','version','synthetic_false','synthetic_integer'])
def test_invalid_inputs_do_not_call_provider(endpoint,change):
    fake=FakeProvider();body=deepcopy(BODIES[endpoint])
    if change=='missing':del body['schema_version']
    elif change=='extra':body['admin']=True
    elif change=='long':
        if endpoint=='request-review':body['specification']='x'*2001
        elif endpoint=='report-review':body['cells'][0]['value']='x'*1001
        elif endpoint=='schedule-recommendation':body['trials'][0]['conditions']='x'*2001
        else:body['question']='x'*2001
    elif change=='version':body['schema_version']='2.0'
    elif change=='synthetic_false':body['synthetic']=False
    else:body['synthetic']=1
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+endpoint,json=body)
    assert response.status_code==422 and not fake.calls
    result=response.json()
    assert result['status']=='validation_error' and result['error']['code']=='INVALID_INPUT'
    assert result['findings']==[] and UUID(result['request_id'])
    assert 'x'*100 not in response.text and 'admin' not in response.text


@pytest.mark.parametrize('endpoint',BODIES)
def test_default_provider_denies(endpoint):
    with ASGIClient(create_app()) as client:response=client.post(PREFIX+endpoint,json=BODIES[endpoint])
    assert response.status_code==503
    result=response.json()
    assert result['status']=='not_implemented' and result['provider_mode']=='NOT_INVOKED'
    assert result['error']['code']=='PROVIDER_NOT_IMPLEMENTED'
    assert result['usage']['source']=='NOT_INVOKED'


@pytest.mark.parametrize('failure,status,code',[(RuntimeError('secret API key and request body'),502,'PROVIDER_ERROR'),(TimeoutError('private details'),504,'PROVIDER_TIMEOUT'),(ProviderNotImplemented('private details'),503,'PROVIDER_NOT_IMPLEMENTED')])
def test_provider_errors_are_sanitized(failure,status,code):
    fake=FakeProvider();fake.failure=failure
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'assistant',json=BODIES['assistant'])
    assert response.status_code==status and response.json()['error']['code']==code
    for text in ('secret','private details','Traceback','Explain the synthetic'):assert text not in response.text


@pytest.mark.parametrize('origin',['https://unapproved.example.test','null','https://competition.example.test.evil','http://competition.example.test'])
def test_unapproved_origin_stops_before_provider(origin):
    fake=FakeProvider();settings=CompetitionSettings(allowed_origins=(ORIGIN,))
    with ASGIClient(create_app(settings,provider=fake)) as client:response=client.post(PREFIX+'assistant',json=BODIES['assistant'],headers={'Origin':origin})
    assert response.status_code==403 and response.json()['status']=='origin_denied'
    assert response.headers.get('access-control-allow-origin') is None and not fake.calls


def test_origins_denied_by_default():
    fake=FakeProvider()
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'assistant',json=BODIES['assistant'],headers={'Origin':ORIGIN})
    assert response.status_code==403 and not fake.calls


def test_allowlisted_origin_preflight_and_actual_request():
    fake=FakeProvider();settings=CompetitionSettings(allowed_origins=(ORIGIN,))
    with ASGIClient(create_app(settings,provider=fake)) as client:
        preflight=client.options(PREFIX+'assistant',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type'})
        assert preflight.status_code==200 and not fake.calls
        response=client.post(PREFIX+'assistant',json=BODIES['assistant'],headers={'Origin':ORIGIN})
    assert response.status_code==200 and response.headers['access-control-allow-origin']==ORIGIN
    assert response.headers.get('access-control-allow-credentials') is None


def test_duplicate_origin_headers_refused():
    fake=FakeProvider()
    with ASGIClient(create_app(CompetitionSettings(allowed_origins=(ORIGIN,)),provider=fake)) as client:
        response=client.post(PREFIX+'assistant',json=BODIES['assistant'],headers=[('Origin',ORIGIN),('Origin',ORIGIN)])
    assert response.status_code==403 and not fake.calls


@pytest.mark.parametrize('origin',['*','https://*.example.test','https://user:password@example.test','https://example.test/path','https://example.test/?x=1','null','http://external.example.test'])
def test_settings_reject_unsafe_cors(origin):
    with pytest.raises(ValidationError):CompetitionSettings(allowed_origins=(origin,))


def test_only_four_competition_routes_and_strict_versioned_schemas():
    schema=create_app().openapi()
    # Legacy test name retained; COMP-03A-2 explicitly authorizes a fifth route.
    assert set(schema['paths'])=={PREFIX+name for name in BODIES}|{PREFIX+'signature-quality'}
    assert all(set(schema['paths'][path])=={'post'} for path in schema['paths'])
    models=schema['components']['schemas']
    for model in ('RequestReviewRequest','ReportReviewRequest','ScheduleRequest','AssistantRequest','AdviceResponse'):
        assert models[model]['additionalProperties'] is False
        assert models[model]['properties']['schema_version']['const']=='1.0'
    assert all('tenant_id' not in models[name]['properties'] for name in ('RequestReviewRequest','ReportReviewRequest','ScheduleRequest','AssistantRequest'))


@pytest.mark.parametrize('field,value',[('status','已結案'),('action','approve_request'),('actor_id','FAKE_ADMIN'),('tenant_id','DUMMY'),('role','ADMIN')])
def test_client_cannot_inject_business_authority(field,value):
    fake=FakeProvider();body=dict(BODIES['request-review']);body[field]=value
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'request-review',json=body)
    assert response.status_code==422 and not fake.calls


def test_existing_p5_app_still_has_only_health():
    from app.main import create_app as old_factory
    schema=old_factory().openapi()
    assert set(schema['paths'])=={'/health/live'}
    assert schema['x-integration-status']=='NOT_IMPLEMENTED'


def test_competition_code_has_no_business_or_test_imports():
    folder=Path(__file__).parents[2]/'app'/'competition'
    for p in folder.glob('*.py'):
        tree=ast.parse(p.read_text());imports=[]
        for node in ast.walk(tree):
            if isinstance(node,ast.Import):imports.extend(a.name for a in node.names)
            if isinstance(node,ast.ImportFrom):imports.append(node.module or '')
        assert not any(name.startswith(('tests','tools','app.domain','app.ports','app.authz','app.authentication')) for name in imports)
        assert not any(isinstance(node,ast.Assert) for node in ast.walk(tree))


def test_network_guard_active():
    with pytest.raises(RuntimeError,match='External network forbidden'):socket.create_connection(('example.invalid',443))


def test_future_live_provider_cannot_be_enabled_in_comp02():
    fake=FakeProvider();fake.mode='REAL'
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'assistant',json=BODIES['assistant'])
    assert response.status_code==503 and not fake.calls


@pytest.mark.parametrize('usage',[{'source':'FAKE_OFFLINE','charged_micro_usd':1},{'source':'FAKE_OFFLINE','input_tokens':1},{'source':'PROVIDER','input_tokens':True},{'source':'PROVIDER','charged_micro_usd':-1}])
def test_usage_contract_rejects_false_offline_usage_or_invalid_values(usage):
    with pytest.raises(ValidationError):UsageRecord(**usage)


def test_budget_is_contract_not_enforced_ledger():
    record=UsageRecord(source='PROVIDER',input_tokens=3,output_tokens=2,charged_micro_usd=None)
    assert record.charged_micro_usd is None
    assert BudgetContract().remaining_budget is None
    with pytest.raises(ValidationError):BudgetContract(enforcement='ENFORCED')


def test_provider_output_invalid_shape_safely_rejected():
    class BadProvider:
        mode='FAKE_OFFLINE'
        async def suggest(self,*args):return {'summary':'private raw provider payload'}
    with ASGIClient(create_app(provider=BadProvider())) as client:response=client.post(PREFIX+'assistant',json=BODIES['assistant'])
    assert response.status_code==502 and 'private raw' not in response.text


@pytest.mark.parametrize('endpoint,field',[('request-review','product_code'),('report-review','cells'),('schedule-recommendation','equipment'),('assistant','question')])
def test_engine_specific_required_field(endpoint,field):
    fake=FakeProvider();body=deepcopy(BODIES[endpoint]);del body[field]
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+endpoint,json=body)
    assert response.status_code==422 and not fake.calls


def test_malformed_json_is_not_echoed():
    with ASGIClient(create_app()) as client:
        response=client.post(PREFIX+'assistant',content=b'{"secret_unfinished":',headers={'Content-Type':'application/json'})
    assert response.status_code==422 and 'secret_unfinished' not in response.text


def test_nested_unknown_report_field_rejected():
    fake=FakeProvider();body=deepcopy(BODIES['report-review']);body['cells'][0]['approved']=True
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'report-review',json=body)
    assert response.status_code==422 and not fake.calls


def test_numeric_coercion_refused():
    fake=FakeProvider();body=deepcopy(BODIES['request-review']);body['quantity']='2'
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'request-review',json=body)
    assert response.status_code==422 and not fake.calls


def test_report_cell_count_limit():
    fake=FakeProvider();body=deepcopy(BODIES['report-review']);body['cells']*=201
    with ASGIClient(create_app(provider=fake)) as client:response=client.post(PREFIX+'report-review',json=body)
    assert response.status_code==422 and not fake.calls
