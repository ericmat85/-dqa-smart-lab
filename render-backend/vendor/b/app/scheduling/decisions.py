"""Candidate assessment is not business authorization or a resource reservation."""
from typing import Literal
from uuid import UUID
from pydantic import AwareDatetime, model_validator
from .models import FrozenModel, PositiveInt

DecisionCode = Literal['ALLOW_CANDIDATE_ONLY', 'EQUIPMENT_UNAVAILABLE', 'CAPACITY_EXCEEDED',
    'ENVIRONMENT_INCOMPATIBLE', 'TIME_CONFLICT', 'ENGINEER_UNQUALIFIED',
    'MISSING_REQUIRED_DATA', 'STALE_SNAPSHOT', 'RULE_NOT_APPROVED']


class SchedulingDecision(FrozenModel):
    allowed: bool
    decision_code: DecisionCode
    conflict_codes: tuple[str, ...]
    evaluated_snapshot_version: PositiveInt | None
    evaluated_at: AwareDatetime
    required_evidence: tuple[str, ...]
    proposed_reservation_reference: UUID | None
    proposed_reservation_references: tuple[UUID, ...]
    semantics: Literal['OFFLINE_CANDIDATE_ONLY_NOT_COMMITTED'] = 'OFFLINE_CANDIDATE_ONLY_NOT_COMMITTED'
    side_effects_authorized: Literal[False] = False

    @model_validator(mode='after')
    def consistent(self):
        if self.allowed != (self.decision_code == 'ALLOW_CANDIDATE_ONLY'):
            raise ValueError('Decision status mismatch')
        if self.allowed and (self.conflict_codes or self.required_evidence):
            raise ValueError('Allow cannot contain conflicts or missing evidence')
        return self
