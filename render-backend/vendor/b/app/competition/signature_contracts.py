from typing import Annotated,Literal
from uuid import uuid4
from pydantic import Field,field_validator
from fastapi.responses import JSONResponse
from .schemas import StrictModel,BaseRequest,AdviceResponse,ProviderAdvice,Text,Finding,ErrorInfo
from .budget import UsageRecord
from .signature_images import DESCRIPTOR_MEDIA_TYPE

SIGNATURE_PATH='/api/competition/ai/signature-quality'
FixtureID=Literal['synthetic-clear-v1','synthetic-blurry-v1','synthetic-cropped-v1','synthetic-faint-v1','synthetic-background-v1']
Quality=Literal['acceptable','needs_review','poor','unknown']
Score=Annotated[int,Field(strict=True,ge=0,le=100)]


class SyntheticSignatureDescriptor(StrictModel):
    fixture_id: FixtureID


class SignatureQualityRequest(BaseRequest):
    synthetic_signature_image: SyntheticSignatureDescriptor
    image_media_type: Literal['application/vnd.dqa.synthetic-signature-descriptor+json']
    declared_image_size: Annotated[int,Field(strict=True,ge=0,le=0)]
    context: Literal['quality_only']='quality_only'


class SignatureModelAdvice(StrictModel):
    summary: Text
    findings: Annotated[list[Finding],Field(max_length=20)]
    overall_quality: Quality
    quality_score: Score | None
    manual_review_required: Literal[True]

    @field_validator('manual_review_required',mode='before')
    @classmethod
    def mandatory_manual_review(cls,value):
        if type(value) is not bool or value is not True:raise ValueError('Manual review required for descriptor-only input')
        return value


class SignatureProviderAdvice(ProviderAdvice):
    overall_quality: Quality
    quality_score: Score | None
    manual_review_required: Literal[True]

    @field_validator('manual_review_required',mode='before')
    @classmethod
    def explicit_manual(cls,value):
        if type(value) is not bool or value is not True:raise ValueError('Manual review required')
        return value


class SignatureQualityResponse(AdviceResponse):
    overall_quality: Quality='unknown'
    quality_score: Score | None=None
    manual_review_required: Literal[True]=True
    assessment_scope: Literal['SYNTHETIC_DESCRIPTOR_ONLY']='SYNTHETIC_DESCRIPTOR_ONLY'
    image_decoding: Literal['NOT_IMPLEMENTED']='NOT_IMPLEMENTED'
    identity_verification: Literal['NOT_PERFORMED']='NOT_PERFORMED'
    legal_validity: Literal['NOT_ASSESSED']='NOT_ASSESSED'
    quality_notice: Literal['Quality advice only; not identity verification or approval.']='Quality advice only; not identity verification or approval.'


def signature_error_response(status_code,status,code,summary):
    result=SignatureQualityResponse(request_id=uuid4(),status=status,summary=summary,
        error=ErrorInfo(code=code),usage=UsageRecord(source='NOT_INVOKED'))
    return JSONResponse(status_code=status_code,content=result.model_dump(mode='json'))


def strict_signature_provider_payload(result):
    """Reject model_copy/model_construct extras before serializers drop them."""
    from pydantic import BaseModel
    def check(value):
        if isinstance(value,BaseModel):
            fields=set(type(value).model_fields)
            if set(value.__dict__)-fields or value.model_fields_set-fields or value.__pydantic_extra__:
                raise ValueError('Undeclared provider fields')
            for field in fields:check(getattr(value,field))
        elif isinstance(value,(list,tuple)):
            for item in value:check(item)
        elif isinstance(value,dict):
            for item in value.values():check(item)
    check(result)
    return result.model_dump(warnings=False)
