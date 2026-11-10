from dataclasses import dataclass
from typing import Protocol
from uuid import UUID
from app.domain.permissions import Permission, Role


@dataclass(frozen=True)
class ActorContext:
    actor_id: UUID
    tenant_id: UUID
    membership_active: bool
    roles: frozenset[Role]
    case_ids: frozenset[UUID]

    def __post_init__(self):
        if (not isinstance(self.actor_id, UUID) or not isinstance(self.tenant_id, UUID)
                or type(self.membership_active) is not bool
                or not isinstance(self.roles, frozenset)
                or not all(isinstance(role, Role) for role in self.roles)
                or not isinstance(self.case_ids, frozenset)
                or not all(isinstance(case_id, UUID) for case_id in self.case_ids)):
            raise ValueError("Invalid trusted actor context")


@dataclass(frozen=True)
class CaseScope:
    tenant_id: UUID
    request_id: UUID
    requester_id: UUID
    supervisor_id: UUID
    assignee_ids: frozenset[UUID]


@dataclass(frozen=True)
class PermissionDecision:
    allowed: bool
    code: str = "DENIED"


class PermissionEvaluator(Protocol):
    def evaluate(self, actor: ActorContext, scope: CaseScope, permission: Permission) -> PermissionDecision: ...
