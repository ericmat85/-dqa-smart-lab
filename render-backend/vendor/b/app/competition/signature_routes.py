"""Descriptor-only quality advice; no image or case storage/read capabilities."""
import asyncio
from uuid import uuid4
from fastapi import APIRouter,Request
from .ai_adapter import ProviderNotImplemented,AdapterError
from pydantic import ValidationError
from .schemas import Operation
from .signature_contracts import (SIGNATURE_PATH,SignatureQualityRequest,SignatureQualityResponse,
    SignatureProviderAdvice,signature_error_response,strict_signature_provider_payload)
from .signature_images import MAX_SIGNATURE_BODY_BYTES

router=APIRouter()
SIGNATURE_PROVIDER_TIMEOUT_SECONDS=1.0


class SignatureOutputInvalid(Exception):
    pass


class SignatureBodyLimit:
    def __init__(self,app):self.app=app

    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope.get('path')!=SIGNATURE_PATH or scope.get('method')!='POST':
            await self.app(scope,receive,send);return
        lengths=[v for k,v in scope.get('headers',[]) if k.lower()==b'content-length']
        if lengths and (len(lengths)!=1 or not lengths[0].isdigit() or len(lengths[0])>10):
            await signature_error_response(400,'validation_error','INVALID_BODY_LENGTH','Invalid request body length.')(scope,receive,send);return
        declared=int(lengths[0]) if lengths else None
        if declared is not None and declared>MAX_SIGNATURE_BODY_BYTES:
            await signature_error_response(413,'validation_error','PAYLOAD_TOO_LARGE','Signature request exceeds the body limit.')(scope,receive,send);return
        body=bytearray()
        try:
            async def bounded_body():
                while True:
                    message=await receive()
                    if message['type']=='http.disconnect':raise ValueError('Disconnected')
                    if message['type']!='http.request':raise ValueError('Invalid ASGI request')
                    chunk=message.get('body',b'')
                    if type(chunk) is not bytes:raise ValueError('Invalid ASGI body')
                    if len(body)+len(chunk)>MAX_SIGNATURE_BODY_BYTES:return False
                    body.extend(chunk)
                    if not message.get('more_body',False):return True
            fits=await asyncio.wait_for(bounded_body(),timeout=2)
        except (TimeoutError,ValueError):
            await signature_error_response(400,'validation_error','INVALID_BODY','Request body could not be read.')(scope,receive,send);return
        if not fits:
            await signature_error_response(413,'validation_error','PAYLOAD_TOO_LARGE','Signature request exceeds the body limit.')(scope,receive,send);return
        if declared is not None and declared!=len(body):
            await signature_error_response(400,'validation_error','INVALID_BODY_LENGTH','Invalid request body length.')(scope,receive,send);return
        delivered=False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered=True;return {'type':'http.request','body':bytes(body),'more_body':False}
            return await receive()
        await self.app(scope,replay,send)


@router.post('/signature-quality',response_model=SignatureQualityResponse)
async def signature_quality(payload: SignatureQualityRequest,request: Request):
    from .security_wiring import SecurityDenied
    try:
        result=await asyncio.wait_for(request.app.state.competition_advice_service.execute(Operation.SIGNATURE,payload,request),
            timeout=SIGNATURE_PROVIDER_TIMEOUT_SECONDS)
        if type(result) is not SignatureProviderAdvice:raise SignatureOutputInvalid()
        try:result=SignatureProviderAdvice.model_validate(strict_signature_provider_payload(result))
        except (ValueError,ValidationError):raise SignatureOutputInvalid() from None
        if result.usage.source!='FAKE_OFFLINE' or result.candidates or result.answer is not None:raise SignatureOutputInvalid()
        return SignatureQualityResponse(request_id=uuid4(),status='fake_result',provider_mode='FAKE_OFFLINE',
            summary=result.summary,findings=result.findings,usage=result.usage,
            overall_quality=result.overall_quality,quality_score=result.quality_score,
            manual_review_required=result.manual_review_required)
    except SecurityDenied as error:
        status='validation_error' if error.http_status in (401,403) else 'not_implemented'
        return signature_error_response(error.http_status,status,error.code,'Advice security prerequisites are not satisfied.')
    except ProviderNotImplemented:
        return signature_error_response(503,'not_implemented','PROVIDER_NOT_IMPLEMENTED','Signature quality provider is not implemented.')
    except AdapterError as error:
        mapped={
            'RATE_LIMIT_UNKNOWN':(429,'PROVIDER_RATE_LIMITED'),
            'UPSTREAM_UNKNOWN':(502,'PROVIDER_UPSTREAM_ERROR'),
            'PROVIDER_TIMEOUT':(504,'PROVIDER_TIMEOUT'),
            'INVALID_JSON_UNKNOWN':(502,'PROVIDER_INVALID_OUTPUT'),
            'OUTPUT_SCHEMA_INVALID':(502,'PROVIDER_INVALID_OUTPUT'),
        }
        http_status,code=mapped.get(error.code,(502,'PROVIDER_ERROR'))
        return signature_error_response(http_status,'provider_error',code,'Advice provider could not return valid quality advice.')
    except (SignatureOutputInvalid,ValidationError):
        return signature_error_response(502,'provider_error','PROVIDER_INVALID_OUTPUT','Advice provider returned invalid quality advice.')
    except TimeoutError:
        return signature_error_response(504,'provider_error','PROVIDER_TIMEOUT','Advice provider timed out.')
    except Exception:
        return signature_error_response(502,'provider_error','PROVIDER_ERROR','Advice provider failed.')
