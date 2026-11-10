from datetime import datetime
from uuid import UUID
from app.schemas.common import StrictModel, PositiveVersion


class DomainEvent(StrictModel):
    event_id: UUID
    request_id: UUID
    tenant_id: UUID
    actor_id: UUID
    action: str
    version: PositiveVersion
    recorded_at: datetime
    reason: str | None = None
    reservation_id: UUID | None = None
    content_revision_id: UUID | None = None
    # No actual-execution-end/elapsed-hours or device-release inference.
