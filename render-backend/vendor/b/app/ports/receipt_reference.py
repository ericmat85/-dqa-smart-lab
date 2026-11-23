"""P5-08 offline contracts; no provider implementation or business routes.

Reuse P5-02 authorization, P5-03 bytes and P5-05 UoW/idem. Synthetic
publication implementations belong only in tests; production stays unavailable.
"""
from typing import Protocol
from app.authz.adapters.context import AuthorizationSnapshot
from app.domain.permissions import Permission
from app.domain.workflow import WorkflowTransition
from app.schemas.artifacts import ArtifactDescriptor
from app.schemas.commands import SubmitReport
from app.schemas.storage_receipts import StorageReceipt, PublishOutcome
from .repositories import ImmutableArtifactRepository


class TrustedReceiptProvider(Protocol):
    def attest(self, receipt: StorageReceipt, descriptor: ArtifactDescriptor,
               *, authorization: AuthorizationSnapshot) -> StorageReceipt: ...


class ImmutableObjectStorePort(ImmutableArtifactRepository, Protocol):
    """Extend the existing bytes port; private verification is not user download."""
    def verify_private(self, descriptor: ArtifactDescriptor,
                       *, authorization: AuthorizationSnapshot) -> StorageReceipt: ...


class AuthoritativeAuthzPort(Protocol):
    """Must reuse the snapshot evaluator plus authoritative freshness at boundary."""
    def authorize(self, authorization: AuthorizationSnapshot, descriptor: ArtifactDescriptor,
                  permission: Permission) -> None: ...


class ReferencePublishPort(Protocol):
    def publish(self, command: SubmitReport, receipts: tuple[StorageReceipt, ...],
                *, authorization: AuthorizationSnapshot) -> WorkflowTransition: ...


class OutcomeReconciliationPort(Protocol):
    def reconcile(self, command: SubmitReport, receipts: tuple[StorageReceipt, ...],
                  *, authorization: AuthorizationSnapshot) -> PublishOutcome: ...


class OrphanInspectionPort(Protocol):
    """Inspection cannot delete. Claims must serialize with reference publication."""
    def inspect(self, receipt: StorageReceipt, *, authorization: AuthorizationSnapshot) -> str: ...
