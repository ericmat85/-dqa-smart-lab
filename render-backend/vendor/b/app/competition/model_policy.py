"""Offline server-side metadata. No official pricing verifier exists here."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

class ModelPolicy(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)
    model_id: str | None = Field(default=None, min_length=1, max_length=100)
    provider: Literal["openai"] = "openai"
    context_limit: int | None = Field(default=None, gt=0)
    max_output_tokens: int | None = Field(default=None, gt=0)
    input_token_price: int | None = Field(default=None, gt=0)
    output_token_price: int | None = Field(default=None, gt=0)
    price_unit: Literal["micro_USD_per_million_tokens"] = "micro_USD_per_million_tokens"
    pricing_source: Literal["SYNTHETIC_TEST_FIXTURE"] | None = None
    pricing_verified_at: None = None
    pricing_status: Literal["PRICING_UNVERIFIED", "SYNTHETIC_TEST_ONLY"] = "PRICING_UNVERIFIED"
    enabled: Literal[False] = False

    @field_validator("enabled", mode="before")
    @classmethod
    def disabled_only(cls, value):
        if value is not False:
            raise ValueError("Activation is unavailable")
        return value

    @model_validator(mode="after")
    def consistent(self):
        if self.enabled is not False:
            raise ValueError("Paid model activation unavailable")
        if self.context_limit and self.max_output_tokens and self.max_output_tokens > self.context_limit:
            raise ValueError("Output exceeds context")
        if (self.pricing_status == "SYNTHETIC_TEST_ONLY") != (self.pricing_source == "SYNTHETIC_TEST_FIXTURE"):
            raise ValueError("Synthetic evidence must be labelled consistently")
        return self
