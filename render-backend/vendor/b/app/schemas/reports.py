from uuid import UUID
from .common import ArtifactHashRef, PositiveVersion, StrictModel, SignatureRef


class ReportRevisionRef(StrictModel):
    content_revision_id: UUID
    revision_number: PositiveVersion
    original: ArtifactHashRef
    signed_artifacts: tuple[ArtifactHashRef, ...] = ()
    signatures: tuple[SignatureRef, ...] = ()
