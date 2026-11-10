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
    currency: Literal['USD']='USD'
    total_test_cap_usd: Literal['10.00']='10.00'
    enforcement: Literal['CONTRACT_ONLY_NOT_ENFORCED']='CONTRACT_ONLY_NOT_ENFORCED'
    remaining_budget: None=None


# COMP-03A-1: explicit integer micro-USD offline PoC, no floating point money.
from dataclasses import dataclass
from threading import RLock
from uuid import UUID,uuid4


class BudgetDenied(Exception):
    def __init__(self,code='BUDGET_DENIED'):
        super().__init__(code);self.code=code


def money(value):
    if type(value) is not int or value<0:raise BudgetDenied('INVALID_MONEY')
    return value


@dataclass(frozen=True)
class Reservation:
    id: UUID
    request_id: UUID
    feature: str
    model: str
    maximum_micro_usd: int


class MemoryBudgetLedger:
    """Single-process OFFLINE PoC. Not shared, durable, or live-budget authority."""
    def __init__(self, *, enabled=False,cap_micro_usd=10000000):
        money(cap_micro_usd)
        if cap_micro_usd>10000000:raise BudgetDenied('CAP_EXCEEDS_AUTHORIZED_LIMIT')
        self.enabled=enabled is True;self.cap=cap_micro_usd
        self._lock=RLock();self._spent=0;self._held={};self._requests=set();self._states={}

    def reserve(self,request_id,feature,model,maximum_micro_usd):
        maximum=money(maximum_micro_usd)
        if (maximum<=0 or type(request_id) is not UUID
                or feature not in ('AI-01','AI-02','AI-03','AI-04','AI-05')
                or type(model) is not str or not model):raise BudgetDenied('INVALID_RESERVATION')
        with self._lock:
            if not self.enabled:raise BudgetDenied('LEDGER_DISABLED')
            if request_id in self._requests:raise BudgetDenied('DUPLICATE_REQUEST')
            if self._spent+sum(r.maximum_micro_usd for r in self._held.values())+maximum>self.cap:
                raise BudgetDenied('INSUFFICIENT_BUDGET')
            r=Reservation(uuid4(),request_id,feature,model,maximum)
            self._held[r.id]=r;self._requests.add(request_id);self._states[r.id]='RESERVED'
            return r

    def settle(self,reservation,actual_micro_usd):
        actual=money(actual_micro_usd)
        with self._lock:
            if self._held.get(reservation.id)!=reservation or self._states.get(reservation.id)!='RESERVED':
                raise BudgetDenied('INVALID_SETTLEMENT')
            if actual>reservation.maximum_micro_usd:
                self._states[reservation.id]='UNKNOWN';raise BudgetDenied('COST_EXCEEDS_RESERVATION')
            self._spent+=actual;del self._held[reservation.id];self._states[reservation.id]='SETTLED'
            return actual

    def mark_unknown(self,reservation):
        with self._lock:
            if self._held.get(reservation.id)!=reservation:raise BudgetDenied('UNKNOWN_RESERVATION')
            self._states[reservation.id]='UNKNOWN'

    def snapshot(self):
        with self._lock:
            held=sum(r.maximum_micro_usd for r in self._held.values())
            return {'mode':'SINGLE_PROCESS_OFFLINE_ONLY','cap_micro_usd':self.cap,
                'accounted_micro_usd':self._spent,'held_micro_usd':held,
                'available_micro_usd':self.cap-self._spent-held,
                'unknown_reservations':sum(state=='UNKNOWN' for state in self._states.values())}


from typing import Protocol


class BudgetLedger(Protocol):
    """Future implementations must preserve reserve/settle/unknown semantics.

    A deployed shared ledger needs separate durability/atomicity verification;
    satisfying this structural Protocol alone never authorizes paid execution.
    """
    def reserve(self,request_id: UUID,feature: str,model: str,maximum_micro_usd: int) -> Reservation: ...
    def settle(self,reservation: Reservation,actual_micro_usd: int) -> int: ...
    def mark_unknown(self,reservation: Reservation) -> None: ...
    def snapshot(self) -> dict: ...
