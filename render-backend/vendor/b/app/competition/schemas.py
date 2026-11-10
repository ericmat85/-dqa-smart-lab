"""Version 1.0, bounded, single-organization advice-only wire schemas."""
from enum import Enum
from typing import Annotated,Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,StringConstraints,field_validator,model_validator
from .budget import BudgetContract,UsageRecord

Text=Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=2000)]
Short=Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=128)]
Identifier=Annotated[str,StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,64}$')]
Items=Annotated[list[Text],Field(min_length=1,max_length=30)]


class StrictModel(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)


class Operation(str,Enum):
    REQUEST_REVIEW='request-review'
    REPORT_REVIEW='report-review'
    SCHEDULE='schedule-recommendation'
    ASSISTANT='assistant'
    SIGNATURE='signature-quality'


class BaseRequest(StrictModel):
    schema_version: Literal['1.0']
    synthetic: Literal[True]

    @field_validator('synthetic',mode='before')
    @classmethod
    def explicit_boolean(cls,value):
        if type(value) is not bool or value is not True:raise ValueError('Synthetic fixture marker required')
        return value


class RequestReviewRequest(BaseRequest):
    case_id: Identifier
    product_code: Short
    specification: Text
    judgment_criteria: Text
    quantity: Annotated[int,Field(strict=True,gt=0,le=100000)]
    sop_excerpts: Items
    customer_spec_excerpts: Items


class ReportCell(StrictModel):
    sheet: Short
    cell: Annotated[str,StringConstraints(pattern=r'^[A-Z]{1,3}[1-9][0-9]{0,5}$')]
    value: Annotated[str,StringConstraints(max_length=1000)]
    criterion: Text


class ReportReviewRequest(BaseRequest):
    case_id: Identifier
    revision_id: Identifier
    template_id: Identifier
    cells: Annotated[list[ReportCell],Field(min_length=1,max_length=200)]


class ScheduleTrial(StrictModel):
    trial_id: Identifier
    conditions: Text
    quantity: Annotated[int,Field(strict=True,gt=0,le=100000)]
    planned_hours: Annotated[int,Field(strict=True,gt=0,le=10000)]


class ResourceSnapshot(StrictModel):
    resource_id: Identifier
    capabilities: Items
    availability: Items


class ScheduleRequest(BaseRequest):
    case_id: Identifier
    snapshot_version: Annotated[int,Field(strict=True,gt=0)]
    trials: Annotated[list[ScheduleTrial],Field(min_length=1,max_length=20)]
    equipment: Annotated[list[ResourceSnapshot],Field(min_length=1,max_length=20)]
    engineers: Annotated[list[ResourceSnapshot],Field(min_length=1,max_length=20)]


class AssistantRequest(BaseRequest):
    question: Text
    context: Annotated[list[Text],Field(max_length=20)]


class Finding(StrictModel):
    severity: Literal['info','warning','error']
    code: Identifier
    message: Text
    references: Annotated[list[Short],Field(max_length=20)]=Field(default_factory=list)


class ScheduleCandidate(StrictModel):
    trial_id: Identifier
    equipment_id: Identifier
    engineer_id: Identifier
    suggested_window: Text
    rationale: Text
    deterministic_validation: Literal['REQUIRED_NOT_PERFORMED']='REQUIRED_NOT_PERFORMED'


class ProviderAdvice(StrictModel):
    summary: Text
    findings: Annotated[list[Finding],Field(max_length=50)]=Field(default_factory=list)
    candidates: Annotated[list[ScheduleCandidate],Field(max_length=20)]=Field(default_factory=list)
    answer: Annotated[str,StringConstraints(min_length=1,max_length=4000)] | None=None
    usage: UsageRecord


class ErrorInfo(StrictModel):
    code: Identifier


class AdviceResponse(StrictModel):
    schema_version: Literal['1.0']='1.0'
    request_id: UUID
    status: Literal['fake_result','not_implemented','provider_error','validation_error','origin_denied','internal_error']
    provider_mode: Literal['NOT_INVOKED','FAKE_OFFLINE']='NOT_INVOKED'
    summary: Text
    findings: Annotated[list[Finding],Field(max_length=50)]=Field(default_factory=list)
    candidates: Annotated[list[ScheduleCandidate],Field(max_length=20)]=Field(default_factory=list)
    answer: Annotated[str,StringConstraints(min_length=1,max_length=4000)] | None=None
    error: ErrorInfo | None=None
    usage: UsageRecord
    budget: BudgetContract=Field(default_factory=BudgetContract)
    business_actions_authorized: Literal[False]=False
    business_commit_gate: Literal['RULE_NOT_APPROVED']='RULE_NOT_APPROVED'

    @model_validator(mode='after')
    def label_fake(self):
        if self.status=='fake_result' and (self.provider_mode!='FAKE_OFFLINE' or self.usage.source!='FAKE_OFFLINE' or self.error is not None):
            raise ValueError('Fake result must be explicit')
        return self
