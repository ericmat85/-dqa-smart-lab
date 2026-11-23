"""Fail-closed composition contract, not wired into FastAPI or real services."""
from dataclasses import dataclass, field
from app.core.errors import DomainError
from app.ports.receipt_reference import (TrustedReceiptProvider, ImmutableObjectStorePort,
    ReferencePublishPort, AuthoritativeAuthzPort, OutcomeReconciliationPort, OrphanInspectionPort)


class ReceiptDependencyUnavailable(DomainError):
    code = 'RECEIPT_DEPENDENCY_UNAVAILABLE'
    status_code = 503


class UnavailableReceiptDependencies:
    def attest(self, *args, **kwargs):
        raise ReceiptDependencyUnavailable()

    verify_private = attest
    put_new_bytes = attest
    get_bytes = attest
    append_revision = attest
    authorize = attest
    publish = attest
    reconcile = attest
    inspect = attest


@dataclass(frozen=True)
class ReceiptDependencies:
    receipts: TrustedReceiptProvider = field(default_factory=UnavailableReceiptDependencies)
    objects: ImmutableObjectStorePort = field(default_factory=UnavailableReceiptDependencies)
    references: ReferencePublishPort = field(default_factory=UnavailableReceiptDependencies)
    authz: AuthoritativeAuthzPort = field(default_factory=UnavailableReceiptDependencies)
    outcomes: OutcomeReconciliationPort = field(default_factory=UnavailableReceiptDependencies)
    orphans: OrphanInspectionPort = field(default_factory=UnavailableReceiptDependencies)
