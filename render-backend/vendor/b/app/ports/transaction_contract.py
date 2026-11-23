"""Offline contract vocabulary, not a business service or persistence adapter.

Review decisions remain CaseState.reviews; do not create a competing review model.
Authorization comes from P5-02 trusted sources, never a request-body snapshot.
"""
from uuid import UUID
from app.domain.events import DomainEvent
from app.domain.workflow import IdempotencyRecord
from app.schemas.common import StrictModel


class AuditRecord(StrictModel):
    audit_id: UUID
    event: DomainEvent


def idempotency_scope(record: IdempotencyRecord) -> tuple[UUID, UUID, UUID, str, str]:
    """Persist this scope and the canonical command payload digest atomically."""
    return (record.tenant_id, record.actor_id, record.request_id,
            record.result.event.action, record.key)
