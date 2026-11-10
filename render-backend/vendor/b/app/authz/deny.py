from app.authz.interfaces import PermissionDecision


class DenyByDefaultEvaluator:
    def evaluate(self, actor, scope, permission):
        return PermissionDecision(False, "PERMISSION_MAPPING_NOT_APPROVED")
