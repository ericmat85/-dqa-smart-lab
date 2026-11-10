"""COMP-02 data contracts plus COMP-03A-1 single-process offline budget ledger."""
from typing import Annotated,Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator

Count=Annotated[int,Field(strict=True,ge=0,le=10000000)]
MicroUSD=Annotated[int,Field(strict=True,ge=0,le=1000000000)]


class UsageRecord(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
    source: Literal['NOT_INVOKED','FAKE_OFFLINE','PROVIDER']
    input_tokens: Count | None=None
    output_tokens: Count | None=None
    charged_micro_usd: MicroUSD | None=None

    @model_validator(mode='after')
    def no_fake_charges(self):
        if self.source in ('NOT_INVOKED','FAKE_OFFLINE') and any(
                value not in (None,0) for value in (self.input_tokens,self.output_tokens,self.charged_micro_usd)):
            raise ValueError('Offline usage cannot claim real provider usage')
        return self


class BudgetContract(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
    currency: None=None
    total_test_cap_usd: None=None
    enforcement: Literal['NOT_APPLICABLE_OFFLINE']='NOT_APPLICABLE_OFFLINE'
    remaining_budget: None=None


