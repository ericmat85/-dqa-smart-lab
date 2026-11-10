from typing import Protocol
from .repositories import Repository, ImmutableArtifactRepository


class UnitOfWork(Protocol):
    """One atomic boundary: CAS case (including reviews), events, audit,
    revision/reference metadata and five-part idempotency record.

    Recheck authoritative membership/case versions at commit, including replays.
    Exceptions roll back everything; no partial publication or implicit commit.
    Real business commit remains blocked by the domain gate.
    """
    repository: Repository
    artifacts: ImmutableArtifactRepository
    def __enter__(self) -> "UnitOfWork": ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def __exit__(self, exc_type, exc, traceback) -> None: ...
