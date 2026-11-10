"""Default-deny interface and offline-verifiable OpenAI wire adapter. No live network."""
from typing import Protocol
from .schemas import BaseRequest,Operation,ProviderAdvice


class ProviderNotImplemented(Exception):
    pass


class ProviderFailure(Exception):
    pass


class AdviceProvider(Protocol):
    mode: str
    async def suggest(self,operation: Operation,payload: BaseRequest) -> ProviderAdvice: ...


class DenyProvider:
    mode='NOT_INVOKED'

    async def suggest(self,operation,payload):
        raise ProviderNotImplemented()


import asyncio
import json
import re
from datetime import datetime,timezone
from uuid import UUID,uuid4
import httpx
from pydantic import SecretStr
from .config import OpenAIAdapterSettings
from .budget import MemoryBudgetLedger,BudgetDenied
from .provider_models import AIFeature,SPECS,OPERATION_FEATURE
from .provider_transport import ENDPOINT,ProviderHTTPRequest,ProviderHTTPResponse,OfflineHTTPXTransport
from .provider_usage import MemoryUsageLog,UsageAudit,ModelPrice
from .prepared_transport import PreparedProviderTransport
from .budget import UsageRecord


SAFE_ERROR_CODES=frozenset({
    'INVALID_REQUEST_ID','PROVIDER_DISABLED','FEATURE_NOT_IMPLEMENTED','LIVE_NETWORK_NOT_AUTHORIZED',
    'MODEL_PRICE_UNKNOWN','INPUT_SCHEMA_INVALID','INPUT_BOUND_UNVERIFIABLE','KEY_UNAVAILABLE',
    'LEDGER_DISABLED','DUPLICATE_REQUEST','INSUFFICIENT_BUDGET','INVALID_RESERVATION','INVALID_MONEY',
    'TRANSPORT_RESPONSE_INVALID','RATE_LIMIT_UNKNOWN','UPSTREAM_UNKNOWN','PROVIDER_AUTH_UNKNOWN',
    'HTTP_ERROR_UNKNOWN','OUTPUT_SIZE_INVALID','INVALID_JSON_UNKNOWN','MODEL_RESPONSE_MISMATCH',
    'OUTPUT_SCHEMA_INVALID','DISALLOWED_OUTPUT','REFUSAL_UNKNOWN','OUTPUT_INCOMPLETE_UNKNOWN',
    'USAGE_UNKNOWN','PROVIDER_TIMEOUT','PROVIDER_ERROR',
})


class AdapterError(ProviderFailure):
    def __init__(self,code,request_id):
        code=code if type(code) is str and code in SAFE_ERROR_CODES else 'PROVIDER_ERROR'
        super().__init__(code);self.code=code;self.request_id=request_id


def _json_object(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise ValueError('Duplicate JSON fields')
        result[key]=value
    return result


def _strict_json(raw):
    return json.loads(raw,object_pairs_hook=_json_object,
        parse_constant=lambda value:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def _strict_schema(model):
    schema=model.model_json_schema()
    def visit(node):
        if isinstance(node,dict):
            node.pop('default',None)
            if 'properties' in node:
                node['required']=list(node['properties']);node['additionalProperties']=False
            for value in node.values():visit(value)
        elif isinstance(node,list):
            for value in node:visit(value)
    visit(schema)
    return schema


def _required_shape(value,node,root):
    if '$ref' in node:
        ref=node['$ref']
        if not ref.startswith('#/$defs/'):raise ValueError('Unsupported schema reference')
        return _required_shape(value,root['$defs'][ref.split('/')[-1]],root)
    if node.get('type')=='object':
        if type(value) is not dict or set(value)!=set(node['properties']):raise ValueError('Exact fields required')
        for key,sub in node['properties'].items():_required_shape(value[key],sub,root)
    elif node.get('type')=='array':
        if type(value) is not list:raise ValueError('Array required')
        for element in value:_required_shape(element,node['items'],root)


class OpenAIProviderAdapter:
    """Shared five-feature pipeline, only offline simulation enabled in this phase.

    Four public routes intentionally do NOT accept this mode; default behavior
    remains 503. AI-04 has no FeatureSpec and fails closed until COMP-03A-2.
    """
    mode='OPENAI_OFFLINE_SIMULATION'

    def __init__(self,settings=None, *, secret_source=None,transport=None,prices=None,ledger=None,audit=None):
        self.settings=OpenAIAdapterSettings.model_validate(settings.model_dump()) if settings is not None else OpenAIAdapterSettings()
        self.secret_source=secret_source;self.transport=transport;self.prices=dict(prices or {})
        self.ledger=ledger if ledger is not None else MemoryBudgetLedger()
        self.audit=audit if audit is not None else MemoryUsageLog()

    async def suggest(self,operation,payload, *, request_id=None):
        feature=OPERATION_FEATURE.get(operation)
        return await self.suggest_feature(feature,payload,request_id=request_id)

    async def suggest_feature(self,feature,payload, *, request_id=None):
        rid=request_id or uuid4()
        if type(rid) is not UUID:raise AdapterError('INVALID_REQUEST_ID',uuid4())
        reservation=None;maximum=None;usage_in=usage_out=accounted=None;attempted=False
        model=self.settings.model_id
        name=feature.value if type(feature) is AIFeature else 'UNKNOWN'
        def record(status):
            self.audit.record(UsageAudit(rid,name,model,status,datetime.now(timezone.utc),
                maximum,accounted,usage_in,usage_out,execution='OFFLINE_SIMULATION' if attempted else 'NOT_INVOKED'))
        def uncertain():
            if reservation is not None:self.ledger.mark_unknown(reservation)
        def reject(code):raise AdapterError(code,rid)
        try:
            if not self.settings.enabled:reject('PROVIDER_DISABLED')
            if type(feature) is not AIFeature or feature not in SPECS:reject('FEATURE_NOT_IMPLEMENTED')
            if not (type(self.transport) is OfflineHTTPXTransport or (type(self.transport) is PreparedProviderTransport and self.transport.offline_ready)) or self.transport.offline is not True:reject('LIVE_NETWORK_NOT_AUTHORIZED')
            if model is None or model not in self.prices or type(self.prices[model]) is not ModelPrice or self.prices[model].model!=model:reject('MODEL_PRICE_UNKNOWN')
            price=self.prices[model];spec=SPECS[feature]
            try:validated=spec.request_model.model_validate(payload.model_dump())
            except Exception:reject('INPUT_SCHEMA_INVALID')
            schema=_strict_schema(spec.response_model)
            if feature==AIFeature.SIGNATURE:
                from .signature_images import descriptor_prompt_data
                user_input=json.dumps(descriptor_prompt_data(validated),ensure_ascii=False)
            else:user_input=validated.model_dump_json()
            body={'model':model,'max_output_tokens':self.settings.max_output_tokens,
                'input':[{'role':'system','content':[{'type':'input_text','text':spec.prompt}]},
                         {'role':'user','content':[{'type':'input_text','text':user_input}]}],
                'text':{'format':{'type':'json_schema','name':'advisory_result','strict':True,'schema':schema}}}
            raw_request=json.dumps(body,ensure_ascii=False,separators=(',',':')).encode('utf-8')
            # Conservative OFFLINE byte-bound + explicit framing margin, not a
            # verified live tokenizer/cost guarantee.
            if len(raw_request)+self.settings.input_framing_margin>self.settings.max_input_tokens:reject('INPUT_BOUND_UNVERIFIABLE')
            if self.secret_source is None:reject('KEY_UNAVAILABLE')
            try:key=self.secret_source.load()
            except Exception:reject('KEY_UNAVAILABLE')
            if type(key) is not SecretStr or not re.fullmatch(r'[!-~]{8,256}',key.get_secret_value()):reject('KEY_UNAVAILABLE')
            maximum=price.cost(self.settings.max_input_tokens,self.settings.max_output_tokens)
            try:reservation=self.ledger.reserve(rid,name,model,maximum)
            except BudgetDenied as error:reject(error.code)
            request=ProviderHTTPRequest(ENDPOINT,{'Authorization':'Bearer '+key.get_secret_value(),
                'Content-Type':'application/json'},body,self.settings.timeout_ms/1000)
            attempted=True
            response=await asyncio.wait_for(self.transport.send(request),timeout=request.timeout_seconds)
            if type(response) is not ProviderHTTPResponse or type(response.status_code) is not int:reject('TRANSPORT_RESPONSE_INVALID')
            if response.status_code==429:reject('RATE_LIMIT_UNKNOWN')
            if 500<=response.status_code<=599:reject('UPSTREAM_UNKNOWN')
            if response.status_code in (401,403):reject('PROVIDER_AUTH_UNKNOWN')
            if response.status_code!=200:reject('HTTP_ERROR_UNKNOWN')
            if type(response.body) is not bytes or len(response.body)>1048576:reject('OUTPUT_SIZE_INVALID')
            try:envelope=_strict_json(response.body)
            except Exception:reject('INVALID_JSON_UNKNOWN')
            try:
                if envelope.get('model')!=model:reject('MODEL_RESPONSE_MISMATCH')
                output=envelope['output']
                if type(output) is not list or len(output)!=1:reject('OUTPUT_SCHEMA_INVALID')
                message=output[0]
                if message['type']!='message' or message['role']!='assistant':reject('DISALLOWED_OUTPUT')
                content=message['content']
                if type(content) is not list or len(content)!=1:reject('OUTPUT_SCHEMA_INVALID')
                if content[0]['type']=='refusal':reject('REFUSAL_UNKNOWN')
                if envelope['status']!='completed' or content[0]['type']!='output_text':reject('OUTPUT_INCOMPLETE_UNKNOWN')
                parsed=_strict_json(content[0]['text']);_required_shape(parsed,schema,schema)
                advice=spec.response_model.model_validate(parsed)
            except AdapterError:raise
            except Exception:reject('OUTPUT_SCHEMA_INVALID')
            try:
                usage=envelope['usage'];reported_in=usage['input_tokens'];reported_out=usage['output_tokens'];total=usage['total_tokens']
                if (any(type(v) is not int or v<0 for v in (reported_in,reported_out,total))
                        or reported_in==0 or reported_out==0 or total!=reported_in+reported_out
                        or reported_in>self.settings.max_input_tokens or reported_out>self.settings.max_output_tokens):
                    reject('USAGE_UNKNOWN')
                usage_in,usage_out=reported_in,reported_out
            except AdapterError:raise
            except Exception:reject('USAGE_UNKNOWN')
            # Response remains explicitly Fake; reported tokens/cost are only in
            # simulated audit/ledger, never represented as a real provider charge.
            fields=advice.model_dump();fields['summary']='OFFLINE_SIMULATION: '+fields['summary']
            response_model=ProviderAdvice
            if feature==AIFeature.SIGNATURE:
                from .signature_contracts import SignatureProviderAdvice
                response_model=SignatureProviderAdvice
            result=response_model(**fields,usage=UsageRecord(source='FAKE_OFFLINE',input_tokens=0,output_tokens=0,charged_micro_usd=0))
            cost=price.cost(usage_in,usage_out)
            self.ledger.settle(reservation,cost);reservation=None;accounted=cost
            record('OFFLINE_SIMULATED_SUCCESS')
            return result
        except asyncio.CancelledError:
            uncertain();record('CANCELLED_UNKNOWN');raise
        except (TimeoutError,httpx.TimeoutException):
            uncertain();record('TIMEOUT_UNKNOWN');raise AdapterError('PROVIDER_TIMEOUT',rid) from None
        except AdapterError as error:
            uncertain();record(error.code);raise AdapterError(error.code,rid) from None
        except Exception:
            uncertain();record('PROVIDER_ERROR_UNKNOWN');raise AdapterError('PROVIDER_ERROR',rid) from None
