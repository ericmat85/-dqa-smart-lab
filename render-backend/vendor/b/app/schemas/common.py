from typing import Annotated
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

PositiveVersion = Annotated[int, Field(strict=True, gt=0)]
NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Digest = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)


class RequestRef(StrictModel):
    request_id: UUID
    optimistic_version: PositiveVersion


class ArtifactHashRef(StrictModel):
    artifact_id: UUID
    sha256: Digest


class SignatureRef(ArtifactHashRef):
    signer_id: UUID
