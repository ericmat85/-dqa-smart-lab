"""Request-bound synthetic-policy evaluator. Cannot authorize business side effects."""
from app.authz.interfaces import PermissionDecision
from .context import AuthorizationSnapshot
from app.domain.permissions import Permission, Role
from app.authentication.errors import AuthContextUnavailable
from app.authentication.jwt import number


class SnapshotPermissionEvaluator:
    def __init__(self, snapshot, freshness, clock, *, mode, review_level=None):
        if (mode != 'TEST_ONLY' or not isinstance(snapshot, AuthorizationSnapshot)
                or (review_level is not None and (type(review_level) is not int or review_level not in (0, 1, 2, 3)))):
            raise AuthContextUnavailable()
        self.snapshot, self.freshness, self.clock = snapshot, freshness, clock
        self.level = review_level

    def evaluate(self, actor, scope, permission):
        deny = PermissionDecision(False, 'AUTHORIZATION_DENIED')
        s = self.snapshot
        if (not isinstance(permission, Permission) or actor is not s.actor or scope != s.case.scope
                or actor.membership_active is not True or actor.tenant_id != scope.tenant_id
                or scope.request_id not in actor.case_ids or actor.actor_id not in s.case.related_actor_ids):
            return deny
        try:
            now = self.clock.now()
            if not number(now):
                raise AuthContextUnavailable()
            if (not number(s.expires_at) or not number(s.identity_expires_at)
                    or now >= min(s.expires_at, s.identity_expires_at)):
                return deny
            if self.freshness.validate(actor.actor_id, actor.tenant_id, s.membership_version,
                                       scope.request_id, s.case.version) is not True:
                return deny
        except AuthContextUnavailable:
            raise
        except Exception:
            raise AuthContextUnavailable() from None
        review = permission in {Permission.REVIEW_REQUEST, Permission.REPORT_REVIEW, Permission.REPORT_RETURN}
        if review:
            if self.level is None:
                return deny
            forbidden = {scope.requester_id, *s.case.report_authors}
            if self.level > 0:
                forbidden |= {scope.supervisor_id, *scope.assignee_ids}
                forbidden |= {a for a, level in s.case.reviews if level == 0}
            if actor.actor_id in forbidden:
                return deny
            if any(a == actor.actor_id and level != self.level for a, level in s.case.reviews):
                return deny
        required_role = {0: Role.REQUEST_MANAGER, 1: Role.LEVEL1, 2: Role.LEVEL2, 3: Role.LEVEL3}.get(self.level)
        if review and required_role not in actor.roles:
            return deny
        if any(isinstance(role, Role) and isinstance(p, Permission)
               and (level is None or type(level) is int)
               and role != Role.ADMIN and role in actor.roles and p == permission and level == self.level
               for role, p, level in s.case.grants):
            return PermissionDecision(True, 'TEST_ONLY_SYNTHETIC_POLICY')
        return deny
