"""Server-bound artifact metadata; never a client upload/approval schema."""
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID, uuid4
from pydantic import Field, model_validator
from app.authz.adapters.context import AuthorizationSnapshot
from app.core.errors import DomainError
from .common import ArtifactHashRef


class ArtifactIntegrityError(DomainError):
    code = 'ARTIFACT_INTEGRITY_FAILED'


class ArtifactUnavailableError(DomainError):
    code = 'ARTIFACT_UNAVAILABLE'
    status_code = 404


class ArtifactDescriptor(ArtifactHashRef):
    tenant_id: UUID
    case_id: UUID
    revision_id: UUID
    artifact_kind: Literal['original_excel', 'signature_image', 'signed_excel', 'report_pdf']
    content_length: Annotated[int, Field(strict=True, gt=0)]
    created_by: UUID
    signer_id: UUID | None = None
    display_name: Annotated[str, Field(min_length=1, max_length=200)]
    provenance: Literal['upload', 'derived']
    source_artifact_ids: tuple[UUID, ...] = ()

    @model_validator(mode='after')
    def coherent_provenance(self):
        derived = self.artifact_kind in ('signed_excel', 'report_pdf')
        if (self.provenance != ('derived' if derived else 'upload')
                or bool(self.source_artifact_ids) != derived
                or len(set(self.source_artifact_ids)) != len(self.source_artifact_ids)
                or self.artifact_id in self.source_artifact_ids):
            raise ValueError('Invalid artifact provenance')
        if ((self.artifact_kind == 'signature_image' and self.signer_id != self.created_by)
                or (self.artifact_kind != 'signature_image' and self.signer_id is not None)):
            raise ValueError('Invalid signature reference')
        return self


def validate_content(descriptor: ArtifactDescriptor, content: bytes) -> ArtifactDescriptor:
    """Revalidate metadata (including model_copy bypass) and actual full bytes."""
    if not isinstance(descriptor, ArtifactDescriptor) or type(content) is not bytes or not content:
        raise ArtifactIntegrityError()
    try:
        checked = ArtifactDescriptor.model_validate(descriptor.model_dump())
    except (ValueError, TypeError):
        raise ArtifactIntegrityError() from None
    if len(content) != checked.content_length or sha256(content).hexdigest() != checked.sha256:
        raise ArtifactIntegrityError()
    return checked


def describe_server_bytes(content: bytes, *, authorization: AuthorizationSnapshot,
                          revision_id: UUID, artifact_kind: str, display_name: str,
                          source_artifact_ids: tuple[UUID, ...] = ()) -> ArtifactDescriptor:
    """Trusted internal helper, not an authorization decision or HTTP parser.

    Scope/owner are bound to trusted P5-02 context; digest/length/ID are computed.
    Adapter must still verify authorization, revision binding and source objects.
    """
    if type(content) is not bytes or not content or not isinstance(authorization, AuthorizationSnapshot):
        raise ArtifactIntegrityError()
    actor = authorization.actor
    return ArtifactDescriptor(tenant_id=actor.tenant_id, case_id=authorization.case.scope.request_id,
        artifact_id=uuid4(), revision_id=revision_id, artifact_kind=artifact_kind,
        sha256=sha256(content).hexdigest(), content_length=len(content), created_by=actor.actor_id,
        signer_id=actor.actor_id if artifact_kind == 'signature_image' else None,
        display_name=display_name, provenance='derived' if artifact_kind in ('signed_excel','report_pdf') else 'upload',
        source_artifact_ids=source_artifact_ids)


def hash_reference(descriptor: ArtifactDescriptor) -> ArtifactHashRef:
    """Bridge to existing ReportRevisionRef without discarding the stored binding."""
    return ArtifactHashRef(artifact_id=descriptor.artifact_id, sha256=descriptor.sha256)
