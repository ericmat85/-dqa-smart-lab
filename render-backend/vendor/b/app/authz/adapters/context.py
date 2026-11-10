"""Trusted ports only; snapshots are per request and are never request-body models."""
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID
from app.authentication.jwt import VerifiedIdentity, number
from app.authentication.errors import AuthorizationDenied, ResourceNotFound, AuthContextUnavailable
from app.authz.interfaces import ActorContext, CaseScope
from app.domain.permissions import Permission, Role


@dataclass(frozen=True)
class Membership:
    actor_id: UUID
    tenant_id: UUID
    status: str
    roles: frozenset[Role]
    version: str


@dataclass(frozen=True)
class CaseAuthorization:
    scope: CaseScope
    related_actor_ids: frozenset[UUID]
    report_authors: frozenset[UUID]
    # Full historical identity/level pairs, across rounds and revisions.
    reviews: tuple[tuple[UUID, int], ...]
    # Synthetic trusted grant triples, not a production role-permission seed.
    grants: frozenset[tuple[Role, Permission, int | None]]
    version: str


@dataclass(frozen=True)
class AuthorizationSnapshot:
    actor: ActorContext
    case: CaseAuthorization
    membership_version: str
    expires_at: float
    identity_expires_at: float
    request_id: UUID


class IdentityMapping(Protocol):
    def actor_for(self, issuer: str, subject: str) -> UUID | None: ...


class MembershipReader(Protocol):
    def read(self, actor_id: UUID, tenant_id: UUID) -> Membership | None: ...


class CaseScopeReader(Protocol):
    def read(self, tenant_id: UUID, case_id: UUID, actor_id: UUID) -> CaseAuthorization | None: ...


class AuthzFreshnessPort(Protocol):
    def validate(self, actor_id: UUID, tenant_id: UUID, membership_version: str,
                 case_id: UUID, case_version: str) -> bool: ...


class ActorContextResolver:
    def __init__(self, identities, memberships, cases, freshness, clock, *, mode, snapshot_ttl):
        if mode != 'TEST_ONLY' or not number(snapshot_ttl) or not 0 < snapshot_ttl <= 300:
            raise AuthContextUnavailable()
        self.identities, self.memberships, self.cases = identities, memberships, cases
        self.freshness, self.clock, self.ttl = freshness, clock, snapshot_ttl

    def resolve(self, identity, selected_tenant, case_id, request_id):
        if (not isinstance(identity, VerifiedIdentity) or not isinstance(selected_tenant, UUID)
                or not isinstance(case_id, UUID) or not isinstance(request_id, UUID)):
            raise AuthorizationDenied()
        try:
            now = self.clock.now()
            if not number(now) or now >= identity.expires_at:
                raise AuthorizationDenied()
            actor_id = self.identities.actor_for(identity.issuer, identity.subject)
            if not isinstance(actor_id, UUID):
                raise AuthorizationDenied()
            member = self.memberships.read(actor_id, selected_tenant)
            if (not isinstance(member, Membership) or member.actor_id != actor_id
                    or member.tenant_id != selected_tenant or member.status != 'active'):
                raise AuthorizationDenied()
            if (not isinstance(member.roles, frozenset) or not all(isinstance(r, Role) for r in member.roles)
                    or not isinstance(member.version, str) or not member.version):
                raise AuthContextUnavailable()
            case = self.cases.read(selected_tenant, case_id, actor_id)
            if (not isinstance(case, CaseAuthorization) or case.scope.tenant_id != selected_tenant
                    or case.scope.request_id != case_id or actor_id not in case.related_actor_ids):
                raise ResourceNotFound()
            if not case.version:
                raise AuthContextUnavailable()
            if self.freshness.validate(actor_id, selected_tenant, member.version, case_id, case.version) is not True:
                raise AuthorizationDenied()
            actor = ActorContext(actor_id, selected_tenant, True, member.roles, frozenset({case_id}))
            return AuthorizationSnapshot(actor, case, member.version,
                min(now + self.ttl, identity.expires_at), identity.expires_at, request_id)
        except (AuthorizationDenied, ResourceNotFound, AuthContextUnavailable):
            raise
        except Exception:
            raise AuthContextUnavailable() from None
