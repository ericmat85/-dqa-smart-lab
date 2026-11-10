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


# Isolated demo DTOs only; these do not amend C 0.2.2 or V0.2.
DateOnly=Annotated[str,StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$')]
Litres=Annotated[str,StringConstraints(pattern=r'^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$',max_length=32)]

class ScheduleTrial(StrictModel):
    trial_id: Identifier
    conditions: Text
    quantity: Annotated[int,Field(strict=True,gt=0,le=100000)]
    duration_days: Annotated[int,Field(strict=True,gt=0,le=30)]
    start_date: DateOnly
    required_devices: Annotated[int,Field(strict=True,ge=1,le=4)]=1
    sample_volume_litres: Litres | None=None

    @field_validator('sample_volume_litres')
    @classmethod
    def positive_sample(cls,value):
        from decimal import Decimal
        if value is not None and Decimal(value)<=0:raise ValueError('Positive synthetic L required')
        return value

    @field_validator('start_date')
    @classmethod
    def valid_date(cls,value):
        from datetime import date
        date.fromisoformat(value);return value

class ResourceSnapshot(StrictModel):
    resource_id: Identifier
    capabilities: Items
    available_start: DateOnly
    available_end: DateOnly
    capacity: Annotated[int,Field(strict=True,gt=0,le=100000)] | None=None
    usable_volume_litres: Litres | None=None

    @field_validator('usable_volume_litres')
    @classmethod
    def positive_volume(cls,value):
        from decimal import Decimal
        if value is not None and Decimal(value)<=0:raise ValueError('Positive synthetic L required')
        return value

    @model_validator(mode='after')
    def window(self):
        from datetime import date
        if date.fromisoformat(self.available_start)>date.fromisoformat(self.available_end):
            raise ValueError('Invalid resource window')
        return self

class ScheduleRequest(BaseRequest):
    case_id: Identifier
    snapshot_version: Annotated[int,Field(strict=True,gt=0)]
    time_unit: Literal['day']
    timezone: Literal['Asia/Taipei']
    trials: Annotated[list[ScheduleTrial],Field(min_length=1,max_length=20)]
    equipment: Annotated[list[ResourceSnapshot],Field(min_length=1,max_length=20)]
    engineers: Annotated[list[ResourceSnapshot],Field(min_length=1,max_length=20)]

    @model_validator(mode='after')
    def unique_ids(self):
        for items,key in [(self.trials,'trial_id'),(self.equipment,'resource_id'),(self.engineers,'resource_id')]:
            ids=[getattr(x,key) for x in items]
            if len(ids)!=len(set(ids)):raise ValueError('Duplicate synthetic resource identity')
        return self

class SourceExcerpt(StrictModel):
    source_id: Identifier
    revision: Identifier
    locator: Short
    text: Text

class AssistantRequest(BaseRequest):
    question: Text
    documents: Annotated[list[SourceExcerpt],Field(min_length=1,max_length=20)]

    @model_validator(mode='after')
    def unique_documents(self):
        ids=[x.source_id for x in self.documents]
        if len(ids)!=len(set(ids)):raise ValueError('Duplicate source identity')
        return self


class Finding(StrictModel):
    severity: Literal['info','warning','error']
    code: Identifier
    message: Text
    references: Annotated[list[Text],Field(max_length=20)]=Field(default_factory=list)


class ScheduleCandidate(StrictModel):
    trial_id: Identifier
    equipment_ids: Annotated[list[Identifier],Field(min_length=1,max_length=4)]
    engineer_id: Identifier
    start_date: DateOnly
    end_date: DateOnly
    time_unit: Literal['day']='day'
    timezone: Literal['Asia/Taipei']='Asia/Taipei'
    rationale: Text
    deterministic_validation: Literal['SYNTHETIC_FIXTURE_ONLY']='SYNTHETIC_FIXTURE_ONLY'
    requires_human_confirmation: Literal[True]=True
    reservation_created: Literal[False]=False

    @model_validator(mode='after')
    def dates(self):
        from datetime import date
        if date.fromisoformat(self.start_date)>date.fromisoformat(self.end_date):raise ValueError('Invalid dates')
        return self


class ProviderAdvice(StrictModel):
    summary: Text
    findings: Annotated[list[Finding],Field(max_length=50)]=Field(default_factory=list)
    candidates: Annotated[list[ScheduleCandidate],Field(max_length=20)]=Field(default_factory=list)
    answer: Annotated[str,StringConstraints(min_length=1,max_length=4000)] | None=None
    usage: UsageRecord
    requires_human_confirmation: Literal[True]=True


class ErrorInfo(StrictModel):
    code: Identifier


class AdviceResponse(StrictModel):
    schema_version: Literal['1.0']='1.0'
    request_id: UUID
    status: Literal['fake_result','not_implemented','provider_error','validation_error','origin_denied','internal_error','refused']
    provider_mode: Literal['FAKE_OFFLINE']='FAKE_OFFLINE'
    demo_scope: Literal['SYNTHETIC_ONLY_NO_REAL_AI']='SYNTHETIC_ONLY_NO_REAL_AI'
    summary: Text
    findings: Annotated[list[Finding],Field(max_length=50)]=Field(default_factory=list)
    candidates: Annotated[list[ScheduleCandidate],Field(max_length=20)]=Field(default_factory=list)
    answer: Annotated[str,StringConstraints(min_length=1,max_length=4000)] | None=None
    error: ErrorInfo | None=None
    usage: UsageRecord
    requires_human_confirmation: Literal[True]=True
    budget: BudgetContract=Field(default_factory=BudgetContract)
    business_actions_authorized: Literal[False]=False
    business_commit_gate: Literal['RULE_NOT_APPROVED']='RULE_NOT_APPROVED'

    @model_validator(mode='after')
    def label_fake(self):
        if self.status=='fake_result' and (self.provider_mode!='FAKE_OFFLINE' or self.usage.source!='FAKE_OFFLINE' or self.error is not None):
            raise ValueError('Fake result must be explicit')
        return self
