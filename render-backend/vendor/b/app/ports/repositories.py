from typing import Protocol
from uuid import UUID
from app.schemas.requests import CaseState
from app.schemas.reports import ReportRevisionRef
from app.schemas.artifacts import ArtifactDescriptor
from app.authz.adapters.context import AuthorizationSnapshot
from app.domain.events import DomainEvent
from app.domain.workflow import IdempotencyRecord
from .transaction_contract import AuditRecord


class Repository(Protocol):
    def get_case(self, tenant_id: UUID, request_id: UUID) -> CaseState | None: ...
    def compare_and_swap(self, state: CaseState, expected_version: int) -> None: ...
    def append_event(self, event: DomainEvent) -> None: ...
    # Five-part scope; action is the existing record.result.event.action.
    # Legacy callers without action must not silently share a cross-action key.
    def get_idempotency(self, tenant_id: UUID, actor_id: UUID, request_id: UUID, key: str,
                        *, action: str) -> IdempotencyRecord | None: ...
    def save_idempotency(self, record: IdempotencyRecord) -> None: ...
    def append_audit(self, record: AuditRecord) -> None: ...


class ImmutableArtifactRepository(Protocol):
    # No production adapter. Snapshot is trusted internal DI, never client input.
    # put verifies a new immutable ID; publication is a separate authorized step.
    def put_new_bytes(self, reference: ArtifactDescriptor, content: bytes,
                      *, authorization: AuthorizationSnapshot) -> None: ...
    def get_bytes(self, reference: ArtifactDescriptor,
                  *, authorization: AuthorizationSnapshot) -> bytes: ...
    def append_revision(self, tenant_id: UUID, request_id: UUID, revision: ReportRevisionRef,
                        *, authorization: AuthorizationSnapshot) -> None: ...
