"""Constant-only public errors: never serialize provider exceptions or credentials."""
class AuthError(Exception):
    code = 'AUTHENTICATION_FAILED'
    status_code = 401

    def __init__(self):
        super().__init__(self.code)

    def response(self):
        return {'code': self.code}


class AuthorizationDenied(AuthError):
    code = 'AUTHORIZATION_DENIED'
    status_code = 403


class ResourceNotFound(AuthError):
    code = 'RESOURCE_NOT_FOUND'
    status_code = 404


class AuthContextUnavailable(AuthError):
    code = 'AUTH_CONTEXT_UNAVAILABLE'
    status_code = 503
