"""Explicit server price catalog and metadata-only, in-memory audit records."""
import re
from dataclasses import dataclass
from datetime import datetime
from threading import RLock
from uuid import UUID
from .budget import money


@dataclass(frozen=True)
class ModelPrice:
    model: str
    input_micro_usd_per_million_tokens: int
    output_micro_usd_per_million_tokens: int
    pricing_reference: str

    def __post_init__(self):
        if (type(self.model) is not str or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}',self.model)
                or type(self.pricing_reference) is not str or not 1<=len(self.pricing_reference)<=256):
            raise ValueError('Explicit model and pricing evidence required')
        if money(self.input_micro_usd_per_million_tokens)<=0 or money(self.output_micro_usd_per_million_tokens)<=0:
            raise ValueError('Positive explicit prices required')

    def cost(self,input_tokens,output_tokens):
        if type(input_tokens) is not int or type(output_tokens) is not int or min(input_tokens,output_tokens)<0:
            raise ValueError('Invalid token usage')
        units=input_tokens*self.input_micro_usd_per_million_tokens+output_tokens*self.output_micro_usd_per_million_tokens
        return (units+999999)//1000000


@dataclass(frozen=True)
class UsageAudit:
    request_id: UUID
    feature: str
    model: str | None
    status: str
    timestamp: datetime
    maximum_cost_micro_usd: int | None
    accounted_cost_micro_usd: int | None
    input_tokens: int | None
    output_tokens: int | None
    execution: str='OFFLINE_SIMULATION'
    actual_billed_cost: None=None


class MemoryUsageLog:
    def __init__(self):self._lock=RLock();self._records=[]
    def record(self,record):
        if type(record) is not UsageAudit:raise ValueError('Only safe usage metadata allowed')
        with self._lock:self._records.append(record)
    def records(self):
        with self._lock:return tuple(self._records)
