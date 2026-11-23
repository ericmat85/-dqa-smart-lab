"""Synthetic descriptors only. No image decoding, personal signature, or network."""
import asyncio
import base64
import json
from copy import deepcopy
from uuid import uuid4,UUID
import pytest
from app.competition.main import create_app
from app.competition.config import CompetitionSettings
from app.competition.schemas import Operation,Finding
from app.competition.signature_contracts import SignatureProviderAdvice,SignatureQualityRequest,SIGNATURE_PATH
from app.competition.signature_images import DESCRIPTORS,DESCRIPTOR_MEDIA_TYPE,MAX_SIGNATURE_BODY_BYTES
from app.competition.budget import UsageRecord
from app.competition.ai_adapter import AdapterError
from .fakes import FakeProvider
from .client import ASGIClient
from .test_contract import ORIGIN
from .test_provider_adapter import fixture_adapter,envelope

PAYLOAD={'schema_version':'1.0','synthetic':True,'synthetic_signature_image':{'fixture_id':'synthetic-clear-v1'},
    'image_media_type':DESCRIPTOR_MEDIA_TYPE,'declared_image_size':0,'context':'quality_only'}


class SignatureFakeProvider(FakeProvider):
    async def suggest(self,operation,payload):
        if operation!=Operation.SIGNATURE:return await super().suggest(operation,payload)
        self.calls.append((operation,payload.synthetic_signature_image.fixture_id))
        if self.failure is not None:raise self.failure
        clear=payload.synthetic_signature_image.fixture_id=='synthetic-clear-v1'
        return SignatureProviderAdvice(summary='FAKE_OFFLINE synthetic quality advice, not identity verification.',
            findings=[Finding(severity='info' if clear else 'warning',code='SYNTHETIC_QUALITY_ONLY',
                message='Review clarity, blur, completeness, crop, contrast and background manually.',references=[])],
            overall_quality='acceptable' if clear else 'needs_review',quality_score=90 if clear else 35,
            manual_review_required=True,usage=UsageRecord(source='FAKE_OFFLINE',input_tokens=0,output_tokens=0,charged_micro_usd=0))


def send(body=None,provider=None,**kwargs):
    with ASGIClient(create_app(provider=provider)) as client:
        return client.post(SIGNATURE_PATH,json=PAYLOAD if body is None else body,**kwargs)


def test_signature_openapi_registered_strict():
    schema=create_app().openapi();assert set(schema['paths'][SIGNATURE_PATH])=={'post'}
    model=schema['components']['schemas']['SignatureQualityRequest'];assert model['additionalProperties'] is False
    assert 'image_base64' not in model['properties'] and 'case_id' not in model['properties']


def test_signature_default_denied():
    r=send();assert r.status_code==503 and r.json()['status']=='not_implemented'
    assert r.json()['image_decoding']=='NOT_IMPLEMENTED' and r.json()['provider_mode']=='NOT_INVOKED'


@pytest.mark.parametrize('fixture',tuple(DESCRIPTORS))
def test_signature_fake_curated_descriptors(fixture):
    provider=SignatureFakeProvider();body=deepcopy(PAYLOAD);body['synthetic_signature_image']['fixture_id']=fixture
    before=deepcopy(body);r=send(body,provider);assert r.status_code==200 and body==before
    b=r.json();assert b['status']=='fake_result' and b['provider_mode']=='FAKE_OFFLINE'
    assert b['assessment_scope']=='SYNTHETIC_DESCRIPTOR_ONLY' and b['image_decoding']=='NOT_IMPLEMENTED'
    assert b['manual_review_required'] is True and b['identity_verification']=='NOT_PERFORMED'
    assert b['legal_validity']=='NOT_ASSESSED' and b['business_actions_authorized'] is False
    assert b['business_commit_gate']=='RULE_NOT_APPROVED' and UUID(b['request_id'])
    assert len(provider.calls)==1 and 0<=b['quality_score']<=100


@pytest.mark.parametrize('field',['image_url','file_path','provider_url','api_key','model','case_id','actor_id','admin','request_id'])
def test_signature_unknown_fields_and_case_lookup_denied(field):
    provider=SignatureFakeProvider();body=deepcopy(PAYLOAD);body[field]='CLIENT_UNTRUSTED_VALUE'
    r=send(body,provider);assert r.status_code==422 and not provider.calls and 'CLIENT_UNTRUSTED_VALUE' not in r.text


@pytest.mark.parametrize('field',['schema_version','synthetic','synthetic_signature_image','image_media_type','declared_image_size'])
def test_signature_required_fields(field):
    provider=SignatureFakeProvider();body=deepcopy(PAYLOAD);del body[field]
    r=send(body,provider);assert r.status_code==422 and not provider.calls


@pytest.mark.parametrize('kind',['invalid_base64','empty','corrupt','png_mime','jpeg_mime','external_url','path','unknown_fixture','client_dimensions','image_size','negative_size','boolean_size','personal_context'])
def test_signature_raw_input_and_untrusted_metadata_refused(kind):
    body=deepcopy(PAYLOAD);provider=SignatureFakeProvider()
    if kind=='invalid_base64':body['synthetic_signature_image']='!!not-base64!!'
    elif kind=='empty':body['synthetic_signature_image']=''
    elif kind=='corrupt':body['synthetic_signature_image']=base64.b64encode(b'SYNTHETIC_CORRUPT_IMAGE_CANARY').decode()
    elif kind=='png_mime':body['image_media_type']='image/png'
    elif kind=='jpeg_mime':body['image_media_type']='image/jpeg'
    elif kind=='external_url':body['synthetic_signature_image']='https://untrusted.invalid/image.png'
    elif kind=='path':body['synthetic_signature_image']='/etc/passwd'
    elif kind=='unknown_fixture':body['synthetic_signature_image']['fixture_id']='other-signature'
    elif kind=='client_dimensions':body['synthetic_signature_image']['width']=100
    elif kind=='image_size':body['declared_image_size']=1
    elif kind=='negative_size':body['declared_image_size']=-1
    elif kind=='boolean_size':body['declared_image_size']=False
    else:body['context']='personal-name-or-identifier'
    r=send(body,provider);assert r.status_code==422 and not provider.calls
    assert r.json()['image_decoding']=='NOT_IMPLEMENTED'
    for marker in ('CORRUPT_IMAGE_CANARY','untrusted.invalid','/etc/passwd','personal-name-or-identifier'):assert marker not in r.text


def test_signature_payload_limit_content_length():
    provider=SignatureFakeProvider()
    with ASGIClient(create_app(provider=provider)) as client:r=client.post(SIGNATURE_PATH,content=b'x'*(MAX_SIGNATURE_BODY_BYTES+1),headers={'Content-Type':'application/json'})
    assert r.status_code==413 and r.json()['error']['code']=='PAYLOAD_TOO_LARGE' and not provider.calls


def test_signature_chunked_body_limit():
    provider=SignatureFakeProvider()
    async def chunks():yield b'x'*5000;yield b'y'*5000
    with ASGIClient(create_app(provider=provider)) as client:r=client.post(SIGNATURE_PATH,content=chunks(),headers={'Content-Type':'application/json'})
    assert r.status_code==413 and not provider.calls


def test_signature_length_mismatch():
    with ASGIClient(create_app()) as client:r=client.post(SIGNATURE_PATH,content=b'{}',headers={'Content-Length':'1','Content-Type':'application/json'})
    assert r.status_code==400 and r.json()['error']['code']=='INVALID_BODY_LENGTH'


def test_signature_origin_denied_before_provider():
    p=SignatureFakeProvider();r=send(provider=p,headers={'Origin':'https://unapproved.example.test'})
    assert r.status_code==403 and not p.calls


def test_signature_test_origin_allowed():
    p=SignatureFakeProvider()
    with ASGIClient(create_app(CompetitionSettings(allowed_origins=(ORIGIN,)),provider=p)) as client:
        r=client.post(SIGNATURE_PATH,json=PAYLOAD,headers={'Origin':ORIGIN})
    assert r.status_code==200 and r.headers['access-control-allow-origin']==ORIGIN


@pytest.mark.parametrize('failure,status,code',[(TimeoutError('PRIVATE_IMAGE_CANARY'),504,'PROVIDER_TIMEOUT'),
 (AdapterError('RATE_LIMIT_UNKNOWN',uuid4()),429,'PROVIDER_RATE_LIMITED'),
 (AdapterError('UPSTREAM_UNKNOWN',uuid4()),502,'PROVIDER_UPSTREAM_ERROR'),
 (AdapterError('INVALID_JSON_UNKNOWN',uuid4()),502,'PROVIDER_INVALID_OUTPUT'),
 (AdapterError('OUTPUT_SCHEMA_INVALID',uuid4()),502,'PROVIDER_INVALID_OUTPUT'),
 (RuntimeError('PRIVATE_IMAGE_CANARY'),502,'PROVIDER_ERROR')])
def test_signature_provider_errors_redacted(failure,status,code,caplog):
    p=SignatureFakeProvider();p.failure=failure;caplog.set_level('DEBUG');r=send(provider=p)
    assert r.status_code==status and r.json()['error']['code']==code
    assert 'PRIVATE_IMAGE_CANARY' not in r.text+caplog.text


@pytest.mark.parametrize('kind',['raw_json','identity_field','bad_score','manual_false','business_answer'])
def test_signature_bad_output_refused(kind):
    class Bad(SignatureFakeProvider):
        async def suggest(self,operation,payload):
            if kind=='raw_json':return '{"identity_verified":true}'
            good=await super().suggest(operation,payload)
            if kind=='identity_field':return good.model_copy(update={'identity_verified':True})
            if kind=='bad_score':return good.model_copy(update={'quality_score':101})
            if kind=='manual_false':return good.model_copy(update={'manual_review_required':False})
            return good.model_copy(update={'answer':'Execute approval'})
    r=send(provider=Bad());assert r.status_code==502 and r.json()['status']=='provider_error'


def test_signature_no_image_or_base64_echo(caplog):
    caplog.set_level('DEBUG');body=deepcopy(PAYLOAD);canary='SYNTHETIC_PRIVATE_SIGNATURE_CANARY'
    encoded=base64.b64encode(canary.encode()).decode();body['synthetic_signature_image']=encoded
    r=send(body,SignatureFakeProvider())
    assert r.status_code==422 and encoded not in r.text+caplog.text and canary not in r.text+caplog.text


def test_signature_shared_adapter_curated_prompt_and_budget():
    wire=envelope();wire['output'][0]['content'][0]['text']=json.dumps({'summary':'Synthetic descriptor advice only.',
        'findings':[],'overall_quality':'needs_review','quality_score':40,'manual_review_required':True})
    a,calls,_=fixture_adapter(body=wire)
    result=asyncio.run(a.suggest(Operation.SIGNATURE,SignatureQualityRequest.model_validate(PAYLOAD)))
    assert result.manual_review_required is True and result.usage.source=='FAKE_OFFLINE'
    assert result.overall_quality=='needs_review' and a.audit.records()[-1].feature=='AI-04'
    request=json.loads(calls[0].content)
    assert 'SERVER_CURATED_SYNTHETIC_DESCRIPTOR_NOT_DECODED_IMAGE' in request['input'][1]['content'][0]['text']
    assert 'No image decoding' in request['input'][0]['content'][0]['text']
    assert a.ledger.snapshot()['accounted_micro_usd']==20


def test_signature_invalid_adapter_output_holds_budget():
    wire=envelope();wire['output'][0]['content'][0]['text']=json.dumps({'summary':'S','findings':[],
        'overall_quality':'acceptable','quality_score':100,'manual_review_required':False})
    a,_,_=fixture_adapter(body=wire)
    with pytest.raises(AdapterError):asyncio.run(a.suggest(Operation.SIGNATURE,SignatureQualityRequest.model_validate(PAYLOAD)))
    assert a.ledger.snapshot()['unknown_reservations']==1


def test_signature_openai_adapter_still_denied_by_public_route():
    a,calls,secrets=fixture_adapter();r=send(provider=a)
    assert r.status_code==503 and not calls and secrets.calls==0


def test_perfect_synthetic_quality_score_does_not_authorize_business_actions():
    class Perfect(SignatureFakeProvider):
        async def suggest(self,operation,payload):
            return (await super().suggest(operation,payload)).model_copy(update={'quality_score':100})
    r=send(provider=Perfect());b=r.json()
    assert r.status_code==200 and b['quality_score']==100 and b['manual_review_required'] is True
    assert b['business_actions_authorized'] is False and b['business_commit_gate']=='RULE_NOT_APPROVED'
    assert b['identity_verification']=='NOT_PERFORMED' and b['legal_validity']=='NOT_ASSESSED'


def test_unapproved_origin_does_not_read_request_body():
    async def must_not_read():
        raise RuntimeError('Request body must not be consumed')
        yield b''
    p=SignatureFakeProvider()
    with ASGIClient(create_app(provider=p)) as client:
        r=client.post(SIGNATURE_PATH,content=must_not_read(),headers={'Origin':'https://unapproved.example.test','Content-Type':'application/json'})
    assert r.status_code==403 and not p.calls


@pytest.mark.parametrize('change',[{'schema_version':'2.0'},{'synthetic':False},{'synthetic':1}])
def test_signature_version_and_synthetic_marker_strict(change):
    p=SignatureFakeProvider();body=dict(PAYLOAD);body.update(change)
    r=send(body,p);assert r.status_code==422 and not p.calls


def test_nested_provider_extra_identity_field_refused():
    class BadNested(SignatureFakeProvider):
        async def suggest(self,operation,payload):
            result=await super().suggest(operation,payload)
            finding=result.findings[0].model_copy(update={'signer_id':'UNTRUSTED_PERSON'})
            return result.model_copy(update={'findings':[finding]})
    r=send(provider=BadNested())
    assert r.status_code==502 and 'UNTRUSTED_PERSON' not in r.text


def test_signature_provider_deadline_cancels_slow_fake(monkeypatch):
    import app.competition.signature_routes as module
    monkeypatch.setattr(module,'SIGNATURE_PROVIDER_TIMEOUT_SECONDS',0.005)
    class Slow(SignatureFakeProvider):
        async def suggest(self,operation,payload):
            await asyncio.sleep(1)
            return await super().suggest(operation,payload)
    r=send(provider=Slow())
    assert r.status_code==504 and r.json()['error']['code']=='PROVIDER_TIMEOUT'
