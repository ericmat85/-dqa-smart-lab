class DomainError(Exception):
    code = "DOMAIN_ERROR"
    status_code = 409

    def __init__(self):
        super().__init__(self.code)


class AuthorizationError(DomainError):
    code = "AUTHORIZATION_DENIED"
    status_code = 403


class RuleNotApprovedError(DomainError):
    code = "RULE_NOT_APPROVED"


class VersionConflictError(DomainError):
    code = "VERSION_CONFLICT"


class IdempotencyConflictError(DomainError):
    code = "IDEMPOTENCY_CONFLICT"


class InvalidTransitionError(DomainError):
    code = "INVALID_TRANSITION"
