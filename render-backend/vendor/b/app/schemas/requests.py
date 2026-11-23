from datetime import datetime
from uuid import UUID
from pydantic import model_validator
from app.domain.states import Stage, Substate
from app.domain.events import DomainEvent
from .common import StrictModel, PositiveVersion, SignatureRef
from .reports import ReportRevisionRef


class ReviewRecord(StrictModel):
    actor_id: UUID
    level: int
    round_number: PositiveVersion
    decision: str
    content_revision_id: UUID | None = None
    signature: SignatureRef | None = None

    @model_validator(mode="after")
    def valid_level(self):
        if self.level not in (0, 1, 2, 3):
            raise ValueError("Invalid review level")
        return self


class CaseState(StrictModel):
    request_id: UUID
    tenant_id: UUID
    requester_id: UUID
    supervisor_id: UUID
    assignee_ids: frozenset[UUID]
    stage: Stage
    substate: Substate
    version: PositiveVersion
    round_number: PositiveVersion = 1
    planned_end: datetime | None = None
    reservation_ids: tuple[UUID, ...] = ()
    cancelled_reservation_ids: tuple[UUID, ...] = ()
    # Opaque evidence references retained; never claim these are verified hours.
    execution_record_ids: tuple[UUID, ...] = ()
    reviews: tuple[ReviewRecord, ...] = ()
    reports: tuple[ReportRevisionRef, ...] = ()
    events: tuple[DomainEvent, ...] = ()

    @model_validator(mode="after")
    def coherent_state(self):
        allowed = {
            Stage.SIGNOFF: {Substate.DRAFT, Substate.RETURNED, Substate.PENDING_SIGNOFF},
            Stage.REVIEW: {Substate.RETURNED, Substate.REQUEST_LEVEL1, Substate.REQUEST_LEVEL2},
            Stage.SCHEDULING: {Substate.UNSCHEDULED},
            Stage.CONFIRMATION: {Substate.AWAITING_RECEIPT, Substate.RECEIVED_WAITING_START},
            Stage.RUNNING: {Substate.RUNNING, Substate.PAUSED, Substate.INTERRUPTED, Substate.AWAITING_COMPLETION},
            Stage.REPORT_PROCESSING: {Substate.PENDING_REPORT, Substate.RETURNED},
            Stage.REPORT_REVIEW: {Substate.REPORT_LEVEL2, Substate.REPORT_LEVEL3},
            Stage.REPORT_VIEW: {Substate.REPORT_VIEW},
            Stage.CLOSED: {Substate.ARCHIVED},
        }
        if self.substate not in allowed[self.stage]:
            raise ValueError("Incoherent stage/substate")
        if self.planned_end is not None and self.planned_end.utcoffset() is None:
            raise ValueError("Timezone required")
        if len({r.content_revision_id for r in self.reports}) != len(self.reports):
            raise ValueError("Duplicate content revision")
        return self
