"""Internal offline vocabulary. Deserializing a receipt never establishes trust."""
from enum import Enum
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field
from app.schemas.artifacts import ArtifactDescriptor, ArtifactIntegrityError
from app.schemas.common import StrictModel


class StoragePhase(str, Enum):
    UPLOAD_ATTEMPT = 'UPLOAD_ATTEMPT'
    QUARANTINED = 'QUARANTINED'
    VERIFIED_PRIVATE = 'VERIFIED_PRIVATE'
    REFERENCE_PENDING = 'REFERENCE_PENDING'
    REFERENCE_PUBLISHED = 'REFERENCE_PUBLISHED'
    ORPHAN_CANDIDATE = 'ORPHAN_CANDIDATE'
    CLEANUP_PENDING = 'CLEANUP_PENDING'
    REJECTED = 'REJECTED'


class StorageReceipt(ArtifactDescriptor):
    receipt_id: UUID
    object_key: Annotated[str, Field(min_length=1, max_length=512)]
    storage_generation: Annotated[str, Field(min_length=1, max_length=128)]
    verification_status: Literal['VERIFIED_PRIVATE']
    verification_time: Annotated[float, Field(allow_inf_nan=False, ge=0)]
    expires_at: Annotated[float, Field(allow_inf_nan=False, gt=0)]
    verification_policy: Literal['TEST_ONLY_SYNTHETIC_BYTES_V1']

    def descriptor(self) -> ArtifactDescriptor:
        try:
            return ArtifactDescriptor.model_validate({k: getattr(self, k)
                                                      for k in ArtifactDescriptor.model_fields})
        except (ValueError, TypeError, AttributeError):
            raise ArtifactIntegrityError() from None


def object_key_for(descriptor: ArtifactDescriptor) -> str:
    """Server-derived identity; UUID prefixes are not authorization."""
    return (f'tenants/{descriptor.tenant_id}/cases/{descriptor.case_id}/'
            f'revisions/{descriptor.revision_id}/{descriptor.artifact_id}')


def validate_receipt_binding(receipt: StorageReceipt, descriptor: ArtifactDescriptor,
                             *, now: float) -> StorageReceipt:
    """Structural binding only; the authoritative provider must ALSO attest it.

    Revalidate model_copy/model_construct bypasses and never rely on assert.
    No format, malware, signature authenticity or provider immutability claim.
    """
    try:
        if (type(receipt) is not StorageReceipt or type(descriptor) is not ArtifactDescriptor
                or type(now) not in (float, int)):
            raise ValueError()
        checked = StorageReceipt.model_validate(receipt.model_dump())
        expected = ArtifactDescriptor.model_validate(descriptor.model_dump())
        if (checked.descriptor() != expected or checked.object_key != object_key_for(expected)
                or not checked.verification_time <= now < checked.expires_at):
            raise ValueError()
        return checked
    except (ValueError, TypeError, AttributeError):
        raise ArtifactIntegrityError() from None


class PublishOutcome(StrictModel):
    status: Literal['CONFIRMED', 'NOT_COMMITTED', 'UNKNOWN']
    # A result must be separately authorized; UNKNOWN never means retry or delete.
    event_id: UUID | None = None
