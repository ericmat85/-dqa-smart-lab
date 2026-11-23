from uuid import uuid4
from fastapi import APIRouter,Request
from fastapi.responses import JSONResponse
from .ai_adapter import ProviderNotImplemented
from .budget import UsageRecord
from .schemas import (AdviceResponse,ErrorInfo,ProviderAdvice,Operation,
    RequestReviewRequest,ReportReviewRequest,ScheduleRequest,AssistantRequest)

router=APIRouter(prefix='/api/competition/ai')


def error_response(status_code,status,code,summary):
    body=AdviceResponse(request_id=uuid4(),status=status,summary=summary,
        error=ErrorInfo(code=code),usage=UsageRecord(source='NOT_INVOKED'))
    return JSONResponse(status_code=status_code,content=body.model_dump(mode='json'))


async def advise(operation,payload,request):
    from .security_wiring import SecurityDenied
    try:
        # Only explicit offline injection is supported in COMP-02. A future live
        # adapter needs separate authorization and configuration/schema review.
        result=await request.app.state.competition_advice_service.execute(operation,payload,request)
        if type(result) is not ProviderAdvice:raise ValueError('Invalid provider shape')
        # Revalidate: do not trust model_construct or postconstruction mutation.
        result=ProviderAdvice.model_validate(result.model_dump())
        if result.usage.source!='FAKE_OFFLINE':raise ValueError('Invalid offline label')
        if operation==Operation.SCHEDULE:
            if result.answer is not None:raise ValueError('Unexpected answer')
        elif result.candidates:raise ValueError('Unexpected schedule candidates')
        if operation==Operation.ASSISTANT:
            if result.answer is None:raise ValueError('Missing answer')
        elif result.answer is not None:raise ValueError('Unexpected answer')
        return AdviceResponse(request_id=uuid4(),status='fake_result',provider_mode='FAKE_OFFLINE',
            summary=result.summary,findings=result.findings,candidates=result.candidates,
            answer=result.answer,usage=result.usage)
    except SecurityDenied as error:
        status='validation_error' if error.http_status in (401,403) else 'not_implemented'
        return error_response(error.http_status,status,error.code,'Advice security prerequisites are not satisfied.')
    except ProviderNotImplemented:
        return error_response(503,'not_implemented','PROVIDER_NOT_IMPLEMENTED','AI provider is not implemented.')
    except TimeoutError:
        return error_response(504,'provider_error','PROVIDER_TIMEOUT','Advice provider timed out.')
    except Exception:
        return error_response(502,'provider_error','PROVIDER_ERROR','Advice provider failed.')


@router.post('/request-review',response_model=AdviceResponse)
async def request_review(payload: RequestReviewRequest,request: Request):
    return await advise(Operation.REQUEST_REVIEW,payload,request)


@router.post('/report-review',response_model=AdviceResponse)
async def report_review(payload: ReportReviewRequest,request: Request):
    return await advise(Operation.REPORT_REVIEW,payload,request)


@router.post('/schedule-recommendation',response_model=AdviceResponse)
async def schedule_recommendation(payload: ScheduleRequest,request: Request):
    return await advise(Operation.SCHEDULE,payload,request)


@router.post('/assistant',response_model=AdviceResponse)
async def assistant(payload: AssistantRequest,request: Request):
    return await advise(Operation.ASSISTANT,payload,request)


# COMP-03A-2 adds the descriptor-only fifth route; original four handlers unchanged.
from .signature_routes import router as signature_router
router.include_router(signature_router)
