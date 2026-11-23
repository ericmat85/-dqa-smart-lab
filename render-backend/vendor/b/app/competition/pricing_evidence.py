"""Submitted official-source metadata is unverified until human provenance review."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .model_policy import ModelPolicy

class PricingEvidenceSubmission(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
    model_id: str=Field(min_length=1,max_length=100,pattern=r'^[A-Za-z0-9._-]+$')
    official_source: Literal['https://openai.com/api/pricing/','https://platform.openai.com/docs/pricing']
    version_date: date
    captured_at: date
    snapshot_sha256: str=Field(pattern=r'^[a-f0-9]{64}$')
    input_micro_usd_per_million: int=Field(gt=0)
    output_micro_usd_per_million: int=Field(gt=0)
    context_limit: int=Field(gt=0)
    max_output_tokens: int=Field(gt=0)
    status: Literal['PRICING_UNVERIFIED']='PRICING_UNVERIFIED'

    @model_validator(mode='after')
    def consistent(self):
        if self.version_date>self.captured_at or self.max_output_tokens>self.context_limit:
            raise ValueError('Invalid evidence chronology or limits')
        return self

    def activation_policy(self):
        # Metadata shape is not official provenance or verified current pricing.
        PricingEvidenceSubmission.model_validate(self.model_dump())
        return ModelPolicy()
