"""Immutable, strict offline scheduling evidence. No persistence or provider wiring."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal, Protocol
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator, model_validator

PositiveInt = Annotated[int, Field(strict=True, gt=0)]
NonNegativeInt = Annotated[int, Field(strict=True, ge=0)]
PositiveSpace = Annotated[Decimal, Field(gt=0, allow_inf_nan=False)]
Number = Annotated[Decimal, Field(allow_inf_nan=False)]
NonBlank = Annotated[str, Field(min_length=1, max_length=128, pattern=r'^\S(?:[^\r\n]*\S)?$')]


def utc(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError('Timezone-aware datetime required')
    return value.astimezone(timezone.utc)


class FrozenModel(BaseModel):
    model_config = ConfigDict(strict=True, frozen=True, extra='forbid', revalidate_instances='always')

    @field_validator('*', mode='after')
    @classmethod
    def normalize_datetime(cls, value):
        return utc(value) if isinstance(value, datetime) else value


class TimeWindow(FrozenModel):
    start_time: AwareDatetime
    end_time: AwareDatetime

    @model_validator(mode='after')
    def ordered(self):
        if self.start_time >= self.end_time:
            raise ValueError('Positive half-open interval required')
        return self


class MeasurementRange(FrozenModel):
    minimum: Number
    maximum: Number
    unit: Literal['degC', '%RH']

    @model_validator(mode='after')
    def ordered(self):
        if self.minimum > self.maximum:
            raise ValueError('Range minimum exceeds maximum')
        if self.unit == '%RH' and (self.minimum < 0 or self.maximum > 100):
            raise ValueError('Relative humidity outside physical range')
        return self


class Conditions(FrozenModel):
    temperature: MeasurementRange | None
    humidity: MeasurementRange | None


class Equipment(FrozenModel):
    tenant_id: UUID
    equipment_id: UUID
    status: Literal['ready', 'disabled', 'maintenance', 'calibrating', 'unknown']
    capacity: PositiveInt
    # Physical usable L ceiling, NOT already-netted remaining space.
    available_space: PositiveSpace
    space_unit: Literal['L']
    channels: NonNegativeInt
    supported_temperature: MeasurementRange | None
    supported_humidity: MeasurementRange | None
    preparation_time: timedelta | None
    transition_time: timedelta | None
    cleanup_time: timedelta | None
    availability: tuple[TimeWindow, ...]

    @field_validator('preparation_time', 'transition_time', 'cleanup_time')
    @classmethod
    def nonnegative_buffer(cls, value):
        if value is not None and value < timedelta(0):
            raise ValueError('Negative resource buffer')
        return value


class Qualification(FrozenModel):
    test_type: NonBlank
    valid_from: AwareDatetime
    valid_until: AwareDatetime
    evidence_reference: NonBlank

    @model_validator(mode='after')
    def ordered(self):
        if self.valid_from >= self.valid_until:
            raise ValueError('Invalid qualification validity')
        return self


class Engineer(FrozenModel):
    tenant_id: UUID
    engineer_id: UUID
    qualifications: tuple[Qualification, ...]
    availability: tuple[TimeWindow, ...]
    assigned_work: tuple[TimeWindow, ...]


class Sample(FrozenModel):
    tenant_id: UUID
    sample_id: UUID
    required_space: PositiveSpace
    space_unit: Literal['L']
    required_channels: NonNegativeInt
    requested_conditions: Conditions


class TestRequirement(FrozenModel):
    __test__ = False
    tenant_id: UUID
    request_id: UUID
    test_item_id: UUID
    test_type: NonBlank
    # Authoritative test-item lifecycle evidence, never taken from AI intent.
    scheduling_state: Literal['new_unassigned', 'already_scheduled', 'running', 'interrupted', 'completed', 'cancelled', 'unknown']
    equipment_count: PositiveInt
    sample_ids: frozenset[UUID]
    conditions: Conditions


class Reservation(TimeWindow):
    tenant_id: UUID
    reservation_id: UUID
    request_id: UUID
    test_item_id: UUID
    equipment_id: UUID
    engineer_id: UUID
    sample_ids: frozenset[UUID]
    reserved_capacity: PositiveInt
    reserved_space: PositiveSpace
    space_unit: Literal['L']
    reserved_channels: NonNegativeInt
    conditions: Conditions
    status: Literal['proposed', 'planned', 'running', 'paused', 'interrupted', 'held', 'completed', 'cancelled', 'unknown']


class MaintenanceWindow(TimeWindow):
    tenant_id: UUID
    equipment_id: UUID
    kind: Literal['maintenance', 'calibration']
    reason: NonBlank


class CandidateSchedule(FrozenModel):
    proposed_reservations: Annotated[tuple[Reservation, ...], Field(min_length=1)]
    source: Literal['manual', 'ai', 'TEST_ONLY']
    expected_version: PositiveInt
    # Intent is not authority. Any value except new_reservation is default-denied.
    intent: NonBlank


class TrustedSnapshot(FrozenModel):
    mode: Literal['TEST_ONLY']
    tenant_id: UUID
    version: PositiveInt
    as_of: AwareDatetime
    valid_until: AwareDatetime
    horizon: TimeWindow
    complete_evidence: frozenset[str]
    equipment: tuple[Equipment, ...]
    engineers: tuple[Engineer, ...]
    samples: tuple[Sample, ...]
    requirements: tuple[TestRequirement, ...]
    reservations: tuple[Reservation, ...]
    maintenance: tuple[MaintenanceWindow, ...]

    @model_validator(mode='after')
    def consistent(self):
        if self.as_of >= self.valid_until:
            raise ValueError('Invalid snapshot freshness interval')
        groups = [(self.equipment, 'equipment_id'), (self.engineers, 'engineer_id'),
                  (self.samples, 'sample_id'), (self.reservations, 'reservation_id')]
        for rows, key in groups:
            if len({getattr(row, key) for row in rows}) != len(rows):
                raise ValueError('Duplicate trusted resource ID')
        req_keys = {(r.request_id, r.test_item_id) for r in self.requirements}
        if len(req_keys) != len(self.requirements):
            raise ValueError('Duplicate trusted requirement')
        for rows in (self.equipment, self.engineers, self.samples, self.requirements,
                     self.reservations, self.maintenance):
            if any(row.tenant_id != self.tenant_id for row in rows):
                raise ValueError('Mixed-tenant trusted snapshot')
        if any(row.status == 'proposed' for row in self.reservations):
            raise ValueError('Proposals cannot masquerade as trusted reservations')
        return self


class Clock(Protocol):
    def now(self) -> datetime: ...
